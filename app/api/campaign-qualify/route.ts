import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const expected = process.env.VOXORA_CAMPAIGN_WORKER_SECRET;
  const supplied = request.headers.get('x-voxora-worker-secret');
  if (!expected || !supplied || supplied !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI qualification is not configured.' }, { status: 503 });
  try {
    const body = await request.json();
    const niche = String(body.niche || '').slice(0, 180);
    const country = String(body.country || '').slice(0, 100);
    const title = String(body.title || '').slice(0, 300);
    const description = String(body.description || '').slice(0, 1200);
    const url = String(body.url || '').slice(0, 500);
    if (!niche || !country || !title || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: 'Incomplete research evidence.' }, { status: 400 });
    }
    const prompt = `You are a careful B2B prospect researcher. Decide whether the supplied search result is a genuine business in the requested niche and located in or serving the target country. Do not infer that the business is actively buying, hiring, or seeking a service. Exclude directories, articles, social networks, job boards, and irrelevant pages. Do not invent details. Return only JSON in this shape: {"qualified":true,"companyName":"business name as evidenced","reason":"brief evidence-based explanation"}. If uncertain, set qualified false. Niche: ${niche}. Country: ${country}. Result title: ${title}. Description: ${description}. URL: ${url}`;
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } }),
      signal: AbortSignal.timeout(18000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json({ error: String(payload?.error?.message || 'AI provider failed').slice(0, 220) }, { status: 502 });
    const output = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || '{}';
    const parsed = JSON.parse(output);
    return NextResponse.json({ qualified: parsed.qualified === true, companyName: typeof parsed.companyName === 'string' ? parsed.companyName.slice(0, 160) : '', reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 500) : '' });
  } catch {
    return NextResponse.json({ error: 'AI qualification failed.' }, { status: 502 });
  }
}
