import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

async function signedIn(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return { error: 'Sign in to continue.', status: 401 as const };
  const response = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + token }, cache: 'no-store' });
  if (!response.ok) return { error: 'Your session has expired. Sign in again.', status: 401 as const };
  return { token, url, anon, user: await response.json() };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await signedIn(request);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json();
    const prospectId = String(body.prospectId || '');
    const action = body.action === 'send' ? 'send' : 'draft';
    const key = process.env.GEMINI_API_KEY;
    const pResponse = await fetch(auth.url + '/rest/v1/prospects?id=eq.' + encodeURIComponent(prospectId) + '&select=*,businesses(name,industry)', {
      headers: { apikey: auth.anon, Authorization: 'Bearer ' + auth.token }, cache: 'no-store'
    });
    const rows = await pResponse.json();
    const prospect = Array.isArray(rows) ? rows[0] : null;
    if (!pResponse.ok || !prospect) return NextResponse.json({ error: 'Prospect not found or access denied.' }, { status: 404 });
    if (action === 'draft') {
      if (!key) return NextResponse.json({ error: 'AI email drafting is not configured.' }, { status: 503 });
      const prompt = `Write a concise, genuinely personalised first-contact B2B email from the business "${prospect.businesses?.name || 'our business'}" to "${prospect.company_name}". The sender offers: ${String(body.offer || 'professional services relevant to the recipient').slice(0,500)}. Prospect context: ${String(prospect.description || '').slice(0,800)}. Source: ${prospect.source_url}. Do not claim facts not present in context, do not pretend the recipient requested contact, do not use manipulative urgency. Include a clear, low-pressure question and a simple opt-out sentence. Return ONLY JSON {"subject":"...","body":"..."}.`;
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, responseMimeType: 'application/json' } }),
        signal: AbortSignal.timeout(20000)
      });
      const payload = await response.json();
      if (!response.ok) return NextResponse.json({ error: response.status === 429 ? 'Gemini quota reached. Try again later.' : 'Could not generate the outreach draft.' }, { status: 502 });
      const raw = payload?.candidates?.[0]?.content?.parts?.map((x: {text?:string}) => x.text || '').join('');
      const draft = JSON.parse(raw || '{}');
      if (typeof draft.subject !== 'string' || typeof draft.body !== 'string') throw new Error('Invalid email draft.');
      const saved = await fetch(auth.url + '/rest/v1/prospect_messages', {
        method: 'POST', headers: { apikey: auth.anon, Authorization: 'Bearer ' + auth.token, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ business_id: prospect.business_id, prospect_id: prospect.id, direction: 'outbound', subject: draft.subject.slice(0,200), body: draft.body.slice(0,8000), delivery_status: 'draft' })
      });
      const savedRows = await saved.json();
      if (!saved.ok) return NextResponse.json({ error: 'Draft generated but could not be saved.' }, { status: 502 });
      return NextResponse.json({ subject: draft.subject, body: draft.body, messageId: savedRows?.[0]?.id });
    }

    const email = String(prospect.email || '').trim();
    const subject = String(body.subject || '').trim().slice(0,200);
    const message = String(body.body || '').trim().slice(0,8000);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'No verified public email address is available for this prospect. Do not guess one.' }, { status: 400 });
    if (!subject || !message) return NextResponse.json({ error: 'Review and provide both an email subject and message.' }, { status: 400 });
    const priorResponse = await fetch(auth.url + '/rest/v1/prospect_messages?prospect_id=eq.' + encodeURIComponent(prospect.id) + '&direction=eq.outbound&delivery_status=eq.sent&select=id&limit=1', { headers: { apikey: auth.anon, Authorization: 'Bearer ' + auth.token }, cache: 'no-store' });
    const priorMessages = await priorResponse.json();
    if (!priorResponse.ok) return NextResponse.json({ error: 'Could not verify previous outreach history. Sending was stopped for safety.' }, { status: 502 });
    if (Array.isArray(priorMessages) && priorMessages.length) return NextResponse.json({ error: 'An email has already been sent to this prospect from Vexora. Review the message history before sending again.' }, { status: 409 });
    const gmailUser = process.env.GMAIL_USER;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
    if (!gmailUser || !gmailAppPassword) return NextResponse.json({ error: 'Gmail sending is not configured. Add GMAIL_APP_PASSWORD in Vercel.' }, { status: 503 });
    if (gmailUser.toLowerCase() !== 'pixelpulsestudio777@gmail.com') return NextResponse.json({ error: 'The configured Gmail sender does not match the approved Vexora sender.' }, { status: 503 });
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailAppPassword },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000
    });
    let sendPayload: { messageId?: string };
    try {
      const sent = await transporter.sendMail({
        from: { name: 'Pixel Pulse Studio', address: gmailUser },
        to: email,
        replyTo: gmailUser,
        subject,
        text: message,
        headers: { 'X-Mailer': 'Vexora SI' }
      });
      sendPayload = { messageId: sent.messageId };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown SMTP error';
      console.error('Gmail SMTP outreach failed:', detail);
      return NextResponse.json({ error: 'Gmail could not send this email. Check the Gmail app password and account sending limits.' }, { status: 502 });
    } finally {
      transporter.close();
    }
    const logResponse = await fetch(auth.url + '/rest/v1/prospect_messages', {
      method: 'POST', headers: { apikey: auth.anon, Authorization: 'Bearer ' + auth.token, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ business_id: prospect.business_id, prospect_id: prospect.id, direction: 'outbound', subject, body: message, provider_message_id: sendPayload?.messageId || null, delivery_status: 'sent' })
    });
    if (!logResponse.ok) console.error('Email sent but activity log failed:', logResponse.status);
    await fetch(auth.url + '/rest/v1/prospects?id=eq.' + encodeURIComponent(prospect.id), {
      method: 'PATCH', headers: { apikey: auth.anon, Authorization: 'Bearer ' + auth.token, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'emailed', updated_at: new Date().toISOString() })
    });
    return NextResponse.json({ ok: true, recipient: email, messageId: sendPayload?.messageId || null });
  } catch (error) {
    console.error('Prospect outreach route failed:', error);
    return NextResponse.json({ error: 'Outreach request failed. Please try again.' }, { status: 500 });
  }
}
