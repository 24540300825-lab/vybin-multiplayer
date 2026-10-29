import * as THREE from 'three';
import {$} from './shared.js';
// ===== mặt nạ lá (alpha) thủ tục: silhouette cành lá, mép nhám kiểu cọ =====
export const LEAFMASK=(()=>{const N=256,c=document.createElement('canvas');c.width=c.height=N*2;const g=c.getContext('2d');g.fillStyle='#000';g.fillRect(0,0,N*2,N*2);
  let sd=7;const r=()=>{sd=(sd*16807)%2147483647;return sd/2147483647};
  for(let v=0;v<4;v++){const ox=(v%2)*N,oy=Math.floor(v/2)*N;g.save();g.beginPath();g.rect(ox,oy,N,N);g.clip();g.translate(ox,oy);g.fillStyle='#fff';g.strokeStyle='#fff';
    const stems=5+(r()*3|0);
    for(let s=0;s<stems;s++){const a=-Math.PI/2+(s-(stems-1)/2)*0.34+(r()-.5)*.15,L=N*(0.62+r()*.3),bx=N*(0.5+(r()-.5)*.35),by=N*1.02;
      g.lineWidth=N*0.025;g.beginPath();g.moveTo(bx,by);g.lineTo(bx+Math.cos(a)*L,by+Math.sin(a)*L);g.stroke();
      const nl=7+(r()*4|0);
      for(let k=1;k<=nl;k++){const t=k/(nl+1),px=bx+Math.cos(a)*L*t,py=by+Math.sin(a)*L*t,sz=N*(0.17-0.07*t)*(0.85+r()*.4);
        for(const sg of [-1,1]){const la=a+sg*(0.75+r()*.35);g.save();g.translate(px,py);g.rotate(la);g.beginPath();g.ellipse(sz*.55,0,sz,sz*.36,0,0,Math.PI*2);g.fill();g.restore()}}
      g.save();g.translate(bx+Math.cos(a)*L,by+Math.sin(a)*L);g.rotate(a);g.beginPath();g.ellipse(N*.07,0,N*.12,N*.05,0,0,Math.PI*2);g.fill();g.restore()}
    g.restore()}
  const im=g.getImageData(0,0,N*2,N*2),d=im.data;
  // làm mờ nhẹ rồi cộng nhiễu để ngưỡng cắt ra mép nhám
  const W=N*2,t2=new Float32Array(W*W);for(let i=0;i<W*W;i++)t2[i]=d[i*4]/255;
  const bl=new Float32Array(W*W);for(let y=1;y<W-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;bl[i]=(t2[i]*4+t2[i-1]+t2[i+1]+t2[i-W]+t2[i+W]+t2[i-W-1]+t2[i-W+1]+t2[i+W-1]+t2[i+W+1])/12}
  for(let i=0;i<W*W;i++){const x=i%W,y=(i/W)|0;const n=Math.sin(x*.9)*Math.cos(y*1.3)*.5+Math.sin(x*2.7+y*1.9)*.3+(r()-.5)*.7;const v=Math.min(1,Math.max(0,bl[i]+n*0.28));const q=v*255;d[i*4]=d[i*4+1]=d[i*4+2]=q;d[i*4+3]=255}
  g.putImageData(im,0,0);const t=new THREE.CanvasTexture(c);t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.anisotropy=4;return t})();
export const LM_FRAG='{vec2 _c=vec2(mod(floor(vQ.z*4.0),2.0),floor(floor(vQ.z*4.0)/2.0))*0.5;vec2 _q=fract(vec2(vQ.x,1.0-vQ.y)*2.0);float _a=texture2D(uLM,_c+_q*0.484+0.008).r;if(vQ.z>=0.0&&_a<0.5)discard;}\n';
export const DEPTH_LEAF=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});DEPTH_LEAF.onBeforeCompile=sh=>patchLeafMask(sh);DEPTH_LEAF.customProgramCacheKey=()=>'dleaf1';
export function patchLeafMask(sh){sh.uniforms.uLM={value:LEAFMASK};
  sh.vertexShader='attribute vec3 aQ;varying vec3 vQ;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvQ=aQ;');
  sh.fragmentShader='uniform sampler2D uLM;varying vec3 vQ;\n'+sh.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\n'+LM_FRAG)}

// ===== LOOK PANEL: toon painterly + grade + ngày/đêm + thời tiết =====
export const V3=(r,g,b)=>new THREE.Vector3(r,g,b);
export const TU={uSh:{value:V3(1,1,1)},uMid:{value:V3(1,1,1)},uHi:{value:V3(1,1,1)},uGCol:{value:V3(1,1,1)},uRimCol:{value:V3(1,1,1)},
  uSunC:{value:V3(1,1,1)},uAmbS:{value:V3(1,1,1)},uAmbG:{value:V3(1,1,1)},uLampC:{value:V3(0,0,0)},
  uDS:{value:.6},uDM:{value:.1},uHiS:{value:.5},uGS:{value:.12},uGM:{value:.04},uGStr:{value:.1},uRim:{value:0},uRimPow:{value:3},
  uLeafA:{value:V3(.36,.5,.17)},uLeafB:{value:V3(.7,.8,.3)},uLeafMix:{value:.7},uGrassA:{value:V3(.42,.6,.2)},uGrassB:{value:V3(.7,.8,.33)},uWindT:{value:0},uWindA:{value:0.4},uWet:{value:0},uCloudSh:{value:0.5}};
export const TOON_DEF={sh:'#a08fae',mid:'#f8e4cc',hi:'#fff8e8',dSize:0.8,dSmooth:0.12,hiSize:0.45,gStr:0.12,gSize:0.1,gSmooth:0.05,gCol:'#fff2cf',rim:0.25,rimCol:'#ffd9a8',rimPow:3.5,
  leafA:'#5d7f2a',leafB:'#b2c850',leafMix:0.7,grassA:'#6b9a33',grassB:'#b3c957',
  expo:1.0,con:1.08,sat:1.12,temp:0.12,tintSh:'#6c5aa0',tintHi:'#ffb878',tintAmt:0.35,vig:0.18,bloom:0.22,bloomTh:0.85,post:true,
  rays:1,motes:1,time:17.6,auto:false,speed:0.15,weather:'clear',garden:true,quality:'auto'};
export const TOON_PRESETS={
  'Golden hour (ref)':{},
  'Soft day':{time:11,sh:'#9a8fb0',mid:'#f6e8d8',hi:'#ffffff',dSize:.6,dSmooth:.2,tintAmt:.15,temp:0,vig:.2,sat:1.08,bloom:.2,rim:.1,rimCol:'#ffffff'},
  'Cel hard':{dSmooth:0,hiSize:.5,brush:0,paint:0,gStr:.3,gSmooth:0,tintAmt:.1,bloom:.1},
  'Blender default':{sh:'#000000',mid:'#ffffff',hi:'#ffffff',dSize:.5,dSmooth:0,hiSize:1,gStr:0,brush:0,paint:0,rim:0,time:12,tintAmt:0,vig:0,bloom:0,con:1,sat:1,temp:0},
  'Night lofi':{time:22.5,bloom:.55,rays:1.2,tintSh:'#3a4a9a',tintHi:'#ffc080',tintAmt:.4,vig:.45,temp:-.02},
  'Rainy mood':{time:15,weather:'rain',sat:.95,tintAmt:.3,tintSh:'#4a6a9a',tintHi:'#b8c8e0',temp:-.05,vig:.4},
  'Misty dawn':{time:6.4,weather:'fog',tintAmt:.3,bloom:.5,vig:.3}};
export const TP=Object.assign({},TOON_DEF);
export const hexV=h=>V3(parseInt(h.slice(1,3),16)/255,parseInt(h.slice(3,5),16)/255,parseInt(h.slice(5,7),16)/255);
export function applyToon(save=true){
  TU.uSh.value.copy(hexV(TP.sh));TU.uMid.value.copy(hexV(TP.mid));TU.uHi.value.copy(hexV(TP.hi));TU.uGCol.value.copy(hexV(TP.gCol));TU.uRimCol.value.copy(hexV(TP.rimCol));
  TU.uDS.value=TP.dSize;TU.uDM.value=TP.dSmooth;TU.uHiS.value=TP.hiSize;TU.uGS.value=TP.gSize;TU.uGM.value=TP.gSmooth;TU.uGStr.value=TP.gStr;
  TU.uRim.value=TP.rim;TU.uRimPow.value=TP.rimPow;TU.uLeafA.value.copy(hexV(TP.leafA));TU.uLeafB.value.copy(hexV(TP.leafB));TU.uLeafMix.value=TP.leafMix;TU.uGrassA.value.copy(hexV(TP.grassA));TU.uGrassB.value.copy(hexV(TP.grassB));
  if(window.__envApply)window.__envApply(0);
  const ta=document.getElementById('tj');if(ta&&save)ta.value=JSON.stringify(TP);
  if(save)try{localStorage.setItem('vyLook5',JSON.stringify(TP))}catch(e){}
}
(function buildToonPanel(){
  try{Object.assign(TP,JSON.parse(localStorage.getItem('vyLook5')||'{}'))}catch(e){}
  const tp=document.createElement('div');tp.id='tp';document.body.appendChild(tp);
  const WEA=['clear','cloudy','overcast','drizzle','light rain','rain','heavy rain','storm','snow','blizzard','fog','windy'];
  const rows=[['h','Toon — 3 tông (Shadow / Mid / Highlight)'],['sh','Shadow color','c'],['mid','Mid color','c'],['hi','Highlight color','c'],
    ['dSize','Vùng sáng (Mid) size','n',0,1,0.005],['hiSize','Vùng Highlight / Mid','n',0,1,0.005],['dSmooth','Smooth (mép)','n',0,1,0.005],
    ['h','Cây / lá / cỏ (đồng màu)'],['leafA','Lá — tối','c'],['leafB','Lá — sáng','c'],['leafMix','Độ đồng màu lá','n',0,1,0.01],['grassA','Cỏ — tối','c'],['grassB','Cỏ — sáng','c'],
    ['h','Glossy / Rim'],['gStr','Glossy strength','n',0,2,0.01],['gSize','Glossy size','n',0,1,0.005],['gSmooth','Glossy smooth','n',0,1,0.005],['gCol','Glossy color','c'],
    ['rim','Rim strength','n',0,2,0.01],['rimCol','Rim color','c'],['rimPow','Rim power','n',1,8,0.1],
    ['h','Grade (post)'],['post','Bật post-fx (bloom/grade)','b'],['expo','Exposure','n',0.3,2.5,0.01],['con','Contrast','n',0.5,2,0.01],['sat','Saturation','n',0,2,0.01],['temp','Temperature','n',-0.3,0.4,0.005],
    ['tintSh','Split-tone shadow','c'],['tintHi','Split-tone highlight','c'],['tintAmt','Split-tone amount','n',0,1,0.01],
    ['vig','Vignette','n',0,1,0.01],['bloom','Bloom','n',0,2,0.01],['bloomTh','Bloom threshold','n',0.3,1.5,0.01],
    ['h','Ngày / đêm · thời tiết'],['time','Giờ (0–24)','n',0,24,0.05],['auto','Tự chạy ngày đêm','b'],['speed','Tốc độ (giờ/giây)','n',0.01,2,0.01],['weather','Thời tiết','s',WEA],
    ['rays','Tia sáng (light shafts)','n',0,3,0.05],['motes','Bụi sáng','n',0,3,0.05],['h','Hiệu năng / cảnh quan'],['quality','Chất lượng','s',['auto','low','medium','high']],['garden','Cây cối / vườn','b']];
  const ctr={};
  tp.innerHTML='<b style="font-size:13px">🎨 Look: toon · grade · ngày/đêm</b><div id="tpre"></div>';
  const pre=tp.querySelector('#tpre');
  Object.keys(TOON_PRESETS).forEach(n=>{const b=document.createElement('button');b.textContent=n;b.onclick=()=>{Object.assign(TP,TOON_DEF,TOON_PRESETS[n]);sync();applyToon()};pre.appendChild(b)});
  rows.forEach(r=>{
    if(r[0]==='h'){const h=document.createElement('h4');h.textContent=r[1];tp.appendChild(h);return}
    const [k,lab,ty,mn,mx,st]=r;const l=document.createElement('label');l.append(lab);
    const inp=document.createElement(ty==='s'?'select':'input');
    if(ty==='c'){inp.type='color';inp.oninput=()=>{TP[k]=inp.value;applyToon()};l.append(inp)}
    else if(ty==='b'){inp.type='checkbox';inp.onchange=()=>{TP[k]=inp.checked;applyToon()};l.append(inp)}
    else if(ty==='s'){mn.forEach(o=>{const op=document.createElement('option');op.value=op.textContent=o;inp.append(op)});inp.onchange=()=>{TP[k]=inp.value;applyToon()};l.append(inp)}
    else{inp.type='range';inp.min=mn;inp.max=mx;inp.step=st;const v=document.createElement('b');
      inp.oninput=()=>{TP[k]=+inp.value;v.textContent=(+inp.value).toFixed(2);applyToon()};
      const w=document.createElement('span');w.style.cssText='display:flex;gap:4px;align-items:center';w.append(inp,v);l.append(w);inp._v=v}
    tp.appendChild(l);ctr[k]=inp;});
  function sync(){for(const k in ctr){const i=ctr[k];if(i.type==='checkbox')i.checked=!!TP[k];else i.value=TP[k];if(i._v)i._v.textContent=(+TP[k]).toFixed(2)}}
  window.__syncTime=()=>{const i=ctr.time;if(i){i.value=TP.time;i._v.textContent=(+TP.time).toFixed(2)}};
  const ta=document.createElement('textarea');ta.id='tj';ta.readOnly=true;
  const bc=document.createElement('button');bc.textContent='Copy JSON';bc.onclick=()=>{ta.select();try{navigator.clipboard.writeText(ta.value)}catch(e){document.execCommand('copy')}};
  const br=document.createElement('button');br.textContent='Reset';br.onclick=()=>{Object.assign(TP,TOON_DEF);sync();applyToon()};
  tp.append(document.createElement('hr'),bc,br,ta);
  sync();applyToon();
  document.getElementById('bToon').onclick=()=>tp.classList.toggle('on');
  window.__tpSync=sync;window.TPX=TP;window.__applyToon=applyToon;window.TOON_PRESETS=TOON_PRESETS;window.TOON_DEF=TOON_DEF;
})();
