import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });

    const body = await request.json();
    const businessName = String(body.businessName || '').trim().slice(0, 120);
    if (!businessName) return NextResponse.json({ error: 'Business name is required.' }, { status: 400 });

    const lead = body.lead || {};
    const transcript = Array.isArray(body.transcript) ? body.transcript.slice(-30).map((t: { role?: string; text?: string }) => ({
      role: t.role === 'assistant' ? 'assistant' : 'caller',
      text: String(t.text || '').slice(0, 1800)
    })) : [];

    const response = await fetch(`${url}/rest/v1/demo_leads`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        business_name: businessName,
        caller_name: typeof lead.caller_name === 'string' ? lead.caller_name.slice(0, 120) : null,
        phone: typeof lead.phone === 'string' ? lead.phone.slice(0, 40) : null,
        email: typeof lead.email === 'string' ? lead.email.slice(0, 254) : null,
        intent: typeof lead.intent === 'string' ? lead.intent.slice(0, 300) : null,
        summary: typeof lead.summary === 'string' ? lead.summary.slice(0, 2000) : null,
        transcript
      })
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error('Supabase lead insert failed:', response.status, detail);
      return NextResponse.json({ error: 'Lead could not be saved to the database.' }, { status: 502 });
    }
    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error('Lead save error:', error);
    return NextResponse.json({ error: 'Could not save this lead.' }, { status: 500 });
  }
}
