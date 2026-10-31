import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const maxDuration = 25;
const countryName = (s:string) => s.trim().replace(/\\s+/g,' ').slice(0,100);
const categoriesFor = (n:string):string[] => {
 const v=n.toLowerCase();
 if(/estate|real estate|property|realtor|letting|property management/.test(v)) return ['commercial.real_estate'];
 if(/salon|barber|beauty|hairdresser|hair stylist/.test(v)) return ['service.beauty'];
 if(/clean|janitor|maid|carpet|housekeeping/.test(v)) return ['service.cleaning'];
 if(/restaurant|cafe|catering|food/.test(v)) return ['catering'];
 return ['commercial'];
};
export async function POST(request:NextRequest) {
 const expected=process.env.VOXORA_CAMPAIGN_WORKER_SECRET;
 const supplied=request.headers.get('x-voxora-worker-secret');
 if(!expected||!supplied||supplied!==expected) return NextResponse.json({error:'Unauthorized'},{status:401});
 const key=process.env.GEOAPIFY_API_KEY;
 if(!key) return NextResponse.json({error:'Geoapify discovery is not configured.'},{status:503});
 try {
  const body=await request.json();
  const country=countryName(String(body.country||''));
  const niche=String(body.niche||'').slice(0,180);
  const limit=Math.max(1,Math.min(100,Number(body.limit)||40));
  if(!country||!niche) return NextResponse.json({error:'Country and niche are required.'},{status:400});
  if(/^(nigeria|ng)$/i.test(country)) return NextResponse.json({error:'Nigeria is excluded from prospect targeting.'},{status:400});
  const geoHeaders={'x-api-key':key,'Accept':'application/json'};
  const geocodeUrl=new URL('https://api.geoapify.com/v1/geocode/search');
  geocodeUrl.searchParams.set('text',country);
  geocodeUrl.searchParams.set('type','country');
  geocodeUrl.searchParams.set('format','json');
  geocodeUrl.searchParams.set('limit','1');
  const geocode=await fetch(geocodeUrl,{headers:geoHeaders,signal:AbortSignal.timeout(9000),cache:'no-store'});
  const geoData=await geocode.json().catch(()=>({}));
  if(!geocode.ok) throw new Error('Country lookup failed (HTTP '+geocode.status+').');
  const code=String(geoData?.results?.[0]?.country_code||'').toLowerCase();
  if(!/^[a-z]{2}$/.test(code)) return NextResponse.json({error:'Could not resolve the target country. Use a full country name.'},{status:422});
  const categories=categoriesFor(niche);
  const search=async (cats:string[]) => fetch('https://api.geoapify.com/v2/places',{
   method:'POST',headers:{...geoHeaders,'Content-Type':'application/json'},
   body:JSON.stringify({categories:cats,filter:{type:'countrycode',values:[code]},limit,lang:'en'}),
   signal:AbortSignal.timeout(12000),cache:'no-store'
  });
  let places=await search(categories);
  let placeData=await places.json().catch(()=>({}));
  if(!places.ok && categories[0]!=='commercial') {
   places=await search(['commercial','service']);
   placeData=await places.json().catch(()=>({}));
  }
  if(!places.ok) throw new Error('Places provider HTTP '+places.status+': '+String(placeData?.message||placeData?.error||'request failed').slice(0,160));
  const features=Array.isArray(placeData.features)?placeData.features:[];
  const seen=new Set<string>();
  const results=features.map((feature:any)=>{
   const p=feature?.properties||{},raw=p.datasource?.raw||{};
   const name=String(p.name||raw.name||'').trim();
   const placeId=String(p.place_id||'');
   const lat=Number(p.lat),lon=Number(p.lon);
   const location=String(p.formatted||[p.address_line1,p.address_line2,p.city,p.state,p.country].filter(Boolean).join(', ')||country);
   const website=String(p.website||raw.website||raw['contact:website']||'');
   const id=placeId||[name,location].join('|');
   const key='geoapify:'+id;
   if(!name||seen.has(key))return null;
   seen.add(key);
   const tags:any={...(raw||{})};
   if(website)tags.website=website;
   for(const field of ['phone','email','opening_hours','contact:phone','contact:email']) if(p[field]&&!tags[field])tags[field]=p[field];
   return {key,osmType:'geoapify',osmId:id,name,location,lat:Number.isFinite(lat)?lat:null,lon:Number.isFinite(lon)?lon:null,tags,sourceUrl:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(name+' '+location)};
  }).filter(Boolean);
  return NextResponse.json({provider:'Geoapify Places API',country,countryCode:code,categories,returned:results.length,results});
 } catch(error) {
  console.error('Campaign discovery failed:',error);
  return NextResponse.json({error:error instanceof Error?error.message:'Discovery failed.'},{status:502});
 }
}