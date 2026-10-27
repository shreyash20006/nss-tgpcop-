/* ===== ECHO.TGPCOP shared script: navbar, footer, animations, Supabase Google login, Wall of Love, Instagram strip ===== */
const ENV = (typeof window !== 'undefined' && window.__ENV__) || {};
const C={
  URL: ENV.SUPABASE_URL || '',
  KEY: ENV.SUPABASE_ANON_KEY || '',
  LOGO: ENV.CLOUDINARY_LOGO_URL || 'echo_logo_white_transparent.png',
  IG: 'https://instagram.com/echo.tgpcop',
  MAIL: 'Media@tgpcop.site'
};
const IGP=[/* {i:'IMAGE_URL',u:'https://instagram.com/p/POST_ID'} */];
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
var sb=null, _echoIo;
function shell(){
 if(document.body && (document.body.classList.contains('nss-page') || document.querySelector('.nss-header') || document.querySelector('.nss-footer'))) return;
 if(!$('#fl')) document.body.insertAdjacentHTML('afterbegin','<div id="fl"></div>');
 if(!$('#lb')) document.body.insertAdjacentHTML('beforeend','<div id="lb"></div>');
 const n=$('#nav');
 if(n){
  n.innerHTML=`<div class="marq"><div id="mq"></div></div><nav><div class="wrap"><a href="index.html"><img src="${C.LOGO}" alt="Echo TGPCOP Media"></a><button id="menu" aria-label="Menu">☰</button><div class="links" id="links"><a href="index.html">Home</a><a href="index.html#about">About</a><a href="events.html">Events</a><a href="showcase.html">Showcase</a><a href="index.html#work">Work</a><a href="team.html">Team</a><a href="collab.html">Collab</a><span id="auth"><a class="btn o sm" href="login.html">Login</a></span><a class="btn" href="${C.IG}" target="_blank" rel="noopener">Follow Us</a></div></div></nav>`;
  const m=$('#mq');if(m)m.innerHTML='<span>ECHO.TGPCOP</span><span>•</span><span>CAMPUS MEDIA</span><span>•</span>'.repeat(16);
  const L=$('#links');$('#menu')?.addEventListener('click',()=>L.classList.toggle('on'));L?.addEventListener('click',e=>{if(e.target.tagName=='A')L.classList.remove('on')});
 }
 const f=$('#foot');
 if(f)f.innerHTML=`<footer><div class="wrap"><img src="${C.LOGO}" alt=""><p><b>Capturing Campus. Creating Memories.</b></p><p>Events • Reels • Photography • Creatives</p><p class="soc"><a href="mailto:${C.MAIL}">${C.MAIL}</a> | <a href="${C.IG}" target="_blank" rel="noopener">@echo.tgpcop</a></p><p style="margin-top:14px;font-size:13px"><a href="privacy.html" style="text-decoration:underline">Privacy Policy</a> &nbsp;•&nbsp; <a href="terms.html" style="text-decoration:underline">Terms of Service</a></p><p style="opacity:.7;font-size:13px;margin-top:6px">© 2026 Echo.TGPCOP | Campus Media</p></div></footer>`;
}
function cnt(el){const to=+el.dataset.n,s=el.dataset.s||'+';let t0;const f=ts=>{t0=t0||ts;const p=Math.min((ts-t0)/1400,1);el.textContent=Math.round(to*p).toLocaleString()+(p==1?s:'');if(p<1)requestAnimationFrame(f)};requestAnimationFrame(f)}
function rv(root=document){
 if(typeof IntersectionObserver !== 'undefined' && _echoIo){
  $$('.rv:not(.in)',root).forEach(e=>_echoIo.observe(e));
 }
 $$('.tilt',root).forEach(c=>{c.onmousemove=e=>{const r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;c.style.transform=`perspective(700px) rotateY(${x*16}deg) rotateX(${-y*16}deg) scale(1.03)`};c.onmouseleave=()=>c.style.transform=''});
}
function fx(){
 if(typeof IntersectionObserver !== 'undefined'){
  _echoIo=new IntersectionObserver(es=>es.forEach(x=>{if(x.isIntersecting){x.target.classList.add('in');_echoIo.unobserve(x.target);$$('[data-n]',x.target).forEach(cnt)}}),{threshold:.15});
 }
 rv();
}
window.LB=h=>{const l=$('#lb');if(l){l.innerHTML=h;l.classList.add('on');}};
document.addEventListener('click',e=>{const l=$('#lb');if(l&&l.classList.contains('on')&&e.target===l){l.classList.remove('on');l.innerHTML=''}});
/* ---- Supabase + Google login ---- */
function paint(u){window.USER=u||null;const a=$('#auth');
 if(a)a.innerHTML=u?`<img class="av" src="${esc(u.user_metadata?.avatar_url||'')}" alt=""><button class="btn o sm" id="out">Logout</button>`:`<a class="btn o sm" href="login.html">Login</a>`;
 $('#out')?.addEventListener('click',()=>sb?.auth.signOut());document.dispatchEvent(new Event('echo-auth'))}
window.signIn=()=>sb?sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:new URL('index.html',location.href).href}}):alert('Setup pending: add Supabase keys in Vercel Environment Variables');
window.getSB=()=>sb;
window.ready=new Promise(res=>{
 if(!C.URL.startsWith('http')){paint(null);return res()}
 const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
 s.onload=async()=>{
  try {
   sb=supabase.createClient(C.URL,C.KEY);
   const{data}=await sb.auth.getSession();
   paint(data.session?.user);
   sb.auth.onAuthStateChange((_,x)=>paint(x?.user));
  } catch(err) {
   console.warn('Supabase init error:', err);
   paint(null);
  }
  res();
 };
 s.onerror=()=>{paint(null);res()};document.head.appendChild(s)});
/* ---- Wall of Love ---- */
const SAMPLE=[{name:'Campus Student',role:'Student',text:'Echo captures every fest so perfectly. The photos are always the best part of the day!'},{name:'Faculty Member',role:'Teacher',text:'Professional, creative and always on time. Proud of this student team.'},{name:'Club Member',role:'Student',text:'Their reels make our events go viral on campus. Love the Echo style!'}];
async function love(){const g=$('#lv');if(!g)return;await ready;let d=[];
 if(sb){const r=await sb.from('reviews').select('name,avatar,role,text').eq('approved',true).order('created_at',{ascending:false}).limit(12);d=r.data||[]}
 if(!d.length)d=SAMPLE;
 g.innerHTML=d.map((r,i)=>`<div class="lv rv" style="--r:${i%2?2:-2}deg"><p>“${esc(r.text)}”</p><div class="who">${r.avatar?`<img class="av" src="${esc(r.avatar)}" alt="">`:'<span class="av">💙</span>'}<div><b>${esc(r.name)}</b><small>${esc(r.role||'')}</small></div></div></div>`).join('');rv(g);
 const f=$('#lf');if(!f)return;
 const draw=()=>{f.innerHTML=window.USER?`<select id="lr"><option>Student</option><option>Teacher</option><option>Alumni</option><option>Other</option></select><textarea id="lt" maxlength="240" placeholder="Write a short review (max 240 characters)"></textarea><button class="btn" id="ls">Post Review</button><small id="lm"></small>`:`<a class="btn" href="login.html">Login with Google to write a review</a>`;
  $('#ls')?.addEventListener('click',async()=>{const t=$('#lt').value.trim();if(t.length<5||!sb)return;const u=window.USER,{error}=await sb.from('reviews').insert({user_id:u.id,name:u.user_metadata.full_name,avatar:u.user_metadata.avatar_url,role:$('#lr').value,text:t});$('#lm').textContent=error?'Could not post. Try again.':'Thanks! Your review will appear after approval.';if(!error)$('#lt').value=''})};
 draw();document.addEventListener('echo-auth',draw)}
/* ---- Instagram strip (manual posts, edit IGP above) ---- */
function ig(){const g=$('#igs');if(!g)return;const d=IGP.length?IGP:Array.from({length:6},()=>({}));
 const h=d.map(p=>`<a class="igt" href="${esc(p.u||C.IG)}" target="_blank" rel="noopener" ${p.i?`style="background-image:url('${esc(p.i)}')"`:''}>${p.i?'':'@echo.tgpcop'}</a>`).join('');g.innerHTML=`<div class="igr">${h+h}</div>`}

/* ---- Scroll shatter logo hero: <div data-shatter data-title="Our<br>Events" data-sub="..." data-skip="#login"></div> ---- */
function shatterInit(){
 const host=$('[data-shatter]');if(!host)return;
 const title=host.dataset.title||'Echo.<br>TGPCOP',sub=host.dataset.sub||'',skip=host.dataset.skip;
 host.className='shatter';host.id='shatter';
 host.innerHTML=`<div class="stage" id="stage"><div class="stage-text" id="stageText"><h2>${title}</h2>${sub?`<p>${sub}</p>`:''}</div><div class="logo-box" id="logoBox"></div><div class="hint" id="hint">Scroll<b>↓</b>${skip?`<a href="${skip}">Skip intro</a>`:''}</div></div>`;
 const wrap=host,stage=$('#stage'),box=$('#logoBox'),txt=$('#stageText'),hint=$('#hint'),src=new URL(C.LOGO,location.href).href;
 box.style.setProperty('--logo',`url("${src}")`);
 if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;
 const CN=8,RN=7,tiles=[],rnd=i=>{const x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x)};
 for(let r=0;r<RN;r++)for(let c=0;c<CN;c++){
  const t=document.createElement('div'),i=r*CN+c;t.className='tile';
  t.style.cssText=`left:${c*100/CN}%;top:${r*100/RN}%;width:calc(${100/CN}% + 1px);height:calc(${100/RN}% + 1px);background-size:${CN*100}% ${RN*100}%;background-position:${c/(CN-1)*100}% ${r/(RN-1)*100}%`;
  box.appendChild(t);const cx=(c+.5)/CN-.5,cy=(r+.5)/RN-.5;
  tiles.push({el:t,cx,cy,rx:rnd(i+1)-.5,ry:rnd(i+50)-.5,rot:rnd(i+99)-.5,d:Math.hypot(cx,cy)*.35+rnd(i+7)*.12});
 }
 const sm=x=>{x=x<0?0:x>1?1:x;return x*x*(3-2*x)};
 const render=()=>{
  const rect=wrap.getBoundingClientRect(),total=wrap.offsetHeight-stage.offsetHeight,p=Math.max(0,Math.min(1,(72-rect.top)/total)),k=box.offsetWidth/560;
  for(const t of tiles){
   const e=sm((p-.03-t.d*.3)/.6),tx=(t.cx*1400+t.rx*500)*e*k,ty=(t.cy*1000+t.ry*400)*e*k+e*e*420*k;
   t.el.style.transform=`translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0) rotate(${(t.rot*760*e).toFixed(1)}deg) scale(${(1-.45*e).toFixed(3)})`;
   t.el.style.opacity=(1-sm((e-.5)/.5)).toFixed(3);
  }
  txt.style.opacity=sm((p-.55)/.3);txt.style.transform=`scale(${.9+.1*sm((p-.55)/.3)})`;
  hint.style.opacity=Math.max(0,1-p*8);
 };
 let busy=false;const req=()=>{if(!busy){busy=true;requestAnimationFrame(()=>{busy=false;render()})}};
 addEventListener('scroll',req,{passive:true});addEventListener('resize',req);render();
}
/* ---- Scroll progress bar (all pages) ---- */
function sprog(){
 if(matchMedia('(prefers-reduced-motion:reduce)').matches||$('.sprog'))return;
 document.body.insertAdjacentHTML('beforeend','<div class="sprog"></div>');const b=$('.sprog');
 const u=()=>{const h=document.documentElement.scrollHeight-innerHeight;b.style.transform=`scaleX(${h>0?Math.min(1,scrollY/h):0})`};
 addEventListener('scroll',u,{passive:true});addEventListener('resize',u);u();
}
shell();fx();love();ig();shatterInit();sprog();
