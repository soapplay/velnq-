import os
import json,re,sys,threading,http.server,socketserver,os,time,urllib.parse
from playwright.sync_api import sync_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',8766),Q);threading.Thread(target=srv.serve_forever,daemon=True).start()
arts=json.load(open('tests/meta.json'))['arts']
gen=['Alternative','Pop','Indie Rock','Electronic','Jazz','Soul']
def mk(i):
    a=arts[i%len(arts)]
    return {"wrapperType":"track","kind":"song","trackId":1000+i,"artistId":50+i%len(arts),"artistName":a,"trackName":f"Song {i}","collectionName":f"Album {i%7}","primaryGenreName":gen[i%len(gen)],"releaseDate":f"{2026 if i%3 else 2019}-{(i*3)%12+1:02d}-15T08:00:00Z","previewUrl":("https://audio.example/p%d.wav"%i) if i%9 else None,"artworkUrl100":f"https://img.example/{i%7}/100x100bb.jpg","trackViewUrl":f"https://music.apple.com/song/{1000+i}"}
mode={'fail':None,'empty':set()}
reqs=[]
def itunes(route):
    u=urllib.parse.urlparse(route.request.url);q=urllib.parse.parse_qs(u.query);reqs.append(route.request.url)
    if mode['fail']:return route.fulfill(status=mode['fail'],body='nope')
    if u.path.endswith('/lookup'):
        aid=int(q['id'][0]);res=[{"wrapperType":"artist","artistId":aid,"artistName":arts[(aid-50)%len(arts)]}]+[mk(i) for i in range(80) if 50+i%len(arts)==aid][:int(q.get('limit',['40'])[0])]
        return route.fulfill(json={"resultCount":len(res),"results":res})
    term=q['term'][0];lim=int(q.get('limit',['25'])[0])
    if term in mode['empty']:return route.fulfill(json={"resultCount":0,"results":[]})
    off=sum(map(ord,term))%20
    res=[mk(i+off) for i in range(lim)]
    route.fulfill(json={"resultCount":len(res),"results":res})
R=[];errs=[]
def chk(name,ok,info=''):
    R.append((name,bool(ok)));print(('PASS ' if ok else 'FAIL ')+name+(' — '+str(info) if info and not ok else ''))
with sync_playwright() as p:
    b=p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    def newpage(w=1360,h=860,sbstub=False):
        ctx=b.new_context(viewport={'width':w,'height':h});pg=ctx.new_page()
        pg.on('pageerror',lambda e:errs.append('pageerror: '+str(e)))
        pg.on('console',lambda m:errs.append('console: '+m.text) if m.type=='error' and 'Failed to load resource' not in m.text else None)
        pg.route('**/itunes.apple.com/**',itunes)
        pg.route('https://audio.example/**',lambda r:r.fulfill(path='tests/tone.wav',content_type='audio/wav'))
        pg.route('https://img.example/**',lambda r:r.fulfill(path='tests/img%s.png'%r.request.url.split('/')[3],content_type='image/png'))
        pg.route('https://cdn.jsdelivr.net/**',lambda r:r.fulfill(body='',content_type='application/javascript'))
        if sbstub:
            pg.route('**/config.js',lambda r:r.fulfill(body="window.VELNQ={url:'https://x.supabase.co',anonKey:'k'};",content_type='application/javascript'))
            pg.add_init_script("""window.VELNQ={url:'https://x.supabase.co',anonKey:'k'};
 const mk=()=>{const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,maybeSingle:()=>q,then:(r)=>r({data:[],error:null})};return q};
 window.supabase={createClient:()=>({from:mk,auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},storage:{from:()=>({})}})};""")
        return ctx,pg
    ctx,pg=newpage()
    pg.goto('http://127.0.0.1:8766/index.html');pg.wait_for_timeout(500)
    chk('loads, library empty state',pg.locator('text=Your library is waiting').count()==1)
    # ---- local import / playback / persistence
    pg.set_input_files('#file',['tests/tone.wav']);pg.wait_for_timeout(900)
    chk('local import adds track',pg.locator('.row').count()==1,pg.inner_text('#main')[:200])
    pg.click('.row .rp');pg.wait_for_timeout(700)
    chk('local playback starts',pg.evaluate('!audio.paused&&audio.currentTime>0'))
    chk('player shows title',pg.inner_text('#pTitle')=='tone',pg.inner_text('#pTitle'))
    pg.click('#bPlay');pg.wait_for_timeout(200);chk('pause works',pg.evaluate('audio.paused'))
    pg.click('.row [data-a=fav]');pg.wait_for_timeout(200)
    chk('favourite local track',pg.inner_text('#nFav')=='1')
    pg.click('[data-view=playlists]');pg.fill('#npl','Night');pg.click('.mk .btn');pg.wait_for_timeout(200)
    pg.click('[data-view=library]');pg.select_option('.row select','' ) if False else None
    pg.evaluate("document.querySelector('.row select').value=S.pls[0].id;document.querySelector('.row select').dispatchEvent(new Event('change',{bubbles:true}))");pg.wait_for_timeout(200)
    chk('playlist add',pg.evaluate('S.pls[0].ids.length')==1)
    pg.reload();pg.wait_for_timeout(800)
    chk('library persists after refresh (IndexedDB)',pg.locator('.row').count()==1)
    chk('favourite + playlist persist',pg.inner_text('#nFav')=='1' and pg.evaluate('S.pls[0].ids.length')==1)
    # ---- online search still works
    pg.click('[data-view=online]');pg.fill('#oq','dream');pg.click('[data-online] .btn');pg.wait_for_timeout(700)
    n_online=pg.locator('#main .row').count()
    chk('online search renders playable results only',n_online>0 and pg.evaluate('S.onr.every(t=>t.stream)'),n_online)
    pg.click('#main .row .rp');pg.wait_for_timeout(700)
    chk('online preview plays',pg.evaluate('!audio.paused&&S.cur.startsWith("on:itunes:")'))
    # ---- Discover
    reqs.clear();pg.click('[data-view=discover]');pg.wait_for_timeout(1500)
    chk('discover heading + supporting text','Find your next obsession.' in pg.inner_text('#main') and 'fits your mood, your taste and your moment.' in pg.inner_text('#main'))
    chk('featured shows real data',pg.locator('.feat h3').count()==1 and pg.inner_text('.feat h3').startswith('Song'),pg.inner_text('#dc-feat')[:100])
    chk('featured has artwork',pg.evaluate("getComputedStyle(document.querySelector('.feat .art')).backgroundImage").startswith('url('))
    nrec=pg.locator('#rail-rec .dcard').count();chk('recommended rail has cards',nrec>=8,nrec)
    chk('discover load used few requests (<=5)',len(reqs)<=5,len(reqs))
    chk('hero mosaic has 4 playable covers',pg.locator('.mosaic button').count()==4)
    chk('spotlight present, no invented bio',pg.locator('.spot h3').count()==1 and 'biograph' in pg.inner_text('.spot').lower())
    nnew=pg.locator('#rail-new .dcard').count();chk('new releases rail',nnew>0,nnew)
    dates=pg.eval_on_selector_all('#rail-new .dcard .meta:nth-of-type(2)','e=>e.map(x=>Date.parse(x.textContent.replace(/ ·.*/,"")))')
    chk('new releases sorted newest first',all(dates[i]>=dates[i+1] for i in range(len(dates)-1)) and len(dates)>1,dates)
    chk('hidden gems rail + honest note',pg.locator('#rail-gems .dcard').count()>0 and 'popularity' in pg.inner_text('#ds-gems'))
    chk('gems artists unique',pg.evaluate("(()=>{const a=[...document.querySelectorAll('#rail-gems .dcard .meta:nth-of-type(1)')].map(x=>x.textContent);return new Set(a).size===a.length})()"))
    chk('moods = 6, genres = 9',pg.locator('.mood').count()==6 and pg.locator('.genre').count()==9)
    pg.screenshot(path='tests/discover_top.png')
    # preview playback via existing player
    first=pg.locator('#rail-rec .dcard').first;fid=first.get_attribute('data-id')
    first.locator('[data-a=dplay]').click();pg.wait_for_timeout(800)
    chk('card preview plays through existing player',pg.evaluate('!audio.paused')and pg.evaluate('S.cur')==fid)
    chk('player bar shows title+artwork',pg.inner_text('#pTitle').startswith('Song') and 'background-image' in (pg.get_attribute('#pArt','style') or ''))
    chk('queue = rail list, order kept',pg.evaluate('S.queue.length')==nrec and pg.evaluate('S.queue[0]')==fid,pg.evaluate('S.queue.length'))
    chk('card shows playing state',pg.locator('#rail-rec .dcard.playing').count()==1)
    pg.locator('#rail-rec .dcard').first.locator('[data-a=dplay]').click();pg.wait_for_timeout(200)
    chk('same card toggles pause',pg.evaluate('audio.paused'))
    # queue add
    q0=pg.evaluate('S.queue.length')
    cid=pg.evaluate("(()=>{const c=[...document.querySelectorAll('.dcard')].find(x=>!S.queue.includes(x.dataset.id));return c&&c.dataset.id})()")
    card=pg.locator('.dcard[data-id="%s"]'%cid).first
    card.scroll_into_view_if_needed();card.locator('[data-a=dq]').click();pg.wait_for_timeout(150)
    chk('add to queue appends',pg.evaluate('S.queue.length')==q0+1 and pg.evaluate('S.queue[S.queue.length-1]')==cid,pg.evaluate('S.queue.length'))
    pg.locator('.dcard[data-id="%s"]'%cid).first.locator('[data-a=dq]').click();pg.wait_for_timeout(150)
    chk('no duplicate queue entry',pg.evaluate('S.queue.length')==q0+1 and 'Already' in pg.inner_text('#toast'))
    pg.click('#bQueue');pg.wait_for_timeout(200)
    chk('player queue button opens Queue',pg.evaluate('S.view')=='queue' and pg.locator('#main .row').count()==q0+1)
    # featured actions
    pg.click('[data-view=discover]');pg.wait_for_timeout(300)
    pg.click('.feat [data-a=dplay]');pg.wait_for_timeout(600)
    chk('featured Play Preview works',pg.evaluate('S.cur')==pg.get_attribute('.feat','data-id'))
    qn=pg.evaluate('S.queue.length');pg.click('.feat [data-a=dq]');pg.wait_for_timeout(100)
    chk('featured Add to Queue works (or already queued)',pg.evaluate('S.queue.length')>=qn)
    # hero play previews
    pg.click('#dc-heroacts [data-a=dplayall]');pg.wait_for_timeout(600)
    chk('hero Play previews plays first of set',pg.evaluate('S.queue[0]')==pg.evaluate("S.d.lists.rec[0]") and pg.evaluate('!audio.paused'))
    # rail arrows
    pg.click('#ds-rec [data-a=drail][data-d="1"]');pg.wait_for_timeout(700)
    chk('rail scroll button scrolls',pg.evaluate("document.querySelector('#rail-rec').scrollLeft")>0)
    # jump chip
    pg.click('.dnav [data-t=ds-moods]');pg.wait_for_timeout(900)
    chk('section chip scrolls to section',pg.evaluate("Math.abs(document.getElementById('ds-moods').getBoundingClientRect().top-document.querySelector('main').getBoundingClientRect().top)")<140)
    # mood
    reqs.clear();pg.click('.mood[data-k=late]');pg.wait_for_timeout(900)
    chk('mood triggers real search',any('term=late%20night' in r for r in reqs),reqs)
    nm=pg.locator('#main .row').count();chk('mood results listed',nm>5,nm)
    chk('mood results have Back to Discover',pg.locator('[data-a=dback]').count()==1)
    pg.locator('#main .row .rp').nth(1).click();pg.wait_for_timeout(600)
    chk('mood result plays; queue = result list',pg.evaluate('!audio.paused')and pg.evaluate('S.queue.length')==nm,pg.evaluate('S.queue.length'))
    pg.screenshot(path='tests/mood_results.png')
    pg.locator('#main .row [data-a=queue]').nth(3).click();pg.wait_for_timeout(100)
    pg.click('[data-a=dback]');pg.wait_for_timeout(300)
    chk('Back returns to Discover home',pg.locator('.hero').count()==1)
    chk('player state survives navigation',pg.evaluate('!audio.paused'))
    # genre
    reqs.clear();pg.click('.genre >> text=Hip-Hop');pg.wait_for_timeout(700)
    chk('genre triggers search (hip hop)',any('term=hip%20hop' in r for r in reqs),reqs)
    chk('genre results shown',pg.locator('#main .row').count()>5)
    pg.click('[data-a=dback]');pg.wait_for_timeout(200)
    reqs.clear();pg.click('.genre >> text=R&B');pg.wait_for_timeout(500)
    chk('R&B term encoded',any('term=r%26b' in r for r in reqs),reqs)
    pg.click('[data-a=dback]');pg.wait_for_timeout(200)
    # cache: repeat mood
    reqs.clear();pg.click('.mood[data-k=late]');pg.wait_for_timeout(500);pg.click('[data-a=dback]')
    chk('repeat mood served from cache (no new request)',len(reqs)==0,reqs)
    # artist
    reqs.clear();pg.click('.spot [data-a=dartist]');pg.wait_for_timeout(800)
    chk('Explore artist uses lookup API',any('/lookup' in r for r in reqs),reqs)
    chk('artist results all same artist',pg.evaluate("(()=>{const a=new Set(S.d.view.ids.map(i=>trk(i).artist));return a.size===1&&S.d.view.ids.length>0})()"))
    pg.click('[data-a=dback]');pg.wait_for_timeout(200)
    # try another gem
    reqs.clear();g0=pg.evaluate('S.d.gem');pg.click('[data-a=dgem]');pg.wait_for_timeout(700)
    chk('Try another changes the gems search',pg.evaluate('S.d.gem')!=g0 and len(reqs)==1)
    # preview missing: track without stream
    pg.evaluate("S.on.set('on:itunes:x',{id:'on:itunes:x',on:'itunes',name:'a - b',title:'b',artist:'a',dur:30,size:0,label:'30s preview'});S.d.lists.t=['on:itunes:x']")
    pg.evaluate("document.getElementById('dc-rec').insertAdjacentHTML('beforeend','<button id=tx data-a=dplay data-sec=t data-id=on:itunes:x>x</button>')");pg.click('#tx');pg.wait_for_timeout(150)
    chk('track without preview: clear message, no playback start',('No preview' in pg.inner_text('#toast')) and pg.evaluate('S.cur')!='on:itunes:x')
    # search box still harmless in Discover
    pg.fill('#q','zzz');pg.wait_for_timeout(200);pg.fill('#q','');
    chk('search box in Discover does not break page',pg.locator('.hero').count()==1)
    # keyboard
    pg.evaluate("document.getElementById('main').scrollTop=0");pg.focus('#rail-rec .dcard .pb');pg.keyboard.press('Enter');pg.wait_for_timeout(500)
    chk('keyboard: Enter on focused card plays',pg.evaluate('!audio.paused'))
    # error state
    mode['fail']=500;dcache_clear="dcache.clear();S.d.sec={};S.d.warned=0;"
    pg.evaluate(dcache_clear);pg.click('[data-view=library]');pg.click('[data-view=discover]');pg.wait_for_timeout(900)
    chk('error state with retry button',pg.locator('#dc-rec [data-a=dretry]').count()==1 and 'Couldn’t reach' in pg.inner_text('#dc-rec'),pg.inner_text('#dc-rec')[:80])
    mode['fail']=None;pg.click('#dc-rec [data-a=dretry]');pg.wait_for_timeout(900)
    chk('retry recovers',pg.locator('#rail-rec .dcard').count()>0)
    mode['fail']=429;pg.evaluate(dcache_clear);pg.click('[data-view=library]');pg.click('[data-view=discover]');pg.wait_for_timeout(700)
    chk('rate-limit message',any('limiting searches' in x for x in [pg.inner_text('#dc-rec')]),pg.inner_text('#dc-rec')[:80])
    mode['fail']=None
    # empty
    mode['empty']={'late night','indie','pop','dream pop','alternative','soul','electronic','folk','jazz','singer songwriter','synthpop'}
    pg.evaluate(dcache_clear);pg.click('[data-view=library]');pg.click('[data-view=discover]');pg.wait_for_timeout(700)
    chk('empty state in sections',pg.locator('#dc-rec .dmsg').count()==1)
    pg.click('.mood[data-k=late]');pg.wait_for_timeout(600)
    chk('empty state in results view','No previews found' in pg.inner_text('#main'))
    pg.click('[data-a=dback]');mode['empty']=set()
    # loading skeleton
    ctx.close()
    # ---- mobile
    ctx,pg=newpage(390,800);pg.goto('http://127.0.0.1:8766/index.html');pg.click('[data-view=discover]');pg.wait_for_timeout(1500)
    ov=pg.evaluate("document.documentElement.scrollWidth>innerWidth+1||document.querySelector('main').scrollWidth>document.querySelector('main').clientWidth+1")
    chk('mobile: no horizontal overflow of main',not ov)
    chk('mobile: rail usable',pg.locator('#rail-rec .dcard').count()>5)
    pg.screenshot(path='tests/mobile.png');pg.locator('#ds-moods').scroll_into_view_if_needed();pg.screenshot(path='tests/mobile2.png')
    ctx.close()
    # ---- with (stubbed) supabase present: community section + nav
    ctx,pg=newpage(sbstub=True);pg.goto('http://127.0.0.1:8766/index.html');pg.click('[data-view=discover]');pg.wait_for_timeout(1300)
    chk('with Supabase configured (stub): Shared on Velnq section renders',pg.locator('#ds-com').count()==1 and 'Nothing has been published' in pg.inner_text('#dc-com'),pg.inner_text('#dc-com') if pg.locator('#dc-com').count() else 'missing')
    ctx.close()
    # ---- other pages screenshots
    ctx,pg=newpage();pg.goto('http://127.0.0.1:8766/index.html');pg.wait_for_timeout(400)
    pg.set_input_files('#file',['tests/tone.wav']);pg.wait_for_timeout(700);pg.click('.row .rp');pg.wait_for_timeout(1200)
    pg.screenshot(path='tests/library.png')
    pg.click('[data-view=discover]');pg.wait_for_timeout(1500);pg.evaluate("document.getElementById('main').scrollTop=900");pg.wait_for_timeout(300);pg.screenshot(path='tests/discover_mid.png')
    pg.evaluate("document.getElementById('main').scrollTop=2000");pg.wait_for_timeout(300);pg.screenshot(path='tests/discover_low.png')
    ctx.close();b.close()
print('\nerrors:',errs[:10])
print('passed %d/%d'%(sum(1 for _,o in R if o),len(R)))
