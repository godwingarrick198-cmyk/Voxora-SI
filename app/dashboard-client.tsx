'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';
type Row={id:string;[key:string]:any};
const input:React.CSSProperties={width:'100%',padding:12,border:'1px solid #29354a',borderRadius:10,background:'#0d1524',color:'#f3f6fb',fontSize:14,boxSizing:'border-box'};
const panel:React.CSSProperties={background:'#111b2b',border:'1px solid #243149',borderRadius:16,padding:20};
const label:React.CSSProperties={display:'grid',gap:7,color:'#b7c2d2',fontSize:12,fontWeight:700};
const muted:React.CSSProperties={color:'#91a0b5',fontSize:13,lineHeight:1.6};
const button:React.CSSProperties={border:0,borderRadius:10,padding:'12px 16px',background:'#9cebd2',color:'#071b17',fontWeight:800,cursor:'pointer'};
export default function DashboardClient(){
 const router=useRouter();const db=createClient();
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[email,setEmail]=useState('');
 const [business,setBusiness]=useState<Row|null>(null),[agent,setAgent]=useState<Row|null>(null),[leads,setLeads]=useState<Row[]>([]),[calls,setCalls]=useState<Row[]>([]);
 const [businessName,setBusinessName]=useState(''),[industry,setIndustry]=useState(''),[phone,setPhone]=useState(''),[agentName,setAgentName]=useState('Nova'),[greeting,setGreeting]=useState('Thank you for calling. How can I help you today?'),[instructions,setInstructions]=useState('');
 async function load(){
  setLoading(true);setError('');const {data:{user}}=await db.auth.getUser();if(!user){router.replace('/login');return;}setEmail(user.email||'');
  const {data:b,error:be}=await db.from('businesses').select('*').eq('owner_id',user.id).order('created_at').limit(1).maybeSingle();
  if(be){setError(be.message);setLoading(false);return;}
  if(b){setBusiness(b);setBusinessName(b.name);setIndustry(b.industry||'other');setPhone(b.business_phone||'');
   const {data:a,error:ae}=await db.from('receptionists').select('*').eq('business_id',b.id).limit(1).maybeSingle();
   if(ae)setError(ae.message);if(a){setAgent(a);setAgentName(a.name);setGreeting(a.greeting);setInstructions(a.instructions||'');}
   const [l,c]=await Promise.all([db.from('leads').select('*').eq('business_id',b.id).order('created_at',{ascending:false}).limit(8),db.from('call_logs').select('*').eq('business_id',b.id).order('created_at',{ascending:false}).limit(8)]);
   if(l.error||c.error)setError(l.error?.message||c.error?.message||'Unable to load activity.');setLeads(l.data||[]);setCalls(c.data||[]);
  }setLoading(false);
 }
 useEffect(()=>{void load();},[]);
 async function save(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setSaving(true);setError('');const {data:{user}}=await db.auth.getUser();if(!user){router.replace('/login');return;}
  let businessId=business?.id;
  if(businessId){const {error}=await db.from('businesses').update({name:businessName.trim(),industry,business_phone:phone.trim()||null}).eq('id',businessId);if(error){setError(error.message);setSaving(false);return;}}
  else{const {data,error}=await db.from('businesses').insert({owner_id:user.id,name:businessName.trim(),industry,business_phone:phone.trim()||null}).select().single();if(error||!data){setError(error?.message||'Business could not be created.');setSaving(false);return;}businessId=data.id;setBusiness(data);}
  const values={business_id:businessId,name:agentName.trim(),greeting:greeting.trim(),instructions:instructions.trim(),enabled:false};
  if(agent){const {error}=await db.from('receptionists').update(values).eq('id',agent.id);if(error){setError(error.message);setSaving(false);return;}}
  else{const {data,error}=await db.from('receptionists').insert(values).select().single();if(error||!data){setError(error?.message||'Receptionist could not be saved.');setSaving(false);return;}setAgent(data);}
  setSaving(false);await load();
 }
 async function logout(){await db.auth.signOut();router.replace('/login');router.refresh();}
 if(loading)return <main style={base}><p style={muted}>Loading your secure workspace…</p></main>;
 return <main style={base}><div style={{maxWidth:1100,margin:'0 auto'}}><header style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:14,borderBottom:'1px solid #233047',paddingBottom:20,marginBottom:28}}><div><b style={{color:'#9cebd2',letterSpacing:2}}>VEXORA SI</b><div style={muted}>Business workspace</div></div><div style={{display:'flex',alignItems:'center',gap:12}}><span style={{...muted,fontSize:12}}>{email}</span><button onClick={logout} style={{background:'transparent',border:'1px solid #334158',color:'#cbd5e1',borderRadius:9,padding:9}}>Sign out</button></div></header>
 <p style={{color:'#9cebd2',fontSize:11,fontWeight:800,letterSpacing:1.5}}>YOUR RECEPTION DESK</p><h1 style={{fontSize:'clamp(28px,5vw,42px)',letterSpacing:-1.5,margin:'8px 0'}}>Your business. Always answered.</h1><p style={muted}>Set up the business profile and receptionist that will power your incoming-call service.</p>
 {!business&&<section style={{...panel,borderColor:'#9cebd2',margin:'24px 0'}}><h2 style={{fontSize:18}}>Start with your business profile</h2><p style={muted}>Your private workspace is empty. Enter real details below; they will be saved to your account.</p></section>}
 <form onSubmit={save} style={{...panel,display:'grid',gap:16,marginTop:22}}><h2 style={{fontSize:18,margin:'0 0 2px'}}>Business and receptionist setup</h2><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:14}}><label style={label}>Business name<input style={input} required maxLength={120} value={businessName} onChange={e=>setBusinessName(e.target.value)}/></label><label style={label}>Industry<select style={input} required value={industry} onChange={e=>setIndustry(e.target.value)}><option value="">Choose industry</option>{['other','professional_services','healthcare','hospitality','real_estate','retail','education','automotive'].map(x=><option key={x} value={x}>{x.replace('_',' ')}</option>)}</select></label><label style={label}>Existing business phone<input style={input} type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+234… / +1…"/></label><label style={label}>Receptionist name<input style={input} required maxLength={50} value={agentName} onChange={e=>setAgentName(e.target.value)}/></label></div><label style={label}>Opening greeting<textarea style={{...input,minHeight:75}} maxLength={300} value={greeting} onChange={e=>setGreeting(e.target.value)}/></label><label style={label}>Business facts and instructions<textarea style={{...input,minHeight:115}} maxLength={2500} value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="Services, opening hours, locations, FAQs, booking rules and accurate pricing…"/></label><div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}><button disabled={saving} style={button}>{saving?'Saving…':'Save business and receptionist'}</button><span style={muted}>Saved to your account, not just this browser.</span></div></form>
 <section style={{...panel,marginTop:18}}><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}><div><h2 style={{fontSize:18,margin:'0 0 7px'}}>Incoming phone service</h2><p style={{...muted,margin:0}}>Bring your existing business number and forward calls when telephony is connected.</p></div><span style={{background:'#352b19',color:'#f4c77c',padding:'7px 10px',borderRadius:30,fontSize:11,fontWeight:800}}>NOT CONNECTED</span></div><p style={muted}>Live phone answering is not active yet. Vexora is not receiving calls. This status will only change after a real provider integration and a successful test call.</p></section>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:14,margin:'18px 0'}}>{[['Saved leads',leads.length],['Call records',calls.length],['Receptionist configuration',agent?'Saved':'Not configured']].map(([title,value])=><section key={String(title)} style={panel}><div style={muted}>{title}</div><div style={{fontSize:28,fontWeight:800,marginTop:8}}>{value}</div><p style={muted}>Live database records only</p></section>)}</div>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(270px,1fr))',gap:14}}><section style={panel}><h2 style={{fontSize:16,marginTop:0}}>Recent leads</h2>{leads.length?leads.map(x=><div key={x.id} style={row}><b>{x.caller_name||'Caller'}</b><span style={muted}>{x.intent||'Enquiry'} · {x.phone||x.email||'No contact details'}</span></div>):<p style={muted}>No real leads yet.</p>}</section><section style={panel}><h2 style={{fontSize:16,marginTop:0}}>Recent calls</h2>{calls.length?calls.map(x=><div key={x.id} style={row}><b>{x.caller_phone||'Caller number unavailable'}</b><span style={muted}>{x.outcome||'No outcome'} · {x.duration_seconds??'—'} sec</span></div>):<p style={muted}>No real phone calls have been received.</p>}</section></div>
 {error&&<p style={{color:'#ff9d9d',fontSize:13,marginTop:18}}>{error}</p>}</div></main>;
}
const base:React.CSSProperties={minHeight:'100vh',background:'#090f1c',color:'#f5f7fb',padding:'26px clamp(16px,4vw,48px) 60px',fontFamily:'Arial,sans-serif'};
const row:React.CSSProperties={padding:'12px 0',borderTop:'1px solid #26334a',display:'grid',gap:5,fontSize:13};
