import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType, GenerationConfig } from '@google/generative-ai';

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
  patient_dob_or_age: string;
  test_date: string;
  categories: CategoryPanel[];
}

export function sanitizeRawText(rawText: string): string {
  if (!rawText) return '';

  let sanitized = rawText;

  // 1. Strip all instances of () and ( )
  sanitized = sanitized.replace(/\(\s*\)/g, '');

  // 2. Remove all asterisk characters * attached to out-of-range numbers
  sanitized = sanitized.replace(/\*/g, '');

  // 3. Strip the specific footer text "patient's clinical findings." completely
  sanitized = sanitized.replace(/patient's clinical findings\.?/gi, '');

  // 4. Normalize excessive newlines (e.g., replace \n\n+ with a single newline)
  sanitized = sanitized.replace(/(\r?\n){2,}/g, '\n');

  return sanitized.trim();
}

function parseFallbackDate(rawText: string): string {
  // Try Collected: ... pattern first
  const collectedMatch = rawText.match(/Collected\s*[:=]?\s*([^\r\n]+)/i);
  const targetText = collectedMatch ? collectedMatch[1] : rawText;

  // Try YYYY-MM-DD
  const isoMatch = targetText.match(/\b(20\d{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // Try MM/DD/YYYY or DD/MM/YYYY
  const dateMatch = targetText.match(/\b([0-3]?\d)[-/]([0-3]?\d)[-/](20\d{2})\b/);
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

  const textDateMatch = targetText.match(/\b([A-Za-z]+)\s+([0-9]{1,2}),?\s+(20\d{2})\b/i);
  if (textDateMatch) {
    const month = monthMap[textDateMatch[1].toLowerCase()];
    if (month) {
      const day = textDateMatch[2].padStart(2, '0');
      return `${textDateMatch[3]}-${month}-${day}`;
    }
  }

  // Fall back to entire rawText if targetText didn't match
  if (collectedMatch) {
    return parseFallbackDate(rawText.replace(/Collected\s*[:=]?\s*/i, ''));
  }

  return '';
}

function extractBloodReportFallback(text: string): BloodReportData {
  // Extract Patient Name (in ALL CAPS near top, ignoring disclaimers)
  const nameMatch = text.match(/(?:Patient\s*Name|Name|Patient)\s*[:=]?\s*([^\r\n]+)/i);
  let patient_name = nameMatch ? nameMatch[1].trim() : '';
  patient_name = patient_name.replace(/[\u4e00-\u9fa5]/g, '').replace(/\b(?:NRIC|IC|ID|Date|Sex|Gender|DOB|Age)\b.*/i, '').trim();
  if (patient_name.toLowerCase().includes("'s clinical findings")) {
    patient_name = '';
  }

  // Extract NRIC/IC
  const icMatch = text.match(/\b([STFGM]\d{7}[A-Z])\b/i) || text.match(/(?:NRIC|IC|ID)\s*[:=]?\s*([A-Z0-9]+)/i);
  const patient_ic = icMatch ? icMatch[1].trim().toUpperCase() : '';

  // Extract DOB / Age
  const dobMatch = text.match(/(?:DOB|Date of Birth|Age)\s*[:=]?\s*([^\r\n]+)/i);
  let patient_dob_or_age = dobMatch ? dobMatch[1].trim() : '';
  patient_dob_or_age = patient_dob_or_age.replace(/[\u4e00-\u9fa5]/g, '').replace(/\b(?:Sex|Gender|NRIC|IC|Date)\b.*/i, '').trim();

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
    patient_dob_or_age,
    test_date,
    categories,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawInput: string = body.text || body.rawText || '';

    if (!rawInput || typeof rawInput !== 'string' || rawInput.trim().length === 0) {
      return NextResponse.json(
        { error: 'No text provided for extraction.' },
        { status: 400 }
      );
    }

    const text = sanitizeRawText(rawInput);

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

      const generationConfig: GenerationConfig = {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            patient_name: {
              type: SchemaType.STRING,
              description: 'Standalone ALL CAPS name located near top, usually near "Page X of Y" text (e.g., "LEE KIM NEO ALICE").',
            },
            patient_ic: {
              type: SchemaType.STRING,
              description: 'Standard Singapore NRIC format (e.g., starting with S and ending with a letter).',
            },
            patient_dob_or_age: {
              type: SchemaType.STRING,
              description: 'Patient age or DOB extracted from strings like "77 Years" or "Female".',
            },
            test_date: {
              type: SchemaType.STRING,
              description: 'First date found in DD/MM/YY format (e.g., "26/09/26").',
            },
            categories: {
              type: SchemaType.ARRAY,
              description: 'List of ALL test categories/panels present in the document, strictly grouped under panels like LIPID PROFILE, LIVER PROFILE, KIDNEY PROFILE, DIABETES MELLITUS PROFILE. Exhaustively read entire document.',
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  category: {
                    type: SchemaType.STRING,
                    description: 'Category panel header name (e.g., LIPID PROFILE, LIVER PROFILE, KIDNEY PROFILE, DIABETES MELLITUS PROFILE)',
                  },
                  tests: {
                    type: SchemaType.ARRAY,
                    description: 'List of test items under this category panel',
                    items: {
                      type: SchemaType.OBJECT,
                      properties: {
                        name: {
                          type: SchemaType.STRING,
                          description: 'English test name extracted by splitting squashed strings or handling newlines (e.g., "Total Cholesterol" from "Total Cholesterol3.59mmol/L", "Urea\\n4.90mmol/L").',
                        },
                        value: {
                          type: SchemaType.NUMBER,
                          description: 'Numeric test result value. Strip any leading asterisks (*) from out-of-range values (e.g., "*38U/L" -> 38).',
                        },
                        unit: {
                          type: SchemaType.STRING,
                          description: 'Unit of measurement associated with test value (e.g., mmol/L, U/L, g/L, %).',
                        },
                        ref_range: {
                          type: SchemaType.STRING,
                          description: 'Reference range string (e.g., <5.20 or 10-50).',
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
          required: ['patient_name', 'patient_ic', 'patient_dob_or_age', 'test_date', 'categories'],
        },
      };

      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-pro',
        systemInstruction:
          'You are a strict, exhaustive medical data parser with spatial reasoning for handling squashed and stripped 1D PDF text output. You MUST NOT hallucinate, infer, or generate synthetic data.\n\n' +
          'CRITICAL MANDATES:\n' +
          '1. TEST PARSING HEURISTICS:\n' +
          '   - Test names, values, and units in the raw PDF text are merged together without spaces (e.g., "Total Cholesterol3.59mmol/L").\n' +
          '   - You must intelligently split squashed strings like "Total Cholesterol3.59mmol/L(<5.20)139mg/dL(<200)" into:\n' +
          '     Name: "Total Cholesterol", Value: 3.59, Unit: "mmol/L".\n' +
          '   - Test names and values are often separated by newlines and empty parentheses. For example, \'HDL Cholesterol\\n()\\n1.54mmol/L\' maps to Name: \'HDL Cholesterol\', Value: 1.54, Unit: \'mmol/L\'. You must scan across these breaks to connect the test with its value.\n' +
          '   - Strip any leading asterisks (*) from out-of-range numeric values (e.g., "*38U/L") before outputting them to JSON so value is purely numeric (e.g., 38).\n' +
          '   - Handle cases where the test name is separated from the value by a newline (e.g., "Urea\\n4.90mmol/L").\n' +
          '   - Group tests strictly under their respective panels (LIPID PROFILE, LIVER PROFILE, KIDNEY PROFILE, DIABETES MELLITUS PROFILE).\n\n' +
          '2. METADATA HEURISTICS:\n' +
          '   - ONLY extract the following 4 metadata fields:\n' +
          '     - Patient Name: Find the standalone ALL CAPS name (e.g., "LEE KIM NEO ALICE") located near the top, usually near the "Page X of Y" text.\n' +
          '     - Patient IC: Look for the standard Singapore NRIC format (e.g., starting with \'S\' and ending with a letter).\n' +
          '     - Test Date: Find the first date in DD/MM/YY format (e.g., "26/09/26").\n' +
          '     - Patient Age/DOB: Look for strings like "77 Years" or "Female" and extract the age.\n' +
          '   - STRICT EXCLUSION: Explicitly IGNORE and omit all information regarding ordering doctors, clinic addresses, clinic names, lab details, and facility addresses.\n\n' +
          '3. STRICT RULES & EXHAUSTIVE ENFORCEMENT:\n' +
          '   - You must extract EVERY test from the raw text. Do not stop after the first panel. Populate the Lipid, Liver, Kidney, and Diabetes profiles fully.\n' +
          '   - Exhaustively read the entire document to the end.\n' +
          '   - Do NOT perform lazy extraction or stop after extracting only one test or panel.\n' +
          '   - Output strict JSON. Do not include Markdown formatting in the response block.',
        generationConfig,
      });

      const prompt = `Analyze the following blood test lab report text and perform an exhaustive multi-panel extraction along with strict patient metadata filtering.

1. TEST PARSING HEURISTICS:
   - Raw PDF text has stripped spaces between test names, values, and units (e.g., "Total Cholesterol3.59mmol/L").
   - Intelligently split squashed strings like "Total Cholesterol3.59mmol/L(<5.20)139mg/dL(<200)" into:
     Name: "Total Cholesterol", Value: 3.59, Unit: "mmol/L".
   - Test names and values are often separated by newlines and empty parentheses. For example, 'HDL Cholesterol\n()\n1.54mmol/L' maps to Name: 'HDL Cholesterol', Value: 1.54, Unit: 'mmol/L'. You must scan across these breaks to connect the test with its value.
   - Strip any leading asterisks (*) from out-of-range numeric values (e.g., "*38U/L" -> 38) before outputting to JSON.
   - Handle cases where the test name is separated from the value by a newline (e.g., "Urea\n4.90mmol/L").
   - Maintain the requirement to group tests strictly under their respective panels (LIPID PROFILE, LIVER PROFILE, KIDNEY PROFILE, DIABETES MELLITUS PROFILE).

2. METADATA HEURISTICS:
   - Patient Name: Find the standalone ALL CAPS name (e.g., "LEE KIM NEO ALICE") located near the top, usually near the "Page X of Y" text.
   - Patient IC: Look for the standard Singapore NRIC format (e.g., starting with 'S' and ending with a letter).
   - Test Date: Find the first date in DD/MM/YY format (e.g., "26/09/26").
   - Patient Age/DOB: Look for strings like "77 Years" or "Female" and extract the age.
   - STRICT EXCLUSION: Explicitly IGNORE and omit all information regarding ordering doctors, clinic addresses, clinic names, lab details, and facility addresses.

3. STRICT RULES & EXHAUSTIVE ENFORCEMENT:
   - You must extract EVERY test from the raw text. Do not stop after the first panel. Populate the Lipid, Liver, Kidney, and Diabetes profiles fully.
   - Exhaustively read the entire document to the end.
   - Output strict JSON matching the schema. Do not include Markdown formatting in the response block.

Lab report text:
"""
${text}
"""`;

      const overrideCommand =
        'CRITICAL SYSTEM OVERRIDE: The text contains multiple panels (Lipid, Liver, Kidney, Diabetes). You are strictly forbidden from terminating after the first match. You must extract every test present in the text.';

      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { text: overrideCommand },
            ],
          },
        ],
        generationConfig,
      });
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
        patient_dob_or_age: String(parsedJson.patient_dob_or_age || ''),
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
