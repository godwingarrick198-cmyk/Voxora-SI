import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'voxora-ai',
    mode: 'browser-receptionist',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    databaseConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    telephonyConfigured: false,
  });
}
