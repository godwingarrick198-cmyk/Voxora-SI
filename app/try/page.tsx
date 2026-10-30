'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bot, Mic, MicOff, PhoneCall, Send, Settings2, Volume2, VolumeX } from 'lucide-react';

type Turn = { role: 'user' | 'assistant'; text: string };
type Lead = { caller_name?: string | null; phone?: string | null; email?: string | null; intent?: string | null; summary?: string | null };
type SpeechRecognitionResult = { [index: number]: { transcript: string } };
type SpeechRecognitionEvent = { results: SpeechRecognitionResult[] };
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((event: SpeechRecognitionEvent) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
declare global { interface Window { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition } }

export default function TryReceptionist() {
  const [businessName, setBusinessName] = useState('Your Business');
  const [industry, setIndustry] = useState('General business');
  const [agentName, setAgentName] = useState('Nova');
  const [greeting, setGreeting] = useState('Hello! Thanks for calling. How can I help you today?');
  const [instructions, setInstructions] = useState('');
  const [showSettings, setShowSettings] = useState(true);
  const [messages, setMessages] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [status, setStatus] = useState('Ready for a test conversation');
  const [leadStatus, setLeadStatus] = useState('');
  const recognitionRef = useRef<Recognition | null>(null);
  const messagesRef = useRef<Turn[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesRef.current = messages; scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);
  useEffect(() => () => { recognitionRef.current?.stop(); window.speechSynthesis?.cancel(); }, []);

  function speak(text: string) {
    if (!voiceOn || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }

  async function sendMessage(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    const next = [...messagesRef.current, { role: 'user' as const, text: clean }];
    setMessages(next); messagesRef.current = next; setInput(''); setBusy(true); setStatus('Nova is thinking…');
    try {
      const response = await fetch('/api/receptionist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName, industry, receptionistName: agentName, greeting, instructions, messages: next })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The receptionist could not respond.');
      const updated = [...next, { role: 'assistant' as const, text: data.reply }];
      setMessages(updated); messagesRef.current = updated; speak(data.reply); setStatus(data.complete ? 'Enquiry ready for staff follow-up' : 'Listening for the next question');
      if (data.lead) {
        const saved = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessName, lead: data.lead, transcript: updated }) });
        const result = await saved.json();
        setLeadStatus(saved.ok ? 'Lead saved securely to the Voxora demo database.' : (result.error || 'Lead could not be saved.'));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      setMessages(prev => [...prev, { role: 'assistant', text: `I’m sorry, I’m having trouble responding right now. ${message}` }]);
      setStatus('Connection issue');
    } finally { setBusy(false); }
  }

  function startListening() {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) { setStatus('Voice input is not supported in this browser. Use the message box below.'); return; }
    const recognition = new Speech();
    recognition.lang = 'en-US'; recognition.interimResults = false; recognition.continuous = false;
    recognition.onresult = (event) => { const transcript = event.results[0]?.[0]?.transcript; if (transcript) void sendMessage(transcript); };
    recognition.onerror = () => { setListening(false); setStatus('Microphone unavailable. Check browser permission or type instead.'); };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try { recognition.start(); setListening(true); setStatus('Listening… speak naturally'); } catch { setListening(false); setStatus('Could not start the microphone.'); }
  }

  function endCall() {
    recognitionRef.current?.stop(); window.speechSynthesis?.cancel(); setListening(false);
    if (messages.length) {
      const history = JSON.parse(localStorage.getItem('voxora_demo_calls') || '[]');
      history.unshift({ id: crypto.randomUUID(), businessName, endedAt: new Date().toISOString(), messages });
      localStorage.setItem('voxora_demo_calls', JSON.stringify(history.slice(0, 25)));
    }
    setMessages([]); messagesRef.current = []; setLeadStatus(''); setStatus('Test conversation ended. Transcript saved on this device.');
  }

  return <main className="try-shell">
    <header className="try-top"><a href="/" className="back-link"><ArrowLeft size={17}/> Dashboard</a><div className="try-brand"><span><Bot size={19}/></span> voxora<span>.ai</span></div><span className="free-pill">FREE BROWSER DEMO</span></header>
    <div className="try-layout">
      <section className="try-intro"><div className="try-eyebrow">LIVE RECEPTIONIST PLAYGROUND</div><h1>Meet <em>{agentName || 'Nova'}.</em><br/>Your AI front desk.</h1><p>Test a real Gemini-powered receptionist with voice input and spoken replies. No phone number or paid telephony required.</p><div className="try-feature"><span><Mic size={16}/></span><div><b>Speak or type</b><small>Use your browser microphone or chat normally.</small></div></div><div className="try-feature"><span><UsersIcon/></span><div><b>Capture enquiries</b><small>Contact details and call summaries can be saved as demo leads.</small></div></div><div className="try-feature"><span><ShieldIcon/></span><div><b>Business-aware</b><small>Give Nova your actual services, hours, and policies before testing.</small></div></div></section>
      <section className="receptionist-card">
        <div className="receptionist-head"><div className="agent-id"><div className="agent-avatar"><Bot size={24}/></div><div><b>{agentName || 'Nova'}</b><small><i/> AI receptionist · {businessName}</small></div></div><button className="settings-toggle" onClick={() => setShowSettings(v => !v)}><Settings2 size={16}/>{showSettings ? 'Hide setup' : 'Business setup'}</button></div>
        {showSettings && <div className="business-settings"><div className="field-row"><label>Business name<input value={businessName} onChange={e=>setBusinessName(e.target.value)} maxLength={120}/></label><label>Industry<select value={industry} onChange={e=>setIndustry(e.target.value)}><option>General business</option><option>Real estate</option><option>Professional services</option><option>Healthcare</option><option>Home services</option><option>Hospitality</option><option>Retail</option></select></label></div><div className="field-row"><label>Receptionist name<input value={agentName} onChange={e=>setAgentName(e.target.value)} maxLength={50}/></label><label>Opening greeting<input value={greeting} onChange={e=>setGreeting(e.target.value)} maxLength={300}/></label></div><label>Business facts and instructions<textarea value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="Example: We are open Mon–Fri, 9am–5pm. We offer plumbing repairs and emergency call-outs. Our service area is…"/></label><small className="settings-hint">Only enter information you want the demo receptionist to use. It will not invent answers for missing details.</small></div>}
        <div className="conversation-title"><div><b>Conversation</b><small>{status}</small></div><button className="sound-toggle" onClick={()=>{setVoiceOn(v=>!v);window.speechSynthesis?.cancel();}}>{voiceOn?<Volume2 size={17}/>:<VolumeX size={17}/>} {voiceOn?'Voice on':'Voice off'}</button></div>
        <div className="chat-window" ref={scrollRef}>{messages.length===0 ? <div className="chat-welcome"><div className="welcome-bot"><Bot size={30}/></div><b>Start a conversation with {agentName || 'Nova'}</b><p>Try: “Hi, I’m looking for more information about your services.”</p><button onClick={()=>void sendMessage('Hello, I would like to know what services you offer.')}>Try a sample enquiry <Send size={13}/></button></div> : messages.map((m,i)=><div className={`chat-message ${m.role}`} key={i}><span>{m.role==='assistant'?agentName:'You'}</span><p>{m.text}</p></div>)}</div>
        {leadStatus && <div className="lead-saved">{leadStatus}</div>}
        <form className="message-composer" onSubmit={e=>{e.preventDefault();void sendMessage(input);}}><button type="button" className={`mic-button ${listening?'mic-active':''}`} onClick={()=>listening?recognitionRef.current?.stop():startListening()} aria-label="Use microphone">{listening?<MicOff size={19}/>:<Mic size={19}/>}</button><input value={input} onChange={e=>setInput(e.target.value)} placeholder="Type what a caller would say…" disabled={busy}/><button className="send-button" disabled={busy||!input.trim()} aria-label="Send message"><Send size={17}/></button></form>
        <div className="conversation-foot"><span>{busy?'Connecting to Gemini…':'Gemini-powered · browser voice'}</span><button onClick={endCall}><PhoneCall size={14}/> End test</button></div>
      </section>
    </div>
    <footer className="try-footer">Voxora AI · Stage 1 browser receptionist · No real phone calls are made.</footer>
    <style jsx>{`
      .try-shell{min-height:100vh;background:#f8f8fc;color:#22223d;font-family:Arial,sans-serif}.try-top{height:70px;background:#fff;border-bottom:1px solid #ececf3;display:flex;align-items:center;justify-content:space-between;padding:0 max(calc((100vw - 1180px)/2),22px)}.back-link{display:flex;align-items:center;gap:8px;color:#77778c;text-decoration:none;font-size:13px}.try-brand{font-size:20px;font-weight:800;letter-spacing:-1px;display:flex;align-items:center;gap:7px}.try-brand>span:first-child{background:#6d5ce8;color:white;width:30px;height:30px;display:grid;place-items:center;border-radius:9px}.try-brand>span:last-child{color:#8375e9;margin-left:-7px}.free-pill{font-size:9px;font-weight:800;letter-spacing:1px;background:#eaf8f1;color:#26996d;padding:8px 10px;border-radius:20px}.try-layout{max-width:1180px;margin:0 auto;padding:65px 22px;display:grid;grid-template-columns:.85fr 1.15fr;gap:65px;align-items:start}.try-intro{padding-top:30px}.try-eyebrow{font-size:10px;letter-spacing:1.8px;font-weight:800;color:#7463e6}.try-intro h1{font-size:46px;line-height:1.12;letter-spacing:-2px;margin:18px 0}.try-intro h1 em{font-style:normal;color:#7463e6}.try-intro>p{color:#85859b;line-height:1.8;font-size:14px;max-width:410px}.try-feature{display:flex;gap:13px;align-items:center;margin-top:27px}.try-feature>span{width:38px;height:38px;border-radius:11px;background:#eeecff;color:#6e5ce6;display:grid;place-items:center}.try-feature div{display:flex;flex-direction:column;gap:5px}.try-feature b{font-size:13px}.try-feature small{font-size:11px;color:#9292a5}.receptionist-card{background:#fff;border:1px solid #e9e9f1;border-radius:18px;box-shadow:0 18px 55px #26224b0c;overflow:hidden}.receptionist-head{padding:17px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f0f0f5}.agent-id{display:flex;align-items:center;gap:10px}.agent-avatar{width:42px;height:42px;border-radius:13px;background:#eeeaff;color:#6c5be4;display:grid;place-items:center}.agent-id>div:last-child{display:flex;flex-direction:column;gap:5px}.agent-id b{font-size:13px}.agent-id small{font-size:10px;color:#9292a4}.agent-id small i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#34b987;margin-right:5px}.settings-toggle,.sound-toggle{display:flex;align-items:center;gap:6px;background:#f7f6ff;border:0;border-radius:8px;padding:9px 10px;color:#6959d9;font-size:10px;font-weight:700}.business-settings{padding:17px 20px;background:#fbfaff;border-bottom:1px solid #f0eff7}.business-settings label{display:flex;flex-direction:column;gap:6px;font-size:10px;font-weight:700;color:#6d6d83;margin-bottom:12px;flex:1;min-width:0}.business-settings input,.business-settings select,.business-settings textarea{border:1px solid #e7e6f0;border-radius:8px;background:#fff;padding:10px;color:#33334e;outline-color:#8e7ef0;width:100%;font:12px Arial}.business-settings textarea{min-height:75px;resize:vertical}.field-row{display:flex;gap:12px}.settings-hint{display:block;color:#9a99ab;font-size:9px;line-height:1.5}.conversation-title{padding:17px 20px 12px;display:flex;align-items:center;justify-content:space-between}.conversation-title>div{display:flex;flex-direction:column;gap:5px}.conversation-title b{font-size:12px}.conversation-title small{font-size:10px;color:#9696a8}.sound-toggle{background:transparent;color:#77778d}.chat-window{height:340px;overflow:auto;padding:18px 20px;background:#fdfdff;display:flex;flex-direction:column;gap:13px}.chat-welcome{margin:auto;text-align:center;max-width:280px;display:flex;align-items:center;flex-direction:column}.welcome-bot{width:58px;height:58px;border-radius:18px;background:#eeeaff;color:#6e5ce6;display:grid;place-items:center;margin-bottom:13px}.chat-welcome b{font-size:13px}.chat-welcome p{font-size:11px;color:#9292a5;line-height:1.6}.chat-welcome button{display:flex;align-items:center;gap:7px;background:#f0eeff;border:0;color:#6656d9;padding:10px 12px;border-radius:8px;font-size:10px;font-weight:700}.chat-message{max-width:84%;padding:10px 12px;border-radius:12px;background:#f0eff7;align-self:flex-start}.chat-message.user{align-self:flex-end;background:#6d5ce8;color:#fff}.chat-message>span{font-size:9px;font-weight:700;opacity:.7}.chat-message p{font-size:12px;line-height:1.6;margin:5px 0 0;white-space:pre-wrap}.lead-saved{padding:9px 20px;background:#eaf8f1;color:#22865f;font-size:10px}.message-composer{display:flex;align-items:center;gap:9px;padding:13px 16px;border-top:1px solid #efeff5}.message-composer input{flex:1;min-width:0;border:0;outline:0;font-size:12px;padding:10px 0}.mic-button,.send-button{width:38px;height:38px;border:0;border-radius:10px;display:grid;place-items:center}.mic-button{background:#f0eeff;color:#6d5ce8}.mic-active{background:#ffe9e9;color:#d44}.send-button{background:#6d5ce8;color:white}.send-button:disabled{opacity:.4}.conversation-foot{padding:0 19px 15px;display:flex;align-items:center;justify-content:space-between;color:#9999aa;font-size:9px}.conversation-foot button{display:flex;align-items:center;gap:5px;background:transparent;border:0;color:#d36b6b;font-size:10px;font-weight:700}.try-footer{text-align:center;padding:0 20px 25px;color:#aaaabc;font-size:10px}
      @media(max-width:850px){.try-layout{grid-template-columns:1fr;gap:30px;padding:35px 16px}.try-intro{padding-top:0}.try-intro h1{font-size:38px}.try-intro>p{max-width:600px}.try-feature{margin-top:15px}.chat-window{height:360px}}
      @media(max-width:500px){.try-top{height:60px;padding:0 12px}.back-link{font-size:0;gap:0}.back-link svg{width:20px;height:20px}.try-brand{font-size:17px}.free-pill{font-size:8px;padding:7px}.try-layout{padding:25px 12px}.try-intro h1{font-size:34px}.field-row{display:block}.receptionist-head{padding:13px}.business-settings{padding:14px}.chat-window{height:330px;padding:14px}.conversation-title{padding:14px}.message-composer{padding:10px}.conversation-foot{padding:0 13px 13px}}
    `}</style>
  </main>;
}

function UsersIcon(){return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
function ShieldIcon(){return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/><path d="m9 12 2 2 4-4"/></svg>}
