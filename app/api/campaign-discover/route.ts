import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 25;

const countryName = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, 100);

const categoriesFor = (n: string): string[] => {
  const v = n.toLowerCase();
  if (/hotel|hostel|motel|accommodation|guest.?house|resort|hoyel/.test(v)) return ['accommodation'];
  if (/estate|real estate|property|realtor|letting|property management/.test(v)) return ['service.estate_agent', 'commercial'];
  if (/salon|barber|beauty|hairdresser|hair stylist/.test(v)) return ['service.beauty.hairdresser', 'service.beauty'];
  if (/clean|janitor|maid|carpet|housekeeping/.test(v)) return ['service.cleaning'];
  if (/restaurant|cafe|catering|food/.test(v)) return ['catering'];
  return ['commercial', 'service'];
};

export async function POST(request: NextRequest) {
  const expected = process.env.VOXORA_CAMPAIGN_WORKER_SECRET;
  const supplied = request.headers.get('x-voxora-worker-secret');
  if (!expected || !supplied || supplied !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Geoapify discovery is not configured.' }, { status: 503 });

  try {
    const body = await request.json();
    const country = countryName(String(body.country || ''));
    const niche = String(body.niche || '').trim().slice(0, 180);
    const limit = Math.max(1, Math.min(100, Number(body.limit) || 40));

    if (!country || !niche) {
      return NextResponse.json({ error: 'Country and niche are required.' }, { status: 400 });
    }
    if (/^(nigeria|ng)$/i.test(country)) {
      return NextResponse.json({ error: 'Nigeria is excluded from prospect targeting.' }, { status: 400 });
    }

    const headers = { 'x-api-key': apiKey, Accept: 'application/json' };
    const geocodeUrl = new URL('https://api.geoapify.com/v1/geocode/search');
    geocodeUrl.searchParams.set('text', country);
    geocodeUrl.searchParams.set('type', 'country');
    geocodeUrl.searchParams.set('format', 'json');
    geocodeUrl.searchParams.set('limit', '1');

    const geocode = await fetch(geocodeUrl, {
      headers,
      signal: AbortSignal.timeout(9000),
      cache: 'no-store',
    });
    const geoData = await geocode.json().catch(() => ({}));
    if (!geocode.ok) {
      throw new Error('Country lookup failed (HTTP ' + geocode.status + '): ' + String(geoData?.message || geoData?.error || 'provider error').slice(0, 180));
    }

    const countryResult = geoData?.results?.[0];
    const code = String(countryResult?.country_code || '').toLowerCase();
    const countryPlaceId = String(countryResult?.place_id || '');
    if (!/^[a-z]{2}$/.test(code) || !countryPlaceId) {
      return NextResponse.json({ error: 'Could not resolve the target country. Use a full country name.' }, { status: 422 });
    }

    const categories = categoriesFor(niche);
    const search = async (selected: string[]) => {
      const url = new URL('https://api.geoapify.com/v2/places');
      url.searchParams.set('categories', selected.join(','));
      // Geoapify's GET countrycode filter is documented as coming soon on its
      // Places API. Use the country boundary's Geoapify place_id instead.
      url.searchParams.set('filter', 'place:' + countryPlaceId);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('lang', 'en');
      url.searchParams.set('apiKey', apiKey);

      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
        cache: 'no-store',
      });
      const raw = await response.text();
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw.slice(0, 180) }; }
      return { response, data };
    };

    let attempt = await search(categories);
    if (!attempt.response.ok && categories.join(',') !== 'commercial,service') {
      console.warn('Geoapify niche categories rejected; retrying broad categories', {
        status: attempt.response.status,
        message: String(attempt.data?.message || attempt.data?.error || '').slice(0, 180),
      });
      attempt = await search(['commercial', 'service']);
    }

    if (!attempt.response.ok) {
      const detail = String(attempt.data?.message || attempt.data?.error || attempt.data?.status || 'Invalid Places request').slice(0, 180);
      console.error('Geoapify Places API rejected discovery request', {
        status: attempt.response.status,
        categories,
        countryCode: code,
        detail,
      });
      throw new Error('Places provider HTTP ' + attempt.response.status + ': ' + detail);
    }

    const features = Array.isArray(attempt.data?.features) ? attempt.data.features : [];
    const seen = new Set<string>();
    const results = features.map((feature: any) => {
      const p = feature?.properties || {};
      const raw = p.datasource?.raw || {};
      const name = String(p.name || raw.name || '').trim();
      const placeId = String(p.place_id || '');
      const lat = Number(p.lat);
      const lon = Number(p.lon);
      const location = String(p.formatted || [
        p.address_line1, p.address_line2, p.city, p.state, p.country,
      ].filter(Boolean).join(', ') || country);
      const website = String(p.website || raw.website || raw['contact:website'] || '');
      const id = placeId || [name, location].join('|');
      const key = 'geoapify:' + id;
      if (!name || seen.has(key)) return null;
      seen.add(key);

      const tags: any = { ...raw };
      if (website) tags.website = website;
      for (const field of ['phone', 'email', 'opening_hours', 'contact:phone', 'contact:email']) {
        if (p[field] && !tags[field]) tags[field] = p[field];
      }

      return {
        key,
        osmType: 'geoapify',
        osmId: id,
        name,
        location,
        lat: Number.isFinite(lat) ? lat : null,
        lon: Number.isFinite(lon) ? lon : null,
        tags,
        sourceUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(name + ' ' + location),
      };
    }).filter(Boolean);

    return NextResponse.json({
      provider: 'Geoapify Places API',
      country,
      countryCode: code,
      categories,
      returned: results.length,
      results,
    });
  } catch (error) {
    console.error('Campaign discovery failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Discovery failed.' },
      { status: 502 },
    );
  }
}
