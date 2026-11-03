'use strict';
/* Velnq — local music player. Audio blobs: IndexedDB. Playlists/favourites/prefs: localStorage. */
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ic=n=>`<svg class="ic i-${n}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const fmt=s=>{s=isFinite(s)&&s>0?Math.floor(s):0;const h=s/3600|0,m=s%3600/60|0,x=String(s%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${x}`:`${m}:${x}`};
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
const ls=(k,d)=>{try{const v=localStorage.getItem('velnq.'+k);return v==null?d:JSON.parse(v)}catch{return d}};
const put=(k,v)=>{try{localStorage.setItem('velnq.'+k,JSON.stringify(v))}catch{toast('Preferences couldn’t be saved in this browser.')}};
let tt;function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('show'),5500)}

const audio=new Audio();audio.preload='metadata';
const S={tracks:[],remote:new Map(),on:new Map(),onr:[],onq:'',ost:'idle',otok:0,user:null,pub:null,mine:null,shared:undefined,busy:false,cols:null,pubc:null,col:undefined,ed:null,retry:null,blobs:new Map(),favs:new Set([].concat(ls('favs',[]))),pls:ls('pls',[]),pref:{vol:.8,muted:false,shuffle:false,repeat:'off',...ls('pref',{})},view:'library',q:'',queue:[],cur:null,hist:[],bad:new Set(),wait:false,tok:0,url:null,fresh:true,d:{sec:{},view:null,lists:{},tok:0,gem:-1,scroll:0}};
if(!Array.isArray(S.pls))S.pls=[];
audio.volume=S.pref.vol;audio.muted=S.pref.muted;

/* ---------- storage (IndexedDB) ---------- */
const dbp=new Promise(r=>{try{const q=indexedDB.open('velnq',1);q.onupgradeneeded=()=>q.result.createObjectStore('tracks',{keyPath:'id'});q.onsuccess=()=>r(q.result);q.onerror=q.onblocked=()=>r(null)}catch{r(null)}setTimeout(()=>r(null),4000)});
const store=async(mode,fn)=>{const d=await dbp;if(!d)throw Error('storage unavailable');return new Promise((res,rej)=>{const t=d.transaction('tracks',mode),q=fn(t.objectStore('tracks'));t.oncomplete=()=>res(q&&q.result);t.onerror=t.onabort=()=>rej(t.error||Error('storage error'))})};
async function blobOf(id){let b;try{b=(await store('readonly',s=>s.get(id)))?.blob}catch{}return b||S.blobs.get(id)}

/* ---------- helpers ---------- */
const trk=id=>S.tracks.find(t=>t.id===id)||S.remote.get(id)||S.on.get(id),pl=id=>S.pls.find(p=>p.id===id);
const title=t=>t.title||t.name.replace(/\.[^.]+$/,''),ext=t=>t.on?esc(t.artist):((t.name.match(/\.([^.]+)$/)||[])[1]||'audio').toUpperCase(),size=t=>t.on?esc(t.label):(t.size/1048576).toFixed(1)+' MB';
const artv=s=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))>>>0;return`--h:${130+h%55};--a:${h%360}deg`};
const artst=t=>artv(t.name)+(t.art?`;background-image:url('${esc(t.art)}');background-size:cover;background-position:center`:''),n=k=>`${k} track${k===1?'':'s'}`;
const stat=id=>S.bad.has(id)?'Can’t play':id!==S.cur?'':S.wait?'Loading…':audio.paused?'Paused':'Playing';
const lst=()=>{const v=S.view,p=v.startsWith('pl:')?pl(v.slice(3)):null,q=S.q.trim().toLowerCase(),
 all=(p?p.ids:v==='library'?S.tracks.map(t=>t.id):v==='favs'?S.tracks.filter(t=>S.favs.has(t.id)).map(t=>t.id):v==='queue'?S.queue:v==='online'?S.onr.map(t=>t.id):v==='discover'?(S.d.view?S.d.view.ids:(S.pub||[]).map(t=>t.id)):v==='mine'?(S.mine||[]).map(t=>t.id):v==='col'?(S.col?S.col.ids:[]):[]).filter(trk);
 return{p,all,shown:q&&v!=='col'&&v!=='online'?all.filter(id=>title(trk(id)).toLowerCase().includes(q)):all}};

/* ---------- import ---------- */
const probe=f=>new Promise((res,rej)=>{const a=new Audio(),u=URL.createObjectURL(f);let t;const done=(fn,v)=>{clearTimeout(t);a.onloadedmetadata=a.onerror=null;a.removeAttribute('src');a.load();URL.revokeObjectURL(u);fn(v)};t=setTimeout(()=>done(rej),8000);a.preload='metadata';a.onloadedmetadata=()=>done(res,isFinite(a.duration)?a.duration:0);a.onerror=()=>done(rej);a.src=u});
async function importFiles(fl){
 fl=[...fl];if(!fl.length)return;toast(`Reading ${fl.length} file${fl.length>1?'s':''}…`);
 let ok=0,mem=0,dup=0;const bad=[];
 for(const f of fl){
  if(!/^audio\//.test(f.type)&&!/\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba)$/i.test(f.name)){bad.push(f.name);continue}
  if(S.tracks.some(t=>t.name===f.name&&t.size===f.size)){dup++;continue}
  let dur;try{dur=await probe(f)}catch{bad.push(f.name);continue}
  const t={id:uid(),name:f.name,size:f.size,type:f.type,dur,added:Date.now()+ok};
  S.blobs.set(t.id,f);S.tracks.push(t);ok++;
  try{await store('readwrite',s=>s.put({...t,blob:f}))}catch{mem++}
 }
 render();
 let m=ok?`Added ${n(ok)}.`:'';
 if(dup)m+=` ${dup} already in your library.`;
 if(mem)m+=' Browser storage is unavailable, so these will be gone after a refresh.';
 if(bad.length)m+=` Couldn’t add ${bad.slice(0,2).join(', ')}${bad.length>2?` and ${bad.length-2} more`:''}: not a playable audio file.`;
 toast(m.trim()||'Nothing was added.')
}

/* ---------- playback ---------- */
async function play(id,list){
 if(list){S.queue=list.slice();S.hist=[]}
 if(!S.queue.includes(id))S.queue.push(id);
 const tok=++S.tok;S.retry=null;S.cur=id;S.bad.delete(id);S.wait=true;renderNav();sync();
 let src;const t0=trk(id);
 if(t0&&t0.on)src=t0.stream;
 else if(t0&&t0.path){const r=await sb.storage.from('audio').createSignedUrl(t0.path,21600);if(tok!==S.tok)return;if(r.error||!r.data)return fail(id,'This track isn’t available online any more. It may have been unpublished or deleted.');src=r.data.signedUrl}
 else{const b=await blobOf(id);if(tok!==S.tok)return;if(!b)return fail(id,'This file is no longer in browser storage. Remove it and add it again.');src=URL.createObjectURL(b)}
 if(S.url)URL.revokeObjectURL(S.url);
 audio.src=S.url=src;
 try{await audio.play()}catch(e){if(tok===S.tok&&e.name!=='AbortError')fail(id,'Your browser couldn’t play this file.')}
}
function addQueue(id){if(!trk(id))return;if(S.queue.includes(id))toast('Already in the queue.');else{S.queue.push(id);renderNav();renderPlayer();toast('Added to queue.')}}
function fail(id,msg){if(S.bad.has(id))return;S.bad.add(id);S.wait=false;const t=trk(id);toast(msg+(t?` (${title(t)})`:''));sync()}
function togglePlay(){
 if(!S.cur){const{shown}=lst();if(!shown.length)return toast('Add some music to start listening.');return play(shown[0],shown)}
 if(!audio.paused)return audio.pause();
 if(!audio.src||S.bad.has(S.cur))return play(S.cur);
 audio.play().catch(e=>{if(e.name!=='AbortError')fail(S.cur,'Your browser couldn’t play this file.')})
}
function step(dir,auto){
 const q=S.queue;if(!q.length)return;let m;
 if(auto&&S.pref.repeat==='one'){audio.currentTime=0;audio.play().catch(()=>{});return}
 if(S.pref.shuffle){
  if(dir<0&&S.hist.length)m=S.hist.pop();
  else{const pool=q.filter(x=>x!==S.cur);if(dir>0&&S.cur)S.hist.push(S.cur);m=pool.length?pool[Math.random()*pool.length|0]:S.pref.repeat==='all'?S.cur:null}
 }else{const i=q.indexOf(S.cur);m=q[i+dir]??(S.pref.repeat==='all'?q[(i+dir+q.length)%q.length]:null)}
 if(m==null){if(auto){audio.pause();audio.currentTime=0}else if(dir>0)toast('That’s the end of the queue.');else audio.currentTime=0;return}
 play(m)
}
const prev=()=>audio.currentTime>3?(audio.currentTime=0):step(-1);
const skip=d=>{if(S.cur&&isFinite(audio.duration))audio.currentTime=Math.max(0,Math.min(audio.duration,audio.currentTime+d))};
function setVol(v){v=Math.min(1,Math.max(0,v));audio.volume=v;if(v>0)audio.muted=false;S.pref.vol=v;S.pref.muted=audio.muted;put('pref',S.pref)}
function toggleMute(){if(audio.muted||!audio.volume){audio.muted=false;if(!audio.volume)audio.volume=.5}else audio.muted=true;S.pref.muted=audio.muted;S.pref.vol=audio.volume;put('pref',S.pref)}
function toggleShuf(){S.pref.shuffle=!S.pref.shuffle;put('pref',S.pref);renderPlayer();renderMain()}
function cycleRep(){S.pref.repeat={off:'all',all:'one',one:'off'}[S.pref.repeat];put('pref',S.pref);renderPlayer();toast('Repeat: '+S.pref.repeat)}
function toggleFav(id){if(!S.tracks.some(t=>t.id===id))return toast('Favourites are for tracks in your own library.');S.favs.has(id)?S.favs.delete(id):S.favs.add(id);put('favs',[...S.favs]);render()}
async function removeTracks(ids){
 const s=new Set(ids);
 if(s.has(S.cur)){S.tok++;S.cur=null;audio.pause();audio.removeAttribute('src');audio.load();if(S.url){URL.revokeObjectURL(S.url);S.url=null}}
 S.tracks=S.tracks.filter(t=>!s.has(t.id));S.queue=S.queue.filter(x=>!s.has(x));S.hist=S.hist.filter(x=>!s.has(x));
 ids.forEach(id=>{S.favs.delete(id);S.blobs.delete(id);S.bad.delete(id)});S.pls.forEach(p=>p.ids=p.ids.filter(x=>!s.has(x)));
 put('favs',[...S.favs]);put('pls',S.pls);render();
 try{await store('readwrite',st=>{ids.forEach(id=>st.delete(id))})}catch{toast('Removed from view, but browser storage couldn’t be updated.')}
}

/* ---------- rendering ---------- */
const empty=(h,t,b='')=>`<div class="empty"><div class="orb" aria-hidden="true"></div><h2>${h}</h2><p>${t}</p>${b}</div>`;
const row=id=>{const t=trk(id),f=S.favs.has(id),v=S.view,tt=esc(title(t));
 const mid=v==='queue'?`<button class="ib" data-a="unq" aria-label="Remove from queue">${ic('minus')}</button>`:v.startsWith('pl:')?`<button class="ib" data-a="unpl" aria-label="Remove from playlist">${ic('minus')}</button>`:
  `<button class="ib" data-a="queue" aria-label="Add to queue">${ic('queue')}</button><span class="ib sel" title="Add to playlist">${ic('plus')}<select data-a="addpl" aria-label="Add to playlist">${S.pls.length?'<option value="">Choose playlist…</option>'+S.pls.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join(''):'<option value="">Create a playlist first</option>'}</select></span>`;
 return`<li class="row" data-id="${id}" data-t="${tt}"><button class="rp" data-a="play" aria-label="Play ${tt}"><span class="th"><span class="art" style="${artst(t)}"></span><span class="ov">${ic('play')}${ic('pause')}</span></span><span class="ti"><strong>${tt}</strong><span class="meta">${ext(t)} · ${size(t)}<span class="st"></span></span></span></button><span class="du">${t.dur?fmt(t.dur):'–'}</span><div class="ac"><button class="ib${f?' on':''}" data-a="fav" aria-pressed="${f}" aria-label="${f?'Remove from':'Add to'} favourites">${ic('heart')}</button>${mid}${v==='library'?`<button class="ib" data-a="pub" aria-label="Upload to share online">${ic('share')}</button><button class="ib" data-a="del" aria-label="Remove from library">${ic('trash')}</button>`:''}</div></li>`};
const guide=()=>`<section class="view prose ${S.fresh?'in':''}"><h1>Guide</h1><h2>Keyboard shortcuts</h2><dl class="keys">${[['Space','Play / pause'],['← →','Seek 5 seconds'],['N · P','Next · previous'],['↑ ↓','Volume'],['M','Mute'],['S','Shuffle'],['R','Repeat: off, all, one'],['F','Favourite current track'],['/','Search'],['?','Open this guide']].map(([k,d])=>`<div><dt><kbd>${k}</kbd></dt><dd>${d}</dd></div>`).join('')}</dl><p class="muted">Shortcuts pause while you type in a field.</p><h2>Storage &amp; privacy</h2><p>Your audio never leaves this device. Files are copied into this browser’s own storage (IndexedDB) so your library survives a refresh; playlists, favourites and settings use localStorage.</p><p>Search online sends the words you type to Apple’s iTunes Search service and plays 30-second previews from Apple’s servers. Nothing from your library is sent.</p><p>Clearing site data, private browsing, or switching browser or device will erase the library. Keep your original files.</p><p>${n(S.tracks.length)} stored · ${(S.tracks.reduce((a,t)=>a+t.size,0)/1048576).toFixed(1)} MB</p><button class="btn ghost danger" data-a="clear"${S.tracks.length?'':' disabled'}>Clear local library</button></section>`;
const plists=()=>`<section class="view ${S.fresh?'in':''}"><h1>Playlists</h1><p class="sub">Hand-picked orders for the way you listen.</p><form class="mk" data-form="new"><label class="sr" for="npl">New playlist name</label><input id="npl" maxlength="60" placeholder="Name a new playlist" required><button class="btn">Create</button></form>${S.pls.length?`<ul class="cards">${S.pls.map(p=>`<li><button class="card" data-open="${p.id}"><span class="art" style="${artv(p.name)}"></span><strong>${esc(p.name)}</strong><span>${n(p.ids.filter(trk).length)}</span></button></li>`).join('')}</ul>`:empty('No playlists yet','Name one above, then use the + on any track to fill it.')}</section>`;
function renderMain(){
 const v=S.view,m=$('#main');
 if(v==='guide'){m.innerHTML=guide();S.fresh=false;return}
 if(v==='playlists'){m.innerHTML=plists();S.fresh=false;return}
 if(v==='online'){m.innerHTML=onlineView();S.fresh=false;mark();return}
 if(v==='discover'){m.innerHTML=discoverView();S.fresh=false;mark();dStart();return}
 if(/^(mine|track|col|edit)$/.test(v)){m.innerHTML=remoteView(v);S.fresh=false;mark();return}
 if(v.startsWith('pl:')&&!pl(v.slice(3)))return setView('playlists');
 const{p,all,shown}=lst(),K={library:['Library','Your music, kept on this device.'],favs:['Favourites','The ones you keep returning to.'],queue:['Queue','What plays next.']};
 const head=p?`<form class="ph" data-form="rename"><label class="sr" for="plname">Playlist name</label><input id="plname" value="${esc(p.name)}" maxlength="60" required><button class="btn ghost">Rename</button><button type="button" class="btn ghost danger" data-a="delpl">Delete</button></form><p class="sub">${n(all.length)}</p>`:`<h1>${K[v][0]}</h1><p class="sub">${K[v][1]} ${n(all.length)}.</p>`;
 const acts=all.length?`<div class="acts"><button class="btn" data-a="playall"${shown.length?'':' disabled'}>Play${S.pref.shuffle?' shuffled':''}</button>${v==='library'?'<button class="btn ghost danger" data-a="clear">Clear library</button>':''}</div>`:'';
 const body=!all.length?({library:empty('Your library is waiting','Add audio files you own — MP3, M4A, WAV, OGG or FLAC. They stay on this device; nothing is uploaded.','<button class="btn" data-a="add">Choose audio files</button><p class="hint">or drop them anywhere on this page</p>'),favs:empty('No favourites yet','Tap the heart on any track to keep it close.'),queue:empty('The queue is empty','Play a track, or add tracks with the queue button.')}[v]||empty('This playlist is empty','Use the + on any track in your library to add it here.')):!shown.length?empty('No matches',`Nothing here matches “${esc(S.q)}”.`):`<ol class="list">${shown.map(row).join('')}</ol>`;
 m.innerHTML=`<section class="view ${S.fresh?'in':''}">${head}${acts}${body}</section>`;S.fresh=false;mark()
}
function renderNav(){
 $$('[data-view]').forEach(b=>b.setAttribute('aria-current',b.dataset.view===S.view||(b.dataset.view==='playlists'&&S.view.startsWith('pl:'))?'page':'false'));
 $('#nLib').textContent=S.tracks.length||'';$('#nFav').textContent=S.favs.size||'';$('#nQ').textContent=S.queue.length||''
}
function mark(){$$('.row').forEach(r=>{const id=r.dataset.id,on=id===S.cur,p=on&&!audio.paused&&!S.bad.has(id),s=stat(id);
 r.classList.toggle('on',on);r.classList.toggle('playing',p);r.classList.toggle('bad',S.bad.has(id));
 $('.st',r).textContent=s?' · '+s:'';($('[data-a=play],[data-a=dplay]',r)||{setAttribute(){}}).setAttribute('aria-label',(p?'Pause ':'Play ')+r.dataset.t)});dmark()}
function tick(){
 const d=audio.duration,c=S.cur?audio.currentTime||0:0,ok=S.cur&&isFinite(d)&&d>0,t=trk(S.cur),seek=$('#seek');
 $('#tCur').textContent=fmt(c);$('#tDur').textContent=ok?fmt(d):t&&t.dur?fmt(t.dur):'0:00';
 if(!seek.matches(':active')){const p=ok?c/d*1000:0;seek.value=p;seek.style.setProperty('--p',p/10+'%')}
 seek.setAttribute('aria-valuetext',fmt(c)+' of '+$('#tDur').textContent)
}
function renderPlayer(){
 const t=trk(S.cur),on=!!t&&!audio.paused&&!S.bad.has(t.id),f=!!t&&S.favs.has(t.id),r=S.pref.repeat;
 $('#player').classList.toggle('playing',on);
 $('#pTitle').textContent=t?title(t):'Nothing playing';$('#pSub').textContent=t?stat(t.id)||'Ready':'Add music to begin';
 $('#pArt').setAttribute('style',t?artst(t):'');$('#pArt').classList.toggle('blank',!t);
 $('#bPlay').setAttribute('aria-label',on?'Pause':'Play');
 const bf=$('#bFav');bf.disabled=!t;bf.classList.toggle('on',f);bf.setAttribute('aria-pressed',f);bf.setAttribute('aria-label',f?'Remove from favourites':'Add to favourites');
 $('#bShuf').classList.toggle('on',S.pref.shuffle);$('#bShuf').setAttribute('aria-pressed',S.pref.shuffle);
 const br=$('#bRep');br.classList.toggle('on',r!=='off');br.dataset.r=r;br.setAttribute('aria-label','Repeat: '+r);
 $('#seek').disabled=!t;document.title=on?`${title(t)} · Velnq`:'Velnq — a quiet place for your music';
 if(t&&'mediaSession'in navigator&&window.MediaMetadata)navigator.mediaSession.metadata=new MediaMetadata({title:title(t),artist:t.on?t.artist:'Velnq'});
 const i=t?S.queue.indexOf(t.id):-1;
 $('#np').innerHTML=t?`<p class="eyebrow">${stat(t.id)||'Ready'}</p><div class="art big${on?' spin':''}" style="${artst(t)}"></div><h2>${esc(title(t))}</h2><p class="muted">${ext(t)} · ${size(t)}${t.dur?' · '+fmt(t.dur):''}</p>${i>=0?`<p class="muted">Track ${i+1} of ${S.queue.length} in queue</p>`:''}`:`<p class="eyebrow">Now playing</p><div class="orb" style="margin:28px auto" aria-hidden="true"></div><h2>Nothing yet</h2><p class="muted">Choose a track and it will appear here.</p>`;
 tick()
}
function sync(){mark();renderPlayer()}
function render(){renderNav();renderMain();renderPlayer()}
function setView(v){S.view=v;S.d.view=null;S.d.tok++;S.q='';S.fresh=true;$('#q').value='';$('#q').placeholder=v==='online'?'Search online':'Search your tracks ( / )';$('#main').scrollTop=0;if(v!=='track'&&v!=='col'&&/[?&][tc]=/.test(location.search))history.replaceState(null,'',location.pathname);render();if(sb&&v==='discover')loadDiscover();if(sb&&v==='mine'&&S.user)loadMine()}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
 const o=e.target.closest('[data-view],[data-open],[data-a]');if(!o)return;
 if(o.dataset.view)return setView(o.dataset.view);
 if(o.dataset.open)return setView('pl:'+o.dataset.open);
 const a=o.dataset.a,r=o.closest('.row'),id=r&&r.dataset.id,{p,shown}=lst();
 if(a==='add')$('#file').click();
 else if(a==='play'){id===S.cur&&!S.bad.has(id)?togglePlay():play(id,S.view==='queue'?null:shown)}
 else if(a==='playall'){if(shown.length)play(S.pref.shuffle?shown[Math.random()*shown.length|0]:shown[0],shown)}
 else if(a==='fav')toggleFav(id);
 else if(a==='queue')addQueue(id);
 else if(a==='unq'){S.queue=S.queue.filter(x=>x!==id);render()}
 else if(a==='unpl'){p.ids=p.ids.filter(x=>x!==id);put('pls',S.pls);render()}
 else if(a==='del'){if(confirm(`Remove “${r.dataset.t}” from your library? Your original file isn’t touched.`))removeTracks([id])}
 else if(a==='delpl'){if(confirm(`Delete the playlist “${p.name}”? The tracks stay in your library.`)){S.pls=S.pls.filter(x=>x.id!==p.id);put('pls',S.pls);setView('playlists')}}
 else if(a==='clear'){if(S.tracks.length&&confirm(`Remove all ${n(S.tracks.length)} from this browser? Playlists keep their names but are emptied. Your original files aren’t touched.`))removeTracks(S.tracks.map(t=>t.id))}
 if(id&&!o.isConnected)$(`[data-id="${id}"] [data-a="${a}"]`)?.focus()
});
document.addEventListener('change',e=>{const t=e.target;
 if(t.id==='file'){importFiles(t.files);t.value=''}
 else if(t.dataset.a==='addpl'){const id=t.closest('.row').dataset.id,p=pl(t.value);t.value='';if(!p)return;
  if(p.ids.includes(id))toast(`Already in “${p.name}”.`);else{p.ids.push(id);put('pls',S.pls);toast(`Added to “${p.name}”.`)}}
});
document.addEventListener('submit',e=>{const f=e.target.dataset.form;if(!f)return;e.preventDefault();const v=$('input',e.target).value.trim();if(!v)return;
 if(f==='new'){const p={id:uid(),name:v,ids:[]};S.pls.push(p);put('pls',S.pls);setView('pl:'+p.id)}
 else{pl(S.view.slice(3)).name=v;put('pls',S.pls);toast('Playlist renamed.')}
});
$('#q').addEventListener('input',e=>{S.q=e.target.value;if(/^(guide|playlists)$/.test(S.view))S.view='library';renderNav();if(S.view==='discover'&&!S.d.view)paintCommunity();else renderMain()});
$('#bPlay').onclick=togglePlay;$('#bNext').onclick=()=>step(1);$('#bPrev').onclick=prev;$('#bShuf').onclick=toggleShuf;$('#bRep').onclick=cycleRep;$('#bMute').onclick=toggleMute;$('#bFav').onclick=()=>S.cur&&toggleFav(S.cur);
const seek=$('#seek'),vol=$('#vol'),paint=(r,p)=>r.style.setProperty('--p',p+'%');
seek.addEventListener('input',()=>{if(isFinite(audio.duration)&&audio.duration>0){audio.currentTime=seek.value/1000*audio.duration;paint(seek,seek.value/10);$('#tCur').textContent=fmt(audio.currentTime)}});
vol.addEventListener('input',()=>setVol(vol.value/100));
audio.addEventListener('volumechange',()=>{const m=audio.muted||!audio.volume;vol.value=m?0:audio.volume*100;paint(vol,vol.value);$('#player').classList.toggle('muted',m);$('#bMute').setAttribute('aria-pressed',String(audio.muted));$('#bMute').setAttribute('aria-label',m?'Unmute':'Mute')});
audio.addEventListener('playing',()=>{S.wait=false;sync()});
['play','pause'].forEach(ev=>audio.addEventListener(ev,sync));
['timeupdate','durationchange','loadedmetadata'].forEach(ev=>audio.addEventListener(ev,tick));
audio.addEventListener('ended',()=>step(1,true));
audio.addEventListener('error',async()=>{
 if(!S.cur||!audio.getAttribute('src'))return;
 const id=S.cur,t=trk(id);
 if(t&&t.path&&sb&&S.retry!==id){S.retry=id;const pos=audio.currentTime,tok=S.tok,r=await sb.storage.from('audio').createSignedUrl(t.path,21600);
  if(tok!==S.tok)return;if(r.data){audio.src=S.url=r.data.signedUrl;audio.currentTime=pos;audio.play().catch(()=>{});return}}
 fail(id,'Your browser couldn’t play this file. Check your connection and try again.')});
document.addEventListener('keydown',e=>{
 if(e.ctrlKey||e.metaKey||e.altKey)return;
 const t=e.target,k=e.key;
 if(/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)||t.isContentEditable){if(k==='Escape'&&t.id==='q')t.blur();return}
 if(k===' '&&/^(BUTTON|A|SUMMARY)$/.test(t.tagName))return;
 const h={' ':togglePlay,ArrowRight:()=>skip(5),ArrowLeft:()=>skip(-5),ArrowUp:()=>setVol(audio.volume+.05),ArrowDown:()=>setVol(audio.volume-.05),n:()=>step(1),p:prev,m:toggleMute,s:toggleShuf,r:cycleRep,f:()=>S.cur&&toggleFav(S.cur),'/':()=>$('#q').focus(),'?':()=>setView('guide')}[k.length>1?k:k.toLowerCase()];
 if(h){e.preventDefault();h()}
});
let dc=0;const hasFiles=e=>e.dataTransfer&&[...e.dataTransfer.types].includes('Files');
addEventListener('dragenter',e=>{if(hasFiles(e)){dc++;$('#drop').hidden=false}});
addEventListener('dragleave',e=>{if(hasFiles(e)&&--dc<=0){dc=0;$('#drop').hidden=true}});
addEventListener('dragover',e=>{if(hasFiles(e))e.preventDefault()});
addEventListener('drop',e=>{if(!hasFiles(e))return;e.preventDefault();dc=0;$('#drop').hidden=true;importFiles(e.dataTransfer.files)});
if('mediaSession'in navigator)[['play',()=>audio.paused&&togglePlay()],['pause',()=>audio.pause()],['previoustrack',prev],['nexttrack',()=>step(1)]].forEach(([a,f])=>{try{navigator.mediaSession.setActionHandler(a,f)}catch{}});

/* ---------- online sharing (Supabase) ---------- */
const MIME={mp3:'audio/mpeg',m4a:'audio/mp4',aac:'audio/aac',wav:'audio/wav',ogg:'audio/ogg',oga:'audio/ogg',opus:'audio/ogg',flac:'audio/flac',weba:'audio/webm'},MAX=52428800;
let sb=null;try{if(window.VELNQ&&VELNQ.url&&VELNQ.anonKey&&window.supabase)sb=supabase.createClient(VELNQ.url,VELNQ.anonKey)}catch{}
const reg=r=>{const t={id:r.id,name:r.file_name,title:r.title,description:r.description||'',size:r.size_bytes,dur:r.duration_s,path:r.audio_path,pub:r.is_published,owner:r.owner_id};S.remote.set(t.id,t);return t};
const linkOf=(id,k='t')=>`${location.origin}${location.pathname}?${k}=${id}`;
async function copyLink(id,k){if(location.protocol==='file:')return toast('Open the deployed site (not a local file) to get a link others can use.');const u=linkOf(id,k);try{await navigator.clipboard.writeText(u);toast('Link copied: '+u)}catch{prompt('Copy this link:',u)}}
const upMsg=e=>{const m=String(e.message||e);return/maximum allowed size|too large/i.test(m)?'That file is larger than the 50 MB per-file limit.':/mime|not supported/i.test(m)?'That audio format isn’t accepted for upload. Try MP3, M4A, WAV, OGG or FLAC.':/bucket not found/i.test(m)?'The “audio” storage bucket is missing. Run the SQL migration (see README).':/row-level security|unauthorized|jwt/i.test(m)?'You’re not allowed to upload. Sign in again and retry.':/quota|exceed/i.test(m)?'Your free storage looks full. Delete something or upgrade the plan.':'Upload failed: '+m};
const ensureMine=async()=>{if(!S.mine||!S.cols)await loadMine()};
async function xhrUpload(path,blob,type,onp){
 const{data}=await sb.auth.getSession(),ss=data.session;if(!ss)throw Error('You’re signed out. Sign in again and retry.');
 return new Promise((res,rej)=>{const x=new XMLHttpRequest();x.open('POST',`${VELNQ.url.replace(/\/+$/,'')}/storage/v1/object/audio/${path}`);
  x.setRequestHeader('Authorization','Bearer '+ss.access_token);x.setRequestHeader('apikey',VELNQ.anonKey);x.setRequestHeader('Content-Type',type);x.setRequestHeader('x-upsert','false');x.setRequestHeader('cache-control','max-age=3600');
  x.upload.onprogress=e=>{if(e.lengthComputable)onp(e.loaded/e.total)};
  x.onload=()=>{if(x.status<300)return res();let m=x.statusText||'HTTP '+x.status;try{m=JSON.parse(x.responseText).message||m}catch{}rej(Error(m))};
  x.onerror=()=>rej(Error('Network error during upload. Check your connection and try again.'));x.onabort=()=>rej(Error('Upload cancelled.'));x.send(blob)})}
async function uploadFiles(fl){
 fl=[...fl];if(!fl.length)return;
 if(!sb||!S.user)return toast('Sign in on the Published page to upload.');
 if(S.busy)return toast('An upload or save is already in progress. Please wait.');
 S.busy=true;let ok=0;const errs=[];
 try{await ensureMine();
  for(const[i,f]of fl.entries()){
   const e=((f.name.match(/\.([a-z0-9]+)$/i)||[])[1]||'').toLowerCase(),type=MIME[e]||(/^audio\//.test(f.type)?f.type:'');
   if(!type){errs.push(f.name+': unsupported format');continue}
   if(f.size>MAX){errs.push(f.name+': over 50 MB');continue}
   if(S.mine.some(t=>t.name===f.name&&t.size===f.size)){errs.push(f.name+': already uploaded');continue}
   const lab=`Uploading ${i+1}/${fl.length}: ${f.name}`;toast(lab+' 0%');
   let dur;try{dur=f.dur!==undefined?f.dur:await probe(f)}catch{errs.push(f.name+': your browser can’t decode it');continue}
   const path=`${S.user.id}/${uid()}.${e||'mp3'}`;let last=0;
   try{await xhrUpload(path,f,type,p=>{const k=Math.round(p*20)*5;if(k!==last){last=k;toast(lab+' '+k+'%')}})}catch(x){errs.push(f.name+': '+upMsg(x));continue}
   const r=await sb.from('tracks').insert({title:f.name.replace(/\.[^.]+$/,'').slice(0,120),file_name:f.name,audio_path:path,mime_type:type,size_bytes:f.size,duration_s:dur||null}).select().single();
   if(r.error){await sb.storage.from('audio').remove([path]);errs.push(f.name+': couldn’t save details ('+r.error.message+')');continue}
   S.mine.unshift(reg(r.data));ok++
  }
 }catch(x){errs.push(x.message)}finally{S.busy=false}
 toast((ok?`Uploaded ${ok} track${ok>1?'s':''}. `:'')+(errs.length?'Skipped — '+errs.join('; '):'')||'Nothing uploaded.');
 if(S.view==='mine'||S.view==='edit')renderMain()
}
async function shareLocal(id){
 if(!sb)return toast('Sharing isn’t set up yet. Add your Supabase details to config.js (see README).');
 if(!S.user){toast('Sign in to upload music.');return setView('mine')}
 const t=trk(id),b=t&&await blobOf(id);
 if(!b)return toast('The local copy of this file is missing, so it can’t be uploaded.');
 const f=new File([b],t.name,{type:b.type||''});f.dur=t.dur;uploadFiles([f])
}
async function loadDiscover(){const[a,b]=await Promise.all([sb.from('tracks').select('*').eq('is_published',true).order('published_at',{ascending:false}).limit(100),sb.from('collections').select('*, collection_tracks(track_id, position)').eq('is_published',true).order('published_at',{ascending:false}).limit(100)]);
 if(a.error||b.error)toast('Couldn’t load Discover: '+(a.error||b.error).message);S.pub=a.error?[]:a.data.map(reg);S.pubc=b.error?[]:b.data.map(regC);if(S.view==='discover')paintCommunity()}
async function loadMine(){const[a,b]=await Promise.all([sb.from('tracks').select('*').eq('owner_id',S.user.id).order('created_at',{ascending:false}),sb.from('collections').select('*, collection_tracks(track_id, position)').eq('owner_id',S.user.id).order('created_at',{ascending:false})]);
 if(a.error||b.error)toast('Couldn’t load your music: '+(a.error||b.error).message);S.mine=a.error?[]:a.data.map(reg);S.cols=b.error?[]:b.data.map(regC);if(S.view==='mine')renderMain()}
async function loadShared(id){let t=null;if(/^[0-9a-f-]{36}$/i.test(id)){const r=await sb.from('tracks').select('*').eq('id',id).maybeSingle();if(r.error)toast('Couldn’t load this track: '+r.error.message);else if(r.data)t=reg(r.data)}S.shared=t;if(S.view==='track')renderMain()}
function route(){const p=new URLSearchParams(location.search),c=p.get('c'),id=p.get('t');if(c){S.view='col';S.col=undefined;render();if(sb)loadCol(c)}else if(id){S.view='track';S.shared=undefined;render();if(sb)loadShared(id)}}
async function setPub(t,on){const{error}=await sb.from('tracks').update({is_published:on,published_at:on?new Date().toISOString():null}).eq('id',t.id);
 if(error)return toast('Couldn’t update: '+error.message);t.pub=on;S.pub=null;renderMain();if(on)copyLink(t.id);else toast('Unpublished. The link no longer works.')}
async function ownerAct(a,t){
 if(a==='toggle')return setPub(t,!t.pub);
 if(a==='edit'){const ti=prompt('Title',title(t));if(ti===null||!ti.trim())return;const d=prompt('Description (optional)',t.description);if(d===null)return;
  const v={title:ti.trim().slice(0,120),description:d.trim().slice(0,500)},{error}=await sb.from('tracks').update(v).eq('id',t.id);
  if(error)return toast('Couldn’t save: '+error.message);Object.assign(t,v);return renderMain()}
 if(a==='rdel'&&confirm(`Delete “${title(t)}” from online storage? Its link will stop working.${(S.cols||[]).some(c=>c.ids.includes(t.id))?' It will also be removed from your playlists and albums.':''} Your local library isn’t affected.`)){
  const r=await sb.storage.from('audio').remove([t.path]);if(r.error)return toast('Couldn’t delete the audio file: '+r.error.message);
  const{error}=await sb.from('tracks').delete().eq('id',t.id);if(error)return toast('Couldn’t delete: '+error.message);
  S.mine=S.mine.filter(x=>x.id!==t.id);(S.cols||[]).forEach(c=>c.ids=c.ids.filter(x=>x!==t.id));S.pub=S.pubc=null;S.remote.delete(t.id);renderMain()}
}
async function auth(up){const em=$('#em')?.value.trim(),pw=$('#pw')?.value||'';if(!em||pw.length<6)return toast('Enter your email and a password of at least 6 characters.');
 const{data,error}=await(up?sb.auth.signUp({email:em,password:pw}):sb.auth.signInWithPassword({email:em,password:pw}));
 if(error)return toast(error.message);if(up&&!data.session)toast('Account created. Check your email to confirm it, then sign in.')}
if(sb)sb.auth.onAuthStateChange((_e,s)=>{const u=s?s.user:null;if((u&&u.id)===(S.user&&S.user.id)){S.user=u;return}S.user=u;S.mine=S.cols=null;setTimeout(()=>{if(S.view==='mine'){renderMain();if(S.user)loadMine()}},0)});
const rrow=t=>{const tt=esc(title(t)),own=S.view==='mine',sh=S.view==='col';
 return`<li class="row" data-id="${t.id}" data-t="${tt}"><button class="rp" data-a="play" aria-label="Play ${tt}"><span class="th"><span class="art" style="${artv(t.name)}"></span><span class="ov">${ic('play')}${ic('pause')}</span></span><span class="ti"><strong>${tt}</strong><span class="meta">${own?(t.pub?'Published':'Private draft')+' · ':''}${ext(t)} · ${size(t)}<span class="st"></span></span></span></button><span class="du">${t.dur?fmt(t.dur):'–'}</span><div class="ac">${!sh&&(t.pub||!own)?`<button class="ib" data-a="copy" aria-label="Copy share link">${ic('link')}</button>`:''}${own?`<button class="btn ghost sm" data-a="toggle">${t.pub?'Unpublish':'Publish'}</button><button class="btn ghost sm" data-a="edit">Edit</button><button class="ib" data-a="rdel" aria-label="Delete from online storage">${ic('trash')}</button>`:''}</div></li>`};
const regC=r=>{const ct=[...(r.collection_tracks||[])].sort((a,b)=>a.position-b.position);ct.forEach(x=>x.tracks&&reg(x.tracks));return{id:r.id,kind:r.kind,title:r.title,description:r.description||'',year:r.release_year,pub:r.is_published,ids:ct.map(x=>x.track_id)}};
const ckind=c=>c.kind==='album'?'Album'+(c.year?' · '+c.year:''):'Playlist';
const ctitle=c=>`${ckind(c)} · ${n(c.ids.length)}`;
const crow=c=>`<li class="erow" data-cid="${c.id}"><span class="th"><span class="art" style="${artv(c.id)}"></span></span><span class="ti"><strong>${esc(c.title)}</strong><span class="meta">${ctitle(c)} · ${c.pub?'Published':'Private draft'}</span></span><span class="ac">${c.pub?`<button class="ib" data-a="ccopy" aria-label="Copy share link">${ic('link')}</button>`:''}<button class="btn ghost sm" data-a="cpub">${c.pub?'Unpublish':'Publish'}</button><button class="btn ghost sm" data-a="cedit">Edit</button><button class="ib" data-a="cdel" aria-label="Delete ${esc(c.title)}">${ic('trash')}</button></span></li>`;
const er=(t,b)=>`<li class="erow"><span class="ti"><strong>${esc(title(t))}</strong><span class="meta">${ext(t)} · ${t.dur?fmt(t.dur):'–'}</span></span>${b}</li>`;
const openCol=id=>{S.col=undefined;setView('col');history.replaceState(null,'','?c='+id);loadCol(id)};
async function loadCol(id){let c=null,bad=false;if(/^[0-9a-f-]{36}$/i.test(id||'')){const r=await sb.from('collections').select('*, collection_tracks(track_id, position, tracks(*))').eq('id',id).maybeSingle();if(r.error){bad=true;toast('Couldn’t load this page: '+r.error.message)}else if(r.data)c=regC(r.data)}S.col=bad?false:c;if(S.view==='col')renderMain()}
async function openEd(kind,id){await ensureMine();const c=id&&S.cols.find(x=>x.id===id);S.ed=c?{id,kind:c.kind,title:c.title,description:c.description,year:c.year??'',ids:[...c.ids]}:{id:null,kind,title:'',description:'',year:'',ids:[]};setView('edit')}
async function saveEd(){
 if(S.busy)return toast('Already saving. Please wait.');
 const d=S.ed,ti=d.title.trim();if(!ti)return toast('Give it a title.');
 const yr=d.kind==='album'&&String(d.year).trim()!==''?Number(d.year):null;
 if(yr!==null&&!(Number.isInteger(yr)&&yr>=1900&&yr<=2100))return toast('Release year must be between 1900 and 2100.');
 S.busy=true;
 try{
  const v={kind:d.kind,title:ti.slice(0,120),description:d.description.trim().slice(0,500),release_year:yr};
  if(d.id){const r=await sb.from('collections').update(v).eq('id',d.id);if(r.error)throw r.error}
  else{const r=await sb.from('collections').insert(v).select('id').single();if(r.error)throw r.error;d.id=r.data.id}
  const t=await sb.rpc('set_collection_tracks',{p_collection:d.id,p_tracks:[...new Set(d.ids)]});if(t.error)throw t.error;
  S.cols=null;S.pubc=null;S.ed=null;toast('Saved. New items stay private until you publish them.');setView('mine')
 }catch(x){toast('Couldn’t save: '+x.message)}finally{S.busy=false}
}
async function setColPub(c,on){
 if(S.busy)return;if(on&&!c.ids.length)return toast('Add at least one track before publishing.');
 S.busy=true;const{error}=await sb.from('collections').update({is_published:on,published_at:on?new Date().toISOString():null}).eq('id',c.id);S.busy=false;
 if(error)return toast('Couldn’t update: '+error.message);c.pub=on;S.pubc=null;renderMain();if(on)copyLink(c.id,'c');else toast('Unpublished. The link no longer works.')}
async function delCol(c){if(!confirm(`Delete the ${c.kind} “${c.title}”? Its link will stop working. Your uploaded tracks aren’t deleted.`))return;
 const{error}=await sb.from('collections').delete().eq('id',c.id);if(error)return toast('Couldn’t delete: '+error.message);S.cols=S.cols.filter(x=>x.id!==c.id);S.pubc=null;renderMain()}
function remoteView(v){
 const f=S.fresh?' in':'',head=(h,s)=>`<h1>${h}</h1><p class="sub">${s}</p>`,load=`<section class="view${f}"><p class="sub">Loading…</p></section>`,
  q=S.q.trim().toLowerCase(),m=x=>!q||((x.title||'')+' '+(x.description||'')).toLowerCase().includes(q);
 if(!sb)return`<section class="view prose${f}"><h1>Sharing isn’t set up</h1><p>Add your Supabase URL and anon key to <code>config.js</code> and run the SQL files in <code>supabase/migrations</code>. The README has the exact steps. Local playback works without it.</p></section>`;
 if(v==='track'){const t=S.shared;
  if(t===undefined)return load;
  if(!t)return`<section class="view${f}">${empty('Track not found','This link may be wrong, or the owner has unpublished it.','<a class="btn" href="./">Open Velnq</a>')}</section>`;
  return`<section class="view share${f}"><p class="eyebrow">Shared on Velnq</p><span class="art" style="${artv(t.name)}"></span><h1>${esc(title(t))}</h1>${t.description?`<p class="sub">${esc(t.description)}</p>`:''}<div class="acts"><button class="btn" data-a="playshared">Play</button><button class="btn ghost" data-a="copy" data-id="${t.id}">Copy link</button><a class="btn ghost" href="./">Open Velnq</a></div><p class="muted">${ext(t)} · ${size(t)}${t.dur?' · '+fmt(t.dur):''}</p></section>`}
 if(v==='col'){const c=S.col;
  if(c===undefined)return load;
  if(c===false)return`<section class="view${f}">${empty('Couldn’t load this page','Check your connection and try again.','<button class="btn" data-a="reload">Try again</button>')}</section>`;
  if(!c)return`<section class="view${f}">${empty('Not available','This link may be wrong, or the owner has unpublished it.','<a class="btn" href="./">Open Velnq</a>')}</section>`;
  const ids=c.ids.filter(trk);let tot=0;ids.forEach(i=>tot+=trk(i).dur||0);
  return`<section class="view share${f}"><p class="eyebrow">${ckind(c)}</p><span class="art" style="${artv(c.id)}"></span><h1>${esc(c.title)}</h1>${c.description?`<p class="sub">${esc(c.description)}</p>`:''}<p class="muted">${n(ids.length)}${tot?' · '+fmt(tot):''}</p><div class="acts"><button class="btn" data-a="playcol"${ids.length?'':' disabled'}>Play all</button><button class="btn ghost" data-a="ccopy" data-id="${c.id}">Copy link</button><a class="btn ghost" href="./">Open Velnq</a></div>${ids.length?`<ol class="list">${ids.map(i=>rrow(trk(i))).join('')}</ol>`:empty('Nothing here yet','The owner hasn’t added any tracks.')}</section>`}
 if(v==='edit'){const d=S.ed;if(!S.user||!d)return`<section class="view"><p class="sub">Nothing to edit.</p></section>`;
  const av=(S.mine||[]).filter(t=>!d.ids.includes(t.id)),b=(c,i,l,x)=>`<button type="button" class="ib" data-a="${c}" data-i="${i}" aria-label="${l}">${x}</button>`;
  return`<section class="view${f}">${head((d.id?'Edit ':'New ')+d.kind,d.id?'Changes to a published '+d.kind+' go live when you save.':'Saved as a private draft until you publish it.')}<form class="ed" data-ed-form><label>Title<input data-ed="title" maxlength="120" required value="${esc(d.title)}"></label><label>Description<textarea data-ed="description" maxlength="500" rows="3">${esc(d.description)}</textarea></label>${d.kind==='album'?`<label>Release year (optional)<input data-ed="year" type="number" min="1900" max="2100" value="${esc(d.year)}"></label>`:''}<h2 class="hd">Tracks (${d.ids.length})</h2>${d.ids.length?`<ol class="list">${d.ids.map((id,i)=>{const t=trk(id);return t?er(t,`<span class="ac">${b('eup',i,'Move up','↑')}${b('edown',i,'Move down','↓')}${b('edel',i,'Remove from '+d.kind,ic('minus'))}</span>`):''}).join('')}</ol>`:'<p class="sub">No tracks yet. A draft can stay empty.</p>'}<h2 class="hd">Add from your uploads</h2>${av.length?`<ul class="list">${av.map(t=>er(t,`<button type="button" class="btn ghost sm" data-a="eadd" data-id="${t.id}">Add</button>`)).join('')}</ul>`:'<p class="sub">'+((S.mine||[]).length?'All your uploaded tracks are already here.':'You haven’t uploaded any tracks yet. Cancel and use “Upload tracks”.')+'</p>'}<div class="acts"><button class="btn"${S.busy?' disabled':''}>Save</button><button type="button" class="btn ghost" data-a="ecancel">Cancel</button></div></form></section>`}
 if(v==='discover'){if(!S.pub||!S.pubc)return load;const cs=S.pubc.filter(m),ts=S.pub.filter(m);
  return`<section class="view${f}">${head('Discover','Playlists, albums and tracks shared on Velnq.')}${cs.length?`<ul class="cards">${cs.map(c=>`<li><button class="card" data-col="${c.id}"><span class="art" style="${artv(c.id)}"></span><strong>${esc(c.title)}</strong><span>${ctitle(c)}</span></button></li>`).join('')}</ul>`:''}${ts.length?`<h2 class="hd">Tracks</h2><ol class="list">${ts.map(rrow).join('')}</ol>`:''}${cs.length||ts.length?'':empty(q?'No matches':'Nothing published yet',q?`Nothing here matches “${esc(S.q)}”.`:'Nothing has been published yet.')}</section>`}
 if(!S.user)return`<section class="view${f}">${head('My published music','Sign in to upload and manage what you share.')}<form class="mk" data-auth><label class="sr" for="em">Email</label><input id="em" type="email" placeholder="Email" autocomplete="email" required><label class="sr" for="pw">Password</label><input id="pw" type="password" placeholder="Password (6+ characters)" minlength="6" autocomplete="current-password" required><button class="btn">Sign in</button><button type="button" class="btn ghost" data-a="signup">Create account</button></form></section>`;
 const ok=S.mine&&S.cols,cs=(S.cols||[]).filter(m),ts=(S.mine||[]).filter(m);
 return`<section class="view${f}">${head('My published music',`Signed in as ${esc(S.user.email)}. <button class="btn ghost sm" data-a="signout">Sign out</button>`)}<div class="acts"><button class="btn" data-a="newpl">New playlist</button><button class="btn" data-a="newal">New album</button><button class="btn ghost" data-a="upl">Upload tracks</button><input id="upf" type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac" multiple hidden></div>${!ok?'<p class="sub">Loading…</p>':`<h2 class="hd">Playlists &amp; albums</h2>${cs.length?`<ul class="list">${cs.map(crow).join('')}</ul>`:'<p class="sub">Nothing yet. Upload some tracks, then create a playlist or album.</p>'}<h2 class="hd">Uploaded tracks</h2>${ts.length?`<ol class="list">${ts.map(rrow).join('')}</ol>`:'<p class="sub">No uploads yet. Use “Upload tracks”, or the upload icon on a Library track.</p>'}`}</section>`
}
document.addEventListener('click',async e=>{
 const o=e.target.closest('[data-a],[data-col]');if(!o)return;
 if(o.dataset.col)return openCol(o.dataset.col);
 const a=o.dataset.a;
 if(!/^(pub|copy|toggle|edit|rdel|signup|signout|playshared|newpl|newal|upl|ccopy|cpub|cedit|cdel|playcol|eadd|eup|edown|edel|ecancel|reload)$/.test(a))return;
 const row=o.closest('.row'),cid=(o.closest('[data-cid]')||{dataset:{}}).dataset.cid,id=o.dataset.id||(row&&row.dataset.id),t=id&&trk(id),c=cid&&S.cols&&S.cols.find(x=>x.id===cid),i=+o.dataset.i;
 switch(a){
  case'pub':return shareLocal(id);
  case'copy':return copyLink(id);
  case'ccopy':return copyLink(o.dataset.id||cid,'c');
  case'playshared':return S.shared&&play(S.shared.id,[S.shared.id]);
  case'playcol':{const ids=S.col.ids.filter(trk);return ids.length&&play(ids[0],ids)}
  case'signup':return auth(true);
  case'signout':return sb.auth.signOut();
  case'upl':return $('#upf').click();
  case'newpl':return openEd('playlist');
  case'newal':return openEd('album');
  case'cedit':return openEd(c.kind,cid);
  case'cpub':return setColPub(c,!c.pub);
  case'cdel':return delCol(c);
  case'eadd':if(!S.ed.ids.includes(id))S.ed.ids.push(id);return renderMain();
  case'eup':case'edown':{const j=a==='eup'?i-1:i+1,x=S.ed.ids;if(j>=0&&j<x.length)[x[i],x[j]]=[x[j],x[i]];return renderMain()}
  case'edel':S.ed.ids.splice(i,1);return renderMain();
  case'ecancel':S.ed=null;return setView('mine');
  case'reload':S.col=undefined;renderMain();return loadCol(new URLSearchParams(location.search).get('c'));
  default:if(t&&S.user&&t.owner===S.user.id)ownerAct(a,t)
 }
});
document.addEventListener('submit',e=>{const t=e.target;if(t.matches('[data-auth]')){e.preventDefault();auth(false)}else if(t.matches('[data-ed-form]')){e.preventDefault();saveEd()}});
document.addEventListener('input',e=>{const k=e.target.dataset&&e.target.dataset.ed;if(k&&S.ed)S.ed[k]=e.target.value});
document.addEventListener('change',e=>{if(e.target.id==='upf'){const fl=[...e.target.files];e.target.value='';uploadFiles(fl)}});

/* ---------- init ---------- */
$$('[data-ic]').forEach(b=>b.insertAdjacentHTML('afterbegin',b.dataset.ic.split(' ').map(ic).join('')));
audio.dispatchEvent(new Event('volumechange'));
route();
(async()=>{
 try{
  S.tracks=((await store('readonly',s=>s.getAll()))||[]).sort((a,b)=>a.added-b.added).map(({blob,...t})=>t);
  const ok=new Set(S.tracks.map(t=>t.id));
  S.favs=new Set([...S.favs].filter(x=>ok.has(x)));S.pls.forEach(p=>p.ids=(p.ids||[]).filter(x=>ok.has(x)));
 }catch{toast('Saved music couldn’t be loaded. Browser storage may be blocked (private mode?). You can still add files for this session.')}
 render()
})();

/* ---------- online search (Apple iTunes Search API: no key needed, 30-second previews) ---------- */
const okUrl=u=>typeof u==='string'&&/^https:\/\/[^\s"'()<>\\]+$/.test(u)?u:'';
function jsonp(url,ms=8000){return new Promise((res,rej)=>{const cb='_vq'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),sc=document.createElement('script');let t;const done=(f,v)=>{clearTimeout(t);delete window[cb];sc.remove();f(v)};t=setTimeout(()=>done(rej,Error('timeout')),ms);window[cb]=d=>done(res,d);sc.onerror=()=>done(rej,Error('network'));sc.src=url+'&callback='+cb;document.head.appendChild(sc)})}
async function ifetch(u){let d;
 try{const r=await fetch(u);if(!r.ok){const e=Error('http '+r.status);e.http=r.status;throw e}d=await r.json()}
 catch(e){if(e.http)throw e;d=await jsonp(u)}
 return d}
const iMap=x=>({id:'on:itunes:'+x.trackId,on:'itunes',name:(x.artistName||'')+' - '+(x.trackName||''),title:x.trackName||'Untitled',artist:x.artistName||'Unknown artist',album:x.collectionName||'',dur:30,size:0,label:'30s preview',stream:okUrl(x.previewUrl),art:okUrl(String(x.artworkUrl100||'').replace('100x100bb','300x300bb')),link:okUrl(x.trackViewUrl),genre:x.primaryGenreName||'',rel:x.releaseDate||'',aid:x.artistId||0});
const iList=d=>(d&&d.results||[]).filter(x=>x&&x.trackId&&okUrl(x.previewUrl)).map(iMap);
async function itunes(term,o={}){
 return iList(await ifetch('https://itunes.apple.com/search?media=music&entity=song&limit='+(o.limit||25)+'&term='+encodeURIComponent(term)))
}
const itunesLookup=async(aid,limit=40)=>iList(await ifetch('https://itunes.apple.com/lookup?id='+encodeURIComponent(aid)+'&entity=song&limit='+limit));
async function runOnline(term){
 term=String(term||'').trim();if(!term)return;
 S.onq=term;S.ost='loading';S.onr=[];const tok=++S.otok;if(S.view==='online')renderMain();
 try{const rs=await itunes(term);if(tok!==S.otok)return;rs.forEach(t=>S.on.set(t.id,t));S.onr=rs;S.ost='ok'}
 catch(e){if(tok!==S.otok)return;S.onr=[];S.ost='error';toast(e.http===403||e.http===429?'Apple is limiting searches for a moment. Wait a minute and try again.':'Couldn’t reach the music service. Check your connection and try again.')}
 if(S.view==='online')renderMain()
}
const orow=t=>{const tt=esc(title(t));
 return`<li class="row" data-id="${esc(t.id)}" data-t="${tt}"><button class="rp" data-a="play" aria-label="Play ${tt}"><span class="th"><span class="art" style="${artst(t)}"></span><span class="ov">${ic('play')}${ic('pause')}</span></span><span class="ti"><strong>${tt}</strong><span class="meta">${ext(t)}${t.album?' · '+esc(t.album):''} · ${size(t)}<span class="st"></span></span></span></button><span class="du">${fmt(t.dur)}</span><div class="ac"><button class="ib" data-a="queue" aria-label="Add to queue">${ic('queue')}</button>${t.link?`<a class="ib" href="${esc(t.link)}" target="_blank" rel="noopener noreferrer" aria-label="Open this song on Apple Music" title="Open on Apple Music">${ic('link')}</a>`:''}</div></li>`};
const onlineView=()=>{const f=S.fresh?' in':'',st=S.ost,
 form=`<form class="mk" data-online><label class="sr" for="oq">Search songs online</label><input id="oq" type="search" maxlength="100" placeholder="Song, artist or album" value="${esc(S.onq)}" autocomplete="off"><button class="btn">Search</button></form>`,
 body=st==='loading'?'<p class="sub">Searching…</p>':st==='error'?empty('Couldn’t reach the music service','Check your connection and try again.','<button class="btn" data-a="onretry">Try again</button>'):st==='idle'?empty('Find a song','Search Apple’s music catalogue. Each result plays a 30-second preview, not the full song.'):!S.onr.length?empty('No results',`Nothing found for “${esc(S.onq)}”.`):`<div class="acts"><button class="btn" data-a="playall">Play all previews</button></div><ol class="list">${S.onr.map(orow).join('')}</ol><p class="muted">Previews and artwork are provided by Apple through the iTunes Search API. Use the link icon to open a song on Apple Music.</p>`;
 return`<section class="view${f}"><h1>Search online</h1><p class="sub">Look up a song and hear a 30-second preview.</p>${form}${body}</section>`};
document.addEventListener('submit',e=>{if(e.target.matches&&e.target.matches('[data-online]')){e.preventDefault();runOnline($('#oq').value)}});
document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('[data-a=onretry]'))runOnline(S.onq)});
$('#q').addEventListener('keydown',e=>{if(e.key==='Enter'&&S.view==='online'){e.preventDefault();runOnline(e.target.value)}});

/* ---------- Discover (Apple iTunes Search API, 30-second previews; reuses the player, queue and itunes() above) ---------- */
const DY=new Date().getFullYear();
const D_SEEDS=['indie','dream pop','alternative','soul','electronic','folk','jazz','singer songwriter','synthpop'];
const D_GEMS=['shoegaze','ambient','post-rock','folktronica','lo-fi','jazz fusion','chamber pop','krautrock','synthwave','neo soul'];
const D_MOODS=[
 {k:'late',n:'Late Night',q:'late night',s:'After-hours listening'},
 {k:'dream',n:'Dreamy',q:'dream pop',s:'Soft focus, slow drift'},
 {k:'focus',n:'Focus',q:'instrumental focus',s:'Keep the thread'},
 {k:'nostalgia',n:'Nostalgia',q:'throwback',s:'Back in time'},
 {k:'energy',n:'Energy',q:'high energy',s:'Turn it up'},
 {k:'melancholy',n:'Melancholy',q:'melancholy',s:'Beautifully heavy'}];
const D_GENRES=[['Indie','indie'],['Pop','pop'],['Hip-Hop','hip hop'],['R&B','r&b'],['Rock','rock'],['Jazz','jazz'],['Electronic','electronic'],['Classical','classical'],['Alternative','alternative']];
const D_NAV=[['Featured','ds-feat'],['Recommended','ds-rec'],['Moods','ds-moods'],['Genres','ds-genres'],['Artist','ds-spot'],['New releases','ds-new'],['Hidden gems','ds-gems']];
const reduceMotion=()=>!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
const dseed=()=>D_SEEDS[Math.floor(Date.now()/864e5)%D_SEEDS.length];
const dwhen=t=>{const d=new Date(t.rel);return t.rel&&!isNaN(d)?d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):''};
const uniqBy=(a,f)=>{const s=new Set();return a.filter(x=>{const k=f(x);if(s.has(k))return false;s.add(k);return true})};
const dErr=e=>e&&(e.http===403||e.http===429)?'Apple is limiting searches for a moment. Wait a minute and try again.':'Couldn’t reach Apple’s music service. Check your connection and try again.';

/* request cache: one request per query, in-flight requests shared, failures never cached */
const dcache=new Map();
function dget(key,fn,ttl=6e5){
 const c=dcache.get(key);if(c&&(c.p||Date.now()-c.t<ttl))return c.p||Promise.resolve(c.v);
 const p=fn().then(v=>{dcache.set(key,{t:Date.now(),v});return v},e=>{dcache.delete(key);throw e});
 dcache.set(key,{p,t:Date.now()});return p}
const dreg=l=>{l.forEach(t=>S.on.set(t.id,t));return l};
const dSearch=(term,limit=40)=>dget('s:'+limit+':'+term.toLowerCase(),async()=>dreg(await itunes(term,{limit})));
const dArtist=(aid,name)=>dget('a:'+(aid||name),async()=>{
 let r=[];
 if(aid){try{r=await itunesLookup(aid,40)}catch(e){if(e.http)throw e}}
 if(!r.length){r=await itunes(name,{limit:40});const same=r.filter(x=>x.artist===name);if(same.length)r=same}
 return dreg(uniqBy(r,x=>x.id))});

/* what each section loads */
const DL={
 disc:()=>dSearch(dseed(),50),
 new:async()=>{
  const rs=await Promise.allSettled([dSearch('new music '+DY,60),dSearch('new release '+DY,60)]),ok=rs.filter(r=>r.status==='fulfilled');
  if(!ok.length)throw rs[0].reason;
  const now=Date.now()+864e5;
  return uniqBy(ok.flatMap(r=>r.value),x=>x.id).filter(x=>x.rel&&Date.parse(x.rel)<=now).sort((a,b)=>Date.parse(b.rel)-Date.parse(a.rel)).slice(0,14)},
 gems:async()=>{if(S.d.gem<0)S.d.gem=Math.random()*D_GEMS.length|0;return uniqBy(await dSearch(D_GEMS[S.d.gem],40),x=>x.artist).slice(0,14)}
};
function dDerive(items){
 const feat=items.find(t=>t.art)||items[0]||null,rest=items.filter(t=>t!==feat);
 let rec=uniqBy(rest,t=>t.artist).slice(0,14);if(rec.length<8)rec=uniqBy(rec.concat(rest),t=>t.id).slice(0,14);
 const by=new Map();rest.filter(t=>!feat||t.artist!==feat.artist).forEach(t=>{const k=t.aid||t.artist;by.set(k,(by.get(k)||[]).concat(t))});
 const top=[...by.values()].sort((a,b)=>b.length-a.length)[0]||null;
 return{feat,rec,spot:top?{name:top[0].artist,aid:top[0].aid,genre:top[0].genre,items:top.slice(0,4)}:null}}

function dStart(){if(S.d.view)return;['disc','new','gems'].forEach(k=>{const x=S.d.sec[k];if(!x||x.st==='idle')dLoad(k)})}
async function dLoad(k){
 const sec=S.d.sec[k]={st:'loading',items:[]};dPaint(k);
 try{sec.items=await DL[k]();sec.st='ok';if(k==='disc')sec.d=dDerive(sec.items)}
 catch(e){sec.st='error';sec.err=e}
 if(S.d.sec[k]!==sec)return;dPaint(k);
 if(sec.st==='error'&&S.view==='discover'&&!S.d.view&&!S.d.warned){S.d.warned=1;toast(dErr(sec.err))}}

/* html pieces */
const dsh=(h,p,ctl='')=>`<div class="dh"><div><h2>${h}</h2>${p?`<p>${p}</p>`:''}</div>${ctl}</div>`;
const rctl=k=>`<div class="dctl"><button class="ib" data-a="drail" data-t="${k}" data-d="-1" aria-label="Scroll left">${ic('chevl')}</button><button class="ib" data-a="drail" data-t="${k}" data-d="1" aria-label="Scroll right">${ic('chevr')}</button></div>`;
const skelRail=()=>`<ul class="rail" aria-hidden="true">${'<li><div class="skel"></div></li>'.repeat(6)}</ul>`;
const dmsg=(t,k,b='Try again')=>`<div class="dmsg"><p>${t}</p><button class="btn ghost" data-a="dretry" data-k="${k}">${b}</button></div>`;
function dcard(t,key,sub){
 const tt=esc(title(t));
 return`<li><div class="dcard" data-id="${esc(t.id)}" data-t="${tt}"><button class="pb" data-a="dplay" data-sec="${key}" aria-label="Play preview of ${tt}"><span class="art" style="${artst(t)}"></span><span class="ov">${ic('play')}${ic('pause')}</span></button><strong title="${tt}">${tt}</strong><span class="meta">${esc(t.artist)}</span><span class="meta">${esc(sub)}<span class="st"></span></span><div class="dact"><button class="ib" data-a="dq" aria-label="Add ${tt} to queue">${ic('queue')}</button>${t.link?`<a class="ib" href="${esc(t.link)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${tt} on Apple Music" title="Open on Apple Music">${ic('link')}</a>`:''}</div></div></li>`}
function dRail(key,items,sub,empty){
 S.d.lists[key]=items.map(t=>t.id);
 return items.length?`<ul class="rail" id="rail-${key}" tabindex="0" role="region" aria-label="${esc(empty)}">${items.map(t=>dcard(t,key,sub(t))).join('')}</ul>`:null}
function dSecBody(k,fn){const x=S.d.sec[k]||{st:'loading'};
 if(x.st==='loading')return skelRail();
 if(x.st==='error')return dmsg(esc(dErr(x.err)),k);
 return fn(x)}

const dParts={
 heroacts:()=>{const x=S.d.sec.disc||{},ok=x.st==='ok'&&x.d&&x.d.rec.length;
  return`<button class="btn" data-a="dplayall" data-sec="rec"${ok?'':' disabled'}>${ic('play')}Play previews</button><button class="btn ghost" data-a="djump" data-t="ds-moods">Explore by mood</button>`},
 mosaic:()=>{const x=S.d.sec.disc||{};
  if(x.st==='ok'&&x.d&&x.d.rec.length){S.d.lists.rec=x.d.rec.map(t=>t.id);return x.d.rec.slice(0,4).map(t=>{const tt=esc(title(t));return`<button data-a="dplay" data-sec="rec" data-id="${esc(t.id)}" aria-label="Play preview of ${tt} by ${esc(t.artist)}"><span class="art" style="${artst(t)}"></span></button>`}).join('')}
  if(x.st==='error')return'';
  return'<div class="ph1 skel"></div>'.repeat(4)},
 feat:()=>dSecBody('disc',x=>{const t=x.d.feat;
  if(!t)return dmsg('Apple returned no previewable songs for today’s search.','disc');
  S.d.lists.feat=[t.id];
  const tags=[t.album,t.genre,dwhen(t)?'Released '+dwhen(t):''].filter(Boolean).map(esc).join(' · '),tt=esc(title(t));
  return`<article class="feat" data-id="${esc(t.id)}" data-t="${tt}"><span class="art" style="${artst(t)}"></span><div><p class="eyebrow">Featured</p><h3>${tt}</h3><p class="who">${esc(t.artist)}</p><p class="tags">${tags}</p><div class="acts"><button class="btn" data-a="dplay" data-sec="feat" data-id="${esc(t.id)}">${ic('play')}Play preview</button><button class="btn ghost" data-a="dartist" data-aid="${t.aid||''}" data-name="${esc(t.artist)}">Explore artist</button><button class="btn ghost" data-a="dq" data-id="${esc(t.id)}">${ic('queue')}Add to queue</button></div><p class="note">Picked from an Apple search for “${esc(dseed())}”. Apple’s search doesn’t include artist biographies, so none are shown.</p></div></article>`}),
 rec:()=>dSecBody('disc',x=>dRail('rec',x.d.rec,t=>t.album||t.genre||'','Recommended previews')||dmsg('No previews were found for this search.','disc')),
 spot:()=>dSecBody('disc',x=>{const s=x.d.spot;
  if(!s)return dmsg('Not enough results to pick an artist today.','disc');
  S.d.lists.spot=s.items.map(t=>t.id);
  const arts=s.items.slice(0,4).map(t=>`<span class="art" style="${artst(t)}"></span>`).join(''),nm=esc(s.name);
  return`<article class="spot"><div class="mono${s.items.length<2?' one':''}" aria-hidden="true">${arts}</div><div><p class="eyebrow">Artist spotlight</p><h3>${nm}</h3><p class="muted">${[s.genre,n(s.items.length).replace('track','preview')+' in today’s results'].filter(Boolean).map(esc).join(' · ')}</p><div class="acts" style="margin-top:12px"><button class="btn" data-a="dartist" data-aid="${s.aid||''}" data-name="${nm}">Explore artist</button><button class="btn ghost" data-a="dplayall" data-sec="spot">${ic('play')}Play previews</button></div><ol class="list">${s.items.map(t=>orow(t).replace('data-a="play"','data-a="dplay" data-sec="spot"')).join('')}</ol><p class="dnote">Artwork shown is from their releases; Apple’s search doesn’t supply artist photos or biographies.</p></div></article>`}),
 new:()=>dSecBody('new',x=>dRail('new',x.items,t=>dwhen(t)||t.album||'','New releases')||dmsg('No dated results came back for the new-release searches.','new')),
 gems:()=>dSecBody('gems',x=>dRail('gems',x.items,t=>t.album||t.genre||'','Hidden gems')||dmsg('No previews were found for this search.','gems'))
};
function dPaint(k){
 if(S.view!=='discover'||S.d.view)return;
 const set=(id,h)=>{const el=$('#dc-'+id);if(el)el.innerHTML=h};
 if(k==='disc'){['heroacts','mosaic','feat','rec','spot'].forEach(p=>set(p,dParts[p]()))}
 else set(k,dParts[k]());
 if(k==='gems'){const g=$('#dc-gemnote');if(g)g.textContent=`Sampled from the search “${D_GEMS[S.d.gem]}”.`}
 mark()}

function communityInner(){
 if(!sb)return'';
 if(!S.pub||!S.pubc)return'<p class="sub">Loading…</p>';
 const q=S.q.trim().toLowerCase(),m=x=>!q||((x.title||'')+' '+(x.description||'')).toLowerCase().includes(q),cs=S.pubc.filter(m),ts=S.pub.filter(m);
 return(cs.length?`<ul class="cards">${cs.map(c=>`<li><button class="card" data-col="${c.id}"><span class="art" style="${artv(c.id)}"></span><strong>${esc(c.title)}</strong><span>${ctitle(c)}</span></button></li>`).join('')}</ul>`:'')+(ts.length?`<h3 class="hd">Tracks</h3><ol class="list">${ts.map(rrow).join('')}</ol>`:'')+(cs.length||ts.length?'':`<p class="sub">${q?`Nothing here matches “${esc(S.q)}”.`:'Nothing has been published yet.'}</p>`)}
function paintCommunity(){const el=$('#dc-com');if(el){el.innerHTML=communityInner();mark()}}

function discoverView(){
 if(S.d.view)return dResultsView();
 const f=S.fresh?' in':'',sec=(id,h,p,ctl,body)=>`<section class="dsec" id="${id}" aria-label="${esc(h)}">${dsh(h,p,ctl)}${body}</section>`;
 return`<section class="view dv${f}">
<div class="hero"><div><p class="eyebrow">Discover</p><h1>Find your next obsession.</h1><p class="lead">Discover music that fits your mood, your taste and your moment.</p><div class="acts" id="dc-heroacts">${dParts.heroacts()}</div></div><div class="mosaic" id="dc-mosaic">${dParts.mosaic()}</div></div>
<nav class="dnav" aria-label="Discover sections">${D_NAV.map(([l,id])=>`<button class="chip" data-a="djump" data-t="${id}">${l}</button>`).join('')}</nav>
${sec('ds-feat','Featured selection','',``,`<div id="dc-feat">${dParts.feat()}</div>`)}
${sec('ds-rec','Selected for discovery',`Songs from an Apple search for “${esc(dseed())}”. Velnq has no personal recommendation system yet, so this isn’t tailored to you.`,rctl('rec'),`<div id="dc-rec">${dParts.rec()}</div>`)}
${sec('ds-moods','Explore by mood','Each mood runs a keyword search, so matches are approximate.','',`<ul class="moods">${D_MOODS.map(m=>`<li><button class="mood" data-k="${m.k}" data-a="dmood" aria-label="${m.n}: search for ${esc(m.q)}"><strong>${m.n}</strong><span>${m.s}</span></button></li>`).join('')}</ul>`)}
${sec('ds-genres','Explore by genre','','',`<ul class="genres">${D_GENRES.map(([l,q])=>`<li><button class="genre" data-a="dgenre" data-q="${esc(q)}" data-l="${esc(l)}">${esc(l)}</button></li>`).join('')}</ul>`)}
${sec('ds-spot','Artist spotlight','','',`<div id="dc-spot">${dParts.spot()}</div>`)}
${sec('ds-new','New releases','The most recent release dates among a few Apple searches. This isn’t a complete or official new-releases list.',rctl('new'),`<div id="dc-new">${dParts.new()}</div>`)}
${sec('ds-gems','Hidden gems','Apple doesn’t share popularity data, so these aren’t proven overlooked songs. They’re a way to wander through less mainstream corners.',`<div class="dctl"><button class="btn ghost sm" data-a="dgem">Try another</button>${rctl('gems').replace('<div class="dctl">','').replace(/<\/div>$/,'')}</div>`,`<p class="dnote" id="dc-gemnote">${S.d.gem>=0?`Sampled from the search “${esc(D_GEMS[S.d.gem])}”.`:''}</p><div id="dc-gems">${dParts.gems()}</div>`)}
${sb?sec('ds-com','Shared on Velnq','Playlists, albums and tracks published by Velnq owners.','',`<div id="dc-com">${communityInner()}</div>`):''}
<p class="muted" style="margin-top:36px">Previews and artwork are provided by Apple through the iTunes Search API and last 30 seconds. They aren’t full songs.</p>
</section>`}

/* mood / genre / artist results */
function dOpen(type,label,note,loader){
 S.d.scroll=$('#main').scrollTop;const tok=++S.d.tok;
 S.d.view={type,label,note,ids:[],st:'loading',retry:()=>dOpen(type,label,note,loader)};S.fresh=true;S.q='';$('#q').value='';renderMain();$('#main').scrollTop=0;
 loader().then(items=>{if(tok!==S.d.tok||!S.d.view)return;S.d.view.ids=items.map(t=>t.id);S.d.view.st='ok'}).catch(e=>{if(tok!==S.d.tok||!S.d.view)return;S.d.view.st='error';S.d.view.err=e;toast(dErr(e))}).finally(()=>{if(tok===S.d.tok&&S.view==='discover')renderMain()})}
function dResultsView(){
 const v=S.d.view,f=S.fresh?' in':'',{all,shown}=lst();
 const body=v.st==='loading'?`<div class="list" aria-busy="true">${'<div class="skel" style="height:60px;margin-bottom:8px"></div>'.repeat(6)}</div>`
  :v.st==='error'?`<div class="dmsg"><p>${esc(dErr(v.err))}</p><button class="btn ghost" data-a="dvretry">Try again</button></div>`
  :!all.length?empty('No previews found',`Apple returned no previewable songs for ${esc(v.label)}. Try another mood or genre.`)
  :!shown.length?empty('No matches',`Nothing here matches “${esc(S.q)}”.`)
  :`<div class="acts"><button class="btn" data-a="playall">${ic('play')}Play${S.pref.shuffle?' shuffled':' all previews'}</button></div><ol class="list">${shown.map(id=>orow(trk(id))).join('')}</ol>`;
 return`<section class="view dv${f}"><button class="btn ghost sm back" data-a="dback">← Back to Discover</button><p class="eyebrow" style="margin-top:22px">${esc(v.type)}</p><h1>${esc(v.label)}</h1><p class="dnote">${v.note}</p>${body}<p class="muted" style="margin-top:28px">Previews and artwork are provided by Apple through the iTunes Search API and last 30 seconds.</p></section>`}

/* player/queue glue for Discover cards */
function dmark(){$$('.dcard').forEach(r=>{const id=r.dataset.id,on=id===S.cur,p=on&&!audio.paused&&!S.bad.has(id),s=stat(id),st=$('.st',r);
 r.classList.toggle('on',on);r.classList.toggle('playing',p);if(st)st.textContent=s?' · '+s:'';
 const b=$('[data-a=dplay]',r);if(b)b.setAttribute('aria-label',(p?'Pause ':'Play preview of ')+r.dataset.t)})}
function dPlayCard(id,key){
 const t=trk(id);if(!t||!t.stream)return toast('No preview is available for this track.');
 if(id===S.cur&&!S.bad.has(id))return togglePlay();
 const ids=(S.d.lists[key]||[id]).filter(x=>{const y=trk(x);return y&&y.stream});play(id,ids.includes(id)?ids:[id])}
const DA=new Set(['dplay','dplayall','dq','dmood','dgenre','dartist','dback','dretry','dvretry','dgem','djump','drail']);
document.addEventListener('click',e=>{
 const o=e.target.closest&&e.target.closest('[data-a]');if(!o||!DA.has(o.dataset.a))return;
 const a=o.dataset.a,idOf=()=>o.dataset.id||((o.closest('[data-id]')||{dataset:{}}).dataset.id);
 switch(a){
  case'dplay':return dPlayCard(idOf(),o.dataset.sec);
  case'dplayall':{const ids=(S.d.lists[o.dataset.sec]||[]).filter(x=>trk(x)&&trk(x).stream);if(!ids.length)return toast('No previews to play yet.');return play(S.pref.shuffle?ids[Math.random()*ids.length|0]:ids[0],ids)}
  case'dq':return addQueue(idOf());
  case'dmood':{const m=D_MOODS.find(x=>x.k===o.dataset.k);return m&&dOpen('Mood',m.n,`Keyword search on Apple for “${esc(m.q)}”. Mood matching is approximate.`,()=>dSearch(m.q,40))}
  case'dgenre':{const q=o.dataset.q;return dOpen('Genre',o.dataset.l,`Keyword search on Apple for “${esc(q)}”. Results are search matches, not an official genre chart.`,()=>dSearch(q,40))}
  case'dartist':{const aid=o.dataset.aid,nm=o.dataset.name;return dOpen('Artist',nm,'Previews found for this artist through Apple’s search.',()=>dArtist(aid,nm))}
  case'dback':{S.d.view=null;S.d.tok++;S.fresh=false;S.q='';$('#q').value='';renderMain();$('#main').scrollTop=S.d.scroll||0;return}
  case'dvretry':return S.d.view&&S.d.view.retry();
  case'dretry':{S.d.warned=0;return dLoad(o.dataset.k)}
  case'dgem':{S.d.gem=(S.d.gem+1)%D_GEMS.length;S.d.warned=0;return dLoad('gems')}
  case'djump':{const el=document.getElementById(o.dataset.t);return el&&el.scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'start'})}
  case'drail':{const r=document.getElementById('rail-'+o.dataset.t);return r&&r.scrollBy({left:(+o.dataset.d)*r.clientWidth*.85,behavior:reduceMotion()?'auto':'smooth'})}
 }
});
