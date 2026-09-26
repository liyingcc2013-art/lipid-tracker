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
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not configured in the environment.' },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction:
        'You are a strict medical data parser with spatial reasoning for handling disjointed, squashed, and scrambled 1D PDF text output. You MUST NOT hallucinate, infer, or generate synthetic data. Extract ONLY values explicitly present in the provided raw text. If a test or value is missing, you MUST omit it.\n\n' +
        'CRITICAL PARSING & SPATIAL REASONING RULES:\n' +
        '1. PATIENT NAME: The patient name usually appears in ALL CAPS near the top of the text, often near the I/C number or age/gender. Do NOT extract footer text like "\'s clinical findings." or disclaimers.\n' +
        '2. TEST DATE: Look for the date following keywords like "Collected:" or "Reported:". Format as YYYY-MM-DD.\n' +
        '3. SQUASHED & MERGED COLUMNS: The text contains merged columns like "3.59mmol/L(<5.20)139mg/dL". You must find the English test name, ignore the Chinese characters, and extract the FIRST numeric value and its immediate unit (e.g., 3.59 and mmol/L). Map these to: patient_name, patient_ic, test_date, and an array of panels containing tests.',
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            patient_name: {
              type: SchemaType.STRING,
              description: 'Patient full name in ALL CAPS usually found near top near I/C number or age/gender.',
            },
            patient_ic: {
              type: SchemaType.STRING,
              description: 'Patient IC/NRIC/ID number, e.g., S0066927E',
            },
            test_date: {
              type: SchemaType.STRING,
              description: 'Date following keywords like "Collected:" or "Reported:" formatted as YYYY-MM-DD',
            },
            categories: {
              type: SchemaType.ARRAY,
              description: 'List of test categories/panels present in the report',
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
                          description: 'FIRST numeric value extracted for this test item',
                        },
                        unit: {
                          type: SchemaType.STRING,
                          description: 'Immediate unit associated with the numeric value, e.g., mmol/L, U/L, g/L, %',
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

INSTRUCTIONS & RULES FOR SQUASHED / MERGED TEXT:
1. Patient Metadata:
   - Extract patient_name: The patient name usually appears in ALL CAPS near the top of the text, often near the I/C number or age/gender. Do NOT extract footer text like "'s clinical findings."
   - Extract patient_ic (string).
   - Extract test_date: Look for the date following keywords like "Collected:" or "Reported:". Format as YYYY-MM-DD.

2. Merged Column Extraction Rules:
   - The text contains merged columns like '3.59mmol/L(<5.20)139mg/dL'. You must find the English test name, ignore the Chinese characters, and extract the FIRST numeric value and its immediate unit (e.g., 3.59 and mmol/L). Map these to: patient_name, patient_ic, test_date, and an array of panels containing tests.
   - Actively search for all panels present in the report.
   - You MUST NOT generate synthetic data, infer, or hallucinate missing tests.
   - Extract ONLY tests explicitly present in the text.

3. Dynamic Test Categories:
   - Group all extracted tests into their respective panel categories (e.g. LIPID PROFILE, LIVER PROFILE, KIDNEY PROFILE).
   - Return an array of categories, each containing:
     - category: Name of the test panel/category
     - tests: Array of test items under that category.
       Each test item must have:
       - name: string (English name only)
       - value: number (FIRST numeric value extracted)
       - unit: string (immediate unit)
       - ref_range: string

Lab report text:
"""
${text}
"""`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    let parsedJson;
    try {
      // Clean response string if wrapped in markdown code block
      const cleanedJsonText = responseText
        .replace(/^```(?:json)?/gi, '')
        .replace(/```$/g, '')
        .trim();
      parsedJson = JSON.parse(cleanedJsonText);
    } catch (parseErr: unknown) {
      const parseErrMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      return NextResponse.json(
        { error: `JSON parse error: ${parseErrMsg}. Raw output: ${responseText}` },
        { status: 500 }
      );
    }

    const reportData: BloodReportData = {
      patient_name: String(parsedJson.patient_name || ''),
      patient_ic: String(parsedJson.patient_ic || ''),
      test_date: String(parsedJson.test_date || ''),
      categories: Array.isArray(parsedJson.categories) ? parsedJson.categories : [],
    };

    return NextResponse.json({
      success: true,
      ...reportData,
    });
  } catch (err: unknown) {
    console.error('Error in extract-lipid-data route:', err);
    const errorMessage =
      err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
