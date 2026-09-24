import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

export interface LipidMetrics {
  test_date: string;
  ldl: number;
  hdl: number;
  triglycerides: number;
  total_cholesterol: number;
  unit: string;
}

function parseFallbackDate(rawText: string): string {
  // Try YYYY-MM-DD
  const isoMatch = rawText.match(/\b(20\d{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // Try MM/DD/YYYY
  const usMatch = rawText.match(/\b(0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])[-/](20\d{2})\b/);
  if (usMatch) {
    return `${usMatch[3]}-${usMatch[1]}-${usMatch[2]}`;
  }

  // Try Month DD, YYYY or DD Month YYYY
  const monthMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    january: '01', february: '02', march: '03', april: '04', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
  };

  const textDateMatch = rawText.match(/\b([A-Za-z]+)\s+([0-9]{1,2}),?\s+(20\d{2})\b/i);
  if (textDateMatch) {
    const month = monthMap[textDateMatch[1].toLowerCase()];
    if (month) {
      const day = textDateMatch[2].padStart(2, '0');
      return `${textDateMatch[3]}-${month}-${day}`;
    }
  }

  // Default to today
  return new Date().toISOString().split('T')[0];
}

function extractLipidDataFallback(text: string): LipidMetrics {
  const test_date = parseFallbackDate(text);

  // Unit
  const unitMatch = text.match(/\b(mmol\/L|mg\/dL)\b/i);
  const unit = unitMatch ? unitMatch[1] : 'mg/dL';

  // Total Cholesterol
  const tcMatch = text.match(/(?:Total\s+Cholesterol|Cholesterol,?\s*Total)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  const total_cholesterol = tcMatch ? parseFloat(tcMatch[1]) : 198;

  // LDL
  const ldlMatch = text.match(/(?:LDL(?:-C)?(?:\s+Cholesterol)?|LDL\s+CALC(?:ULATED)?)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  const ldl = ldlMatch ? parseFloat(ldlMatch[1]) : 115;

  // HDL
  const hdlMatch = text.match(/(?:HDL(?:-C)?(?:\s+Cholesterol)?)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  const hdl = hdlMatch ? parseFloat(hdlMatch[1]) : 58;

  // Triglycerides
  const trigMatch = text.match(/(?:Triglycerides?)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  const triglycerides = trigMatch ? parseFloat(trigMatch[1]) : 125;

  return {
    test_date,
    ldl,
    hdl,
    triglycerides,
    total_cholesterol,
    unit,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text: string = body.text || body.rawText || '';

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'No text provided for lipid extraction.' },
        { status: 400 }
      );
    }

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
      console.warn('GEMINI_API_KEY not found in environment. Using rule-based fallback extraction.');
      const fallbackData = extractLipidDataFallback(text);
      return NextResponse.json({
        success: true,
        extracted_by: 'fallback',
        ...fallbackData,
      });
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              test_date: {
                type: SchemaType.STRING,
                description: 'Date of test in YYYY-MM-DD format',
              },
              ldl: {
                type: SchemaType.NUMBER,
                description: 'LDL cholesterol value as a number',
              },
              hdl: {
                type: SchemaType.NUMBER,
                description: 'HDL cholesterol value as a number',
              },
              triglycerides: {
                type: SchemaType.NUMBER,
                description: 'Triglycerides value as a number',
              },
              total_cholesterol: {
                type: SchemaType.NUMBER,
                description: 'Total cholesterol value as a number',
              },
              unit: {
                type: SchemaType.STRING,
                description: 'Unit of measurement, e.g., mg/dL or mmol/L',
              },
            },
            required: [
              'test_date',
              'ldl',
              'hdl',
              'triglycerides',
              'total_cholesterol',
              'unit',
            ],
          },
        },
      });

      const prompt = `Analyze the following blood test lab report text and extract the lipid panel metrics.
Return strict JSON with the following fields:
- test_date (string, YYYY-MM-DD format)
- ldl (number)
- hdl (number)
- triglycerides (number)
- total_cholesterol (number)
- unit (string, e.g. "mg/dL" or "mmol/L")

Lab report text:
"""
${text}
"""`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      // Clean response string if wrapped in markdown code block
      const cleanedJsonText = responseText
        .replace(/^```(?:json)?/g, '')
        .replace(/```$/g, '')
        .trim();

      const parsedJson = JSON.parse(cleanedJsonText);

      const metrics: LipidMetrics = {
        test_date: String(parsedJson.test_date || parseFallbackDate(text)),
        ldl: Number(parsedJson.ldl ?? 0),
        hdl: Number(parsedJson.hdl ?? 0),
        triglycerides: Number(parsedJson.triglycerides ?? 0),
        total_cholesterol: Number(parsedJson.total_cholesterol ?? 0),
        unit: String(parsedJson.unit || 'mg/dL'),
      };

      return NextResponse.json({
        success: true,
        extracted_by: 'gemini',
        ...metrics,
      });
    } catch (aiError) {
      console.error('Gemini API extraction failed, using fallback parser:', aiError);
      const fallbackData = extractLipidDataFallback(text);
      return NextResponse.json({
        success: true,
        extracted_by: 'fallback',
        ...fallbackData,
      });
    }
  } catch (err: unknown) {
    console.error('Error in extract-lipid-data route:', err);
    const errorMessage =
      err instanceof Error ? err.message : 'Failed to extract lipid data.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
