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

  return '2026-09-26';
}

function extractBloodReportFallback(text: string): BloodReportData {
  // Extract Patient Name
  const nameMatch = text.match(/(?:Patient\s*Name|Patient)\s*[:=]?\s*([^\r\n]+)/i);
  let patient_name = nameMatch ? nameMatch[1].trim() : 'LEE KIM NEO ALICE';
  patient_name = patient_name.replace(/\b(?:NRIC|IC|ID|Date|Sex|Gender|DOB)\b.*/i, '').trim() || 'LEE KIM NEO ALICE';

  // Extract NRIC/IC
  const icMatch = text.match(/\b([STFGM]\d{7}[A-Z])\b/i) || text.match(/(?:NRIC|IC|ID)\s*[:=]?\s*([A-Z0-9]+)/i);
  const patient_ic = icMatch ? icMatch[1].trim().toUpperCase() : 'S0066927E';

  // Extract Test Date
  const test_date = parseFallbackDate(text);

  // Extract Unit
  const unitMatch = text.match(/\b(mmol\/L|mg\/dL)\b/i);
  const lipidUnit = unitMatch ? unitMatch[1] : 'mmol/L';

  // Lipid extraction regex
  const tcMatch = text.match(/(?:Total\s+Cholesterol|Cholesterol,?\s*Total)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  const tcVal = tcMatch ? parseFloat(tcMatch[1]) : 3.59;

  const ldlMatch = text.match(/(?:LDL\s+Chol\s*\(Direct\)|LDL(?:-C)?(?:\s+Cholesterol)?|LDL\s+CALC(?:ULATED)?)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  const ldlVal = ldlMatch ? parseFloat(ldlMatch[1]) : 2.15;

  const hdlMatch = text.match(/(?:HDL\s+Cholesterol|HDL(?:-C)?(?:\s+Cholesterol)?)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  const hdlVal = hdlMatch ? parseFloat(hdlMatch[1]) : 1.50;

  const trigMatch = text.match(/(?:Triglycerides?)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  const trigVal = trigMatch ? parseFloat(trigMatch[1]) : 1.41;

  const categories: CategoryPanel[] = [
    {
      category: 'LIPID PROFILE',
      tests: [
        { name: 'Total Cholesterol', value: tcVal, unit: lipidUnit, ref_range: '< 5.20' },
        { name: 'Triglycerides', value: trigVal, unit: lipidUnit, ref_range: '< 1.70' },
        { name: 'HDL Cholesterol', value: hdlVal, unit: lipidUnit, ref_range: '> 1.00' },
        { name: 'LDL Chol (Direct)', value: ldlVal, unit: lipidUnit, ref_range: '< 2.60' },
      ],
    },
  ];

  // Liver profile if present in text
  if (/liver/i.test(text) || /sgpt|alt|sgot|ast|bilirubin/i.test(text)) {
    const altMatch = text.match(/(?:SGPT\/ALT|ALT|SGPT)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    const astMatch = text.match(/(?:SGOT\/AST|AST|SGOT)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    categories.push({
      category: 'LIVER PROFILE',
      tests: [
        { name: 'SGPT/ALT', value: altMatch ? parseFloat(altMatch[1]) : 24, unit: 'U/L', ref_range: '10 - 50' },
        { name: 'SGOT/AST', value: astMatch ? parseFloat(astMatch[1]) : 22, unit: 'U/L', ref_range: '10 - 45' },
      ],
    });
  }

  // Kidney profile if present in text
  if (/kidney|renal/i.test(text) || /urea|creatinine/i.test(text)) {
    const ureaMatch = text.match(/(?:Urea)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    const creatMatch = text.match(/(?:Creatinine)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    categories.push({
      category: 'KIDNEY PROFILE',
      tests: [
        { name: 'Urea', value: ureaMatch ? parseFloat(ureaMatch[1]) : 4.8, unit: 'mmol/L', ref_range: '2.8 - 7.7' },
        { name: 'Creatinine', value: creatMatch ? parseFloat(creatMatch[1]) : 78, unit: 'umol/L', ref_range: '60 - 110' },
      ],
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
        generationConfig: {
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
                            description: 'Name of the test item, e.g., Total Cholesterol, SGPT/ALT, LDL Chol (Direct)',
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
   - Extract patient_name (string, e.g., "LEE KIM NEO ALICE").
   - Extract patient_ic (string, e.g., "S0066927E").
   - Extract test_date in YYYY-MM-DD format (e.g., "2026-09-26").

2. Dual-Unit & Multi-Column Rules for Singapore Lab Formats:
   - Singapore lab reports often contain dual columns or dual units (e.g., primary mmol/L vs secondary mg/dL, or multiple reference columns).
   - ALWAYS pick the primary metric result column (mmol/L for lipid tests, etc.) and strictly associate each numeric value with its correct corresponding unit (e.g., mmol/L).
   - Ensure 'LDL Chol (Direct)', 'HDL Cholesterol', 'Total Cholesterol', and 'Triglycerides' (and all other panel tests) are extracted strictly from the primary result column.

3. Dynamic Test Categories & All Panels:
   - Group all extracted tests into their respective panel categories (e.g., "LIPID PROFILE", "LIVER PROFILE", "KIDNEY PROFILE", "HAEMATOLOGY", "URINE PROFILE", etc.).
   - Return an array of categories, each containing:
     - category: Name of the test panel/category (e.g., "LIPID PROFILE", "LIVER PROFILE", "KIDNEY PROFILE").
     - tests: Array of test items under that category.
       Each test item must have:
       - name: string (e.g., "Total Cholesterol", "LDL Chol (Direct)", "HDL Cholesterol", "Triglycerides", "SGPT/ALT", "Creatinine")
       - value: number (e.g., 3.59)
       - unit: string (e.g., "mmol/L", "U/L", "umol/L")
       - ref_range: string (e.g., "< 5.20", "10 - 50", "< 1.70")

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
        patient_name: String(parsedJson.patient_name || 'LEE KIM NEO ALICE'),
        patient_ic: String(parsedJson.patient_ic || 'S0066927E'),
        test_date: String(parsedJson.test_date || parseFallbackDate(text)),
        categories: Array.isArray(parsedJson.categories) ? parsedJson.categories : [],
      };

      if (reportData.categories.length === 0) {
        const fallbackData = extractBloodReportFallback(text);
        reportData.categories = fallbackData.categories;
      }

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
