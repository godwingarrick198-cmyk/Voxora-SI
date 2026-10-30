'use client';
import {FormEvent,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';
export default function SignupPage(){
 const router=useRouter();const [name,setName]=useState('');const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError('');setNotice('');const normalizedEmail=email.trim().toLowerCase();if(!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com$/i.test(normalizedEmail)){setBusy(false);setError('Only Gmail addresses ending in @gmail.com are accepted.');return;}const {data,error}=await createClient().auth.signUp({email:normalizedEmail,password,options:{data:{full_name:name.trim()}}});setBusy(false);if(error){setError(error.message);return;}if(data.session){router.replace('/');router.refresh();}else setNotice('Your account request was received, but email confirmation is still enabled in the authentication settings. Turn it off in Supabase to allow immediate access.');}
 return <main style={s}><section style={c}><div style={m}>V</div><p style={k}>VEXORA SUPER INTELLIGENCE</p><h1>Create your account.</h1><p style={muted}>Set up a secure workspace for your business receptionist.</p><form onSubmit={submit} style={{display:'grid',gap:13,marginTop:25}}><label style={l}>Your name<input style={i} required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><label style={l}>Gmail address<input style={i} type="email" required placeholder="you@gmail.com" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label style={l}>Password<input style={i} type="password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/><small style={muted}>At least 8 characters.</small></label>{error&&<p style={{color:'#ff9d9d'}}>{error}</p>}{notice&&<p style={{color:'#9cebd2'}}>{notice}</p>}<button disabled={busy} style={b}>{busy?'Creating account…':'Create account'}</button></form><p style={muted}>Already registered? <Link href="/login" style={{color:'#9cebd2'}}>Sign in</Link></p></section></main>;
}
const s:React.CSSProperties={minHeight:'100vh',display:'grid',placeItems:'center',padding:20,background:'#090d18',color:'#f7f8fc',fontFamily:'Arial,sans-serif'};
const c:React.CSSProperties={width:'100%',maxWidth:450,padding:36,border:'1px solid #242c40',borderRadius:22,background:'#111827'};
const m:React.CSSProperties={width:44,height:44,display:'grid',placeItems:'center',borderRadius:13,background:'#9cebd2',color:'#071b18',fontWeight:900,fontSize:24};
const k:React.CSSProperties={marginTop:22,color:'#9cebd2',fontSize:10,letterSpacing:2,fontWeight:800};
const muted:React.CSSProperties={color:'#9ca8ba',lineHeight:1.6,fontSize:13};
const l:React.CSSProperties={display:'grid',gap:8,color:'#d9e0eb',fontSize:12,fontWeight:700};
const i:React.CSSProperties={padding:'13px 14px',borderRadius:10,border:'1px solid #303b50',background:'#0b1220',color:'white',fontSize:14};
const b:React.CSSProperties={padding:14,border:0,borderRadius:10,background:'#9cebd2',color:'#081a17',fontWeight:800,fontSize:14};
