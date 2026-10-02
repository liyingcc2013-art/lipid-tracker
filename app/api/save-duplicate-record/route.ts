import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { formatDateForDb, BloodReportData } from '../extract-lipid-data/route';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const reportData: BloodReportData = {
      patient_name: String(body.patient_name || body.extracted_data?.patient_name || ''),
      patient_ic: String(body.patient_ic || body.extracted_data?.patient_ic || ''),
      patient_dob_or_age: String(
        body.patient_dob_or_age || body.extracted_data?.patient_dob_or_age || ''
      ),
      test_date: String(body.test_date || body.extracted_data?.test_date || ''),
      categories: Array.isArray(body.categories)
        ? body.categories
        : Array.isArray(body.extracted_data?.categories)
        ? body.extracted_data.categories
        : [],
      file_path: body.file_path || body.extracted_data?.file_path || null,
    };

    if (!reportData.patient_ic && !reportData.test_date && reportData.categories.length === 0) {
      return NextResponse.json(
        { error: 'Invalid or empty blood report data provided.' },
        { status: 400 }
      );
    }

    let patientId: string | null = null;
    let labResultId: string | null = null;

    if (reportData.patient_ic) {
      // 1. Upsert patient
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
      // 2. Unconditionally insert lab result row referencing patient_id
      const formattedDate = formatDateForDb(reportData.test_date);
      const { data: labData, error: labError } = await supabase
        .from('lab_results')
        .insert({
          patient_id: patientId,
          test_date: formattedDate,
          metrics: reportData.categories,
          file_path: reportData.file_path || null,
        })
        .select('id')
        .single();

      if (labError) {
        console.error('Error force-saving lab results into Supabase:', labError);
        return NextResponse.json(
          { error: 'Failed to insert duplicate record into database.' },
          { status: 500 }
        );
      } else if (labData) {
        labResultId = labData.id;
      }
    }

    return NextResponse.json({
      success: true,
      forced_save: true,
      patient_id: patientId,
      lab_result_id: labResultId,
      ...reportData,
    });
  } catch (err: unknown) {
    console.error('Error in save-duplicate-record route:', err);
    const errorMessage =
      err instanceof Error ? err.message : 'Failed to save duplicate record.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
