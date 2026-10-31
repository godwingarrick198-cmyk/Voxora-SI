import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const gmailUser = process.env.GMAIL_USER;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');

    if (!token || !supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Please sign in again before testing email.' }, { status: 401 });
    }
    if (!gmailUser || !gmailAppPassword) {
      return NextResponse.json({ error: 'Gmail is not configured. Check GMAIL_USER and GMAIL_APP_PASSWORD in Vercel.' }, { status: 503 });
    }
    if (gmailUser.toLowerCase() !== 'pixelpulsestudio777@gmail.com') {
      return NextResponse.json({ error: 'The configured Gmail sender does not match the approved Vexora sender.' }, { status: 503 });
    }

    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!authResponse.ok) return NextResponse.json({ error: 'Your session is invalid. Please sign in again.' }, { status: 401 });
    const user = await authResponse.json();
    const recipient = typeof user.email === 'string' ? user.email : '';
    if (!recipient) return NextResponse.json({ error: 'Your account has no email address to receive the test.' }, { status: 400 });

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

    try {
      const sent = await transporter.sendMail({
        from: { name: 'Pixel Pulse Studio', address: gmailUser },
        to: recipient,
        replyTo: gmailUser,
        subject: 'Vexora SI Gmail connection test',
        text: 'Your Vexora SI workspace successfully sent this test email through Gmail SMTP.'
      });
      return NextResponse.json({ ok: true, recipient, messageId: sent.messageId });
    } catch (error) {
      const smtpError = error as { message?: string; responseCode?: number; code?: string };
      const detail = smtpError?.message || 'Unknown SMTP error';
      console.error('Gmail SMTP test failed:', { responseCode: smtpError?.responseCode, code: smtpError?.code, message: detail });
      if (smtpError?.responseCode === 535 || /BadCredentials|Username and Password not accepted/i.test(detail)) {
        return NextResponse.json({ error: 'Gmail rejected the app password (535). Create a fresh Google App Password for pixelpulsestudio777@gmail.com, update GMAIL_APP_PASSWORD in Vercel, and redeploy.' }, { status: 502 });
      }
      return NextResponse.json({ error: 'Gmail could not send the test email. Check Gmail SMTP access and sending limits.' }, { status: 502 });
    } finally {
      transporter.close();
    }
  } catch (error) {
    console.error('Gmail email test route failed:', error);
    return NextResponse.json({ error: 'The Gmail test could not be completed. Please try again.' }, { status: 500 });
  }
}
