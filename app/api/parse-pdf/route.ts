import { NextRequest, NextResponse } from 'next/server';
// @ts-expect-error pdf-parse/lib/pdf-parse.js bypasses root test file check on import
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No PDF file provided.' },
        { status: 400 }
      );
    }

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload a PDF file.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parsedData = await pdfParse(buffer);

    return NextResponse.json({
      success: true,
      filename: file.name,
      text: parsedData.text,
      numpages: parsedData.numpages,
      info: parsedData.info,
    });
  } catch (err: unknown) {
    console.error('Error parsing PDF:', err);
    const errorMessage = err instanceof Error ? err.message : 'Failed to parse PDF file.';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
