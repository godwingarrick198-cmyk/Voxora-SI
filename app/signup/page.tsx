'use client';
import {FormEvent,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';
export default function SignupPage(){
 const router=useRouter();const [name,setName]=useState('');const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError('');setNotice('');const normalizedEmail=email.trim().toLowerCase();if(!/^[a-z0-9.!#$%&'*+/=?^`{|}~-]+@gmail\\.com$/i.test(normalizedEmail)){setBusy(false);setError('Only Gmail addresses ending in @gmail.com are accepted.');return;}const {data,error}=await createClient().auth.signUp({email:normalizedEmail,password,options:{data:{full_name:name.trim()}}});setBusy(false);if(error){setError(error.message);return;}if(data.session){router.replace('/');router.refresh();}else setNotice('Your account request was received, but email confirmation is still enabled in the authentication settings. Turn it off in Supabase to allow immediate access.');}
 return <main style={shell}><section style={card} aria-labelledby="signup-title"><div style={mark}>V</div><p style={eyebrow}>VEXORA SUPER INTELLIGENCE</p><h1 id="signup-title">Create your account.</h1><p style={muted}>Set up a secure workspace for your business receptionist.</p><form onSubmit={submit} style={{display:'grid',gap:15,marginTop:24}}><label style={label}>Your name<input style={input} required maxLength={100} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label><label style={label}>Gmail address<input style={input} type="email" required placeholder="you@gmail.com" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e=>setEmail(e.target.value)}/></label><label style={label}>Password<input style={input} type="password" minLength={8} autoComplete="new-password" required value={password} onChange={e=>setPassword(e.target.value)}/><small style={muted}>At least 8 characters.</small></label>{error&&<p role="alert" style={errorStyle}>{error}</p>}{notice&&<p role="status" style={noticeStyle}>{notice}</p>}<button type="submit" disabled={busy} style={{...button,opacity:busy?.7:1}}>{busy?'Creating account…':'Create account'}</button></form><p style={foot}>Already registered? <Link href="/login" style={link}>Sign in</Link></p></section></main>;
}
const shell:React.CSSProperties={minHeight:'100vh',minHeight:'100svh',display:'grid',placeItems:'center',padding:'max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))',background:'#090d18',color:'#f7f8fc',fontFamily:'Arial,sans-serif',overflowY:'auto'};
const card:React.CSSProperties={width:'100%',maxWidth:460,padding:'clamp(22px, 5vw, 38px)',border:'1px solid #242c40',borderRadius:22,background:'#111827',boxShadow:'0 25px 90px #0007',margin:'auto'};
const mark:React.CSSProperties={width:44,height:44,display:'grid',placeItems:'center',borderRadius:13,background:'#9cebd2',color:'#071b18',fontWeight:900,fontSize:24};
const eyebrow:React.CSSProperties={marginTop:22,color:'#9cebd2',fontSize:10,letterSpacing:2,fontWeight:800};
const muted:React.CSSProperties={color:'#9ca8ba',lineHeight:1.6,fontSize:13};
const label:React.CSSProperties={display:'grid',gap:8,color:'#d9e0eb',fontSize:12,fontWeight:700};
const input:React.CSSProperties={width:'100%',minWidth:0,minHeight:48,padding:'13px 14px',borderRadius:10,border:'1px solid #303b50',background:'#0b1220',color:'white',fontSize:16,boxSizing:'border-box'};
const button:React.CSSProperties={minHeight:48,padding:14,border:0,borderRadius:10,background:'#9cebd2',color:'#081a17',fontWeight:800,fontSize:15,cursor:'pointer'};
const errorStyle:React.CSSProperties={color:'#ff9d9d',fontSize:13,lineHeight:1.5,overflowWrap:'anywhere'};
const noticeStyle:React.CSSProperties={color:'#9cebd2',fontSize:13,lineHeight:1.6,overflowWrap:'anywhere'};
const foot:React.CSSProperties={marginTop:22,color:'#9ca8ba',fontSize:13,lineHeight:1.6};
const link:React.CSSProperties={color:'#9cebd2',fontWeight:700,textDecoration:'none'};
