export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export async function GET() {
  try {
    // 1. Query the Supabase lab_results table to find the most recently added record
    const { data: latestLabResults, error: latestLabErr } = await supabase
      .from('lab_results')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (latestLabErr) {
      console.error('Error querying latest lab result:', latestLabErr);
      return NextResponse.json(
        { error: 'Failed to retrieve latest patient record.' },
        { status: 500 }
      );
    }

    if (!latestLabResults || latestLabResults.length === 0) {
      return NextResponse.json({
        success: true,
        patient: null,
        lab_results: [],
        latest_lab_result: null,
      });
    }

    const latestLabResult = latestLabResults[0];
    const patientId = latestLabResult.patient_id;

    if (!patientId) {
      return NextResponse.json({
        success: true,
        patient: null,
        lab_results: [],
        latest_lab_result: latestLabResult,
      });
    }

    // 2. Query patients profile data for specific patient_id
    const { data: patientData, error: patientErr } = await supabase
      .from('patients')
      .select('id, nric, name, dob_or_age')
      .eq('id', patientId)
      .maybeSingle();

    if (patientErr) {
      console.error('Error querying patient profile:', patientErr);
    }

    // 3. Query ALL lab_results for that specific patient_id
    const { data: allLabResults, error: allLabErr } = await supabase
      .from('lab_results')
      .select('id, patient_id, test_date, metrics, file_path, created_at')
      .eq('patient_id', patientId)
      .order('test_date', { ascending: true });

    if (allLabErr) {
      console.error('Error querying patient lab results:', allLabErr);
      return NextResponse.json(
        { error: 'Failed to retrieve patient lab results.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      patient: patientData || null,
      lab_results: allLabResults || [],
      latest_lab_result: latestLabResult,
    });
  } catch (err: unknown) {
    console.error('Error in get-latest-patient route:', err);
    const msg = err instanceof Error ? err.message : 'Internal server error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
