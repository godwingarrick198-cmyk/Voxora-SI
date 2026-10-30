import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

type Turn = { role: 'user' | 'assistant'; text: string };
type RequestBody = { businessName?: string; industry?: string; receptionistName?: string; greeting?: string; instructions?: string; messages?: Turn[] };

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Gemini is not configured on the server.' }, { status: 503 });

    const body = (await request.json()) as RequestBody;
    const businessName = String(body.businessName || 'the business').slice(0, 120);
    const industry = String(body.industry || 'general business').slice(0, 80);
    const receptionistName = String(body.receptionistName || 'Nova').slice(0, 50);
    const instructions = String(body.instructions || '').slice(0, 2500);
    const greeting = String(body.greeting || 'Hello! Thanks for calling. How can I help?').slice(0, 300);
    const messages = Array.isArray(body.messages) ? body.messages.slice(-16).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.text || '').slice(0, 1800) }]
    })) : [];

    const system = `You are ${receptionistName}, the friendly and professional AI receptionist for ${businessName}, a ${industry} business.
Your job: answer questions using only the business information below, understand what the caller needs, and politely collect a name plus a phone number or email when they want a callback, appointment, quote, or follow-up.
Business instructions and facts: ${instructions || 'No additional business facts have been supplied. Do not invent prices, opening hours, policies, availability, addresses, or services. Say you can have a team member confirm unknown details.'}
Opening greeting: ${greeting}
Be concise and natural for spoken conversation. Ask one question at a time. Never claim an appointment is booked; call it a request unless a booking system confirms it. Never pretend to transfer a call or contact staff.
Return ONLY valid JSON with this exact shape:
{"reply":"the words to say aloud","lead":{"caller_name":null,"phone":null,"email":null,"intent":null,"summary":null}|null,"complete":false}
Set lead to an object only when caller has clearly provided at least one contact method and expressed a genuine enquiry or follow-up need. Include only details actually provided. Do not make up missing values. Keep summary factual and short. Set complete true when the enquiry is ready for staff follow-up.`;

    const contents = [{ role: 'user', parts: [{ text: system }] }, ...messages];
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.4, responseMimeType: 'application/json' }
      }),
      signal: AbortSignal.timeout(25000)
    });
    const payload = await response.json();
    if (!response.ok) {
      console.error('Gemini request failed:', response.status, payload?.error?.message);
      return NextResponse.json({ error: 'The AI service could not respond. Check the Gemini key and free-tier quota.' }, { status: 502 });
    }
    const raw = payload?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('');
    if (!raw) return NextResponse.json({ error: 'Gemini returned an empty response. Please try again.' }, { status: 502 });
    const parsed = JSON.parse(raw);
    if (typeof parsed.reply !== 'string') throw new Error('Invalid model response');
    return NextResponse.json({
      reply: parsed.reply.slice(0, 1200),
      lead: parsed.lead && typeof parsed.lead === 'object' ? parsed.lead : null,
      complete: Boolean(parsed.complete)
    });
  } catch (error) {
    console.error('Receptionist route error:', error);
    return NextResponse.json({ error: 'Something went wrong while generating the receptionist response.' }, { status: 500 });
  }
}
