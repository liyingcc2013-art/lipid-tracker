import { NextResponse } from 'next/server';

export async function POST() {
  try {
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

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Google API Error (${res.status}): ${errText}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const rawModels: { name: string }[] = Array.isArray(data.models) ? data.models : [];
    const modelNames = rawModels.map((m) => m.name);

    return NextResponse.json({
      models: modelNames,
    });
  } catch (err: unknown) {
    console.error('Error in extract-lipid-data route:', err);
    const errorMessage =
      err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
