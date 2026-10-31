import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function clean(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}
function xmlItems(xml: string) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
    const block = match[1];
    const get = (tag: string) => {
      const found = block.match(new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
      return found ? clean(found[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')) : '';
    };
    return { title: get('title'), link: get('link'), description: get('description') };
  }).filter((item) => item.title && /^https?:\/\//i.test(item.link));
}


function decodeHtml(value: string) {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
async function searchPublicWeb(searchText: string) {
  const headers = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', accept: 'text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.8' };
  try {
    const response = await fetch('https://www.bing.com/search?format=rss&q=' + encodeURIComponent(searchText), { headers, cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (response.ok) {
      const items = xmlItems(await response.text());
      if (items.length) return { items, provider: 'Bing' };
    }
  } catch (error) { console.warn('Bing lead search unavailable:', error instanceof Error ? error.message : 'unknown error'); }
  try {
    const response = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(searchText), { headers, cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('DuckDuckGo returned HTTP ' + response.status);
    const html = await response.text();
    const items = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\\s\\S]*?)<\\/a>/gi)].map((m) => {
      let link = decodeHtml(m[1]);
      try { const parsed = new URL(link); if (parsed.hostname.includes('duckduckgo.com')) link = parsed.searchParams.get('uddg') || link; } catch {}
      const after = html.slice((m.index || 0), (m.index || 0) + 5000);
      const snippet = after.match(/class="result__snippet"[^>]*>([\\s\\S]*?)<\\/[^>]+>/i)?.[1] || '';
      return { title: clean(decodeHtml(m[2])), link, description: clean(decodeHtml(snippet)) };
    }).filter((x) => x.title && /^https?:\\/\\//i.test(x.link));
    if (items.length) return { items, provider: 'DuckDuckGo' };
    throw new Error('DuckDuckGo returned no parseable public results');
  } catch (error) {
    console.error('Public web search providers failed:', error instanceof Error ? error.message : 'unknown error');
    throw new Error('Search providers did not return usable results. Please retry with a shorter, more specific search.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!token || !url || !anon) return NextResponse.json({ error: 'Sign in to search for prospects.' }, { status: 401 });
    if (!geminiKey) return NextResponse.json({ error: 'AI analysis is not configured on the server.' }, { status: 503 });
    const auth = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + token }, cache: 'no-store' });
    if (!auth.ok) return NextResponse.json({ error: 'Your session has expired. Sign in again.' }, { status: 401 });
    const user = await auth.json();
    const body = await request.json();
    const businessId = String(body.businessId || '');
    const query = String(body.query || '').trim().slice(0, 500);
    const country = String(body.country || '').trim().slice(0, 80);
    if (!businessId || query.length < 8) return NextResponse.json({ error: 'Enter a clear search instruction (at least 8 characters).' }, { status: 400 });
    const businessResponse = await fetch(url + '/rest/v1/businesses?id=eq.' + encodeURIComponent(businessId) + '&owner_id=eq.' + encodeURIComponent(user.id) + '&select=id,name,industry', {
      headers: { apikey: anon, Authorization: 'Bearer ' + token }, cache: 'no-store'
    });
    const businesses = await businessResponse.json();
    if (!businessResponse.ok || !Array.isArray(businesses) || !businesses[0]) return NextResponse.json({ error: 'Business workspace not found or access denied.' }, { status: 403 });

    const searchText = [query, country ? 'in ' + country : ''].filter(Boolean).join(' ');
    const searchResult = await searchPublicWeb(searchText);
    const rawItems = searchResult.items.slice(0, 18);
    console.info('Lead search provider returned results:', searchResult.provider, rawItems.length);
    if (!rawItems.length) return NextResponse.json({ error: 'No indexed results were returned. Try a more specific search phrase or another country.' }, { status: 200, headers: { 'x-vexora-empty': '1' } });

    const prompt = `You are Vexora's B2B lead research analyst. User's search instruction: "${query}". Target country: "${country || 'not specified'}". Business using Vexora: "${businesses[0].name}" (${businesses[0].industry}).
Search provider: ${searchResult.provider}. Review only the supplied search engine results. Select results that represent a real business, organization, or a specific public opportunity relevant to the user's instruction. Do not invent companies, contact names, email addresses, websites, facts, or hiring intent. A result may be included without an email. Only return an email if the exact email address appears literally in the title or description. Ignore directories, generic articles, social profiles without clear business identity, duplicates, and irrelevant pages. Score fit from 0-100 and explain briefly. Return ONLY JSON: {"prospects":[{"sourceUrl":"exact supplied URL","companyName":"name","contactName":null,"email":null,"website":null,"description":"short factual summary","fitScore":0,"fitReason":"short reason"}]}.
Supplied results: ${JSON.stringify(rawItems)}`;
    const aiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } }),
      signal: AbortSignal.timeout(25000)
    });
    const aiPayload = await aiResponse.json().catch(() => ({}));
    if (!aiResponse.ok) {
      console.error('Lead analysis Gemini error:', aiResponse.status, aiPayload?.error?.message);
      return NextResponse.json({ error: aiResponse.status === 429 ? 'Gemini quota or rate limit reached. Try again later.' : 'Gemini API error (' + aiResponse.status + '): ' + String(aiPayload?.error?.message || 'AI prospect analysis failed').slice(0, 220) }, { status: 502 });
    }
    const output = aiPayload?.candidates?.[0]?.content?.parts?.map((part: {text?:string}) => part.text || '').join('');
    let parsed: any;
    try { parsed = JSON.parse(output || '{}'); } catch { return NextResponse.json({ error: 'AI returned an unreadable result. Please retry.' }, { status: 502 }); }
    const sourceMap = new Map(rawItems.map((item) => [item.link, item]));
    const prospects = (Array.isArray(parsed.prospects) ? parsed.prospects : []).slice(0, 12).flatMap((p: any) => {
      const source = sourceMap.get(String(p.sourceUrl || ''));
      if (!source || typeof p.companyName !== 'string' || !p.companyName.trim()) return [];
      const email = typeof p.email === 'string' && /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(p.email) &&
        (source.title + ' ' + source.description).toLowerCase().includes(p.email.toLowerCase()) ? p.email.toLowerCase() : null;
      return [{
        business_id: businessId, search_query: query, company_name: p.companyName.trim().slice(0, 160),
        contact_name: typeof p.contactName === 'string' ? p.contactName.slice(0, 120) : null,
        email, website: typeof p.website === 'string' && /^https?:\/\//i.test(p.website) ? p.website.slice(0, 500) : null,
        source_url: source.link, source_title: source.title.slice(0, 300),
        description: (typeof p.description === 'string' ? p.description : source.description).slice(0, 1000),
        fit_score: Math.max(0, Math.min(100, Number(p.fitScore) || 50)),
        fit_reason: (typeof p.fitReason === 'string' ? p.fitReason : 'Potential match based on indexed search results.').slice(0, 500)
      }];
    });
    if (!prospects.length) return NextResponse.json({ prospects: [], message: 'Search results were found, but none could be confidently qualified. Try narrowing the instruction.' });
    const insertResponse = await fetch(url + '/rest/v1/prospects?on_conflict=business_id,source_url', {
      method: 'POST',
      headers: { apikey: anon, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(prospects), signal: AbortSignal.timeout(15000)
    });
    const saved = await insertResponse.json();
    if (!insertResponse.ok) {
      console.error('Prospect save failed:', insertResponse.status, saved);
      return NextResponse.json({ error: 'Prospects were found, but could not be saved to your workspace.' }, { status: 502 });
    }
    return NextResponse.json({ prospects: saved, count: saved.length, message: 'Search completed. Review each prospect and verify details before contacting them.' });
  } catch (error) {
    console.error('Lead search route failed:', error);
    return NextResponse.json({ error: error instanceof Error && error.name === 'TimeoutError' ? 'The search took too long. Try again.' : 'Lead search could not be completed.' }, { status: 500 });
  }
}
