import {$} from './shared.js';
import {Lofi} from './lofi.js';
// ===== HUD / UI mới (kiểu game) =====
(function buildHUD(){
  const $=id=>document.getElementById(id),V=()=>window.VY;
  const toast=m=>{const t=$('toast');t.textContent=m;t.style.opacity=1;clearTimeout(toast._t);toast._t=setTimeout(()=>t.style.opacity=0,1800)};
  const WI={clear:'☀️',cloudy:'🌤️',overcast:'☁️',drizzle:'🌦️','light rain':'🌦️',rain:'🌧️','heavy rain':'🌧️',storm:'⛈️',snow:'🌨️',blizzard:'❄️',fog:'🌫️',windy:'🍃'};
  const WV={clear:'Trời quang',cloudy:'Ít mây',overcast:'Nhiều mây',drizzle:'Mưa phùn','light rain':'Mưa nhẹ',rain:'Mưa','heavy rain':'Mưa lớn',storm:'Giông bão',snow:'Tuyết',blizzard:'Bão tuyết',fog:'Sương mù',windy:'Gió lớn'};
  const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}},load=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}};
  // --- settings DOM: chuyển panel cũ vào "Nâng cao" + điều khiển cũ vào "Điều khiển"
  const tp=$('tp');$('sAdv').appendChild(tp);
  const ctl=$('sCtl');['sW','sR','sWA','sRA','cCol'].forEach(id=>{const e=$(id);if(e&&e.parentElement&&e.parentElement.tagName==='LABEL')ctl.appendChild(e.parentElement)});
  $('sAdvB').onclick=()=>$('sAdv').classList.toggle('on');
  $('iSet').onclick=()=>$('hSet').classList.add('on');$('sX').onclick=()=>$('hSet').classList.remove('on');$('hSet').onclick=e=>{if(e.target.id==='hSet')$('hSet').classList.remove('on')};

  {const MAPID=window.MAPID,MI={studio:['🏢','Studio (cũ)','Gác lửng 1 cầu thang, vườn cây'],house:['🏠','Nhà 2 tầng (mới)','2 cầu thang, giường & bàn làm việc']};
   $('mpList').innerHTML=Object.keys(MI).map(k=>`<div class="mc${k===MAPID?' cur':''}" data-m="${k}"><span>${MI[k][0]}</span><div><b>${MI[k][1]}${k===MAPID?' · đang ở':''}</b><small>${MI[k][2]}</small></div></div>`).join('');
   $('iMap').onclick=()=>$('hMap').classList.add('on');$('mX').onclick=()=>$('hMap').classList.remove('on');$('hMap').onclick=e=>{if(e.target.id==='hMap')$('hMap').classList.remove('on')};
   $('mpList').onclick=e=>{const c=e.target.closest('.mc');if(!c||c.classList.contains('cur'))return;const m=c.dataset.m;$('hMap').classList.remove('on');window.__switchMap&&window.__switchMap(m)}
   $('mpList').onmouseover=e=>{const c=e.target.closest('.mc');if(c&&window.__prefetchMap)window.__prefetchMap(c.dataset.m)}}
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
  const days=['CN','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'];
  function clk(){const T=window.TPX;$('cT').textContent=fmt(T.time);const d=new Date();$('cD').textContent=days[d.getDay()]+', '+d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear()+' · '+WV[T.weather];
    const night=T.time<5.5||T.time>19.3;$('cW').textContent=T.weather==='clear'?(night?'🌙':'☀️'):WI[T.weather]||'☀️';
    if(document.activeElement!==sT){sT.value=T.time;$('sTimeV').textContent=fmt(T.time)}$('sAuto').checked=!!T.auto}
  setInterval(clk,500);clk();
  // --- hồ sơ: bấm đổi nhân vật
  const LS=()=>window.LOCAL_SLOT||'vy';
  function prof(){const bin=LS()==='bin';$('pNm').textContent=bin?'Bin':'Vy';$('pAv').textContent=bin?'B':'V';$('pLv').textContent='Lv. 12 · đang điều khiển '+(bin?'Bin':'Vy')}
  prof();
  // --- chỉ số
  const S={hp:98,st:68,fo:72,mo:78};
  function setB(k,id,txt){$('b'+id).style.width=Math.max(2,S[k])+'%';$('v'+id).textContent=txt!=null?txt:Math.round(S[k])}
  setInterval(()=>{const v=V();if(!v)return;const c=v.local;const clip=c.cur?c.cur.getClip().name:'',mode=c.P.mode;const dt=.5;
    const run=/RUN/.test(clip),walk=/WALK/.test(clip),typ=/TYPING/.test(clip),slp=/SLEEP/.test(clip)||mode==='bed';
    S.st=Math.min(100,Math.max(0,S.st+(run?-2.2:walk?-.3:slp?3:.8)*dt));
    S.fo=Math.min(100,Math.max(0,S.fo+(typ?1.2:slp?-.3:-.15)*dt));
    S.mo=Math.min(100,Math.max(10,S.mo+(slp?.5:0)*dt+((window.TPX.weather.includes('rain')||window.TPX.weather==='storm')?-.02:.02)*dt+(Lofi.on?.15:0)*dt));
    S.hp=Math.min(100,S.hp+(slp?.3:0)*dt);
    setB('hp','Hp');setB('st','St');setB('fo','Fo');setB('mo','Mo',S.mo>70?'Vui':S.mo>40?'Ổn':'Buồn');
    document.querySelectorAll('#hAct .ib').forEach(b=>{const id=b.dataset.a;b.classList.toggle('on',(id==='bRun'&&run)||(id==='bWalk'&&walk)||(id==='bType'&&typ)||(id==='bSit'&&/SITTING_IDLE/.test(clip))||(id==='bSleep'&&slp))});
  },500);
  document.querySelectorAll('#hAct .ib').forEach(b=>b.onclick=()=>{const t=$(b.dataset.a);if(t)t.click()});
  // --- task
  let tasks=load('vyTasks',[{t:'Hoàn thiện storyboard',h:'16:00',d:0},{t:'Render test animation',h:'18:00',d:0},{t:'Chỉnh thiết kế poster',h:'20:00',d:0},{t:'Đọc tài liệu',h:'22:00',d:0},{t:'Uống nước (2L)',h:'15:00',d:1}]);
  function rt(){const L=$('tkList');L.innerHTML='';tasks.forEach((k,i)=>{const r=document.createElement('div');r.className='tk'+(k.d?' done':'');const c=document.createElement('input');c.type='checkbox';c.checked=!!k.d;c.onchange=()=>{k.d=c.checked?1:0;save('vyTasks',tasks);rt()};
    const s=document.createElement('span');s.textContent=k.t;const e=document.createElement('em');e.textContent=k.h;const u=document.createElement('u');u.textContent='✕';u.onclick=()=>{tasks.splice(i,1);save('vyTasks',tasks);rt()};r.append(c,s,e,u);L.appendChild(r)})}
  rt();$('iTask').onclick=()=>{$('hTasks').classList.toggle('on');$('iTask').classList.toggle('on')};$('hTasks').classList.add('on');$('iTask').classList.add('on');
  $('tkPlus').onclick=()=>{const a=$('tkAdd');a.style.display=a.style.display==='none'?'flex':'none';$('tkTx').focus()};
  const addT=()=>{const t=$('tkTx').value.trim();if(!t)return;tasks.push({t,h:$('tkTm').value||'--:--',d:0});$('tkTx').value='';save('vyTasks',tasks);rt()};
  $('tkOk').onclick=addT;$('tkTx').onkeydown=e=>{if(e.key==='Enter')addT()};
  // --- chụp ảnh
  $('iCam').onclick=()=>{window.__shot=()=>{const a=document.createElement('a');a.download='vy-bin-'+Date.now()+'.png';a.href=V().renderer.domElement.toDataURL('image/png');a.click();toast('Đã lưu ảnh')}};
  // --- nhạc
  const T=Lofi.tracks;let playing=false;
  const showT=()=>{const t=T[Lofi.idx];$('mTt').textContent=t.name;$('mSt').textContent=t.sub+' · '+t.bpm+' BPM';$('mPlay').textContent=playing?'⏸':'▶';[...$('mList').children].forEach((d,i)=>d.classList.toggle('cur',i===Lofi.idx))};
  T.forEach((t,i)=>{const d=document.createElement('div');d.textContent=(i+1)+'. '+t.name+' — '+t.sub;d.onclick=()=>{Lofi.setTrack(i);if(!playing)play();showT()};$('mList').appendChild(d)});
  async function play(){playing=await Lofi.toggle();showT()}
  $('mPlay').onclick=play;$('mNext').onclick=()=>{Lofi.setTrack(Lofi.idx+1);showT()};$('mPrev').onclick=()=>{Lofi.setTrack(Lofi.idx-1);showT()};
  $('mLs').onclick=()=>$('mList').classList.toggle('on');
  const mv=$('mVol'),sv=$('sVolS');mv.value=sv.value=0.5;mv.oninput=()=>{sv.value=mv.value;Lofi.vol(+mv.value)};sv.oninput=()=>{mv.value=sv.value;Lofi.vol(+sv.value)};
  showT();
})();
