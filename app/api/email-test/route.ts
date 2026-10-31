import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const apiKey = process.env.BREVO_API_KEY;
    if (!token || !supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Please sign in again before testing email.' }, { status: 401 });
    }
    if (!apiKey) return NextResponse.json({ error: 'Brevo is not configured on the server.' }, { status: 503 });

    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!authResponse.ok) return NextResponse.json({ error: 'Your session is invalid. Please sign in again.' }, { status: 401 });
    const user = await authResponse.json();
    const recipient = typeof user.email === 'string' ? user.email : '';
    if (!recipient) return NextResponse.json({ error: 'Your account has no email address to receive the test.' }, { status: 400 });

    const sendersResponse = await fetch('https://api.brevo.com/v3/senders?limit=50&offset=0', {
      headers: { accept: 'application/json', 'api-key': apiKey },
      cache: 'no-store'
    });
    const sendersPayload = await sendersResponse.json().catch(() => ({}));
    if (!sendersResponse.ok) {
      console.error('Brevo sender lookup failed:', sendersResponse.status, sendersPayload?.message);
      const detail = typeof sendersPayload?.message === 'string' ? sendersPayload.message : typeof sendersPayload?.code === 'string' ? sendersPayload.code : 'No error detail returned';
      return NextResponse.json({ error: 'Brevo sender lookup failed (HTTP ' + sendersResponse.status + '): ' + detail.slice(0, 220) }, { status: 502 });
    }
    const senders = Array.isArray(sendersPayload?.senders) ? sendersPayload.senders : [];
    const sender = senders.find((item: any) => item.active === true && typeof item.email === 'string');
    if (!sender) {
      return NextResponse.json({ error: 'Brevo API key is accepted, but there is no active verified sender. Verify a sender email in Brevo, then test again.' }, { status: 409 });
    }

    const messageResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        sender: { email: sender.email, name: sender.name || 'Vexora SI' },
        to: [{ email: recipient }],
        subject: 'Vexora SI email connection test',
        textContent: 'Your Vexora SI workspace has successfully sent this test email through Brevo. Transactional email delivery is connected.',
        htmlContent: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#202033"><h2>Vexora SI email test</h2><p>Your Vexora SI workspace has successfully sent this test email through Brevo.</p><p>Transactional email delivery is connected.</p></div>',
        tags: ['vexora-email-test']
      }),
      signal: AbortSignal.timeout(20000)
    });
    const messagePayload = await messageResponse.json().catch(() => ({}));
    if (!messageResponse.ok) {
      console.error('Brevo send failed:', messageResponse.status, messagePayload?.message);
      const detail = typeof messagePayload?.message === 'string' ? messagePayload.message : typeof messagePayload?.code === 'string' ? messagePayload.code : 'No error detail returned';
      return NextResponse.json({ error: 'Brevo send failed (HTTP ' + messageResponse.status + '): ' + detail.slice(0, 220) }, { status: 502 });
    }
    return NextResponse.json({ ok: true, recipient, messageId: messagePayload?.messageId || null });
  } catch (error) {
    console.error('Brevo email test failed:', error);
    return NextResponse.json({ error: 'The email test could not be completed. Please try again.' }, { status: 500 });
  }
}
