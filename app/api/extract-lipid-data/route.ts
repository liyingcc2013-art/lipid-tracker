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
  const nameMatch = text.match(/(?:Patient\s*Name|Patient)\s*[:=]?\s*([^\r\n]+)/i);
  let patient_name = nameMatch ? nameMatch[1].trim() : '';
  if (patient_name) {
    patient_name = patient_name.replace(/\b(?:NRIC|IC|ID|Date|Sex|Gender|DOB)\b.*/i, '').trim();
  }

  // Extract NRIC/IC
  const icMatch = text.match(/\b([STFGM]\d{7}[A-Z])\b/i) || text.match(/(?:NRIC|IC|ID)\s*[:=]?\s*([A-Z0-9]+)/i);
  const patient_ic = icMatch ? icMatch[1].trim().toUpperCase() : '';

  // Extract Test Date
  const test_date = parseFallbackDate(text);

  // Extract Unit
  const unitMatch = text.match(/\b(mmol\/L|mg\/dL)\b/i);
  const lipidUnit = unitMatch ? unitMatch[1] : 'mmol/L';

  const lipidTests: TestItem[] = [];

  const tcMatch = text.match(/(?:Total\s+Cholesterol|Cholesterol,?\s*Total)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (tcMatch) {
    lipidTests.push({ name: 'Total Cholesterol', value: parseFloat(tcMatch[1]), unit: lipidUnit, ref_range: '< 5.20' });
  }

  const trigMatch = text.match(/(?:Triglycerides?)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (trigMatch) {
    lipidTests.push({ name: 'Triglycerides', value: parseFloat(trigMatch[1]), unit: lipidUnit, ref_range: '< 1.70' });
  }

  const hdlMatch = text.match(/(?:HDL\s+Cholesterol|HDL(?:-C)?(?:\s+Cholesterol)?)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (hdlMatch) {
    lipidTests.push({ name: 'HDL Cholesterol', value: parseFloat(hdlMatch[1]), unit: lipidUnit, ref_range: '> 1.00' });
  }

  const ldlMatch = text.match(/(?:LDL\s+Chol\s*\(Direct\)|LDL(?:-C)?(?:\s+Cholesterol)?|LDL\s+CALC(?:ULATED)?)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (ldlMatch) {
    lipidTests.push({ name: 'LDL Chol (Direct)', value: parseFloat(ldlMatch[1]), unit: parseFloat(ldlMatch[1]) > 0 ? lipidUnit : 'mmol/L', ref_range: '< 2.60' });
  }

  const categories: CategoryPanel[] = [];
  if (lipidTests.length > 0) {
    categories.push({ category: 'LIPID PROFILE', tests: lipidTests });
  }

  // Liver profile tests
  const liverTests: TestItem[] = [];
  const altMatch = text.match(/(?:SGPT\/ALT|ALT|SGPT)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (altMatch) {
    liverTests.push({ name: 'SGPT/ALT', value: parseFloat(altMatch[1]), unit: 'U/L', ref_range: '10 - 50' });
  }
  const astMatch = text.match(/(?:SGOT\/AST|AST|SGOT)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (astMatch) {
    liverTests.push({ name: 'SGOT/AST', value: parseFloat(astMatch[1]), unit: 'U/L', ref_range: '10 - 45' });
  }
  if (liverTests.length > 0) {
    categories.push({ category: 'LIVER PROFILE', tests: liverTests });
  }

  // Kidney profile tests
  const kidneyTests: TestItem[] = [];
  const ureaMatch = text.match(/(?:Urea)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (ureaMatch) {
    kidneyTests.push({ name: 'Urea', value: parseFloat(ureaMatch[1]), unit: 'mmol/L', ref_range: '2.8 - 7.7' });
  }
  const creatMatch = text.match(/(?:Creatinine)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (creatMatch) {
    kidneyTests.push({ name: 'Creatinine', value: parseFloat(creatMatch[1]), unit: 'umol/L', ref_range: '60 - 110' });
  }
  if (kidneyTests.length > 0) {
    categories.push({ category: 'KIDNEY PROFILE', tests: kidneyTests });
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
      const systemInstruction =
        'You are a strict medical data parser. You MUST NOT hallucinate, infer, or generate synthetic data. Extract ONLY values explicitly present in the provided raw text. If a test or value is missing, you MUST omit it. The raw text contains English test names immediately followed by Chinese characters (e.g., \'LDL Chol (Direct) 低脂蛋白(坏)胆固醇 1.74 mmol/L\'). You must ignore the Chinese characters and extract the first numeric value and its corresponding unit.';

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        systemInstruction,
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
                description: 'Date of test in YYYY-MM-DD format',
              },
              categories: {
                type: SchemaType.ARRAY,
                description: 'List of test categories/panels extracted from the raw lab report text',
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    category: {
                      type: SchemaType.STRING,
                      description: 'Category or panel name, e.g., LIPID PROFILE, LIVER PROFILE',
                    },
                    tests: {
                      type: SchemaType.ARRAY,
                      description: 'List of test items present in raw text under this category',
                      items: {
                        type: SchemaType.OBJECT,
                        properties: {
                          name: {
                            type: SchemaType.STRING,
                            description: 'English-only name of the test item (omit Chinese characters)',
                          },
                          value: {
                            type: SchemaType.NUMBER,
                            description: 'First numeric value associated with the test result',
                          },
                          unit: {
                            type: SchemaType.STRING,
                            description: 'Unit of measurement associated with the numeric value',
                          },
                          ref_range: {
                            type: SchemaType.STRING,
                            description: 'Reference range string present in text',
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

      const prompt = `Extract blood report metadata and test results strictly from the provided raw text below. Do NOT generate or infer synthetic or missing data.

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
        test_date: String(parsedJson.test_date || parseFallbackDate(text) || ''),
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
