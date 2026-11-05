// Test multiplayer 2 client độc lập (2 trang, backend giả lập dev/mock-supabase.js, cùng phòng): A = Bin, B = Vy.
// Mỗi trang tự chạy vòng lặp game không vẽ (?test, tick 60Hz) để đo đúng thời gian thực. Ghi lại vị trí nhân vật của mình và bản sao của đối phương,
// rồi so: bản sao bên B so với nhân vật thật bên A (và ngược lại) — lệch vị trí/độ cao/tầng/chế độ, số lần "giật" (nhảy >25cm/khung), độ lệch khi dừng.
// Dùng: BASE=http://localhost:8124 node tools/mptest/mp.cjs <map> "<tham số mạng>" [kịch bản,...]
//   vd: node tools/mptest/mp.cjs living "" all      |  node tools/mptest/mp.cjs vy "mocklat=120&mockjit=150&mockloss=0.1" walk,zig
const {chromium}=require('playwright');
const MAP=process.argv[2]||'living',NETQ=process.argv[3]||'',SC=(process.argv[4]||'all').split(','),BASE=process.env.BASE||'http://localhost:8124';
const room='mp'+Date.now().toString(36);
(async()=>{
const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const ctx=await b.newContext({viewport:{width:200,height:150}});
const errs=[];
const open=async(as)=>{const p=await ctx.newPage();p.on('pageerror',e=>errs.push(as+': '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push(as+' console: '+m.text().slice(0,160))});
  await p.goto(`${BASE}/?mock=/dev/mock-supabase.js&room=${room}&as=${as}&m=${MAP}&test&q=low${NETQ?'&'+NETQ:''}`,{waitUntil:'load'});return p};
const A=await open('bin');await new Promise(r=>setTimeout(r,1500));const B=await open('vy');
const frameOf=async(p,id)=>{for(let i=0;i<180;i++){for(const f of p.frames()){if(await f.evaluate(id=>!!(window.VY&&window.VY.local&&window.VY.local.id===id),id).catch(()=>false))return f}await p.waitForTimeout(1000)}throw new Error('no game '+id)};
const fa=await frameOf(A,'bin'),fb=await frameOf(B,'vy');
// vòng lặp riêng: tick 60Hz không vẽ + ghi hình
const startLoop=f=>f.evaluate(()=>{const V=window.VY;window.__rec=[];let last=performance.now();
  const snap=c=>c?{x:+c.P.pos.x.toFixed(3),y:+c.P.pos.y.toFixed(3),z:+c.P.pos.z.toFixed(3),l:c.P.level,m:c.P.mode,w:+c.P.yaw.toFixed(2),sp:+c.P.sp.toFixed(2),b:c.busy?c.busy.kind:0,pl:c.plan.length,a:c.air&&c.air()?c.air().k:0}:null;
  if(window.__iv)clearInterval(window.__iv);
  window.__iv=setInterval(()=>{const now=performance.now();let acc=Math.min((now-last)/1000,0.25);last=now;
    try{while(acc>0.0501){V.tick(0.05,false);acc-=0.05}V.tick(acc,false)}catch(e){console.error('tick',e.message)}
    if(window.__recOn)window.__rec.push({t:performance.timeOrigin+now,L:snap(V.local),R:snap(V.remote)})},16)});
await startLoop(fa);await startLoop(fb);
// chờ 2 bên thấy nhau
for(let i=0;i<60;i++){const ok=await fa.evaluate(()=>!!window.VY.remote)&&await fb.evaluate(()=>!!window.VY.remote);if(ok)break;await A.waitForTimeout(1000)}
console.log('map',MAP,'net',NETQ||'sạch','remote A',await fa.evaluate(()=>!!window.VY.remote),'remote B',await fb.evaluate(()=>!!window.VY.remote));
await A.waitForTimeout(3000);
const rec=async(on)=>{await fa.evaluate(v=>{window.__recOn=v;if(v)window.__rec=[]},on);await fb.evaluate(v=>{window.__recOn=v;if(v)window.__rec=[]},on)};
const key=async(p,k,ms)=>{await p.keyboard.down(k);await p.waitForTimeout(ms);await p.keyboard.up(k)};
const both=async(fn)=>Promise.all([fn(A,fa),fn(B,fb)]);
const scen={
  walk:async(p)=>{await key(p,'KeyW',1800);await p.waitForTimeout(1500);await key(p,'KeyS',1200);await p.waitForTimeout(1500)},
  zig:async(p)=>{for(const k of ['KeyW','KeyD','KeyS','KeyA','KeyW','KeyD','KeyS','KeyA','KeyW','KeyA'])await key(p,k,280);await p.waitForTimeout(1500)},
  run:async(p)=>{await p.keyboard.down('ShiftLeft');await key(p,'KeyA',1500);await p.keyboard.up('ShiftLeft');await p.waitForTimeout(400);await p.keyboard.down('ShiftLeft');await key(p,'KeyD',1500);await p.keyboard.up('ShiftLeft');await p.waitForTimeout(1500)},
  tap:async(p)=>{for(let i=0;i<8;i++){await key(p,i%2?'KeyD':'KeyW',90);await p.waitForTimeout(120)}await p.waitForTimeout(1500)},
  jump:async(p)=>{await p.keyboard.down('KeyW');await p.waitForTimeout(300);await p.keyboard.press('Space');await p.waitForTimeout(1300);await p.keyboard.press('Space');await p.waitForTimeout(90);await p.keyboard.press('Space');await p.waitForTimeout(1300);await p.keyboard.up('KeyW');
    await p.keyboard.press('KeyD');await p.waitForTimeout(60);await p.keyboard.press('KeyD');await p.waitForTimeout(1600)},
  stairs:async(p,f)=>{const r=await f.evaluate(()=>{const V=window.VY,L=V.local,S=V.A.stairs&&V.A.stairs[0];if(!S)return 'no stairs';L.cmdMove(S.cx,S.z0-0.6,1);return 'up'});if(r==='no stairs')return;await p.waitForTimeout(9000);
    await f.evaluate(()=>{const V=window.VY,L=V.local,S=V.A.stairs[0];L.cmdMove(S.cx+1.2,S.z1+1.0,0)});await p.waitForTimeout(9000)},
  sit:async(p,f)=>{await f.evaluate(()=>window.VY.local.cmdSit());await p.waitForTimeout(9000);await key(p,'KeyS',600);await p.waitForTimeout(5000)},
  sleep:async(p,f)=>{await f.evaluate(()=>window.VY.local.cmdSleep());await p.waitForTimeout(12000);await key(p,'KeyS',600);await p.waitForTimeout(6000)},
  click:async(p,f)=>{await f.evaluate(()=>{const L=window.VY.local;L.cmdMove(L.P.pos.x+2,L.P.pos.z-1.5,L.P.level)});await p.waitForTimeout(4000)},
  simul:async()=>{await both(async(p)=>{await key(p,'KeyW',1200);await key(p,'KeyD',800);await p.waitForTimeout(1500)})},
};
const list=SC[0]==='all'?Object.keys(scen):SC;
const results=[];
for(const name of list){
  for(const dir of (name==='simul'?['AB']:['A','B'])){
    const [P,F]=dir==='B'?[B,fb]:[A,fa];
    await rec(true);
    try{await scen[name](P,F)}catch(e){console.log('scenario err',name,e.message)}
    await A.waitForTimeout(800);await rec(false);
    const ra=await fa.evaluate(()=>window.__rec),rb=await fb.evaluate(()=>window.__rec);
    // so: chủ (owner) = L của trang lái; quan sát = R của trang kia
    if(process.env.DUMP===dir){const own=dir==='B'?rb:ra,obs=dir==='B'?ra:rb;const pick=(arr,k)=>arr.filter((_,i)=>i%20===0).map(r=>{const c=r[k];return c?`${((r.t-arr[0].t)/1000).toFixed(1)} ${c.m}/${c.b||'-'}/pl${c.pl} (${c.x.toFixed(2)},${c.y.toFixed(2)},${c.z.toFixed(2)}) L${c.l} sp${c.sp}`:'-'});const a=pick(own,'L'),bb=pick(obs,'R');for(let i=0;i<Math.max(a.length,bb.length);i++)console.log((a[i]||'').padEnd(60),'|',bb[i]||'')}
    const pairs=dir==='AB'?[['A→B',ra,rb],['B→A',rb,ra]]:dir==='A'?[['A→B',ra,rb]]:[['B→A',rb,ra]];
    for(const [lab,own,obs] of pairs)results.push({name,lab,...metrics(own.map(r=>({t:r.t,...r.L})),obs.filter(r=>r.R).map(r=>({t:r.t,...r.R})))});
  }
}
function metrics(own,obs){
  if(own.length<10||obs.length<10)return {err:'thiếu dữ liệu '+own.length+'/'+obs.length};
  const at=(t)=>{let i=0,j=own.length-1;if(t<=own[0].t)return own[0];if(t>=own[j].t)return own[j];while(j-i>1){const m=(i+j)>>1;if(own[m].t<=t)i=m;else j=m}const a=own[i],b=own[j],u=(t-a.t)/(b.t-a.t);return {x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,z:a.z+(b.z-a.z)*u,l:u<0.5?a.l:b.l,m:u<0.5?a.m:b.m}};
  let best=null;for(let D=0;D<=700;D+=20){let s=0;for(const o of obs){const w=at(o.t-D);s+=(o.x-w.x)**2+(o.z-w.z)**2}const r=Math.sqrt(s/obs.length);if(!best||r<best.r)best={D,r}}
  let mx=0,ymx=0,lvBad=0,mdBad=0,snaps=0,jerk=0;
  for(let i=0;i<obs.length;i++){const o=obs[i],w=at(o.t-best.D);const e=Math.hypot(o.x-w.x,o.z-w.z);mx=Math.max(mx,e);if(o.m==='free'&&w.m==='free')ymx=Math.max(ymx,Math.abs(o.y-w.y));if(o.l!==w.l)lvBad++;if(o.m!==w.m)mdBad++;
    if(i>0){const p=obs[i-1],st=Math.hypot(o.x-p.x,o.z-p.z)+Math.abs(o.y-p.y),dt=(o.t-p.t)/1000;const w0=at(p.t-best.D),os=Math.hypot(w.x-w0.x,w.z-w0.z)+Math.abs(w.y-w0.y);if(st>0.25&&st>os*2+0.1)snaps++;
      if(i>1){const q=obs[i-2],v1=Math.hypot(o.x-p.x,o.z-p.z)/Math.max(dt,1e-3),v0=Math.hypot(p.x-q.x,p.z-q.z)/Math.max((p.t-q.t)/1000,1e-3);if(Math.abs(v1-v0)>6)jerk++}}}
  const lo=obs[obs.length-1],lw=own[own.length-1];
  return {lagMs:best.D,rms:+best.r.toFixed(3),max:+mx.toFixed(3),yMax:+ymx.toFixed(3),lvBad:+(lvBad/obs.length).toFixed(3),modeBad:+(mdBad/obs.length).toFixed(3),snaps,jerk,endErr:+Math.hypot(lo.x-lw.x,lo.z-lw.z).toFixed(3),endY:+Math.abs(lo.y-lw.y).toFixed(3),endMode:lo.m+'/'+lw.m,n:obs.length,
    hz:+(obs.length/((obs[obs.length-1].t-obs[0].t)/1000)).toFixed(0)};
}
for(const r of results)console.log(JSON.stringify(r));
if(process.env.DUMP){}
console.log('errors',errs.slice(0,8));
await b.close()})().catch(e=>{console.error('FATAL',e);process.exit(1)})
