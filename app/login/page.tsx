'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); setBusy(true); setError('');
    const normalizedEmail=email.trim().toLowerCase();
    if(!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\\.com$/i.test(normalizedEmail)){setBusy(false);setError('Use the Gmail address registered with Vexora.');return;}
    const supabase=createClient();
    const {error}=await supabase.auth.signInWithPassword({email:normalizedEmail,password});
    setBusy(false);
    if(error){setError(error.message);return;}
    router.replace('/'); router.refresh();
  }
  return <main style={shell}><section style={card}><div style={mark}>V</div><p style={eyebrow}>VEXORA SUPER INTELLIGENCE</p><h1>Welcome back.</h1><p style={muted}>Sign in to manage your business receptionist.</p><form onSubmit={submit} style={{display:'grid',gap:14,marginTop:28}}><label style={label}>Gmail address<input style={input} type="email" placeholder="you@gmail.com" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} /></label><label style={label}>Password<input style={input} type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} /></label>{error&&<p style={errorStyle}>{error}</p>}<button disabled={busy} style={button}>{busy?'Signing in…':'Sign in'}</button></form><p style={foot}>New to Vexora? <Link href="/signup" style={link}>Create an account</Link></p></section></main>;
}
const shell:React.CSSProperties={minHeight:'100vh',display:'grid',placeItems:'center',padding:20,background:'#090d18',color:'#f7f8fc',fontFamily:'Arial,sans-serif'};
const card:React.CSSProperties={width:'100%',maxWidth:430,padding:36,border:'1px solid #242c40',borderRadius:22,background:'#111827',boxShadow:'0 25px 90px #0007'};
const mark:React.CSSProperties={width:44,height:44,display:'grid',placeItems:'center',borderRadius:13,background:'#9cebd2',color:'#071b18',fontWeight:900,fontSize:24};
const eyebrow:React.CSSProperties={marginTop:22,color:'#9cebd2',fontSize:10,letterSpacing:2,fontWeight:800};
const muted:React.CSSProperties={color:'#9ca8ba',lineHeight:1.6,fontSize:14};
const label:React.CSSProperties={display:'grid',gap:8,color:'#d9e0eb',fontSize:12,fontWeight:700};
const input:React.CSSProperties={padding:'13px 14px',borderRadius:10,border:'1px solid #303b50',background:'#0b1220',color:'white',fontSize:14,outline:'none'};
const button:React.CSSProperties={padding:14,border:0,borderRadius:10,background:'#9cebd2',color:'#081a17',fontWeight:800,fontSize:14,cursor:'pointer'};
const errorStyle:React.CSSProperties={color:'#ff9d9d',fontSize:12};
const foot:React.CSSProperties={marginTop:24,color:'#9ca8ba',fontSize:13};
const link:React.CSSProperties={color:'#9cebd2',fontWeight:700,textDecoration:'none'};
