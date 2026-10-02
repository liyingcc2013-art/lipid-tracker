import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filePath = searchParams.get('filePath') || searchParams.get('file_path');

    if (!filePath) {
      return NextResponse.json(
        { error: 'Missing filePath query parameter.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.storage
      .from('blood-reports')
      .createSignedUrl(filePath, 60);

    if (error || !data?.signedUrl) {
      console.error('Error generating signed URL from Supabase storage:', error);
      return NextResponse.json(
        { error: error?.message || 'Failed to generate signed URL for PDF.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      signedUrl: data.signedUrl,
      filePath,
    });
  } catch (err: unknown) {
    console.error('Error in get-pdf-url route:', err);
    const errorMessage =
      err instanceof Error ? err.message : 'Failed to generate signed URL.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
