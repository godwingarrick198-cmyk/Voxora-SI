'use client';

import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';
import LeadGeneration from '@/components/lead-generation';

type Row={id:string;[key:string]:any};
type ChatMessage={role:'user'|'assistant';text:string};
type SpeechRecognitionResultEvent=Event&{results:ArrayLike<ArrayLike<{transcript:string}>>};
const field:React.CSSProperties={width:'100%',padding:'12px 13px',border:'1px solid var(--line)',borderRadius:10,background:'var(--field)',color:'var(--text)',fontSize:14,boxSizing:'border-box',outlineOffset:2};
const label:React.CSSProperties={display:'grid',gap:7,color:'var(--muted)',fontSize:12,fontWeight:700};
const card:React.CSSProperties={background:'var(--card)',border:'1px solid var(--line)',borderRadius:16,padding:18,minWidth:0};
const secondary:React.CSSProperties={border:'1px solid var(--line)',borderRadius:10,padding:'10px 13px',background:'var(--card)',color:'var(--text)',fontWeight:700,cursor:'pointer'};
const primary:React.CSSProperties={border:0,borderRadius:10,padding:'12px 16px',background:'#7564e8',color:'#fff',fontWeight:800,cursor:'pointer'};
const muted:React.CSSProperties={color:'var(--muted)',fontSize:13,lineHeight:1.6};
export default function DashboardClient(){
 const router=useRouter();const db=createClient();const chatEnd=useRef<HTMLDivElement|null>(null);const recognition=useRef<any>(null);
 const [theme,setTheme]=useState<'light'|'dark'>('light'),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[email,setEmail]=useState(''),[emailBusy,setEmailBusy]=useState(false),[emailStatus,setEmailStatus]=useState('');
 const [business,setBusiness]=useState<Row|null>(null),[agent,setAgent]=useState<Row|null>(null),[leads,setLeads]=useState<Row[]>([]),[calls,setCalls]=useState<Row[]>([]);
 const [businessName,setBusinessName]=useState(''),[industry,setIndustry]=useState('other'),[phone,setPhone]=useState(''),[agentName,setAgentName]=useState('Nova'),[greeting,setGreeting]=useState('Thank you for calling. How can I help you today?'),[instructions,setInstructions]=useState('');
 const [messages,setMessages]=useState<ChatMessage[]>([]),[draft,setDraft]=useState(''),[chatBusy,setChatBusy]=useState(false),[listening,setListening]=useState(false),[voiceSupported,setVoiceSupported]=useState(false),[speakReplies,setSpeakReplies]=useState(true);
 useEffect(()=>{const saved=localStorage.getItem('vexora-theme');if(saved==='dark'||saved==='light')setTheme(saved);setVoiceSupported(Boolean((window as any).SpeechRecognition||(window as any).webkitSpeechRecognition));},[]);
 useEffect(()=>{localStorage.setItem('vexora-theme',theme);document.documentElement.dataset.theme=theme;},[theme]);
 useEffect(()=>{chatEnd.current?.scrollIntoView({behavior:'smooth'});},[messages]);
 async function load(){
  setLoading(true);setError('');const {data:{user}}=await db.auth.getUser();if(!user){router.replace('/login');return;}setEmail(user.email||'');
  const {data:b,error:be}=await db.from('businesses').select('*').eq('owner_id',user.id).order('created_at').limit(1).maybeSingle();
  if(be){setError(be.message);setLoading(false);return;}
  if(b){setBusiness(b);setBusinessName(b.name);setIndustry(b.industry||'other');setPhone(b.business_phone||'');
   const {data:a,error:ae}=await db.from('receptionists').select('*').eq('business_id',b.id).limit(1).maybeSingle();if(ae)setError(ae.message);if(a){setAgent(a);setAgentName(a.name);setGreeting(a.greeting);setInstructions(a.instructions||'');}
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
 async function testEmail(){
  setEmailBusy(true);setEmailStatus('');setError('');
  try{
   const {data:{session}}=await db.auth.getSession();
   if(!session?.access_token)throw new Error('Your session has expired. Sign in again.');
   const response=await fetch('/api/email-test',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`}});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'Email test failed.');
   setEmailStatus(`Test email accepted by Brevo and sent to ${data.recipient}. Check your inbox and spam folder.`);
  }catch(e){setError(e instanceof Error?e.message:'Email test failed.');}
  finally{setEmailBusy(false);}
 }
 async function logout(){await db.auth.signOut();router.replace('/login');router.refresh();}
 function speak(text:string){if(!speakReplies||typeof window==='undefined'||!('speechSynthesis'in window))return;window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.rate=1;utterance.pitch=1;window.speechSynthesis.speak(utterance);}
 async function sendMessage(text=draft){
  const clean=text.trim();if(!clean||chatBusy)return;const next=[...messages,{role:'user' as const,text:clean}];setMessages(next);setDraft('');setChatBusy(true);setError('');
  try{const response=await fetch('/api/receptionist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({businessName:businessName||'your business',industry,receptionistName:agentName,greeting,instructions,messages:next})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Gemini could not respond.');const reply=String(data.reply||'I could not prepare a response.');setMessages([...next,{role:'assistant',text:reply}]);speak(reply);}
  catch(e){setError(e instanceof Error?e.message:'Assistant request failed.');}finally{setChatBusy(false);}
 }
 function startListening(){
  const Speech=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;if(!Speech){setError('Voice input is not supported in this browser. You can still type and hear replies.');return;}
  const r=new Speech();recognition.current=r;r.lang='en-US';r.interimResults=false;r.maxAlternatives=1;r.onresult=(event:SpeechRecognitionResultEvent)=>{const text=event.results[0][0].transcript;setListening(false);void sendMessage(text);};r.onerror=()=>{setListening(false);setError('Microphone input failed. Check browser microphone permission and try again.');};r.onend=()=>setListening(false);setListening(true);r.start();
 }
 if(loading)return <main className="vx-shell"><p style={muted}>Loading your secure workspace…</p></main>;
 return <main className="vx-shell" data-theme={theme}><div className="vx-wrap">
  <header className="vx-header"><div className="vx-brand"><span className="vx-logo">V</span><div><b>VEXORA <i>SI</i></b><small>Vexora Super Intelligence</small></div></div><div className="vx-header-actions"><span className="vx-user">{email}</span><button style={secondary} onClick={()=>setTheme(theme==='light'?'dark':'light')} aria-label="Toggle light and dark mode">{theme==='light'?'☾ Dark mode':'☀ Light mode'}</button><button style={secondary} onClick={logout}>Sign out</button></div></header>
  <section className="vx-hero"><div><span className="vx-eyebrow">AI LEAD GENERATION & EMAIL OUTREACH</span><h1>Find customers.<br/>Start conversations.</h1><p>Tell Vexora what opportunities you want. Discover prospects, qualify them with AI and prepare personalised outreach emails.</p></div><div className="vx-hero-badge"><span>✦</span><b>AI Lead Finder</b><small>Gemini powered</small></div></section>
  {!business&&<section style={{...card,borderColor:'#7564e8',marginBottom:18}}><b>Start with your business profile</b><p style={muted}>Your private workspace is empty. Add your business name and industry to start finding relevant prospects.</p></section>}
  <div className="vx-main-grid">
   <form onSubmit={save} style={{...card,display:'grid',gap:15}}><div><h2 className="vx-title">Business profile</h2><p style={muted}>Your business name and industry help Vexora personalise prospect research and outreach.</p></div><div className="vx-form-grid"><label style={label}>Business name<input style={field} required maxLength={120} value={businessName} onChange={e=>setBusinessName(e.target.value)}/></label><label style={label}>Industry<select style={field} required value={industry} onChange={e=>setIndustry(e.target.value)}>{['other','professional_services','healthcare','hospitality','real_estate','retail','education','automotive'].map(x=><option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}</select></label></div><button disabled={saving} style={primary}>{saving?'Saving…':'Save business profile'}</button></form>
   <section style={{...card,display:"none"}}><div className="vx-section-head"><div><h2 className="vx-title">Talk to your Gemini assistant</h2><p style={muted}>Test the receptionist with text or your microphone.</p></div><span className="vx-status">AI PREVIEW</span></div><div className="vx-chat" aria-live="polite">{messages.length===0?<div className="vx-empty-chat"><span>✦</span><b>{agentName} is ready to practise</b><p>Ask about your business, opening hours or services. Gemini will answer using the details you saved.</p><button style={secondary} onClick={()=>void sendMessage('Hello, what can you help me with?')}>Try a sample question</button></div>:messages.map((m,i)=><div key={i} className={m.role==='user'?'vx-msg vx-msg-user':'vx-msg vx-msg-ai'}><small>{m.role==='user'?'You':agentName}</small><p>{m.text}</p></div>)}{chatBusy&&<div className="vx-msg vx-msg-ai"><small>{agentName}</small><p>Thinking…</p></div>}<div ref={chatEnd}/></div><form className="vx-chat-controls" onSubmit={e=>{e.preventDefault();void sendMessage();}}><input style={{...field,flex:1,minWidth:0}} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Type a message…" disabled={chatBusy}/><button type="submit" style={primary} disabled={chatBusy||!draft.trim()}>Send</button></form><div className="vx-voice-row"><button type="button" style={secondary} onClick={startListening} disabled={listening||chatBusy}>{listening?'Listening…':'🎙 Speak to assistant'}</button><label className="vx-speak-toggle"><input type="checkbox" checked={speakReplies} onChange={e=>setSpeakReplies(e.target.checked)}/> Speak replies aloud</label></div><p style={{...muted,fontSize:11,marginBottom:0}}>{voiceSupported?'Voice input is available in supported browsers. Spoken replies use your device voice.':'This browser may not support microphone input; text chat and spoken replies can still work.'} This is a browser preview, not a live phone call.</p></section>
  </div>
  {business&&<LeadGeneration businessId={business.id} businessName={business.name}/>}

  <section style={{...card,marginTop:18}}><div className="vx-section-head"><div><h2 className="vx-title">Email delivery</h2><p style={muted}>Transactional email through Brevo.</p></div><span className="vx-status">BREVO CONNECTED</span></div><p style={muted}>Send a real test email to your signed-in account ({email}). This checks your Brevo API connection and active sender configuration.</p><button type="button" style={primary} disabled={emailBusy||!email} onClick={()=>void testEmail()}>{emailBusy?'Sending test…':'Send test email to my inbox'}</button>{emailStatus&&<p role="status" style={{...muted,color:'#16834a',marginBottom:0}}>{emailStatus}</p>}</section>
  {error&&<div className="vx-error" role="alert">{error}</div>}<footer className="vx-footer">Vexora SI · Business workspace · Your data stays in your account</footer>
 </div></main>;
}
