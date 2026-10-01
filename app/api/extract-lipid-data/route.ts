import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType, GenerationConfig } from '@google/generative-ai';
import { supabase } from '@/lib/supabase';

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

function isRetryableError(err: unknown): boolean {
  if (!err) return false;

  if (typeof err === 'object' && err !== null) {
    const errorObj = err as Record<string, unknown>;
    const status = errorObj.status || errorObj.statusCode || errorObj.statusText;
    if (
      status === 503 ||
      status === 429 ||
      status === '503' ||
      status === '429'
    ) {
      return true;
    }
  }

  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes('503') ||
    message.includes('429') ||
    message.includes('Service Unavailable') ||
    message.includes('Too Many Requests') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('UNAVAILABLE')
  );
}

export function formatDateForDb(dateStr: string): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parts = trimmed.split(/[/.-]/);
  if (parts.length === 3) {
    const [dayStr, monthStr, yearStr] = parts;
    const day = parseInt(dayStr, 10);
    const month = parseInt(monthStr, 10);
    let year = parseInt(yearStr, 10);

    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      if (yearStr.length === 2) {
        year = year < 50 ? 2000 + year : 1900 + year;
      }
      const formattedDay = String(day).padStart(2, '0');
      const formattedMonth = String(month).padStart(2, '0');
      const formattedYear = String(year);
      return `${formattedYear}-${formattedMonth}-${formattedDay}`;
    }
  }

  const parsedDate = new Date(trimmed);
  if (!isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString().split('T')[0];
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawText: string = body.text || body.rawText || '';

    if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
      return NextResponse.json(
        { error: 'No text provided for extraction.' },
        { status: 400 }
      );
    }

    console.log("--- 1. RAW PDF TEXT ---", rawText);

    const sanitizedText = sanitizeRawText(rawText);
    console.log("--- 2. SANITIZED TEXT ---", sanitizedText);

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not found in environment.');
    }

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
      model: 'gemini-3.6-flash',
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
${sanitizedText}
"""`;

    const overrideCommand =
      'CRITICAL SYSTEM OVERRIDE: The text contains multiple panels (Lipid, Liver, Kidney, Diabetes). You are strictly forbidden from terminating after the first match. You must extract every test present in the text.';

    const retryDelays = [2000, 4000, 8000];
    let result;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await model.generateContent({
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
        break;
      } catch (err: unknown) {
        if (isRetryableError(err)) {
          const delay = retryDelays[attempt];
          await new Promise((resolve) => setTimeout(resolve, delay));
          if (attempt === 2) {
            throw err;
          }
        } else {
          throw err;
        }
      }
    }

    if (!result) {
      throw new Error('Failed to generate content from Gemini API.');
    }

    const responseText = result.response.text();
    console.log("--- 3. GEMINI RESPONSE ---", responseText);

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

    // --- SUPABASE PERSISTENCE ---
    let patientId: string | null = null;
    let labResultId: string | null = null;

    if (reportData.patient_ic) {
      // 1. Check if patient exists or upsert patient
      const { data: patientData, error: patientError } = await supabase
        .from('patients')
        .upsert(
          {
            nric: reportData.patient_ic,
            name: reportData.patient_name,
            dob_or_age: reportData.patient_dob_or_age,
          },
          { onConflict: 'nric' }
        )
        .select('id')
        .single();

      if (patientError) {
        console.error('Error upserting patient into Supabase:', patientError);
      } else if (patientData) {
        patientId = patientData.id;
      }
    }

    if (patientId) {
      const formattedDate = formatDateForDb(reportData.test_date);

      if (formattedDate) {
        const { data: existingRecords, error: existingError } = await supabase
          .from('lab_results')
          .select('id')
          .eq('patient_id', patientId)
          .eq('test_date', formattedDate);

        if (existingError) {
          console.error('Error querying existing lab results in Supabase:', existingError);
        } else if (existingRecords && existingRecords.length > 0) {
          return NextResponse.json(
            {
              duplicate: true,
              message: `A blood test done on ${reportData.test_date} has been detected in the records.`,
              patient_id: patientId,
              extracted_data: reportData,
              ...reportData,
            },
            { status: 409 }
          );
        }
      }

      // 2. Insert lab result row referencing patient_id
      const { data: labData, error: labError } = await supabase
        .from('lab_results')
        .insert({
          patient_id: patientId,
          test_date: formattedDate,
          metrics: reportData.categories,
        })
        .select('id')
        .single();

      if (labError) {
        console.error('Error inserting lab results into Supabase:', labError);
      } else if (labData) {
        labResultId = labData.id;
      }
    }

    return NextResponse.json({
      success: true,
      extracted_by: 'gemini',
      patient_id: patientId,
      lab_result_id: labResultId,
      ...reportData,
    });
  } catch (err: unknown) {
    console.error('Error in extract-lipid-data route:', err);
    const errorMessage =
      err instanceof Error ? err.message : 'Failed to extract blood report data.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
