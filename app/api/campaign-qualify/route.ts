import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const maxDuration = 30;
type Item = { title: string; url: string; description: string };
type Site = { url: string; domain: string; status: number | null; title: string; description: string; h1: string; hasViewport: boolean; hasContactSignal: boolean; text: string; error?: string };
const clean = (s: string) => s.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
const domainOf = (v: string) => { try { return new URL(v).hostname.toLowerCase().replace(/^www\./,''); } catch { return ''; } };
const blocked = /(^|\.)((facebook|instagram|linkedin|tiktok|youtube|x|twitter|yelp|yellowpages|mapquest|tripadvisor|angi|thumbtack|bbb|manta|chamberofcommerce|alignable|nextdoor|bark|houzz)\.com|google\.[a-z.]+|bing\.com|duckduckgo\.com)$/i;
function parseBing(xml: string): Item[] {
 return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m => {
  const field = (tag: string) => clean((m[1].match(new RegExp('<'+tag+'>([\\s\\S]*?)</'+tag+'>','i'))?.[1] || '').replace(/^<!\[CDATA\[|\]\]>$/g,''));
  return {title:field('title'),url:field('link'),description:field('description')};
 }).filter(x=>x.title && /^https?:\/\//i.test(x.url));
}
async function findSites(name: string, location: string): Promise<Item[]> {
 const q = '"' + name + '" "' + location + '" official website';
 const r = await fetch('https://www.bing.com/search?format=rss&q='+encodeURIComponent(q),{headers:{'User-Agent':'VoxoraSI/1.0 (business prospect research)',Accept:'application/rss+xml,application/xml'},signal:AbortSignal.timeout(7000),cache:'no-store'});
 if(!r.ok) throw new Error('Search provider HTTP '+r.status);
 return parseBing(await r.text()).slice(0,8);
}
async function inspectSite(url: string): Promise<Site> {
 const domain=domainOf(url);
 if(!domain || blocked.test(domain) || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(domain))
  return {url,domain,status:null,title:'',description:'',h1:'',hasViewport:false,hasContactSignal:false,text:'',error:'Not an eligible business domain.'};
 try {
  const r=await fetch(url,{redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 (compatible; VoxoraSIResearch/1.0)',Accept:'text/html,application/xhtml+xml'},signal:AbortSignal.timeout(6500),cache:'no-store'});
  const finalDomain=domainOf(r.url); if(!finalDomain || blocked.test(finalDomain)) throw new Error('Redirected to a non-business platform.');
  const html=(await r.text()).slice(0,180000);
  const title=clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').slice(0,180);
  const description=clean(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1]||html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description/i)?.[1]||'').slice(0,300);
  const h1=clean(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'').slice(0,180);
  return {url:r.url,domain:finalDomain,status:r.status,title,description,h1,hasViewport:/<meta[^>]+name=["']viewport["']/i.test(html),hasContactSignal:/mailto:|tel:|contact us|request a quote|book now/i.test(html),text:clean(html).slice(0,1800)};
 } catch(e) { return {url,domain,status:null,title:'',description:'',h1:'',hasViewport:false,hasContactSignal:false,text:'',error:e instanceof Error?e.message.slice(0,120):'Could not inspect website.'}; }
}
export async function POST(request: NextRequest) {
 const expected=process.env.VOXORA_CAMPAIGN_WORKER_SECRET, supplied=request.headers.get('x-voxora-worker-secret');
 if(!expected || !supplied || supplied!==expected) return NextResponse.json({error:'Unauthorized'},{status:401});
 const apiKey=process.env.GEMINI_API_KEY; if(!apiKey) return NextResponse.json({error:'AI qualification is not configured.'},{status:503});
 try {
  const body=await request.json();
  const niche=String(body.niche||'').slice(0,180), country=String(body.country||'').slice(0,100);
  const name=String(body.companyName||body.title||'').slice(0,180), location=String(body.location||country).slice(0,180);
  const osmWebsite=String(body.website||'').slice(0,500), tags=body.tags&&typeof body.tags==='object'?body.tags:{};
  if(!niche||!country||!name) return NextResponse.json({error:'Incomplete business evidence.'},{status:400});
  let results:Item[]=[]; let searchSucceeded=false; try { results=await findSites(name,location); searchSucceeded=true; } catch(e) { console.warn('Website search failed:',e); }
  const urls=new Map<string,string>();
  if(/^https?:\/\//i.test(osmWebsite)) urls.set(domainOf(osmWebsite),osmWebsite);
  for(const item of results){const d=domainOf(item.url);if(d&&!blocked.test(d)&&!urls.has(d)) urls.set(d,item.url);}
  const siteUrls=[...urls.values()].slice(0,3); const sites:Site[]=await Promise.all(siteUrls.map(inspectSite));
  if(!searchSucceeded && !/^https?:\/\//i.test(osmWebsite)) return NextResponse.json({qualified:false,websiteStatus:'uncertain',website:'',companyName:name,reason:'Could not complete the public website search; manual review required.',fitScore:0,websiteChecks:0});
  const contact={phone:String(tags['contact:phone']||tags.phone||'').slice(0,80),email:String(tags['contact:email']||tags.email||'').slice(0,120),facebook:String(tags['contact:facebook']||tags.facebook||'').slice(0,200),instagram:String(tags['contact:instagram']||tags.instagram||'').slice(0,200)};
  const prompt = [
   'You qualify real local businesses as potential website-design clients.',
   'Niche: '+niche+'. Target country: '+country+'. Business: '+name+'. Location: '+location+'.',
   'OpenStreetMap tags: '+JSON.stringify(tags).slice(0,1800)+'. Public contact clues: '+JSON.stringify(contact)+'.',
   'Search results for exact business and location: '+JSON.stringify(results).slice(0,5000)+'. Website inspections: '+JSON.stringify(sites).slice(0,7000)+'.',
   'Choose websiteStatus exactly: no_website_found, needs_improvement, good_website, uncertain.',
   'no_website_found means no plausible official company website appears in the supplied checks; social profiles/directories are not official sites. This is NOT proof that no website exists.',
   'needs_improvement only when a likely official site exists and evidence shows meaningful deficiencies such as broken/unreachable, missing core business information, no mobile viewport, no clear service/contact path, placeholder/empty page. Do not infer age or visual taste.',
   'good_website means a working official site has adequate business information and a contact path. uncertain means business identity or official-site match is ambiguous.',
   'Qualify only if this is clearly a real business in the requested niche/country AND status is no_website_found or needs_improvement. Never invent. Return JSON only: {"qualified":boolean,"websiteStatus":"no_website_found|needs_improvement|good_website|uncertain","website":"official URL or empty","companyName":"evidenced name","reason":"brief evidence-based explanation","fitScore":integer 0-100}.'
  ].join(' ');
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.1,responseMimeType:'application/json'}}),signal:AbortSignal.timeout(15000)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok) return NextResponse.json({error:String(payload?.error?.message||'AI provider failed').slice(0,220)},{status:502});
  const output=payload?.candidates?.[0]?.content?.parts?.map((p:{text?:string})=>p.text||'').join('')||'{}';
  const parsed=JSON.parse(output), status=['no_website_found','needs_improvement','good_website','uncertain'].includes(parsed.websiteStatus)?parsed.websiteStatus:'uncertain';
  const qualified=parsed.qualified===true&&(status==='no_website_found'||status==='needs_improvement');
  return NextResponse.json({qualified,websiteStatus:status,website:typeof parsed.website==='string'&&/^https?:\/\//i.test(parsed.website)?parsed.website.slice(0,500):'',companyName:typeof parsed.companyName==='string'?parsed.companyName.slice(0,160):name,reason:typeof parsed.reason==='string'?parsed.reason.slice(0,500):'Website opportunity needs manual verification.',fitScore:Number.isFinite(Number(parsed.fitScore))?Math.max(0,Math.min(100,Math.round(Number(parsed.fitScore)))):70,websiteChecks:sites.length});
 } catch(e) { console.error('Campaign qualification failed:',e); return NextResponse.json({error:'AI qualification failed.'},{status:502}); }
}