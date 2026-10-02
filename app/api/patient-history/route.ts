import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const patientIdParam = searchParams.get('patient_id');
    const patientIcParam = searchParams.get('patient_ic') || searchParams.get('nric');

    if (!patientIdParam && !patientIcParam) {
      return NextResponse.json(
        { error: 'Missing patient_id or patient_ic parameter.' },
        { status: 400 }
      );
    }

    let patientId = patientIdParam;
    let patientData = null;

    if (patientIcParam) {
      const { data: patient, error: patientErr } = await supabase
        .from('patients')
        .select('id, nric, name, dob_or_age')
        .eq('nric', patientIcParam.trim())
        .maybeSingle();

      if (patientErr) {
        console.error('Error fetching patient by IC:', patientErr);
      }

      if (patient) {
        patientId = patient.id;
        patientData = patient;
      }
    } else if (patientId) {
      const { data: patient, error: patientErr } = await supabase
        .from('patients')
        .select('id, nric, name, dob_or_age')
        .eq('id', patientId)
        .maybeSingle();

      if (patientErr) {
        console.error('Error fetching patient by ID:', patientErr);
      }

      if (patient) {
        patientData = patient;
      }
    }

    if (!patientId) {
      return NextResponse.json({
        success: true,
        patient: null,
        lab_results: [],
      });
    }

    const { data: labResults, error: labErr } = await supabase
      .from('lab_results')
      .select('id, patient_id, test_date, metrics, file_path, created_at')
      .eq('patient_id', patientId)
      .order('test_date', { ascending: true });

    if (labErr) {
      console.error('Error fetching lab results:', labErr);
      return NextResponse.json(
        { error: 'Failed to retrieve lab results.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      patient: patientData,
      lab_results: labResults || [],
    });
  } catch (err: unknown) {
    console.error('Error in patient-history route:', err);
    const msg = err instanceof Error ? err.message : 'Internal server error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
