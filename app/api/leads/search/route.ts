import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function clean(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}
function xmlItems(xml: string) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
    const block = match[1];
    const get = (tag: string) => {
      const found = block.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>', 'i'));
      return found ? clean(found[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')) : '';
    };
    return { title: get('title'), link: get('link'), description: get('description') };
  }).filter((item) => item.title && /^https?:\/\//i.test(item.link));
}
function decodeHtml(value: string) {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
async function searchPublicWeb(searchText: string) {
  const headers = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', accept: 'text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.8' };
  try {
    const response = await fetch('https://www.bing.com/search?format=rss&q=' + encodeURIComponent(searchText), { headers, cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (response.ok) {
      const items = xmlItems(await response.text());
      if (items.length) return { items, provider: 'Bing' };
    } else {
      console.warn('Bing lead search returned HTTP', response.status);
    }
  } catch (error) { console.warn('Bing lead search unavailable:', error instanceof Error ? error.message : 'unknown error'); }
  try {
    const response = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(searchText), { headers, cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('DuckDuckGo returned HTTP ' + response.status);
    const html = await response.text();
    const items = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => {
      let link = decodeHtml(m[1]);
      try { const parsed = new URL(link); if (parsed.hostname.includes('duckduckgo.com')) link = parsed.searchParams.get('uddg') || link; } catch {}
      const after = html.slice((m.index || 0), (m.index || 0) + 5000);
      const snippet = after.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] || '';
      return { title: clean(decodeHtml(m[2])), link, description: clean(decodeHtml(snippet)) };
    }).filter((x) => x.title && /^https?:\/\//i.test(x.link));
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
    const intentSearches = [
      searchText,
      [query, '"looking for" OR "need" OR "seeking" OR "request for proposal"', country].filter(Boolean).join(' '),
      [query, '"hire" OR "freelance" OR "web project" OR "website redesign"', country].filter(Boolean).join(' '),
      ['"request for proposal" OR "RFP"', query, country].filter(Boolean).join(' ')
    ];
    const searchRuns = await Promise.allSettled(intentSearches.map((text) => searchPublicWeb(text)));
    const successfulRuns = searchRuns.flatMap((run) => run.status === 'fulfilled' ? [run.value] : []);
    if (!successfulRuns.length) throw new Error('Search providers did not return usable results. Try again shortly.');
    const seenUrls = new Set<string>();
    const mergedItems = successfulRuns.flatMap((run) => run.items).filter((item) => {
      const normalized = item.link.split('#')[0].replace(/\/$/, '').toLowerCase();
      if (seenUrls.has(normalized)) return false;
      seenUrls.add(normalized);
      return true;
    });
    const searchResult = { items: mergedItems, provider: [...new Set(successfulRuns.map((run) => run.provider))].join(' + ') };
    const rawItems = searchResult.items.slice(0, 40);
    console.info('Lead search provider returned results:', searchResult.provider, rawItems.length);
    if (!rawItems.length) return NextResponse.json({ error: 'No indexed results were returned. Try a more specific search phrase or another country.' }, { status: 200, headers: { 'x-vexora-empty': '1' } });

    const indexedItems = rawItems.map((item, sourceIndex) => ({ sourceIndex, ...item }));
    const prompt = `You are Vexora's B2B lead research analyst. User instruction: "${query}". Target country: "${country || 'not specified'}". Workspace: "${businesses[0].name}" (${businesses[0].industry}).
Review the indexed public search results. Return only genuine businesses, organizations, or specific public opportunities relevant to the instruction. Do not claim a business is actively buying, hiring, or seeking a service unless the supplied result explicitly proves that intent. Do not invent company names, people, emails, websites, facts, or intent. A result can be included without an email. Ignore directories, generic articles, irrelevant pages, and duplicates. Use the exact integer sourceIndex from the supplied result; do not return a URL instead of sourceIndex. Give a short factual summary, fit score 0-100, and explain the match. Return ONLY JSON in this exact shape: {"prospects":[{"sourceIndex":0,"companyName":"name as shown in result","contactName":null,"email":null,"website":null,"description":"factual summary","fitScore":50,"fitReason":"why it matches"}]}.
Indexed results: ${JSON.stringify(indexedItems)}`;
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
    const parsedProspects = Array.isArray(parsed.prospects) ? parsed.prospects : [];
    const rejected = { invalidSource: 0, missingCompany: 0 };
    let prospects = parsedProspects.slice(0, 18).flatMap((p: any) => {
      const sourceIndex = Number(p.sourceIndex);
      const source = Number.isInteger(sourceIndex) && sourceIndex >= 0 && sourceIndex < rawItems.length
        ? rawItems[sourceIndex] : rawItems.find((item) => item.link === String(p.sourceUrl || ''));
      if (!source) { rejected.invalidSource++; return []; }
      if (typeof p.companyName !== 'string' || !p.companyName.trim()) { rejected.missingCompany++; return []; }
      const sourceText = source.title + ' ' + source.description;
      const emailMatch = sourceText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      const suppliedEmail = typeof p.email === 'string' ? p.email.trim() : '';
      const email = emailMatch && (!suppliedEmail || suppliedEmail.toLowerCase() === emailMatch[0].toLowerCase())
        ? emailMatch[0].toLowerCase() : null;
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
    if (!prospects.length) {
      const intentPattern = /\b(looking for|need(?:s|ed)?|seeking|request(?:ing|ed)?|rfp|hire(?:d|s|ing)?|freelance(?:r|rs)?|web project|website redesign|website design project|web development project|proposal)\b/i;
      const servicePattern = /\b(website|web design|web developer|web development|redesign|digital agency|design agency)\b/i;
      const used = new Set<string>();
      prospects = rawItems.flatMap((source) => {
        const evidence = source.title + ' ' + source.description;
        if (!intentPattern.test(evidence) || !servicePattern.test(evidence)) return [];
        const normalized = source.link.split('#')[0].replace(/\/$/, '').toLowerCase();
        if (used.has(normalized)) return [];
        used.add(normalized);
        let host = 'Public opportunity';
        try { host = new URL(source.link).hostname.replace(/^www\./i, ''); } catch {}
        const titleName = source.title.split(/\s[|–—]\s|\s-\s/)[0].trim();
        const emailMatch = evidence.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        return [{
          business_id: businessId, search_query: query,
          company_name: (titleName.length >= 3 ? titleName : host).slice(0, 160),
          contact_name: null, email: emailMatch ? emailMatch[0].toLowerCase() : null,
          website: null, source_url: source.link, source_title: source.title.slice(0, 300),
          description: (source.description || source.title).slice(0, 1000),
          fit_score: 60,
          fit_reason: 'Public search result contains website-service and request/need language. Verify the original post and whether the opportunity is still active before contacting.'
        }];
      }).slice(0, 12);
    }
    console.info('Lead qualification summary:', JSON.stringify({ provider: searchResult.provider, rawResults: rawItems.length, aiCandidates: parsedProspects.length, accepted: prospects.length, rejected }));
    if (!prospects.length) return NextResponse.json({ prospects: [], message: 'The search provider returned pages, but the AI could not verify enough real business matches. Try a narrower industry, location, or service keyword.' });
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
    return NextResponse.json({ prospects: saved, count: saved.length, message: 'Search completed. Review each source and verify the business, buying intent and contact details before contacting them.' });
  } catch (error) {
    console.error('Lead search route failed:', error);
    return NextResponse.json({ error: error instanceof Error && error.name === 'TimeoutError' ? 'The search took too long. Try again.' : 'Lead search could not be completed.' }, { status: 500 });
  }
}
