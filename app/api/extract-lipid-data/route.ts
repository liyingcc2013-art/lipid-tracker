import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

export interface TestItem {
  name: string;
  value: number;
  unit: string;
  ref_range: string;
}

export interface CategoryPanel {
  category: string;
  tests: TestItem[];
}

export interface BloodReportData {
  patient_name: string;
  patient_ic: string;
  test_date: string;
  categories: CategoryPanel[];
}

function parseFallbackDate(rawText: string): string {
  // Try YYYY-MM-DD
  const isoMatch = rawText.match(/\b(20\d{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // Try MM/DD/YYYY or DD/MM/YYYY
  const dateMatch = rawText.match(/\b([0-3]?\d)[-/]([0-3]?\d)[-/](20\d{2})\b/);
  if (dateMatch) {
    const p1 = dateMatch[1].padStart(2, '0');
    const p2 = dateMatch[2].padStart(2, '0');
    const year = dateMatch[3];
    return `${year}-${p2}-${p1}`;
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

  return '';
}

function extractBloodReportFallback(text: string): BloodReportData {
  // Extract Patient Name
  const nameMatch = text.match(/(?:Patient\s*Name|Name|Patient)\s*[:=]?\s*([^\r\n]+)/i);
  let patient_name = nameMatch ? nameMatch[1].trim() : '';
  patient_name = patient_name.replace(/[\u4e00-\u9fa5]/g, '').replace(/\b(?:NRIC|IC|ID|Date|Sex|Gender|DOB)\b.*/i, '').trim();

  // Extract NRIC/IC
  const icMatch = text.match(/\b([STFGM]\d{7}[A-Z])\b/i) || text.match(/(?:NRIC|IC|ID)\s*[:=]?\s*([A-Z0-9]+)/i);
  const patient_ic = icMatch ? icMatch[1].trim().toUpperCase() : '';

  // Extract Test Date
  const test_date = parseFallbackDate(text);

  const categories: CategoryPanel[] = [];

  // Minimal regex extraction for lipid tests strictly if present
  const lipidTests: TestItem[] = [];

  const tcMatch = text.match(/(?:Total\s+Cholesterol|Cholesterol,?\s*Total)[^\d\r\n]*(\d+(?:\.\d+)?)\s*(mmol\/L|mg\/dL)?/i);
  if (tcMatch) {
    lipidTests.push({
      name: 'Total Cholesterol',
      value: parseFloat(tcMatch[1]),
      unit: tcMatch[2] || 'mmol/L',
      ref_range: '< 5.20'
    });
  }

  const trigMatch = text.match(/(?:Triglycerides?)[^\d\r\n]*(\d+(?:\.\d+)?)\s*(mmol\/L|mg\/dL)?/i);
  if (trigMatch) {
    lipidTests.push({
      name: 'Triglycerides',
      value: parseFloat(trigMatch[1]),
      unit: trigMatch[2] || 'mmol/L',
      ref_range: '< 1.70'
    });
  }

  const hdlMatch = text.match(/(?:HDL\s+Cholesterol|HDL-C)[^\d\r\n]*(\d+(?:\.\d+)?)\s*(mmol\/L|mg\/dL)?/i);
  if (hdlMatch) {
    lipidTests.push({
      name: 'HDL Cholesterol',
      value: parseFloat(hdlMatch[1]),
      unit: hdlMatch[2] || 'mmol/L',
      ref_range: '> 1.00'
    });
  }

  const ldlMatch = text.match(/(?:LDL\s+Chol\s*\(Direct\)|LDL-C|LDL\s+Cholesterol)[^\d\r\n]*(\d+(?:\.\d+)?)\s*(mmol\/L|mg\/dL)?/i);
  if (ldlMatch) {
    lipidTests.push({
      name: 'LDL Chol (Direct)',
      value: parseFloat(ldlMatch[1]),
      unit: ldlMatch[2] || 'mmol/L',
      ref_range: '< 2.60'
    });
  }

  if (lipidTests.length > 0) {
    categories.push({
      category: 'LIPID PROFILE',
      tests: lipidTests,
    });
  }

  return {
    patient_name,
    patient_ic,
    test_date,
    categories,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text: string = body.text || body.rawText || '';

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'No text provided for extraction.' },
        { status: 400 }
      );
    }

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
      console.warn('GEMINI_API_KEY not found in environment. Using fallback extraction.');
      const fallbackData = extractBloodReportFallback(text);
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
        systemInstruction:
          'You are a strict medical data parser. You MUST NOT hallucinate, infer, or generate synthetic data. Extract ONLY values explicitly present in the provided raw text. If a test or value is missing, you MUST omit it. The raw text contains English test names immediately followed by Chinese characters (e.g., \'LDL Chol (Direct) 低脂蛋白(坏)胆固醇 1.74 mmol/L\'). You must ignore the Chinese characters and extract the first numeric value and its corresponding unit.',
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              patient_name: {
                type: SchemaType.STRING,
                description: 'Patient full name, e.g., LEE KIM NEO ALICE',
              },
              patient_ic: {
                type: SchemaType.STRING,
                description: 'Patient IC/NRIC/ID number, e.g., S0066927E',
              },
              test_date: {
                type: SchemaType.STRING,
                description: 'Date of test in YYYY-MM-DD format, e.g., 2026-09-26',
              },
              categories: {
                type: SchemaType.ARRAY,
                description: 'List of test categories/panels extracted from the lab report',
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    category: {
                      type: SchemaType.STRING,
                      description: 'Category or panel name, e.g., LIPID PROFILE, LIVER PROFILE, KIDNEY PROFILE',
                    },
                    tests: {
                      type: SchemaType.ARRAY,
                      description: 'List of test items under this category',
                      items: {
                        type: SchemaType.OBJECT,
                        properties: {
                          name: {
                            type: SchemaType.STRING,
                            description: 'English name of the test item ONLY (ignore Chinese characters)',
                          },
                          value: {
                            type: SchemaType.NUMBER,
                            description: 'Extracted numeric test value from primary result column',
                          },
                          unit: {
                            type: SchemaType.STRING,
                            description: 'Unit of measurement associated with the numeric value, e.g., mmol/L, U/L',
                          },
                          ref_range: {
                            type: SchemaType.STRING,
                            description: 'Reference range string, e.g., < 5.20 or 10 - 50',
                          },
                        },
                        required: ['name', 'value', 'unit', 'ref_range'],
                      },
                    },
                  },
                  required: ['category', 'tests'],
                },
              },
            },
            required: ['patient_name', 'patient_ic', 'test_date', 'categories'],
          },
        },
      });

      const prompt = `Analyze the following blood test lab report text and extract complete multi-panel test metrics along with patient metadata.

INSTRUCTIONS & RULES:
1. Patient Metadata:
   - Extract patient_name (string).
   - Extract patient_ic (string).
   - Extract test_date in YYYY-MM-DD format.

2. Dual-Unit & Chinese Character Rules:
   - The raw text contains English test names immediately followed by Chinese characters (e.g., 'LDL Chol (Direct) 低脂蛋白(坏)胆固醇 1.74 mmol/L').
   - You MUST ignore Chinese characters and extract test names in English only.
   - Extract the first numeric value and its corresponding unit.
   - You MUST NOT generate synthetic data, infer, or hallucinate missing tests.
   - Extract ONLY tests explicitly present in the text.

3. Dynamic Test Categories:
   - Group all extracted tests into their respective panel categories as stated in the text.
   - Return an array of categories, each containing:
     - category: Name of the test panel/category
     - tests: Array of test items under that category.
       Each test item must have:
       - name: string (English only)
       - value: number
       - unit: string
       - ref_range: string

Return strict JSON conforming to the requested schema.

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

      const reportData: BloodReportData = {
        patient_name: String(parsedJson.patient_name || ''),
        patient_ic: String(parsedJson.patient_ic || ''),
        test_date: String(parsedJson.test_date || ''),
        categories: Array.isArray(parsedJson.categories) ? parsedJson.categories : [],
      };

      return NextResponse.json({
        success: true,
        extracted_by: 'gemini',
        ...reportData,
      });
    } catch (aiError) {
      console.error('Gemini API extraction failed, using fallback parser:', aiError);
      const fallbackData = extractBloodReportFallback(text);
      return NextResponse.json({
        success: true,
        extracted_by: 'fallback',
        ...fallbackData,
      });
    }
  } catch (err: unknown) {
    console.error('Error in extract-lipid-data route:', err);
    const errorMessage =
      err instanceof Error ? err.message : 'Failed to extract blood report data.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
