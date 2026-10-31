'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Prospect = { id:string; company_name:string; contact_name:string|null; email:string|null; website:string|null; source_url:string; source_title:string|null; description:string|null; fit_score:number; fit_reason:string|null; status:string; created_at:string };
type Draft = { prospect:Prospect; subject:string; body:string; messageId?:string };

const input:React.CSSProperties={width:'100%',padding:'12px',border:'1px solid var(--line)',borderRadius:10,background:'var(--field)',color:'var(--text)',fontSize:14,boxSizing:'border-box'};
const btn:React.CSSProperties={border:0,borderRadius:10,padding:'11px 15px',background:'#7564e8',color:'#fff',fontWeight:800,cursor:'pointer'};
const ghost:React.CSSProperties={border:'1px solid var(--line)',borderRadius:10,padding:'10px 13px',background:'var(--card)',color:'var(--text)',fontWeight:700,cursor:'pointer'};
const muted:React.CSSProperties={color:'var(--muted)',fontSize:12,lineHeight:1.6};

export default function LeadGeneration({businessId,businessName}:{businessId:string;businessName:string}) {
 const db=createClient();
 const [query,setQuery]=useState('Find businesses that are actively looking for website design, website redesign or web development services.');
 const [country,setCountry]=useState('');
 const [prospects,setProspects]=useState<Prospect[]>([]);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const [draft,setDraft]=useState<Draft|null>(null);
 const [draftBusy,setDraftBusy]=useState(false);
 const [sendBusy,setSendBusy]=useState(false);
 const [offer,setOffer]=useState('professional website design and development');

 async function token(){const {data:{session}}=await db.auth.getSession();if(!session?.access_token)throw new Error('Your session expired. Sign in again.');return session.access_token;}
 async function load(){const {data,error}=await db.from('prospects').select('*').eq('business_id',businessId).order('created_at',{ascending:false}).limit(60);if(error)setError(error.message);else setProspects(data||[]);}
 useEffect(()=>{void load();},[businessId]);
 async function search(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('Searching indexed public web results and checking relevance…');try{const access=await token();const r=await fetch('/api/leads/search',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+access},body:JSON.stringify({businessId,query,country})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Search failed.');if(data.error)throw new Error(data.error);setNotice(data.message||('Saved '+(data.count||0)+' prospects.'));await load();}catch(e){setNotice('');setError(e instanceof Error?e.message:'Search failed.');}finally{setBusy(false);}}
 async function makeDraft(prospect:Prospect){setDraftBusy(true);setError('');try{const access=await token();const r=await fetch('/api/leads/outreach',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+access},body:JSON.stringify({action:'draft',prospectId:prospect.id,offer})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Draft generation failed.');setDraft({prospect,subject:data.subject,body:data.body,messageId:data.messageId});}catch(e){setError(e instanceof Error?e.message:'Draft generation failed.');}finally{setDraftBusy(false);}}
 async function send(){if(!draft)return;setSendBusy(true);setError('');try{const access=await token();const r=await fetch('/api/leads/outreach',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+access},body:JSON.stringify({action:'send',prospectId:draft.prospect.id,subject:draft.subject,body:draft.body})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Email sending failed.');setNotice('Email sent through Gmail to '+data.recipient+'.');setDraft(null);await load();}catch(e){setError(e instanceof Error?e.message:'Email sending failed.');}finally{setSendBusy(false);}}
 async function saveEmail(p:Prospect,value:string){
  const clean=value.trim().toLowerCase();
  if(clean&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)){setError('Enter a valid email address.');return;}
  const {error}=await db.from('prospects').update({email:clean||null,updated_at:new Date().toISOString()}).eq('id',p.id);
  if(error)setError(error.message);else{setError('');setNotice('Contact email saved. Verify it is publicly listed and correct before sending.');await load();}
 }
 async function dismiss(p:Prospect){const {error}=await db.from('prospects').update({status:'dismissed',updated_at:new Date().toISOString()}).eq('id',p.id);if(error)setError(error.message);else await load();}
 return <section style={{background:'var(--card)',border:'1px solid var(--line)',borderRadius:16,padding:18,marginTop:18}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'center'}}><div><div style={{fontSize:11,fontWeight:800,letterSpacing:1.2,color:'#7564e8'}}>VEXORA AI LEAD FINDER</div><h2 style={{fontSize:22,margin:'7px 0'}}>Find your next customers</h2><p style={muted}>Describe the gigs, businesses or customers you want. Vexora searches public indexed pages, scores matches and saves prospects to this workspace.</p></div><div style={{fontSize:12,color:'var(--muted)'}}>{prospects.length} saved prospects</div></div>
  <form onSubmit={search} style={{display:'grid',gap:11,marginTop:16}}>
   <label style={{display:'grid',gap:6,fontSize:12,fontWeight:700,color:'var(--muted)'}}>What should Vexora look for?<textarea style={{...input,minHeight:100,resize:'vertical'}} value={query} onChange={e=>setQuery(e.target.value)} maxLength={500} placeholder="Example: Find restaurants in Canada actively looking for a website designer."/></label>
   <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:10,alignItems:'end'}}><label style={{display:'grid',gap:6,fontSize:12,fontWeight:700,color:'var(--muted)'}}>Target country (optional)<input style={input} value={country} onChange={e=>setCountry(e.target.value)} maxLength={80} placeholder="e.g. United Kingdom, USA, Nigeria"/></label><button style={btn} disabled={busy||query.trim().length<8}>{busy?'Searching…':'Find prospects'}</button></div>
  </form>
  <label style={{display:'grid',gap:6,fontSize:12,fontWeight:700,color:'var(--muted)',marginTop:14}}>What are you offering?<input style={input} value={offer} onChange={e=>setOffer(e.target.value)} maxLength={500}/></label>
  <p style={{...muted,marginTop:10}}>Email sending is manual and requires a publicly listed address plus an configured Gmail sender. Vexora never guesses email addresses. Review each source and comply with local marketing and privacy laws.</p>
  {notice&&<p role="status" style={{color:'#16834a',fontSize:13}}>{notice}</p>}
  {error&&<p role="alert" style={{color:'#c44',fontSize:13}}>{error}</p>}
  {draft&&<div style={{border:'1px solid var(--line)',borderRadius:13,padding:14,marginTop:14,display:'grid',gap:10}}><div style={{display:'flex',justifyContent:'space-between',gap:10}}><b>Review outreach to {draft.prospect.company_name}</b><button type="button" style={ghost} onClick={()=>setDraft(null)}>Close</button></div><label style={{display:'grid',gap:5,fontSize:12,color:'var(--muted)'}}>Subject<input style={input} value={draft.subject} onChange={e=>setDraft({...draft,subject:e.target.value})}/></label><label style={{display:'grid',gap:5,fontSize:12,color:'var(--muted)'}}>Message<textarea style={{...input,minHeight:180,resize:'vertical'}} value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})}/></label><button type="button" style={btn} disabled={sendBusy||!draft.prospect.email} onClick={()=>void send()}>{sendBusy?'Sending…':draft.prospect.email?'Approve and send email':'No email address available'}</button></div>}
  <div style={{display:'grid',gap:10,marginTop:16}}>
   {prospects.length===0?<div style={{padding:18,border:'1px dashed var(--line)',borderRadius:12,textAlign:'center',color:'var(--muted)',fontSize:13}}>Your prospect list will appear here after your first search.</div>:prospects.map(p=><article key={p.id} style={{border:'1px solid var(--line)',borderRadius:12,padding:14,display:'grid',gap:8}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'start'}}><div><b style={{fontSize:15}}>{p.company_name}</b><div style={muted}>{p.email||'No public email found'}{p.contact_name?' · '+p.contact_name:''}</div></div><span style={{fontSize:11,fontWeight:800,color:p.fit_score>=75?'#16834a':'var(--muted)',whiteSpace:'nowrap'}}>{p.fit_score}/100 match</span></div>
    <p style={{...muted,margin:0}}>{p.description||p.fit_reason}</p><label style={{display:'grid',gap:5,fontSize:11,color:'var(--muted)'}}>Contact email (only use a verified business address)<input type="email" defaultValue={p.email||''} placeholder="Add public business email" style={input} onBlur={e=>{if(e.target.value.trim()!==(p.email||''))void saveEmail(p,e.target.value);}}/></label><div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}><a href={p.source_url} target="_blank" rel="noreferrer" style={{fontSize:12,color:'#7564e8'}}>View source ↗</a>{p.website&&<a href={p.website} target="_blank" rel="noreferrer" style={{fontSize:12,color:'#7564e8'}}>Website ↗</a>}<span style={{fontSize:11,color:'var(--muted)'}}>· {p.status.replaceAll('_',' ')}</span></div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" style={ghost} disabled={draftBusy} onClick={()=>void makeDraft(p)}>{draftBusy?'Preparing…':'Generate email draft'}</button><button type="button" style={ghost} onClick={()=>void dismiss(p)}>Dismiss</button></div>
   </article>)}
  </div>
 </section>;
}
