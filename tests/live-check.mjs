// REAL-BACKEND check (not mocked). Needs: migrations 001+002 applied, config.js filled in, one Supabase account.
// Usage:  VELNQ_EMAIL=you@example.com VELNQ_PASSWORD=yourpassword node tests/live-check.mjs      (Node 18+)
// It uploads two tiny WAV files, builds a playlist, and checks what an ANONYMOUS visitor can and cannot do.
// All test rows and files are deleted at the end.
import fs from 'node:fs';
const cfg=fs.readFileSync(new URL('../config.js',import.meta.url),'utf8');
const U=((cfg.match(/url:\s*'([^']*)'/)||[])[1]||'').replace(/\/+$/,''),K=(cfg.match(/anonKey:\s*'([^']*)'/)||[])[1];
const{VELNQ_EMAIL:E,VELNQ_PASSWORD:P}=process.env;
if(!U||!K||!E||!P){console.log('Fill in config.js and set VELNQ_EMAIL and VELNQ_PASSWORD, then run again.');process.exit(2)}
let role='';try{role=JSON.parse(Buffer.from(K.split('.')[1],'base64url').toString()).role}catch{}
if(role==='service_role'||K.startsWith('sb_secret_')){console.error('config.js contains a SECRET key. Remove it, then rotate that key in Supabase.');process.exit(1)}
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
const hdr=t=>({apikey:K,Authorization:'Bearer '+(t||K),'Content-Type':'application/json'});
const rest=async(m,p,t,b,x={})=>{const r=await fetch(`${U}/rest/v1/${p}`,{method:m,headers:{...hdr(t),Prefer:'return=representation',...x},body:b&&JSON.stringify(b)});return{s:r.status,j:await r.json().catch(()=>null)}};
const up=(t,path,body)=>fetch(`${U}/storage/v1/object/audio/${path}`,{method:'POST',headers:{apikey:K,Authorization:'Bearer '+(t||K),'Content-Type':'audio/wav','x-upsert':'false'},body}).then(r=>r.status);
const sign=async(t,path)=>{const r=await fetch(`${U}/storage/v1/object/sign/audio/${path}`,{method:'POST',headers:hdr(t),body:JSON.stringify({expiresIn:120})});const j=await r.json().catch(()=>({}));return{url:j.signedURL?`${U}/storage/v1${j.signedURL}`:null}};
const wav=()=>{const n=1600,b=Buffer.alloc(44+n,128);b.write('RIFF',0);b.writeUInt32LE(36+n,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(8000,28);b.writeUInt16LE(1,32);b.writeUInt16LE(8,34);b.write('data',36);b.writeUInt32LE(n,40);return b};
const login=await fetch(`${U}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:K,'Content-Type':'application/json'},body:JSON.stringify({email:E,password:P})}).then(r=>r.json()).catch(e=>({msg:e.message}));
const T=login.access_token,uid=login.user&&login.user.id;
if(!T){console.error('Sign-in failed: '+(login.msg||login.error_description||JSON.stringify(login)));process.exit(1)}
ok(true,'owner sign-in');
const stamp=Date.now(),paths=[],tids=[];let cid;
try{
 for(const i of [1,2]){const p=`${uid}/livecheck-${stamp}-${i}.wav`,s=await up(T,p,wav());ok(s===200,`owner uploads audio #${i} (HTTP ${s})`);paths.push(p);
  const r=await rest('POST','tracks',T,{title:'live check '+i,file_name:`l${i}.wav`,audio_path:p,mime_type:'audio/wav',size_bytes:1644,duration_s:0.2});ok(r.s===201&&!!(r.j&&r.j[0]),`track row #${i} saved (HTTP ${r.s})`);tids.push(r.j&&r.j[0]&&r.j[0].id)}
 let r=await rest('POST','collections',T,{kind:'playlist',title:'live check '+stamp});cid=r.j&&r.j[0]&&r.j[0].id;ok(!!cid,'draft playlist created');
 r=await fetch(`${U}/rest/v1/rpc/set_collection_tracks`,{method:'POST',headers:hdr(T),body:JSON.stringify({p_collection:cid,p_tracks:[tids[1],tids[0]]})});ok(r.status<300,`track order saved via RPC (HTTP ${r.status})`);
 r=await rest('GET',`collections?id=eq.${cid}&select=id`);ok(r.s===200&&r.j.length===0,'anon CANNOT read a draft playlist');
 r=await rest('GET',`tracks?id=eq.${tids[0]}&select=id`);ok(r.s===200&&r.j.length===0,'anon CANNOT read draft track rows');
 let sg=await sign(null,paths[0]);ok(!sg.url,'anon CANNOT sign a draft audio URL');
 r=await fetch(`${U}/storage/v1/object/audio/${paths[0]}`,{headers:{apikey:K}});ok(r.status!==200,'anon CANNOT fetch draft audio directly');
 ok(!!(await sign(T,paths[0])).url,'owner CAN preview own draft audio');
 r=await rest('PATCH',`collections?id=eq.${cid}`,T,{is_published:true,published_at:new Date().toISOString()});ok(r.s===200&&r.j.length===1,'owner publishes');
 r=await rest('GET',`collections?id=eq.${cid}&select=*,collection_tracks(track_id,position,tracks(*))`);
 const ids=((r.j&&r.j[0]&&r.j[0].collection_tracks)||[]).sort((a,b)=>a.position-b.position).map(x=>x.track_id);
 ok(ids.join()===[tids[1],tids[0]].join(),'anon reads published playlist, tracks in saved order');
 for(const p of paths){sg=await sign(null,p);ok(!!sg.url,'anon can sign published audio');
  if(sg.url){const a=await fetch(sg.url,{headers:{Range:'bytes=0-99'}}),ct=a.headers.get('content-type')||'';ok([200,206].includes(a.status)&&/audio|wav|octet/.test(ct),`anon streams published audio (HTTP ${a.status}, ${ct})`)}}
 r=await rest('POST','tracks',null,{title:'x',file_name:'x',audio_path:`${uid}/evil.wav`,size_bytes:1});ok(r.s>=400,'anon CANNOT insert tracks');
 r=await rest('PATCH',`collections?id=eq.${cid}`,null,{title:'hacked'});ok(!(r.j&&r.j.length),'anon CANNOT edit collections');
 r=await rest('DELETE',`collections?id=eq.${cid}`);ok(!(r.j&&r.j.length),'anon CANNOT delete collections');
 ok(await up(null,`${uid}/evil-${stamp}.wav`,wav())>=400,'anon CANNOT upload audio');
 r=await rest('GET',`collections?id=eq.${cid}&select=title`);ok(!!(r.j&&r.j[0]&&r.j[0].title.startsWith('live check')),'collection unchanged after anon attempts');
 await rest('PATCH',`collections?id=eq.${cid}`,T,{is_published:false,published_at:null});
 r=await rest('GET',`collections?id=eq.${cid}&select=id`);ok(r.j.length===0,'after UNPUBLISH anon CANNOT read the playlist');
 sg=await sign(null,paths[0]);ok(!sg.url,'after UNPUBLISH anon CANNOT sign audio');
}catch(e){ok(false,'unexpected error: '+e.message)}
finally{
 if(cid)await rest('DELETE',`collections?id=eq.${cid}`,T);
 for(const i of tids)if(i)await rest('DELETE',`tracks?id=eq.${i}`,T);
 for(const p of paths)await fetch(`${U}/storage/v1/object/audio/${p}`,{method:'DELETE',headers:{apikey:K,Authorization:'Bearer '+T}});
 console.log(fails?`\n${fails} CHECK(S) FAILED`:'\nALL LIVE CHECKS PASSED');process.exit(fails?1:0)}
