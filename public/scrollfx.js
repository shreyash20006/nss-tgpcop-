/* NSS TGPCOP – descent-scroll layer. Native scroll stays in charge (sticky header, modals, camera, tables keep working). */
(()=>{
if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;
const D=document,R=D.documentElement,$=(s,r=D)=>[...r.querySelectorAll(s)];
const admin=!!D.querySelector('.nss-admin-header'),verify=!!D.querySelector('.nss-scanner-wrapper'),home=!!D.querySelector('.nss-hero');
const fine=matchMedia('(pointer:fine)').matches,small=innerWidth<768;
const go=()=>{
R.classList.add('sfx');
let cur=scrollY,tgt=scrollY,active=false,mx=innerWidth/2,my=innerHeight/2,lx=mx,ly=my,T=0;
const max=()=>Math.max(0,R.scrollHeight-innerHeight);
/* progress bar */
const bar=D.createElement('div');bar.className='sfx-bar';D.body.appendChild(bar);
/* lamp */
let lamp=null;if(fine&&!admin&&!verify){lamp=D.createElement('div');lamp.className='sfx-lamp';D.body.appendChild(lamp);addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY},{passive:true})}
/* ambient canvas */
let cv=null,cx,W,H,P=[];
/* The standalone cinematic homepage already owns a full-screen canvas. Avoid painting a second one over it. */
if(!admin&&!verify&&!D.getElementById('fx')){cv=D.createElement('canvas');cv.className='sfx-fx';D.body.appendChild(cv);cx=cv.getContext('2d');
const fit=()=>{const d=Math.min(devicePixelRatio||1,small?1:1.25);W=innerWidth;H=innerHeight;cv.width=W*d;cv.height=H*d;cx.setTransform(d,0,0,d,0,0)};fit();addEventListener('resize',fit);
P=Array.from({length:home?(small?12:42):(small?8:24)},(_,i)=>({x:Math.random(),y:Math.random(),z:.3+Math.random()*1.2,r:.8+Math.random()*2,ph:Math.random()*6.28,leaf:i%9===0,ox:0,oy:0}))}
const draw=(t,dt)=>{if(!cv)return;cx.clearRect(0,0,W,H);
for(const p of P){const px=p.x*W+Math.sin(t*.6+p.ph)*18*p.z,py=((p.y*H-t*12*p.z-scrollY*.3*p.z)%H+H)%H;
const dx=px-mx,dy=py-my,d=Math.hypot(dx,dy)||1;let tx=0,ty=0;if(fine&&d<170){const f=Math.pow(1-d/170,1.5)*60;tx=dx/d*f;ty=dy/d*f}
p.ox+=(tx-p.ox)*(1-Math.exp(-3*dt));p.oy+=(ty-p.oy)*(1-Math.exp(-3*dt));
const a=.12+.3*Math.abs(Math.sin(t*1.5+p.ph));cx.fillStyle=p.leaf?`rgba(255,212,0,${a+.1})`:`rgba(120,170,255,${a})`;cx.beginPath();
if(p.leaf)cx.ellipse(px+p.ox,py+p.oy,5*p.z,2.2*p.z,t*.5+p.ph,0,6.28);else cx.arc(px+p.ox,py+p.oy,p.r*p.z,0,6.28);cx.fill()}};
/* hero intro + parallax (home) */
let hero=null,hc=null,hbg=null,title=null;
if(home){hero=D.querySelector('.nss-hero');hc=hero.querySelector('.nss-hero-content');hbg=hero.querySelector('.nss-hero-bg-art');title=hero.querySelector('.nss-hero-title');
if(title){const txt=title.textContent.trim();title.textContent='';title.setAttribute('aria-label',txt);const wrap=D.createElement('span');wrap.className='sfx-t';wrap.setAttribute('aria-hidden','true');let n=0;
txt.split(' ').forEach((w,k,a)=>{const ws=D.createElement('span');ws.className='sfx-w';[...w].forEach(ch=>{const c=D.createElement('span');c.className='sfx-c';c.style.setProperty('--i',n++);c.textContent=ch;ws.appendChild(c)});wrap.appendChild(ws);if(k<a.length-1)wrap.appendChild(D.createTextNode(' '))});title.appendChild(wrap)}
const sub=hero.querySelector('.nss-hero-subtitle');if(sub)sub.classList.add('sfx-hide-sub');
['.nss-badge-pill','.nss-hero-description','.nss-hero-actions','.nss-scroll-indicator'].forEach((s,i)=>{const e=hero.querySelector(s);if(e){e.classList.add('sfx-rise');e.style.setProperty('--i',i)}});
if(hbg&&hbg.animate)hbg.animate([{scale:1.09},{scale:1}],{duration:2600,easing:'cubic-bezier(.2,.8,.2,1)'});
requestAnimationFrame(()=>requestAnimationFrame(()=>hero.classList.add('sfx-go')))}
/* heading line masks */
const lines=admin?[]:$('main h1,.nss-reg-hero h1,.nss-section-title,.nss-eyebrow,.nss-section-subtitle').filter(e=>!e.closest('.nss-hero,.nss-drawer,header,footer,[class*="modal"]')&&!e.querySelector('input,select,textarea,button,a'));
lines.forEach(e=>{e.innerHTML='<span class="sfx-ln"><span>'+e.innerHTML+'</span></span>'});
/* cards */
const sel=admin?'.nss-stat-card':'.nss-card,.nss-form-card,.nss-status-card,.nss-id-card-wrapper,.nss-scanner-wrapper,[class*="nss-"][class*="-card"],.nss-container [class*="grid"]>*';
let cards=$(sel).filter(e=>!e.closest('.nss-drawer,header,footer,[class*="modal"],.nss-hero'));
cards=cards.filter(e=>!cards.some(o=>o!==e&&o.contains(e)));
const pend=[];
const io=new IntersectionObserver(es=>{const vis=es.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top||a.boundingClientRect.left-b.boundingClientRect.left);
vis.forEach((e,i)=>{const t=e.target;io.unobserve(t);t.style.setProperty('--d',(i*90)+'ms');
if(t.classList.contains('sfx-card')){requestAnimationFrame(()=>t.classList.add('sfx-in'));setTimeout(()=>t.classList.remove('sfx-card','sfx-in'),1400+i*90);setTimeout(()=>{t.style.removeProperty('--d')},1500+i*90)}
else{t.classList.add('sfx-in')}})},{threshold:.12,rootMargin:'0px 0px -8% 0px'});
lines.forEach((e,i)=>{const ln=e.firstElementChild;ln.classList.add('sfx-ln-host');io.observe(ln)});
cards.forEach(c=>{c.classList.add('sfx-card');io.observe(c)});
/* seams between sections + before footer */
if(home){$('main .nss-section,.nss-footer').forEach(s=>{const bg=getComputedStyle(s).backgroundColor;if(!bg||bg==='rgba(0, 0, 0, 0)')return;
const v=D.createElement('div');v.className='sfx-seam';v.setAttribute('aria-hidden','true');
const a=Math.random()>.5;const e=a?'M0 92V46C240 6 480 78 720 42S1200 8 1440 48V92Z':'M0 92V44C260 84 500 10 760 46S1190 78 1440 40V92Z';
const ed=e.replace(/V92Z$/,'').replace(/^M0 92V/,'M0 ');
v.innerHTML='<svg viewBox="0 0 1440 92" preserveAspectRatio="none"><path d="'+e+'" fill="'+bg+'"/><path class="l" d="'+ed+'"/><path class="d" d="'+ed.replace(/^M0 (\d+)/,(m,y)=>'M0 '+(+y+12))+'"/></svg>';
s.insertBefore(v,s.firstChild)})}
/* smooth wheel (home only; native scroll otherwise) */
const smooth=home&&fine;
if(smooth){R.classList.add('sfx-smooth');
const inner=(el,dy)=>{for(;el&&el!==D.body&&el!==R;el=el.parentElement){const o=getComputedStyle(el).overflowY;if((o==='auto'||o==='scroll')&&el.scrollHeight>el.clientHeight+1){if(dy<0&&el.scrollTop>0)return true;if(dy>0&&el.scrollTop+el.clientHeight<el.scrollHeight-1)return true}}return false};
addEventListener('wheel',e=>{if(e.ctrlKey||e.defaultPrevented||getComputedStyle(D.body).overflow==='hidden'||inner(e.target,e.deltaY))return;e.preventDefault();
if(!active){cur=tgt=scrollY}let d=e.deltaY;if(e.deltaMode===1)d*=32;else if(e.deltaMode===2)d*=innerHeight;tgt=Math.max(0,Math.min(max(),tgt+d));active=true},{passive:false});
addEventListener('scroll',()=>{if(!active)cur=tgt=scrollY},{passive:true})}
/* loop */
let last=performance.now(),framePending=false;
const needsFrame=()=>!!(cv||lamp||smooth||hero);
const updateBar=()=>{const y=scrollY;bar.style.transform='scaleX('+(y/Math.max(1,max()))+')'};
const scheduleFrame=()=>{if(!framePending&&!document.hidden&&needsFrame()){framePending=true;requestAnimationFrame(frame)}};
const frame=now=>{framePending=false;if(document.hidden)return;if(small&&now-last<32){scheduleFrame();return}const dt=Math.min(.05,(now-last)/1000);last=now;T+=dt;
if(active){cur+=(tgt-cur)*(1-Math.exp(-7.5*dt));if(Math.abs(tgt-cur)<.5){cur=tgt;active=false}scrollTo(0,cur)}
const y=scrollY;updateBar();
if(hero&&y<innerHeight*1.4){const hp=Math.min(1,y/Math.max(1,hero.offsetHeight));hc.style.translate='0 '+(y*.3)+'px';if(hbg)hbg.style.translate='0 '+(y*.12)+'px';if(title)title.style.letterSpacing=(.02+hp*.14)+'em'}
if(lamp){lx+=(mx-lx)*(1-Math.exp(-10*dt));ly+=(my-ly)*(1-Math.exp(-10*dt));lamp.style.transform='translate3d('+lx+'px,'+ly+'px,0)'}
draw(T,dt);scheduleFrame()};
updateBar();
addEventListener('scroll',()=>{if(!active)cur=tgt=scrollY;updateBar();scheduleFrame()},{passive:true});
addEventListener('resize',()=>{updateBar();scheduleFrame()},{passive:true});
D.addEventListener('visibilitychange',()=>{if(!D.hidden){last=performance.now();scheduleFrame()}});
scheduleFrame();
};
if(D.readyState==='loading')D.addEventListener('DOMContentLoaded',go);else go();
})();
