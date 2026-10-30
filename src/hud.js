import {$} from './shared.js';
import {SFX} from './sfx.js';
import {Lofi} from './lofi.js';
import {createYTMusic} from './music-yt.js';
import {mountYtUi} from './ui/music-ui.js';
import {ic, paintIcons} from './ui/icons.js';
import {Notify} from './ui/notify.js';
// ===== HUD / UI mới (kiểu game) =====
(function buildHUD(){
  const $=id=>document.getElementById(id),V=()=>window.VY;
  const toast=m=>{const t=$('toast');t.textContent=m;t.style.opacity=1;clearTimeout(toast._t);toast._t=setTimeout(()=>t.style.opacity=0,1800)};
  // icon thời tiết (SVG, tên trong ui/icons.js) — dùng cho đồng hồ; emoji chỉ còn dùng ở chip chọn thời tiết trong Cài đặt
  const WI={clear:'☀️',cloudy:'🌤️',overcast:'☁️',drizzle:'🌦️','light rain':'🌦️',rain:'🌧️','heavy rain':'🌧️',storm:'⛈️',snow:'🌨️',blizzard:'❄️',fog:'🌫️',windy:'🍃'};
  const WSVG={clear:'w_clear',cloudy:'w_cloudy',overcast:'w_overcast',drizzle:'w_drizzle','light rain':'w_drizzle',rain:'w_rain','heavy rain':'w_heavy',storm:'w_storm',snow:'w_snow',blizzard:'w_blizzard',fog:'w_fog',windy:'w_wind'};
  paintIcons(document);
  const WV={clear:'Trời quang',cloudy:'Ít mây',overcast:'Nhiều mây',drizzle:'Mưa phùn','light rain':'Mưa nhẹ',rain:'Mưa','heavy rain':'Mưa lớn',storm:'Giông bão',snow:'Tuyết',blizzard:'Bão tuyết',fog:'Sương mù',windy:'Gió lớn'};
  const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}},load=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}};
  // --- settings DOM: chuyển panel cũ vào "Nâng cao" + điều khiển cũ vào "Điều khiển"
  const tp=$('tp');$('sAdv').appendChild(tp);
  const ctl=$('sCtl');['sW','sR','sWA','sRA','cCol'].forEach(id=>{const e=$(id);if(e&&e.parentElement&&e.parentElement.tagName==='LABEL')ctl.appendChild(e.parentElement)});
  $('iSet').onclick=()=>$('hSet').classList.add('on');$('sX').onclick=()=>$('hSet').classList.remove('on');$('hSet').onclick=e=>{if(e.target.id==='hSet')$('hSet').classList.remove('on')};

  {const MAPID=window.MAPID,MI={studio:['building','Studio (cũ)','Gác lửng 1 cầu thang, vườn cây'],house:['home','Nhà 2 tầng (mới)','2 cầu thang, giường & bàn làm việc']};
   $('mpList').innerHTML=Object.keys(MI).map(k=>`<div class="mapc${k===MAPID?' cur':''}" data-m="${k}"><span class="ic">${ic(MI[k][0])}</span><div><b>${MI[k][1]}${k===MAPID?' · đang ở':''}</b><small>${MI[k][2]}</small></div></div>`).join('');
   $('iMap').onclick=()=>$('hMap').classList.add('on');$('mX').onclick=()=>$('hMap').classList.remove('on');$('hMap').onclick=e=>{if(e.target.id==='hMap')$('hMap').classList.remove('on')};
   $('mpList').onclick=e=>{const c=e.target.closest('.mapc');if(!c||c.classList.contains('cur'))return;const m=c.dataset.m;$('hMap').classList.remove('on');window.__switchMap&&window.__switchMap(m)}
   $('mpList').onmouseover=e=>{const c=e.target.closest('.mapc');if(c&&window.__prefetchMap)window.__prefetchMap(c.dataset.m)}}
  addEventListener('keydown',e=>{if(e.code==='Escape'){$('hMap').classList.remove('on')}if(e.code==='Escape')$('hSet').classList.remove('on')});
  // --- preset đồ họa
  const GFX={'Tiết kiệm':{quality:'low',post:false,rays:0,motes:0,bloom:0,garden:true},'Cân bằng':{quality:'medium',post:true,rays:0.6,motes:0.5,bloom:0.15},'Đẹp':{quality:'high',post:true,rays:1,motes:1,bloom:0.22},'Điện ảnh':{quality:'high',post:true,rays:1.7,motes:1.6,bloom:0.4,vig:0.3},'Tự động':{quality:'auto',post:true,rays:1,motes:1,bloom:0.22}};
  const gfxCur=load('vyGfx','Tự động');
  function chips(el,items,cur,fn){el.innerHTML='';items.forEach(([k,l])=>{const c=document.createElement('div');c.className='chip'+(k===cur?' on':'');c.textContent=l;c.onclick=()=>{[...el.children].forEach(x=>x.classList.remove('on'));c.classList.add('on');fn(k)};el.appendChild(c)})}
  function syncOld(){try{window.__tpSync&&window.__tpSync()}catch(e){}}
  function setGfx(n){Object.assign(window.TPX,GFX[n]);save('vyGfx',n);syncOld();window.__applyToon()}
  chips($('sGfx'),Object.keys(GFX).map(k=>[k,k]),gfxCur,setGfx);
  if(gfxCur!==load('vyGfxApplied',null)){}
  setGfx(gfxCur);
  chips($('sWea'),Object.keys(WI).map(k=>[k,WI[k]+' '+WV[k]]),window.TPX.weather,k=>{window.TPX.weather=k;syncOld();window.__applyToon();window.__envChanged&&window.__envChanged()});
  chips($('sLook'),Object.keys(window.TOON_PRESETS).map(k=>[k,k]),null,k=>{const keep={quality:window.TPX.quality,post:window.TPX.post};Object.assign(window.TPX,window.TOON_DEF,window.TOON_PRESETS[k],keep);syncOld();window.__applyToon();$('sWea').querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c.textContent.slice(2).trim()===WV[window.TPX.weather]))});
  const sT=$('sTime');sT.value=window.TPX.time;$('sTimeV').textContent=fmt(window.TPX.time);
  function fmt(h){h=((h%24)+24)%24;const H=Math.floor(h),M=Math.floor((h-H)*60);return String(H).padStart(2,'0')+':'+String(M).padStart(2,'0')}
  sT.oninput=()=>{window.TPX.time=+sT.value;window.__syncTime&&window.__syncTime();window.__applyToon(false);window.__envChanged&&window.__envChanged()};
  $('sAuto').checked=!!window.TPX.auto;$('sAuto').onchange=e=>{window.TPX.auto=e.target.checked;syncOld();window.__applyToon();window.__envChanged&&window.__envChanged()};
  // --- đồng hồ
  const days=['Chủ nhật','Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy'];
  // Giờ thật theo múi giờ chọn (mặc định Hà Nội). Thời tiết vẫn đổi tự do. Tắt "Giờ thật" => quay về giờ chỉnh tay như cũ.
  const TZS=[['Asia/Ho_Chi_Minh','Hà Nội / TP.HCM (UTC+7)'],['Asia/Bangkok','Bangkok (UTC+7)'],['Asia/Singapore','Singapore (UTC+8)'],['Asia/Tokyo','Tokyo (UTC+9)'],['Asia/Seoul','Seoul (UTC+9)'],['Australia/Sydney','Sydney'],['Asia/Kolkata','Ấn Độ (UTC+5:30)'],['Europe/Moscow','Moscow (UTC+3)'],['Europe/Paris','Paris / Berlin'],['Europe/London','London'],['UTC','UTC'],['America/New_York','New York'],['America/Chicago','Chicago'],['America/Los_Angeles','Los Angeles']];
  let tz=load('vyTz','Asia/Ho_Chi_Minh');if(!TZS.some(x=>x[0]===tz))tz='Asia/Ho_Chi_Minh';
  let real=load('vyReal',true)!==false;window.__realTime=real;
  const sTz=$('sTz');sTz.innerHTML=TZS.map(([k,l])=>`<option value="${k}"${k===tz?' selected':''}>${l}</option>`).join('');
  const dtf=z=>{try{return new Intl.DateTimeFormat('en-GB',{timeZone:z,hour:'numeric',minute:'numeric',second:'numeric',hourCycle:'h23',weekday:'short',day:'numeric',month:'numeric',year:'numeric'})}catch(e){return null}};
  let F=dtf(tz);
  function nowIn(){const o={};const d=new Date();if(F)F.formatToParts(d).forEach(p=>o[p.type]=p.value);else{o.hour=d.getHours();o.minute=d.getMinutes();o.second=d.getSeconds();o.weekday=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];o.day=d.getDate();o.month=d.getMonth()+1;o.year=d.getFullYear()}
    return {h:(+o.hour%24)+(+o.minute)/60+(+o.second)/3600,wd:{Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[o.weekday]||0,day:o.day,mon:o.month,yr:o.year}}
  function setReal(v){real=!!v;window.__realTime=real;save('vyReal',real);if(real){window.TPX.auto=false;syncOld();window.__applyToon&&window.__applyToon(false)}sT.disabled=real;$('sAuto').disabled=real;$('sReal').checked=real;clk()}
  $('sReal').onchange=e=>setReal(e.target.checked);
  sTz.onchange=e=>{tz=e.target.value;save('vyTz',tz);F=dtf(tz);clk()};
  function clk(){const T=window.TPX,N=nowIn();if(real&&T.auto)T.auto=false;if(real&&Math.abs(T.time-N.h)>1e-4){T.time=N.h;window.__syncTime&&window.__syncTime()}
    const shown=real?N.h:T.time;$('cT').textContent=fmt(shown);$('cDw').textContent=days[N.wd];$('cDd').textContent=String(N.day).padStart(2,'0')+'/'+String(N.mon).padStart(2,'0')+'/'+N.yr;$('cWt').textContent=WV[T.weather]||'';
    const night=T.time<5.5||T.time>19.3;const wk=T.weather==='clear'?(night?'w_night':'w_clear'):(WSVG[T.weather]||'w_clear');if($('cW').dataset.w!==wk){$('cW').dataset.w=wk;$('cW').innerHTML=ic(wk)}
    if(document.activeElement!==sT){sT.value=T.time;$('sTimeV').textContent=fmt(T.time)}if(!real)$('sAuto').checked=!!T.auto}
  setInterval(clk,1000);setReal(real);
  // --- hồ sơ: bấm đổi nhân vật
  const LS=()=>window.LOCAL_SLOT||'vy';
  function prof(){const bin=LS()==='bin';$('pNm').textContent=bin?'Bin':'Vy';$('pAv').src=bin?'assets/ui/avatars/bin.v1.png':'assets/ui/avatars/vy.v1.png';$('pLv').textContent='Lv.12'}
  prof();
  // --- thu gọn / mở rộng (nhớ lại; màn nhỏ mặc định thu gọn)
  const compact=()=>matchMedia('(max-width:1180px),(max-height:640px)').matches;
  const ui=load('vyUi',{});const saveUi=()=>save('vyUi',ui);
  const setProf=min=>{$('hProf').classList.toggle('min',min);$('pTog').setAttribute('aria-expanded',String(!min));$('pTog').setAttribute('aria-label',min?'Mở rộng hồ sơ':'Thu gọn hồ sơ');setTimeout(()=>window.dispatchEvent(new Event('resize')),300)};
  setProf(ui.profMin!=null?!!ui.profMin:compact());
  $('pTog').onclick=()=>{const m=!$('hProf').classList.contains('min');ui.profMin=m;saveUi();setProf(m)};
  const setAct=min=>{$('hAct').classList.toggle('min',min);const t=$('aTog');t.setAttribute('aria-expanded',String(!min));t.setAttribute('aria-label',min?'Mở thanh hành động':'Thu gọn thanh hành động')};
  setAct(ui.actMin!=null?!!ui.actMin:false);
  $('aTog').onclick=()=>{const m=!$('hAct').classList.contains('min');ui.actMin=m;saveUi();setAct(m)};
  // --- chỉ số
  const S={hp:98,st:68,fo:72,mo:78};
  function setB(k,id,txt){$('b'+id).style.width=Math.max(2,S[k])+'%';$('v'+id).textContent=txt!=null?txt:Math.round(S[k])}
  setInterval(()=>{const v=V();if(!v)return;const c=v.local;const clip=c.cur?c.cur.getClip().name:'',mode=c.P.mode;const dt=.5;
    const run=/RUN/.test(clip),walk=/WALK/.test(clip),typ=/TYPING/.test(clip),slp=/SLEEP/.test(clip)||mode==='bed';
    S.st=Math.min(100,Math.max(0,S.st+(run?-2.2:walk?-.3:slp?3:.8)*dt));
    S.fo=Math.min(100,Math.max(0,S.fo+(typ?1.2:slp?-.3:-.15)*dt));
    S.mo=Math.min(100,Math.max(10,S.mo+(slp?.5:0)*dt+((window.TPX.weather.includes('rain')||window.TPX.weather==='storm')?-.02:.02)*dt+(Lofi.on?.15:0)*dt));
    S.hp=Math.min(100,S.hp+(slp?.3:0)*dt);
    setB('hp','Hp');setB('st','St');setB('fo','Fo');setB('mo','Mo');
    $('rHp').title='Sức khỏe: '+Math.round(S.hp);$('rSt').title='Thể lực: '+Math.round(S.st);$('rFo').title='Tập trung: '+Math.round(S.fo);$('rMo').title='Tâm trạng: '+(S.mo>70?'Vui':S.mo>40?'Ổn':'Buồn')+' ('+Math.round(S.mo)+')';
    document.querySelectorAll('#hAct .ib').forEach(b=>{const id=b.dataset.a;b.classList.toggle('on',(id==='bRun'&&run)||(id==='bWalk'&&walk)||(id==='bType'&&typ)||(id==='bSit'&&/SITTING_IDLE/.test(clip))||(id==='bSleep'&&slp))});
  },500);
  document.querySelectorAll('#hAct .ib').forEach(b=>b.onclick=()=>{const t=$(b.dataset.a);if(t)t.click()});
  // --- task
  let tasks=load('vyTasks',[{t:'Hoàn thiện storyboard',h:'16:00',d:0},{t:'Render test animation',h:'18:00',d:0},{t:'Chỉnh thiết kế poster',h:'20:00',d:0},{t:'Đọc tài liệu',h:'22:00',d:0},{t:'Uống nước (2L)',h:'15:00',d:1}]);
  function rt(){const L=$('tkList');L.innerHTML='';if(!tasks.length){L.innerHTML='<div class="tk-empty">Chưa có việc nào — bấm + để thêm.</div>';return}tasks.forEach((k,i)=>{const r=document.createElement('div');r.className='tk'+(k.d?' done':'');const c=document.createElement('input');c.type='checkbox';c.checked=!!k.d;c.onchange=()=>{k.d=c.checked?1:0;save('vyTasks',tasks);rt()};
    const s=document.createElement('span');s.textContent=k.t;const e=document.createElement('em');e.textContent=k.h;const u=document.createElement('u');u.innerHTML=ic('x');u.title='Xoá';u.onclick=()=>{SFX.play('del');tasks.splice(i,1);save('vyTasks',tasks);rt()};r.append(c,s,e,u);L.appendChild(r)})}
  rt();
  // panel bên phải: chỉ mở 1 cái một lúc (Việc / Thông báo); trạng thái "Việc" được nhớ
  const setTasks=v=>{$('hTasks').classList.toggle('on',v);$('iTask').classList.toggle('on',v);ui.tasks=v;saveUi();if(v)Notify.close()};
  Notify.init({onOpen:()=>{$('hTasks').classList.remove('on');$('iTask').classList.remove('on')}});
  $('iTask').onclick=()=>setTasks(!$('hTasks').classList.contains('on'));$('tkX').onclick=()=>setTasks(false);
  if(ui.tasks)setTasks(true);
  $('tkPlus').onclick=()=>{const a=$('tkAdd');a.hidden=!a.hidden;if(!a.hidden)$('tkTx').focus()};
  const addT=()=>{const t=$('tkTx').value.trim();if(!t)return;tasks.push({t,h:$('tkTm').value||'--:--',d:0});$('tkTx').value='';save('vyTasks',tasks);rt()};
  $('tkOk').dataset.nosfx='1';$('tkOk').onclick=addT;$('tkTx').onkeydown=e=>{if(e.key==='Enter')addT()};
  // --- chụp ảnh
  $('iCam').onclick=()=>{window.__shot=()=>{const a=document.createElement('a');a.download='vy-bin-'+Date.now()+'.png';a.href=V().renderer.domElement.toDataURL('image/png');a.click();SFX.play('shutter');toast('Đã lưu ảnh')}};
  // --- nhạc: 2 nguồn — Lofi (tạo trong game) và YouTube (phát nhúng + thư viện playlist)
  const T=Lofi.tracks;let playing=false,src=load('vyMusicSrc','lofi')==='yt'?'yt':'lofi';
  let ytUi=null;
  const YTM=createYTMusic({toast,onChange:()=>{ytUi&&ytUi.render();showT()}});
  const showT=()=>{
    if(src==='yt'){const it=YTM.curItem;$('mTt').textContent=YTM.title||'YouTube';$('mSt').textContent='YouTube · '+YTM.lib.pls[YTM.lib.pl].name;$('mPlay').innerHTML=ic(YTM.playing?'pause':'play');$('mCv').classList.add('yt');[...$('mList').children].forEach(d=>d.classList.remove('cur'));return}
    const t=T[Lofi.idx];$('mTt').textContent=t.name;$('mSt').textContent=t.sub+' · '+t.bpm+' BPM';$('mPlay').innerHTML=ic(playing?'pause':'play');$('mCv').classList.remove('yt');[...$('mList').children].forEach((d,i)=>d.classList.toggle('cur',i===Lofi.idx))};
  const stopLofi=async()=>{if(Lofi.on){await Lofi.toggle();playing=false}};
  const useSrc=async s=>{if(s===src)return;src=s;save('vyMusicSrc',s);if(s==='yt')await stopLofi();else YTM.pause();showT()};
  T.forEach((t,i)=>{const d=document.createElement('div');d.textContent=(i+1)+'. '+t.name+' — '+t.sub;d.onclick=async()=>{await useSrc('lofi');Lofi.setTrack(i);if(!playing)await play();showT()};$('mList').appendChild(d)});
  async function play(){if(src==='yt'){const on=await YTM.toggle();SFX.play(on?'musicPlay':'musicPause');showT();return}playing=await Lofi.toggle();SFX.play(playing?'musicPlay':'musicPause');showT()}
  ['mPlay','mNext','mPrev'].forEach(i=>$(i).dataset.nosfx='1');
  $('mPlay').onclick=play;
  $('mNext').onclick=()=>{if(src==='yt')YTM.next();else{Lofi.setTrack(Lofi.idx+1);showT()}};
  $('mPrev').onclick=()=>{if(src==='yt')YTM.prev();else{Lofi.setTrack(Lofi.idx-1);showT()}};
  $('mLs').onclick=()=>{const o=$('hMusic').classList.toggle('open');$('mLs').setAttribute('aria-expanded',String(o))};
  ytUi=mountYtUi(YTM,{onPick:async i=>{await useSrc('yt');await YTM.playAt(i)},onToggleOpen:o=>$('hMusic').classList.toggle('ytopen',o)});
  const yb=$('mYtB');yb.onclick=()=>{ytUi.open();if(ytUi.isOpen&&src!=='yt'&&YTM.lib.pls[YTM.lib.pl].items.length)useSrc('yt')};
  $('mCv').onclick=()=>yb.click();
  const mv=$('mVol'),sv=$('sVolS');mv.value=sv.value=0.5;const setVol=v=>{Lofi.vol(v);YTM.vol(v)};YTM.vol(0.5);mv.oninput=()=>{sv.value=mv.value;setVol(+mv.value)};sv.oninput=()=>{mv.value=sv.value;setVol(+sv.value)};
  showT();
})();
