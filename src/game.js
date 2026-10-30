import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries,toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';

import {$,sstep,clamp,K,CFG,angDiff} from './shared.js';
import {MAP_CONFIGS} from './map-configs.js';
import {TU,applyToon,patchLeafMask,hexV,TP,DEPTH_LEAF} from './toon.js';
import {Perf} from './perf.js';
import './hud.js';

// API công khai cho lớp mạng (sync.js) — game không biết gì về Supabase.
export const api={local:null,remote:null,emit:null,sendInput:null,onTick:null,envOut:null,peerChanged:null};
const r3=v=>Math.round(v*1000)/1000;
export function init(ctx){
  const envG=ctx.env,treeG=ctx.tree,MAPID=window.MAPID;
  const renderer=new THREE.WebGLRenderer({antialias:true});
  Perf.attach(renderer);
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  document.body.appendChild(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x1a2030);
  const camera=new THREE.PerspectiveCamera(18,innerWidth/innerHeight,1,900);
  camera.position.set(17,16,23);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.target.set(5,2,-4);controls.enableDamping=true;controls.minDistance=14;controls.maxDistance=38;controls.enablePan=true;controls.screenSpacePanning=false;controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};controls.update();
  {const az=controls.getAzimuthalAngle(),po=controls.getPolarAngle();controls.minAzimuthAngle=az-CFG.camPan;controls.maxAzimuthAngle=az+CFG.camPan;controls.minPolarAngle=po-CFG.camTilt;controls.maxPolarAngle=po+CFG.camTilt;}

  // lights
  const hemi=new THREE.HemisphereLight(0xdfe8ff,0x8a7f73,0.9);scene.add(hemi);
  const amb=new THREE.AmbientLight(0xffffff,0.25);scene.add(amb);
  const sun=new THREE.DirectionalLight(0xfff1dc,2.2);
  sun.position.set(12,15,9);sun.target.position.set(5,1.5,-4);
  sun.castShadow=true;sun.shadow.mapSize.set(2560,2560);renderer.shadowMap.autoUpdate=false;
  Object.assign(sun.shadow.camera,{left:-17,right:17,top:15,bottom:-15,near:1,far:90});
  sun.shadow.bias=-0.0003;sun.shadow.normalBias=0.025;
  scene.add(sun,sun.target);
  window.__L={sun,hemi,amb};

  // Toon painterly 3 tông (Shadow/Mid/Highlight) + ambient bounce + noise cọ theo world-space; giữ texture gốc
  const NOISE_GLSL=`
    float h31(vec3 p){p=fract(p*0.3183099+vec3(.1,.2,.3));p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
    float vn3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
      return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);}`;
  function toonify(root){const done=new Set();root.traverse(o=>{if(!(o.isMesh||o.isSkinnedMesh))return;
    (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
      if(m&&m.userData&&m.userData.leafMask&&!o.customDepthMaterial){o.customDepthMaterial=DEPTH_LEAF}
      if(!m||done.has(m)||!m.isMeshStandardMaterial)return;done.add(m);
      m.onBeforeCompile=sh=>{if(m.userData.leafMask)patchLeafMask(sh);Object.assign(sh.uniforms,TU);
        const FOL=(/PolyFoliage|Leaves|Plant_|Fern/i.test(m.name||'')||m.userData.leaf)&&!m.userData.noLeaf,SW=/Wind/i.test(m.name||'')||m.userData.sway||FOL,GRD=!!m.userData.ground||/Stylized Grass/i.test(m.name||'');
        sh.vertexShader=(SW?'#define SWAYX\n':'')+'varying vec3 vWP;uniform float uWindT,uWindA;\n'+sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
          #ifdef SWAYX
          {vec4 q=vec4(transformed,1.0);
          #ifdef USE_INSTANCING
           q=instanceMatrix*q;
          #endif
          vec3 wq=(modelMatrix*q).xyz;float hh=max(transformed.y,0.0);float ph=wq.x*0.35+wq.z*0.27;
          transformed.x+=sin(uWindT*1.7+ph)*uWindA*hh*0.05;transformed.z+=cos(uWindT*1.3+ph*1.3)*uWindA*hh*0.035;}
          #endif`).replace('#include <project_vertex>',`#include <project_vertex>
          {vec4 _p=vec4(transformed,1.0);
          #ifdef USE_INSTANCING
           _p=instanceMatrix*_p;
          #endif
          vWP=(modelMatrix*_p).xyz;}`);
        sh.fragmentShader=(FOL?'#define FOLIAGE\n':'')+(GRD?'#define GROUNDX\n':'')+'uniform vec3 uSh,uMid,uHi,uGCol,uRimCol,uSunC,uAmbS,uAmbG,uLampC;uniform vec3 uLeafA,uLeafB,uGrassA,uGrassB;uniform float uDS,uDM,uHiS,uGS,uGM,uGStr,uRim,uRimPow,uLeafMix,uWindT,uWet,uCloudSh;varying vec3 vWP;\n'+NOISE_GLSL+'\n'+sh.fragmentShader.replace('#include <opaque_fragment>',`
        {float I=1.0,Ih=1.0,vis=1.0,Ig=0.0;
         #ifdef FOLIAGE
         {float lm=dot(diffuseColor.rgb,vec3(0.299,0.587,0.114));vec3 lf=mix(uLeafA,uLeafB,smoothstep(0.03,0.4,lm));
          diffuseColor.rgb=mix(diffuseColor.rgb,lf,uLeafMix)*mix(0.7,1.0,smoothstep(-0.25,0.9,vWP.y));}
         #endif
         #ifdef GROUNDX
         {float lm=dot(diffuseColor.rgb,vec3(0.299,0.587,0.114));diffuseColor.rgb=mix(diffuseColor.rgb,mix(uGrassA,uGrassB,smoothstep(0.08,0.6,lm)),0.75);}
         #endif
         #if ( NUM_DIR_LIGHTS > 0 )
          vec3 Ld=directionalLights[0].direction;
          float ndl=dot(geometryNormal,Ld);
          float ang=acos(clamp(ndl,-1.0,1.0));
          float maxA=uDS*1.5708,sm=uDM*1.5708;
          I=ang<maxA?1.0:((sm>0.0001&&ang<maxA+sm)?1.0-(ang-maxA)/sm:0.0);
          float hiA=maxA*uHiS;
          Ih=ang<hiA?1.0:((sm>0.0001&&ang<hiA+sm)?1.0-(ang-hiA)/sm:0.0);
          float la=dot(diffuseColor.rgb,vec3(0.299,0.587,0.114));
          float ex=max(ndl,0.0)*dot(directionalLights[0].color,vec3(0.299,0.587,0.114))/PI*la;
          vis=ex>0.002?clamp(dot(reflectedLight.directDiffuse,vec3(0.299,0.587,0.114))/ex,0.0,1.0):1.0;
          vec3 Rv=reflect(-geometryViewDir,geometryNormal);
          float angG=acos(clamp(dot(Rv,Ld),-1.0,1.0));
          float gM=uGS*1.5708,gs=uGM*1.5708;
          Ig=angG<gM?1.0:((gs>0.0001&&angG<gM+gs)?1.0-(angG-gM)/gs:0.0);
          Ig*=step(0.0,ndl);
         #endif
         vec3 wn=inverseTransformDirection(geometryNormal,viewMatrix);
         vec3 amb=mix(uAmbG,uAmbS,wn.y*0.5+0.5);
         vec3 tone=mix(uSh*amb,uMid*uSunC,I*vis);
         tone=mix(tone,uHi*uSunC,Ih*vis);
         float inH=smoothstep(-0.2,0.2,vWP.x)*(1.0-smoothstep(9.8,10.2,vWP.x))*smoothstep(-8.2,-7.8,vWP.z)*(1.0-smoothstep(0.4,0.8,vWP.z))*step(vWP.y,6.2)*step(-0.3,vWP.y);
         if(uCloudSh>0.01){float csn=vn3(vec3(vWP.x*0.05+uWindT*0.5,0.0,vWP.z*0.05+uWindT*0.2));tone*=1.0-0.28*smoothstep(0.5,0.62,csn)*uCloudSh*(1.0-inH);}
         vec3 col=diffuseColor.rgb*tone;
         col*=1.0-0.2*uWet*(1.0-inH);
         col+=uGCol*uSunC*Ig*vis*uGStr*(1.0+uWet*3.0*(1.0-inH));
         float rim=pow(1.0-clamp(dot(geometryNormal,geometryViewDir),0.0,1.0),uRimPow)*uRim;
         col+=uRimCol*uSunC*rim*(0.35+0.65*I);
         col+=diffuseColor.rgb*uLampC*inH*(0.2+0.35*I);
         outgoingLight=col+totalEmissiveRadiance;}
        #include <opaque_fragment>`)};
      m.customProgramCacheKey=()=>'vytoon8'+(m.userData.leafMask?'L':'')+((/Wind/i.test(m.name||'')||m.userData.sway||/PolyFoliage|Leaves|Plant_|Fern/i.test(m.name||''))?'s':'')+(((/PolyFoliage|Leaves|Plant_|Fern/i.test(m.name||'')||m.userData.leaf)&&!m.userData.noLeaf)?'f':'')+((m.userData.ground||/Stylized Grass/i.test(m.name||''))?'g':'');m.needsUpdate=true;});});}

  // env
  const env=envG.scene;toonify(env);scene.add(env);env.updateMatrixWorld(true);
  const envMeshes=[];const byName={};
  env.traverse(o=>{byName[o.name]=o;if(o.isMesh){envMeshes.push(o);const m=o.material;const tr=m&&(m.transparent||m.opacity<1);o.userData.glass=tr||/glass/i.test(o.name);
    if(!tr){o.castShadow=true;}o.receiveShadow=true;}});
  const isUnder=(o,name)=>{while(o){if(o.name===name)return true;o=o.parent}return false};
  const box=n=>new THREE.Box3().setFromObject(byName[n]);

  // anchors
  const MAPS=MAP_CONFIGS;
  const MC=MAPS[MAPID]||MAPS.studio;
  if(MC.tint)env.traverse(o=>{if(o.isMesh&&o.material&&MC.tint[o.material.name]!=null)o.material.color.set(MC.tint[o.material.name])});
  if(MC.hideFlat)env.traverse(o=>{if(o.isMesh&&!(o.material&&o.material.name)){const b=new THREE.Box3().setFromObject(o);if((b.max.x-b.min.x)*(b.max.z-b.min.z)>20&&b.max.y-b.min.y<1.2)o.visible=false}});
  if(MC.hide)env.traverse(o=>{if(MC.hide.test(o.name)||(o.isMesh&&o.material&&MC.hide.test(o.material.name||'')))o.visible=false});
  env.updateMatrixWorld(true);
  const A={};A.L0=0;A.L1=box(MC.mezz[0]).max.y;
  // cầu thang: gom thành danh sách; profile độ cao lấy bằng raycast rồi làm mượt
  const stairs=[];
  {const groups=MC.treadNames?MC.treadNames.filter(n=>byName[n]).map(n=>[byName[n]]):[Object.keys(byName).filter(n=>MC.tread.test(n)).map(n=>byName[n])];
    const rc=new THREE.Raycaster();
    groups.forEach(ms=>{if(!ms.length)return;const sb=new THREE.Box3(),meshes=[];ms.forEach(o=>{sb.union(new THREE.Box3().setFromObject(o));o.traverse(q=>{if(q.isMesh)meshes.push(q)})});
      const S={x0:sb.min.x,x1:sb.max.x,z0:sb.min.z,z1:sb.max.z};S.cx=(S.x0+S.x1)/2;S.botZ=S.z1+0.15;S.topZ=S.z0-0.35;S.midZ=(S.z0+S.z1)/2;
      const n=Math.max(8,Math.ceil((S.z1-S.z0)/0.05)),ys=[];
      for(let k=0;k<=n;k++){const z=S.z1-k*(S.z1-S.z0)/n;rc.set(new THREE.Vector3(S.cx,30,z),new THREE.Vector3(0,-1,0));const h=rc.intersectObjects(meshes,false)[0];ys.push(h?h.point.y:null)}
      for(let k=0;k<=n;k++)if(ys[k]==null){let a=k-1,b=k+1;while(a>=0&&ys[a]==null)a--;while(b<=n&&ys[b]==null)b++;ys[k]=a<0?(b<=n?ys[b]:0):b>n?ys[a]:ys[a]+(ys[b]-ys[a])*(k-a)/(b-a)}
      const sm=ys.map((_,k)=>{let t=0,c=0;for(let d=-3;d<=3;d++){const q=k+d;if(q>=0&&q<=n){t+=ys[q];c++}}return t/c});
      S.n=n;const W=Math.max(3,Math.round(0.34/((S.z1-S.z0)/n)));S.ys=sm.map((v,k)=>{let m=v;for(let d=-W;d<=W;d++){const q=k+d;if(q>=0&&q<=n)m=Math.max(m,ys[q])}return m});S.raw=ys;stairs.push(S)})}
  const stairAt=(x,z)=>{for(const S of stairs)if(x>S.x0-0.05&&x<S.x1+0.05&&z>S.z0&&z<S.z1+0.05)return S;return null};
  const inStair=(x,z)=>!!stairAt(x,z);
  const stairY=(S,z)=>{if(z>=S.z1+0.05)return 0;const f=(S.z1-z)/(S.z1-S.z0)*S.n;if(f<=0)return S.ys[0]*(1-Math.max(0,(z-S.z1)/0.05));if(f>=S.n)return S.ys[S.n];const i=Math.floor(f);return S.ys[i]+(S.ys[i+1]-S.ys[i])*(f-i)};
  const heightAt=(x,z,lv)=>{const S=stairAt(x,z);if(S)return stairY(S,z);
    if(!lv)for(const T of stairs)if(x>T.x0-0.05&&x<T.x1+0.05&&z>T.z1+0.05&&z<T.z1+0.39)return T.ys[0]*(1-(z-T.z1-0.05)/0.34);   // chân trước chạm bậc đầu trước khi thân vào cầu thang
    return lv?A.L1:A.L0};
  A.stairs=stairs;
  const pickStair=(x0,z0,x1,z1,up)=>{let best=stairs[0],bd=1e9;for(const S of stairs){const a=up?S.botZ:S.topZ,b=up?S.topZ:S.botZ,d=Math.hypot(x0-S.cx,z0-a)+Math.hypot(S.cx-x1,b-z1);if(d<bd){bd=d;best=S}}return best};
  const seat=box(MC.seat);A.seatC=seat.getCenter(new THREE.Vector3());A.seatTop=seat.max.y;
  A.chairL=A.seatC.y>(A.L0+A.L1)/2?1:0;A.CY=[A.L0,A.L1][A.chairL];
  const CHAIR=Object.values(byName).find(o=>MC.chair.test(o.name)&&!o.isMesh)||byName['Desk_Chair'];
  const q=new THREE.Quaternion();CHAIR.getWorldQuaternion(q);
  const fw=new THREE.Vector3(0,0,1).applyQuaternion(q);fw.y=0;fw.normalize();
  A.chairYaw=Math.atan2(fw.x,fw.z);A.fwd=fw;
  A.mattress=box('Bed_Mattress');A.bedBox=box('Bed');

  // colliders + A*
  const G={x0:-1,z0:-9,c:0.1,W:125,H:100,R:0.13};
  const blocked=[new Uint8Array(G.W*G.H),new Uint8Array(G.W*G.H)],cols=[[],[]];
  for(const m of envMeshes){
    if(/^Stair/.test(m.name)||isUnder(m,CHAIR.name))continue;
    const b=new THREE.Box3().setFromObject(m);if(b.isEmpty())continue;
    if((b.max.x-b.min.x)*(b.max.z-b.min.z)>14)continue;
    [A.L0,A.L1].forEach((fy,lv)=>{if(b.max.y>fy+0.12&&b.min.y<fy+0.9)cols[lv].push(b)});
  }
  const cl=(v,a,b)=>Math.min(b,Math.max(a,v));
  cols.forEach((arr,lv)=>{for(const b of arr){
    const i0=cl(Math.floor((b.min.x-G.R-G.x0)/G.c),0,G.W-1),i1=cl(Math.floor((b.max.x+G.R-G.x0)/G.c),0,G.W-1);
    const j0=cl(Math.floor((b.min.z-G.R-G.z0)/G.c),0,G.H-1),j1=cl(Math.floor((b.max.z+G.R-G.z0)/G.c),0,G.H-1);
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++)blocked[lv][j*G.W+i]=1;}});
  {const fl=MC.mezz.map(n=>box(n));
    for(let j=0;j<G.H;j++)for(let i=0;i<G.W;i++){const x=G.x0+(i+.5)*G.c,z=G.z0+(j+.5)*G.c;let ok=false;for(const b of fl)if(x>b.min.x+0.12&&x<b.max.x-0.12&&z>b.min.z+0.12&&z<b.max.z-0.12){ok=true;break}if(!ok)blocked[1][j*G.W+i]=1}}
  for(let lv=0;lv<2;lv++)for(let j=0;j<G.H;j++)for(let i=0;i<G.W;i++){const x=G.x0+(i+.5)*G.c,z=G.z0+(j+.5)*G.c;
    for(const S of stairs)if(x>S.x0-0.02&&x<S.x1+0.02&&z>S.z0-0.4&&z<S.z1+0.2)blocked[lv][j*G.W+i]=0;}
  // thân cầu thang (giữa chân và đỉnh) là VẬT CẢN với đường đi A* / click-để-đi: chỉ miệng cầu thang (chân & đỉnh) được mở. Trước đây thân cầu thang để trống nên đường đi cắt ngang qua cầu thang ở tầng 0.
  for(let lv=0;lv<2;lv++)for(let j=0;j<G.H;j++)for(let i=0;i<G.W;i++){const x=G.x0+(i+.5)*G.c,z=G.z0+(j+.5)*G.c;
    for(const S of stairs)if(x>S.x0-0.02&&x<S.x1+0.02&&z>S.z0&&z<S.z1+0.02)blocked[lv][j*G.W+i]=1;}
  console.log('colliders',cols[0].length,cols[1].length);
  window.__G={G,blocked,A,cols,envMeshes,isUnder,CHAIR};
  const colGroup=new THREE.Group();colGroup.visible=false;scene.add(colGroup);
  cols.forEach((arr,lv)=>arr.forEach(b=>colGroup.add(new THREE.Box3Helper(b,lv?0x44ff88:0xff5555))));
  $('cCol').onchange=e=>colGroup.visible=e.target.checked;
  const cell=(x,z)=>[Math.floor((x-G.x0)/G.c),Math.floor((z-G.z0)/G.c)];
  const free=(lv,i,j)=>i>=0&&j>=0&&i<G.W&&j<G.H&&!blocked[lv][j*G.W+i];
  function los(lv,x0,z0,x1,z1,skipA,skipB){const d=Math.hypot(x1-x0,z1-z0),n=Math.max(1,Math.ceil(d/0.05));
    for(let k=0;k<=n;k++){const t=k/n,dd=t*d;if((skipA&&dd<0.25)||(skipB&&d-dd<0.25))continue;const [i,j]=cell(x0+(x1-x0)*t,z0+(z1-z0)*t);if(!free(lv,i,j))return false}return true}
  function findPath(x0,z0,x1,z1,lv,exact){
    let [gi,gj]=cell(x1,z1),gx=x1,gz=z1;
    if(!free(lv,gi,gj)&&!exact){let best=null,bd=1e9;
      for(let r=1;r<50&&!best;r++)for(let dj=-r;dj<=r;dj++)for(let di=-r;di<=r;di++){if(Math.max(Math.abs(di),Math.abs(dj))!==r)continue;
        if(free(lv,gi+di,gj+dj)){const d=di*di+dj*dj;if(d<bd){bd=d;best=[gi+di,gj+dj]}}}
      if(best){[gi,gj]=best;gx=G.x0+(gi+.5)*G.c;gz=G.z0+(gj+.5)*G.c}}
    if(los(lv,x0,z0,gx,gz,true,exact))return [{x:gx,z:gz}];
    const [si,sj]=cell(x0,z0),N=G.W*G.H,g=new Float32Array(N).fill(1e9),par=new Int32Array(N).fill(-1),done=new Uint8Array(N);
    const h=(i,j)=>{const dx=Math.abs(i-gi),dz=Math.abs(j-gj);return (dx+dz)+(1.414-2)*Math.min(dx,dz)};
    const heap=[];const push=(f,k)=>{heap.push([f,k]);let c=heap.length-1;while(c>0){const p=(c-1)>>1;if(heap[p][0]<=heap[c][0])break;[heap[p],heap[c]]=[heap[c],heap[p]];c=p}};
    const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let c=0;for(;;){let l=2*c+1,r=l+1,m=c;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===c)break;[heap[m],heap[c]]=[heap[c],heap[m]];c=m}}return top};
    const s0=sj*G.W+si;g[s0]=0;push(h(si,sj),s0);let found=false;const gk=gj*G.W+gi;
    while(heap.length){const [,k]=pop();if(done[k])continue;done[k]=1;if(k===gk){found=true;break}
      const i=k%G.W,j=(k/G.W)|0;
      for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){if(!di&&!dj)continue;const ni=i+di,nj=j+dj;
        if(!free(lv,ni,nj))continue;if(di&&dj&&(!free(lv,i+di,j)||!free(lv,i,j+dj)))continue;
        const nk=nj*G.W+ni,ng=g[k]+(di&&dj?1.414:1);if(ng<g[nk]){g[nk]=ng;par[nk]=k;push(ng+h(ni,nj),nk)}}}
    if(!found)return [{x:gx,z:gz}];
    const cs=[];for(let k=gk;k!==-1&&k!==s0;k=par[k])cs.push({x:G.x0+((k%G.W)+.5)*G.c,z:G.z0+(((k/G.W)|0)+.5)*G.c});
    cs.reverse();cs.push({x:gx,z:gz});
    const pts=[{x:x0,z:z0},...cs],out=[];let a=0;
    while(a<pts.length-1){let b=pts.length-1;for(;b>a+1;b--)if(los(lv,pts[a].x,pts[a].z,pts[b].x,pts[b].z,a===0,exact&&b===pts.length-1))break;out.push(pts[b]);a=b}
    return out;}

  // halo
  let halo=null;
  function doHalo(name){const root=typeof name==='string'?byName[name]:name;if(!root)return;if(halo)endHalo();
    const mat=new THREE.MeshBasicMaterial({color:0xffb347,side:THREE.BackSide,transparent:true,opacity:0.9,depthWrite:false,fog:false});
    mat.onBeforeCompile=sh=>{sh.vertexShader=sh.vertexShader.replace('void main() {','void main() {').replace('#include <begin_vertex>','#include <begin_vertex>\n transformed += normalize(normal)*0.035;')};
    const hulls=[];root.traverse(m=>{if(m.isMesh&&!m.isSkinnedMesh&&m.geometry.attributes.normal&&m.parent){const h=new THREE.Mesh(m.geometry,mat);
      h.position.copy(m.position);h.quaternion.copy(m.quaternion);h.scale.copy(m.scale);h.raycast=()=>{};h.renderOrder=-1;h.userData.src=m;m.parent.add(h);hulls.push(h)}});
    halo={mat,hulls,t:0};}
  function endHalo(){if(!halo)return;halo.hulls.forEach(h=>h.parent&&h.parent.remove(h));halo.mat.dispose();halo=null}
  function updHalo(dt){if(!halo)return;halo.t+=dt;halo.hulls.forEach(h=>{const m=h.userData.src;if(m){h.position.copy(m.position);h.quaternion.copy(m.quaternion);h.scale.copy(m.scale)}});const T=1.1;if(halo.t>=T){endHalo();return}
    const p=halo.t/T;halo.mat.opacity=0.95*(1-p)*(0.6+0.4*Math.sin(p*18));}

  // ===== dùng chung cho 2 nhân vật =====
  const occ={bedL:null,bedR:null,chair:null};
  const toast=m=>{const t=$('toast');t.textContent=m;t.style.opacity=1;clearTimeout(toast._t);toast._t=setTimeout(()=>t.style.opacity=0,1800)};
  // ===== env: chair clips (phát đồng thời với clip nhân vật) =====
  const envMixer=new THREE.AnimationMixer(env),chairActs={};
  envG.animations.forEach(c=>{if(/^ACT_CHAIR_/.test(c.name.trim()))chairActs[c.name.trim()]=envMixer.clipAction(c)});
  // ===== cửa tủ / ngăn kéo: ACT_OPEN_CLOSE__* (đóng→mở→đóng). Bấm: chạy tới đỉnh mở rồi dừng; bấm lần nữa: chạy nốt về đóng =====
  const doorMap=new Map(),doorList=[];
  envG.animations.forEach(c=>{if(!/^ACT_OPEN_CLOSE__/.test(c.name.trim())||!c.tracks.length)return;
    const pn=THREE.PropertyBinding.parseTrackName(c.tracks[0].name);const node=THREE.PropertyBinding.findNode(env,pn.nodeName);if(!node)return;
    let best=0,bt=c.duration/2;const t0=c.tracks[0].times;
    for(let i=0;i<t0.length;i++){let sc=0;c.tracks.forEach(tr=>{const n=tr.getValueSize(),v=tr.values;if(tr.times.length!==t0.length)return;for(let k=0;k<n;k++)sc+=Math.abs(v[i*n+k]-v[k])});if(sc>best){best=sc;bt=t0[i]}}
    const a=envMixer.clipAction(c);a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;
    const d={node,a,peak:bt,end:c.duration,st:'closed'};doorMap.set(node,d);doorList.push(d)});
  function doorOf(o){for(let p=o;p;p=p.parent){const d=doorMap.get(p);if(d)return d}return null}
  function toggleDoor(d){
    if(d.st==='closed'||d.st==='closing'&&false){d.a.reset();d.a.paused=false;d.a.play();d.st='opening'}
    else if(d.st==='open'){d.a.paused=false;d.st='closing'}
    else if(d.st==='opening'){/* đang mở: bỏ qua */}
    else if(d.st==='closing'){/* đang đóng */}}
  function updDoors(){for(const d of doorList){
    if(d.st==='opening'&&d.a.time>=d.peak){d.a.time=d.peak;d.a.paused=true;d.st='open'}
    else if(d.st==='closing'&&(d.a.time>=d.end-0.02||!d.a.isRunning())){d.a.stop();d.st='closed'}}}
  function playChair(tag,side){const a=chairActs['ACT_CHAIR_'+tag+'_'+side];if(!a){console.warn('missing chair clip',tag,side);return}
    Object.values(chairActs).forEach(x=>{if(x!==a)x.stop()});a.reset();a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.timeScale=1;a.play();}


  const DEF_VY={id:'vy',K,eye:{close:'ACT_EYE_CLOSE',open:'ACT_EYE_OPEN',blink:'ACT_BLINK'},eyeMeshes:['Sphere','Sphere001'],trim:null,pos:new THREE.Vector3(2.5,0,-1.5),yaw:0.4,ctrl:'wasd'};
  const KB={REST:'ACT_BIN_RESTPOSE',IDLE:'ACT_BIN_IDLE',WALK:'ACT_BIN_WALK',RUN:'ACT_BIN_RUN',
    CLIMBCHAIR_L:'ACT_BIN_CLIMB ON CHAIR_L',CLIMBCHAIR_R:'ACT_BIN_CLIMB ON CHAIR_R',OFFCHAIR_L:'ACT_BIN_OFF CHAIR_L',OFFCHAIR_R:'ACT_BIN_OFF CHAIR_R',
    CLIMBBED_L:'ACT_BIN_SLEEP_CLIMB ON BED_L',CLIMBBED_R:'ACT_BIN_SLEEP_CLIMB ON BED_R',SLEEP_L:'ACT_BIN_SLEEP-LOOP BREATHE_L',SLEEP_R:'ACT_BIN_SLEEP-LOOP BREATHE_R',
    OFFBED_L:'ACT_BIN_SLEEP_OFF BED_L',OFFBED_R:'ACT_BIN_SLEEP_OFF BED_R'};
  const DEF_BIN={id:'bin',K:KB,eye:{close:'ACT_BIN_EYE_CLOSE',open:'ACT_BIN_EYE_OPEN',blink:'ACT_BIN_BLINK'},eyeMeshes:['Sphere002','Sphere003'],trim:null,idleBurst:true,colors:{BLACK:'#16161b',SKIN:'#f2c9b3',BLUE:'#2b37b5',ORANGE:'#f26b1d'},pos:new THREE.Vector3(4.5,0,-1.5),yaw:0.4,ctrl:'wasd'};
  function makeChar(chrG,DEF){
  const K=DEF.K;
  let emitOff=0;const em=(t,a)=>{if(!DEF.remote&&!emitOff&&api.emit)api.emit(t,a)};
  let net=null,netMis=0,lvMis=0;
  const char=chrG.scene;
  if(DEF.colors)char.traverse(o=>{if(!(o.isMesh))return;(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
    const c=DEF.colors[m.name];if(c&&m.color){m.color.set(c);if('metalness' in m){m.metalness=0;m.roughness=1;}}})});
  toonify(char);scene.add(char);
  char.traverse(o=>{if((o.isMesh||o.isSkinnedMesh)&&(()=>{for(let p=o;p&&p!==char;p=p.parent)if(/^cs_/.test(p.name))return true;return false})()){o.visible=false;o.layers.disable(0);}
    else if(o.isMesh||o.isSkinnedMesh){o.frustumCulled=false;o.castShadow=true;o.receiveShadow=false;}});
  ['Workstation','Workstation001'].forEach(n=>{const o=char.getObjectByName(n);if(o)o.removeFromParent()});
  chrG.animations=chrG.animations.filter(c=>!/^ACT_CHAIR/.test(c.name.trim()));
  const mixer=new THREE.AnimationMixer(char);
  const acts={},eye={CLOSE:[],OPEN:[],BLINK:[]};
  // ACT_WALK trong file có ~37 frame cuối đứng yên (chu kỳ chỉ ~34 frame) -> tự cắt phần đứng yên để loop liên tục
  function trimClip(clip,tEnd,shift){
    const tracks=clip.tracks.map(tr=>{const st=tr.getValueSize(),times=[],vals=[];
      for(let i=0;i<tr.times.length;i++)if(tr.times[i]<=tEnd+1e-4){times.push(tr.times[i]-shift);for(let k=0;k<st;k++)vals.push(tr.values[i*st+k]);}
      if(!times.length||times[times.length-1]<tEnd-shift-1e-4){const v=tr.createInterpolant().evaluate(tEnd);times.push(tEnd-shift);for(let k=0;k<st;k++)vals.push(v[k]);}
      return new tr.constructor(tr.name,times,vals,tr.getInterpolation());});
    return new THREE.AnimationClip(clip.name,tEnd-shift,tracks);}
  function autoTrim(clip){
    let tail=0,t0=1e9;
    for(const tr of clip.tracks){const n=tr.times.length;if(n)t0=Math.min(t0,tr.times[0]);if(n<3)continue;
      const st=tr.getValueSize(),v=tr.values;let last=0;
      for(let i=0;i<n-1;i++)for(let k=0;k<st;k++)if(Math.abs(v[i*st+k]-v[(n-1)*st+k])>1e-4){last=i+1;break;}
      tail=Math.max(tail,tr.times[last]);}
    if(!tail||clip.duration-tail<0.1)return clip;
    const tEnd=tail-1/30;console.log('trim',clip.name,'dur',clip.duration.toFixed(3),'->',(tEnd-t0).toFixed(3));
    return trimClip(clip,tEnd,t0);}
  if(DEF.trim)chrG.animations=chrG.animations.map(c=>DEF.trim.test(c.name.trim())?autoTrim(c):c);

  chrG.animations.forEach(c=>{const n=c.name.trim();
    if(n.startsWith(DEF.eye.close))eye.CLOSE.push(mixer.clipAction(c));
    else if(n.startsWith(DEF.eye.open))eye.OPEN.push(mixer.clipAction(c));
    else if(n.startsWith(DEF.eye.blink))eye.BLINK.push(mixer.clipAction(c));
    else if(n.startsWith('ACT_')&&!n.includes('__'))acts[n]=mixer.clipAction(c);});
  mixer.addEventListener('finished',e=>{const n=e.action.getClip().name;if(/EYE_OPEN|BLINK/.test(n))e.action.stop();});
  // Locomotion and continuous idle clips use Three.js native LoopRepeat.
  // Do not manually pause/seek these actions: native looping preserves mixer timing.
  const loopClipNames = new Set([
    'ACT_WALK','ACT_RUN','ACT_STANDING_IDLE',
    'ACT_SITTING_IDLE','ACT_TYPING_IDLE','ACT_SLEEP-LOOP BREATHE'
  ]);
  const once=a=>{a.reset();a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.play();};

  // ===== hips anchors: đo trực tiếp từ clip (pose đầu/cuối) để khớp root giữa các clip flip L/R =====
  const hipsB=char.getObjectByName(THREE.PropertyBinding.sanitizeNodeName('c_root_master.x'));
  const HIP={};
  function sampleHips(a,t){mixer.stopAllAction();a.reset();a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.play();a.time=t;a.setEffectiveWeight(1);
    mixer.update(0);char.updateMatrixWorld(true);const v=new THREE.Vector3();if(hipsB)hipsB.getWorldPosition(v);a.stop();return v}
  if(!hipsB)console.warn('hips bone not found');
  Object.keys(K).forEach(key=>{const a=acts[K[key]];if(!a)return;const cl=a.getClip();let t0=1e9;cl.tracks.forEach(t=>{if(t.times.length)t0=Math.min(t0,t.times[0])});
    HIP[key]={s:sampleHips(a,t0),e:sampleHips(a,cl.duration)}});
  mixer.stopAllAction();
  console.log('HIP '+JSON.stringify(Object.fromEntries(Object.entries(HIP).map(([k,v])=>[k,[v.s.toArray().map(x=>+x.toFixed(2)),v.e.toArray().map(x=>+x.toFixed(2))]]))));

  // ===== eyes: blink =====
  let eyeSt='open',nextBlink=2,blinkEnd=0;
  const eyeClose=()=>{if(eyeSt==='closed')return;eye.OPEN.forEach(a=>a.stop());eye.BLINK.forEach(a=>a.stop());eye.CLOSE.forEach(once);eyeSt='closed'};
  const eyeOpen=()=>{if(eyeSt!=='closed')return;eye.CLOSE.forEach(a=>a.stop());eye.OPEN.forEach(once);eyeSt='open'};
  const blink=t=>{if(eyeSt!=='open'||t<blinkEnd)return;const sp=0.85+Math.random()*0.5;eye.BLINK.forEach(a=>{once(a);a.timeScale=sp});blinkEnd=t+0.45/sp};
  let pendBlink=-1;
  function blinkTick(){
    if(pendBlink>0&&clock>=pendBlink){pendBlink=-1;blink(clock)}
    if(clock>nextBlink){if(eyeSt==='open'){blink(clock);nextBlink=clock+(Math.random()<0.18?0.2+Math.random()*0.15:Math.min(7,1.6-Math.log(Math.random())*2.2));}else nextBlink=clock+1;}
  }

  // ===== player =====
  const P={sp:0,pos:DEF.pos.clone(),yaw:DEF.yaw,level:0,mode:'free',side:'L',stand:null};
  let plan=[],busy=null,cur=null,clock=0,anchor=null;
  const off=new THREE.Vector3(),offFrom=new THREE.Vector3(),offTo=new THREE.Vector3(),ZERO=new THREE.Vector3();let offT=1,offD=0.3;
  function setOff(to,dur){offFrom.copy(off);offTo.copy(to);offT=0;offD=Math.max(dur,0.001)}
  function offFor(key){if(!anchor)return ZERO;if(key==='SIT'||key==='TYPE'||key.startsWith('SLEEP_')){const h=HIP[key];return h?anchor.clone().sub(h.s):ZERO}return ZERO}
  const layers=[];
  function play(key,o={}){
    const a=acts[K[key]];if(!a){console.warn('missing',key,K[key]);return null}
    if(cur===a&&!o.restart)return a;
    const fade=Math.min(o.fade??0.25,CFG.maxFade)*CFG.fadeScale;
    a.enabled=true;a.paused=false;
    a.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, o.once ? 1 : Infinity);
    a.clampWhenFinished=!!o.once;
    a.timeScale=o.ts||1;
    a.reset();a.play();
    if(cur!==a){
      let sum=0;layers.forEach(l=>sum+=l.w);if(sum>0)layers.forEach(l=>l.w/=sum);
      if(!layers.includes(a)){a.w=0;layers.push(a);}
      a._fade=Math.max(fade,1e-4);
      if(fade<=1e-4)layers.forEach(l=>{l.w=l===a?1:0});
      a.setEffectiveWeight(a.w);
      cur=a;
    }
    setOff(offFor(key),fade);
    return a;
  }
  function updateLayers(dt){
    const c=cur;if(!c)return;
    if(c.w<1)c.w=Math.min(1,c.w+dt/c._fade);
    const rest=1-c.w;let sum=0;for(const l of layers)if(l!==c)sum+=l.w;
    for(const l of layers)if(l!==c)l.w=sum>1e-6?l.w*rest/sum:0;
    for(let i=layers.length-1;i>=0;i--){const l=layers[i];
      if(l!==c&&l.w<0.002){l.stop();l.w=0;layers.splice(i,1);}else l.setEffectiveWeight(l.w);}
  }
  const runMode={v:false};
  let restT=0,idleHeld=false;
  const toRest=(instant)=>{play('REST',{fade:instant?0:0.25});restT=0;idleHeld=false};
  // idle: Vy lặp liên tục sau 5s; Bin (idleBurst) đứng RESTPOSE rồi cứ 5–10s diễn trọn clip IDLE 1 lần (đủ 106 khung) rồi về RESTPOSE
  let idleDone=false,nextIdleAt=5+Math.random()*5;
  mixer.addEventListener('finished',e=>{if(DEF.idleBurst&&e.action===acts[K.IDLE])idleDone=true});
  function idleTick(dt){
    if(cur===acts[K.IDLE]&&idleHeld){if(DEF.idleBurst&&idleDone){idleDone=false;toRest();nextIdleAt=5+Math.random()*5}}
    else if(cur===acts[K.REST]){restT+=dt;if(restT>(DEF.idleBurst?nextIdleAt:5)){idleDone=false;play('IDLE',DEF.idleBurst?{fade:0.12,once:true}:{fade:0.1});idleHeld=true}}
    else toRest();
  }
  const wp=(x,z,setLevel,run)=>({t:'wp',x,z,setLevel,run:run||runMode.v});

  // vị trí root cho từng phía (L/R): hông cuối clip leo phải trùng tâm ghế / giường
  function chairPose(side){const an=HIP['CLIMBCHAIR_'+side].e,y=A.chairYaw,c=Math.cos(y),s=Math.sin(y);
    const tx=A.seatC.x+A.fwd.x*CFG.sitFwd,tz=A.seatC.z+A.fwd.z*CFG.sitFwd;
    return new THREE.Vector3(tx-(an.x*c+an.z*s),A.CY+CFG.sitYAdj,tz-(-an.x*s+an.z*c));}
  const chairStandOf=side=>{const v=chairPose(side);v.y=A.CY;return v};
  // ghế làm việc là vật cản cho đường đi A*/click-để-đi (WASD đã có CHB). Chừa lại 2 ô đứng hai bên ghế để còn bước tới ngồi.
  {const g=G,lv=A.chairL,cb=new THREE.Box3().setFromObject(CHAIR);
    if(!cb.isEmpty()){
      const stands=['L','R'].map(sd=>chairStandOf(sd));
      const mk=G._chair||(G._chair={mine:new Set(),stands:[]});mk.stands.push(...stands);
      const i0=cl(Math.floor((cb.min.x-g.R-g.x0)/g.c),0,g.W-1),i1=cl(Math.floor((cb.max.x+g.R-g.x0)/g.c),0,g.W-1),j0=cl(Math.floor((cb.min.z-g.R-g.z0)/g.c),0,g.H-1),j1=cl(Math.floor((cb.max.z+g.R-g.z0)/g.c),0,g.H-1);
      for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const k=j*g.W+i,x=g.x0+(i+.5)*g.c,z=g.z0+(j+.5)*g.c;
        if(!(x>cb.min.x&&x<cb.max.x&&z>cb.min.z&&z<cb.max.z)&&mk.stands.some(v=>Math.hypot(v.x-x,v.z-z)<0.22)){if(mk.mine.has(k)){blocked[lv][k]=0;mk.mine.delete(k)}continue}
        if(!blocked[lv][k]){blocked[lv][k]=1;mk.mine.add(k)}}}}
  const bedPose=side=>new THREE.Vector3(side==='L'?A.bedBox.min.x-CFG.bedSide:A.bedBox.max.x+CFG.bedSide,A.L1,A.bedBox.min.z+CFG.bedHeadZ);
  const bedRootY=()=>A.mattress.max.y-CFG.bedHipH;

  function startPos(){return (P.mode==='bed'||P.mode==='sit'||P.mode==='type')&&P.stand?P.stand.clone():P.pos.clone()}
  function pickSide(fn){const p=startPos();return ['L','R'].map(s=>{const v=fn(s);return{s,d:Math.hypot(v.x-p.x,v.z-p.z)}}).sort((a,b)=>a.d-b.d)[0].s}
  function route(x,z,lv,run,exact){const it=[],s=startPos();let L=P.level,x0=s.x,z0=s.z;
    const add=pts=>pts.forEach(p=>it.push(wp(p.x,p.z,null,run)));
    if(L===0&&lv===1){const S=pickStair(x0,z0,x,z,true),cx=S.cx;add(findPath(x0,z0,cx,S.botZ,0,true));it.push(wp(cx,S.midZ,1,run),wp(cx,S.topZ,null,run));x0=cx;z0=S.topZ}
    else if(L===1&&lv===0){const S=pickStair(x0,z0,x,z,false),cx=S.cx;add(findPath(x0,z0,cx,S.topZ,1,true));it.push(wp(cx,S.midZ,0,run),wp(cx,S.botZ,null,run));x0=cx;z0=S.botZ}
    add(findPath(x0,z0,x,z,lv,exact));return it;}
  const leave=()=>{const k=busy&&busy.kind;return (P.mode==='bed'||k==='climbBed')?[{t:'offBed'}]:(P.mode==='sit'||P.mode==='type'||k==='climbChair')?[{t:'offChair'}]:[]};
  function cmdMove(x,z,lv,run){
    em('move',[r3(x),r3(z),lv,run?1:0]);
    if(lv===0){x=clamp(x,MC.walk0[0],MC.walk0[1]);z=clamp(z,MC.walk0[2],MC.walk0[3]);} else {x=clamp(x,MC.cl1[0],MC.cl1[1]);z=clamp(z,MC.cl1[2],MC.cl1[3]);}
    {const S=stairAt(x,z);if(S){lv=z>S.midZ?0:1;x=S.cx;z=lv?S.topZ:S.botZ;}}
    plan=[...leave(),...route(x,z,lv,run||runMode.v)];
  }
  function cmdSleep(){em('sleep');if(P.mode==='bed')return;const p0=startPos();const sides=['L','R'].filter(x=>!occ['bed'+x]||occ['bed'+x]===DEF.id).sort((a,b)=>{const va=bedPose(a),vb=bedPose(b);return Math.hypot(va.x-p0.x,va.z-p0.z)-Math.hypot(vb.x-p0.x,vb.z-p0.z)});if(!sides.length){toast('Giường đã có 2 người');return}const side=sides[0],s=bedPose(side);occ['bed'+side]=DEF.id;
    plan=[...leave(),...route(s.x,s.z,1,false,true),{t:'face',yaw:0},{t:'climbBed',side}];}
  function cmdSit(type){em('sit',type||0);if(P.mode==='sit'||P.mode==='type'){if(type)plan=[{t:type==='type'?'type':'sitidle'}];return}
    if(occ.chair&&occ.chair!==DEF.id){toast('Ghế đang có người');return}
    const side=pickSide(chairStandOf),s=chairStandOf(side);
    plan=[...leave(),...route(s.x,s.z,A.chairL,false,true),{t:'face',yaw:A.chairYaw},{t:'climbChair',side}];if(type==='type')plan.push({t:'type'});}
  const cmdWake=()=>{em('wake');if(P.mode==='bed'||(busy&&busy.kind==='climbBed'))plan=[{t:'offBed'}];else if(plan.some(s=>s.t==='climbBed')){plan=[];['bedL','bedR'].forEach(k=>{if(occ[k]===DEF.id)occ[k]=null})}};
  const cmdOffChair=()=>{em('off');if(P.mode==='sit'||P.mode==='type'||(busy&&busy.kind==='climbChair'))plan=[{t:'offChair'}];else if(plan.some(s=>s.t==='climbChair')){plan=[];if(occ.chair===DEF.id)occ.chair=null}};

  // clip nhân vật + clip ghế (nếu có) bắt đầu CÙNG MỘT LÚC
  function startBusy(kind,key,chairTag,y0,y1){
    const a=play(key,{once:true,fade:0.15,restart:true});
    if(chairTag)playChair(chairTag,P.side);
    busy={kind,a,dur:a.getClip().duration,y0,y1};P.pos.y=y0;
  }
  // clip off kết thúc lệch root (hông ở xa gốc) -> dời root theo đúng chỗ hông đã tới, tránh bị kéo/snap khi về REST
  function endDrift(key){const e=HIP[key]&&HIP[key].e,r=HIP.REST&&HIP.REST.s;if(!e||!r)return false;
    const dx=e.x-r.x,dz=e.z-r.z;if(Math.hypot(dx,dz)<0.02)return false;const c=Math.cos(P.yaw),s=Math.sin(P.yaw);
    P.pos.x+=dx*c+dz*s;P.pos.z+=-dx*s+dz*c;return true;}
  function updateBusy(dt){
    const b=busy,p=clamp(b.a.time/b.dur,0,1);
    P.pos.y=THREE.MathUtils.lerp(b.y0,b.y1,sstep(0.2,0.8,p));
    if(b.kind==='climbBed'&&p>=CFG.eyeCloseAt)eyeClose();
    if(p>=0.995||(!b.a.isRunning()&&p>0.9)){
      busy=null;P.pos.y=b.y1;
      if(b.kind==='climbBed'){P.mode='bed';if(plan[0]&&plan[0].t==='offBed'){}else{play('SLEEP_'+P.side,{fade:0.05});eyeClose();}}
      else if(b.kind==='climbChair'){if(plan[0]&&plan[0].t==='offChair'){P.mode='sit'}else if(!K.SIT){P.mode='sit';}else if(plan[0]&&plan[0].t==='type'){plan.shift();P.mode='type';play('TYPE',{fade:0.05});}else{P.mode='sit';play('SIT',{fade:0.1});}}
      else if(b.kind==='offBed'){occ['bed'+P.side]=null;const dr=endDrift('OFFBED_'+P.side);P.mode='free';P.level=1;P.stand=null;anchor=null;toRest(dr);}
      else if(b.kind==='offChair'){occ.chair=null;const dr=endDrift('OFFCHAIR_'+P.side);P.mode='free';P.level=A.chairL;P.stand=null;anchor=null;toRest(dr);}
    }
  }

  function updatePlan(dt){
    if(busy||plan[0])idleHeld=false;
    {const _i=plan[0];if(busy||!(_i&&_i.t==='wp'))P.sp=0;}
    if(busy){updateBusy(dt);return}
    const it=plan[0];
    if(!it){ if(P.mode==='free')idleTick(dt); return; }
    switch(it.t){
      case 'wp':{
        const dx=it.x-P.pos.x,dz=it.z-P.pos.z,d=Math.hypot(dx,dz);
        const last=!(plan[1]&&plan[1].t==='wp');
        const arrive=last?0.02:Math.max(0.1,P.sp*0.12);
        if(d<=arrive){if(last){P.pos.x=it.x;P.pos.z=it.z;}if(it.setLevel!=null)P.level=it.setLevel;plan.shift();break}
        const diff=angDiff(Math.atan2(dx,dz),P.yaw);
        P.yaw+=clamp(diff*(1-Math.exp(-dt*30)),-22*dt,22*dt);
        P.sp=(it.run?CFG.run:CFG.walk)*(stairAt(P.pos.x,P.pos.z)?0.85:1);
        const mx=(last&&d<0.5)?dx/d:Math.sin(P.yaw),mz=(last&&d<0.5)?dz/d:Math.cos(P.yaw);
        const st=Math.min(P.sp*dt,d);P.pos.x+=mx*st;P.pos.z+=mz*st;
        play(it.run?'RUN':'WALK',{fade:0.2});
        break;}
      case 'face':{const diff=angDiff(it.yaw,P.yaw);
        if(Math.abs(diff)<0.04){P.yaw=it.yaw;plan.shift();break}
        P.yaw+=clamp(diff,-9*dt,9*dt);play(DEF.idleBurst?'REST':'IDLE',{fade:0.2});break;}
      case 'climbBed':{plan.shift();if(occ['bed'+it.side]&&occ['bed'+it.side]!==DEF.id){plan=[];toast('Phía giường này có người');break}occ['bed'+it.side]=DEF.id;P.yaw=0;P.level=1;P.side=it.side;const s=bedPose(it.side);P.stand=s.clone();P.pos.x=s.x;P.pos.z=s.z;
        anchor=HIP['CLIMBBED_'+it.side].e.clone();startBusy('climbBed','CLIMBBED_'+it.side,null,A.L1,bedRootY());break;}
      case 'climbChair':{plan.shift();if(occ.chair&&occ.chair!==DEF.id){plan=[];toast('Ghế đang có người');break}occ.chair=DEF.id;P.yaw=A.chairYaw;P.side=it.side;const s=chairStandOf(it.side);P.stand=s.clone();P.pos.x=s.x;P.pos.z=s.z;
        anchor=HIP['CLIMBCHAIR_'+it.side].e.clone();startBusy('climbChair','CLIMBCHAIR_'+it.side,'CLIMBUP',A.CY,A.CY+CFG.sitYAdj);break;}
      case 'offBed':{plan.shift();eyeOpen();startBusy('offBed','OFFBED_'+P.side,null,bedRootY(),A.L1);break;}
      case 'offChair':{plan.shift();startBusy('offChair','OFFCHAIR_'+P.side,'OFF',A.CY+CFG.sitYAdj,A.CY);break;}
      case 'type':{plan.shift();if(P.mode==='sit'&&K.TYPE){P.mode='type';play('TYPE',{fade:0.06});}break;}
      case 'sitidle':{plan.shift();if(P.mode==='type'){P.mode='sit';play('SIT',{fade:0.2});}break;}
    }
  }

  // ===== EYE TARGET: tự animate empty LazyRig_EyeTarget, mắt (Sphere) aim theo =====
  const eyeTarget=char.getObjectByName('LazyRig_EyeTarget'),eyeFrame=char.getObjectByName('LazyRig_EyeFrame');
  const eyeMeshes=DEF.eyeMeshes.map(n=>char.getObjectByName(n));
  const ER={ok:!!(eyeTarget&&eyeFrame&&eyeMeshes[0]&&eyeMeshes[1])};
  if(ER.ok){eyeFrame.updateMatrix();ER.q0=eyeMeshes.map(e=>e.quaternion.clone());ER.T0=eyeTarget.position.clone().applyMatrix4(eyeFrame.matrix);}
  else console.warn('eye rig nodes missing',!!eyeTarget,!!eyeFrame,eyeMeshes.map(e=>!!e));
  const gaze={cur:new THREE.Vector3(),tgt:new THREE.Vector3(),next:1,fast:true};
  function pickGaze(){
    const bx=CFG.eyeBoxX,by=CFG.eyeBoxY,rnd=()=>Math.random()-0.5,prev=gaze.tgt.clone();let x=0,y=0,fast=true;
    if(P.mode==='bed'||busy){gaze.tgt.set(0,0,0);gaze.next=0.4;return}
    if(P.mode==='type'){
      if(Math.random()<0.25){x=rnd()*bx*0.6;y=-by*0.9}else{x=rnd()*bx*1.2;y=-by*0.15+rnd()*0.05}
      gaze.next=0.35-Math.log(Math.random())*0.7}
    else if(P.mode==='sit'){
      if(Math.random()<0.2){x=rnd()*bx*2;y=rnd()*by*1.6}else{x=rnd()*bx*0.7;y=rnd()*by*0.5}
      gaze.next=0.6-Math.log(Math.random())*1.4}
    else{const it=plan[0];
      if(it&&it.t==='wp'){const d=angDiff(Math.atan2(it.x-P.pos.x,it.z-P.pos.z),P.yaw);x=clamp(d*0.3,-bx,bx);y=0.02+rnd()*0.02;gaze.next=0.35+Math.random()*0.5;fast=false}
      else{if(Math.random()<0.22){x=rnd()*bx*2;y=rnd()*by*1.6}else{x=rnd()*bx*0.8;y=rnd()*by*0.6}
        gaze.next=0.5-Math.log(Math.random())*1.6}}
    gaze.tgt.set(clamp(x,-bx,bx),clamp(y,-by,by),0);gaze.fast=fast;
    if(prev.distanceTo(gaze.tgt)>0.12&&Math.random()<0.45)pendBlink=clock+0.03+Math.random()*0.06;
  }
  const _q=new THREE.Quaternion(),_q2=new THREE.Quaternion(),_d0=new THREE.Vector3(),_d1=new THREE.Vector3(),_T=new THREE.Vector3();
  function updateEyes(dt){
    if(!ER.ok)return;
    gaze.next-=dt;if(gaze.next<=0)pickGaze();
    gaze.cur.lerp(gaze.tgt,1-Math.exp(-dt*(gaze.fast?CFG.eyeSpeed:7)));
    const jx=Math.sin(clock*9.1)*0.004+Math.sin(clock*3.7)*0.003,jy=Math.sin(clock*7.7+1)*0.003;
    eyeTarget.position.set(clamp(gaze.cur.x+jx,-CFG.eyeBoxX,CFG.eyeBoxX),clamp(gaze.cur.y+jy,-CFG.eyeBoxY,CFG.eyeBoxY),clamp(gaze.cur.z,-0.1,0.2));
    eyeFrame.updateMatrix();_T.copy(eyeTarget.position).applyMatrix4(eyeFrame.matrix);
    const mx=CFG.eyeMaxDeg*Math.PI/180;
    eyeMeshes.forEach((e,i)=>{_d0.copy(ER.T0).sub(e.position).normalize();_d1.copy(_T).sub(e.position).normalize();
      _q.setFromUnitVectors(_d0,_d1);const ang=2*Math.acos(Math.min(1,Math.abs(_q.w)));
      if(ang>mx){_q2.copy(_q);_q.identity().slerp(_q2,mx/ang);}
      e.quaternion.copy(_q).multiply(ER.q0[i]);});
  }

  // ----- collision helpers (lưới chặn dùng chung) -----
  const CHB=(()=>{const b=new THREE.Box3().setFromObject(CHAIR);return b.isEmpty()?null:[b.min.x-0.1,b.min.z-0.1,b.max.x+0.1,b.max.z+0.1]})();
  function walkable(ox,oz,x,z){
    const S=stairAt(x,z),W=stairAt(ox,oz),ins=!!S,was=!!W,lv=(was&&!ins)?(z<W.midZ?1:0):P.level;
    if(ins){
      if(x<S.x0+0.1||x>S.x1-0.1)return false;
      if(was&&W!==S)return false;
      if(!was){const fromBottom=P.level===0&&oz>=S.z1-0.03&&z<oz,fromTop=P.level===1&&oz<=S.z0+0.08&&z>oz;if(!fromBottom&&!fromTop)return false;}
      return true;}
    if(was&&!ins){const atBot=z>=W.z1+0.05&&oz<W.z1+0.05,atTop=z<=W.z0&&oz>W.z0;if((!atBot&&!atTop)||x<W.x0+0.02||x>W.x1-0.02)return false}   // đang ở trên cầu thang: chỉ được ra ở chân/đỉnh, đúng bề ngang bậc
    if(lv===0){const w=MC.walk0;if(x<w[0]||x>w[1]||z<w[2]||z>w[3])return false}
    else{const w=MC.l1;if(x<w[0]||x>w[1]||z<w[2]||z>(w[3]==null?stairs[0].z0+0.02:w[3]))return false}
    if(lv===A.chairL&&CHB&&x>CHB[0]&&x<CHB[2]&&z>CHB[1]&&z<CHB[3]&&!(ox>CHB[0]&&ox<CHB[2]&&oz>CHB[1]&&oz<CHB[3]))return false;
    const c=cell(x,z);return free(lv,c[0],c[1]);}
  function stepMove(dx,dz){
    const ox=P.pos.x,oz=P.pos.z,nx=ox+dx,nz=oz+dz,W=stairAt(ox,oz),M=0.2;
    // phễu cầu thang: vào/ở trong cầu thang thì tự căn giữa (cách mép/tay vịn M), không bị kẹt
    const fx=(x,z)=>{let S=W;if(!S){const T=stairAt(x,z);if(T&&x>T.x0-0.14&&x<T.x1+0.14)S=T}return S?Math.min(S.x1-M,Math.max(S.x0+M,x)):x};
    let x1=fx(nx,nz);if(walkable(ox,oz,x1,nz)){P.pos.x=x1;P.pos.z=nz;return}
    x1=fx(nx,oz);if(walkable(ox,oz,x1,oz)){P.pos.x=x1;return}
    x1=fx(ox,nz);if(walkable(ox,oz,x1,nz)){P.pos.x=x1;P.pos.z=nz;return}
    P.sp*=0.5;}
    function pushOut(){
    if(inStair(P.pos.x,P.pos.z))return;
    const c=cell(P.pos.x,P.pos.z);if(free(P.level,c[0],c[1]))return;
    let best=null,bd=1e9;
    for(let r=1;r<8&&!best;r++)for(let dj=-r;dj<=r;dj++)for(let di=-r;di<=r;di++){if(Math.max(Math.abs(di),Math.abs(dj))!==r)continue;
      if(free(P.level,c[0]+di,c[1]+dj)){const d=di*di+dj*dj;if(d<bd){bd=d;best=[c[0]+di,c[1]+dj]}}}
    if(best){const tx=G.x0+(best[0]+.5)*G.c,tz=G.z0+(best[1]+.5)*G.c;P.pos.x+=(tx-P.pos.x)*0.35;P.pos.z+=(tz-P.pos.z)*0.35;}}
  const nearestDist=fn=>Math.min(...['L','R'].map(s=>{const v=fn(s);return Math.hypot(v.x-P.pos.x,v.z-P.pos.z)}));

  // ----- WASD control -----
  function manualUpdate(dt,inp){if(inp.interact){em('int');emitOff++;try{manualUpdate0(dt,inp)}finally{emitOff--}}else manualUpdate0(dt,inp)}
  function manualUpdate0(dt,inp){
    if(busy&&(inp.mag>0.1||inp.interact)&&!plan[0]){if(busy.kind==='climbBed')plan=[{t:'offBed'}];else if(busy.kind==='climbChair')plan=[{t:'offChair'}]}
    if(busy||plan[0]){
      if(!busy&&plan[0]&&plan[0].t==='wp'&&inp.mag>0.1)plan=[];
      else{updatePlan(dt);return}}
    if(inp.interact){
      if(P.mode==='bed'){plan=[{t:'offBed'}];return}
      if(P.mode==='sit'||P.mode==='type'){plan=[{t:'offChair'}];return}
      const dB=nearestDist(bedPose),dC=nearestDist(chairStandOf),bOK=P.level===1&&dB<2.2,cOK=P.level===A.chairL&&dC<2.2;
      if(cOK&&(!bOK||dC<=dB)){cmdSit();return}if(bOK){cmdSleep();return}}
    if(P.mode==='bed'||P.mode==='sit'||P.mode==='type'){
      if(inp.mag>0.1)plan=[{t:P.mode==='bed'?'offBed':'offChair'}];
      return;}
    if(inp.mag>0.1){
      const diff=angDiff(Math.atan2(inp.x,inp.z),P.yaw);
      P.yaw+=clamp(diff*(1-Math.exp(-dt*30)),-22*dt,22*dt);
      P.sp=(inp.run?CFG.run:CFG.walk)*(stairAt(P.pos.x,P.pos.z)?0.85:1);
      stepMove(Math.sin(P.yaw)*P.sp*dt,Math.cos(P.yaw)*P.sp*dt);
      play(inp.run?'RUN':'WALK',{fade:0.15});idleHeld=false;
    }else{
      P.sp=0;
      idleTick(dt);
    }
  }

  // ----- update: logic trước, apply sau (để tách va chạm giữa 2 nhân vật) -----
  function logic(dt,inp){
    clock+=dt;
    if(DEF.ctrl==='wasd')manualUpdate(dt,inp);else updatePlan(dt);
    for(const x of ['L','R'])if(occ['bed'+x]===DEF.id&&P.mode!=='bed'&&!(busy&&busy.kind==='climbBed')&&!plan.some(i=>i.t==='climbBed'))occ['bed'+x]=null;
    if(!busy&&!plan[0]&&P.mode==='free')pushOut();
    if(DEF.ctrl==='wasd'){const S=stairAt(P.pos.x,P.pos.z);if(P._S&&!S&&!plan[0])P.level=P.pos.z<P._S.midZ?1:0;P._S=S;}
    if(!busy&&P.mode==='free'){const h=heightAt(P.pos.x,P.pos.z,P.level);P.pos.y+=(h-P.pos.y)*(1-Math.exp(-dt*(stairAt(P.pos.x,P.pos.z)?70:16)));}
    if(DEF.remote&&net)correct(dt);
  }
  // ----- nhân vật remote: nắn dần về snapshot của chủ nhân vật (chủ là authority) -----
  function correct(dt){const s=net,age=Math.min(0.8,(performance.now()-s.t)/1000);
    const tx=s.x+s.vx*age,tz=s.z+s.vz*age,dx=tx-P.pos.x,dz=tz-P.pos.z,d=Math.hypot(dx,dz);
    if(d>9||(d>3&&s.l!==P.level)){P.pos.set(tx,s.y,tz);P.level=s.l;P.yaw=s.w;plan=[];return}      // chỉ 'dịch chuyển' khi lệch rất xa / khác tầng; còn lại lướt nhanh về đúng chỗ
    if(busy)return;
    if(P.mode==='free'){
      const k=1-Math.exp(-dt*(d>3?16:d>0.6?8:3.5));P.pos.x+=dx*k;P.pos.z+=dz*k;
      // tầng của bản sao tự suy ra từ lúc rời cầu thang; chỉ nhận tầng từ snapshot khi lệch KÉO DÀI (snapshot cũ 0.1–0.2s đã làm nhân vật tụt/nhảy tầng)
      if(!stairAt(P.pos.x,P.pos.z)&&!plan[0]){
        if(s.l===P.level)lvMis=0;
        else if(!stairAt(s.x,s.z)&&Math.hypot(s.x-P.pos.x,s.z-P.pos.z)<0.8){lvMis+=dt;if(lvMis>0.7){P.level=s.l;lvMis=0}}
        else lvMis=0;}
      if(P.sp<0.05&&!plan[0])P.yaw+=angDiff(s.w,P.yaw)*(1-Math.exp(-dt*6));}
    // đồng bộ chế độ (nằm/ngồi) nếu lệch kéo dài
    if(s.m!==P.mode&&!s.b&&!plan[0]){netMis+=dt;if(netMis>0.8){netMis=0;
      if(s.m==='bed')cmdSleep();else if(s.m==='sit'||s.m==='type')cmdSit(s.m==='type'?'type':0);else if(P.mode==='bed')cmdWake();else cmdOffChair();}}
    else netMis=0;}
  function setNet(s){net=s}
  function dispose(){
    for(const x of ['L','R'])if(occ['bed'+x]===DEF.id)occ['bed'+x]=null;if(occ.chair===DEF.id)occ.chair=null;
    mixer.stopAllAction();mixer.uncacheRoot(char);scene.remove(char);
    const seen=new Set();char.traverse(o=>{if(o.geometry&&!seen.has(o.geometry)){seen.add(o.geometry);o.geometry.dispose()}
      const ms=Array.isArray(o.material)?o.material:o.material?[o.material]:[];ms.forEach(m=>{if(seen.has(m))return;seen.add(m);for(const k in m){const t=m[k];if(t&&t.isTexture&&!seen.has(t)){seen.add(t);t.dispose()}}m.dispose()})});
  }
  function finish(dt){
    if(offT<1){offT=Math.min(1,offT+dt/offD);off.lerpVectors(offFrom,offTo,offT);}
    char.rotation.y=P.yaw;
    const c=Math.cos(P.yaw),s=Math.sin(P.yaw);
    char.position.set(P.pos.x+off.x*c+off.z*s,P.pos.y+off.y,P.pos.z-off.x*s+off.z*c);
    if(cur===acts[K.WALK])cur.timeScale=CFG.walkAnim;else if(cur===acts[K.RUN])cur.timeScale=CFG.runAnim;
    updateLayers(dt);mixer.update(dt);updateEyes(dt);blinkTick();
  }
  play('REST',{fade:0});
  return{id:DEF.id,DEF,char,P,K,acts,runMode,logic,finish,setNet,dispose,cmdMove,cmdSleep,cmdSit,cmdWake,cmdOffChair,blink:()=>{em('blink');blink(clock)},
    get plan(){return plan},get cur(){return cur},get busy(){return busy}};
  }
  const DEFS={vy:DEF_VY,bin:DEF_BIN};
  const local=makeChar(ctx.localGlb,{...DEFS[ctx.localSlot]});api.local=local;let remote=null;
  const rinp={x:0,z:0,mag:0,run:false,interact:false};let rinpT=0;
  const runMode=local.runMode,P=local.P,{cmdMove,cmdSleep,cmdSit,cmdWake,cmdOffChair}=local;
  // tách 2 nhân vật không chồng lên nhau
  function separate(){if(!remote)return;const a=local.P,b=remote.P;if(a.mode!=='free'||b.mode!=='free'||local.busy||remote.busy||a.level!==b.level)return;
    const dx=b.pos.x-a.pos.x,dz=b.pos.z-a.pos.z,d=Math.hypot(dx,dz),m=0.38;if(d>=m||d<1e-4)return;
    const k=(m-d)/2/d;a.pos.x-=dx*k;a.pos.z-=dz*k;b.pos.x+=dx*k;b.pos.z+=dz*k;}
  // phím
  const keys=new Set();let interactFlag=false;
  addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
    if(e.code==='KeyE'&&!e.repeat)interactFlag=true;keys.add(e.code);if(/^Key[WASD]$/.test(e.code))e.preventDefault();});
  addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
  const _fv=new THREE.Vector3();
  function readInput(){
    camera.getWorldDirection(_fv);let fx=_fv.x,fz=_fv.z;const fl=Math.hypot(fx,fz)||1;fx/=fl;fz/=fl;
    const ix=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),iz=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0);
    let x=fx*iz+(-fz)*ix,z=fz*iz+fx*ix;const m=Math.hypot(x,z);if(m>0){x/=m;z/=m}
    const inp={x,z,mag:m>0?1:0,run:keys.has('ShiftLeft')||keys.has('ShiftRight'),interact:interactFlag};interactFlag=false;return inp;}

  // input
  const ray=new THREE.Raycaster(),mv=new THREE.Vector2();
  const marker=new THREE.Mesh(new THREE.RingGeometry(0.1,0.14,24).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0x4fc3ff,depthTest:false,transparent:true}));
  marker.renderOrder=999;marker.visible=false;scene.add(marker);let markT=0;
  let down=null;
  renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,b:e.button}});
  function pick(e,run){
    mv.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight)*2+1);ray.setFromCamera(mv,camera);
    const hits=ray.intersectObjects(envMeshes,false);
    for(const h of hits){
      if(h.object.userData.glass)continue;
      {const dr=doorOf(h.object);if(dr){doHalo(dr.node);toggleDoor(dr);if(api.emit)api.emit('door',dr.node.name);return}}
      if(isUnder(h.object,'Bed')){doHalo('Bed');cmdSleep();return}
      if(isUnder(h.object,CHAIR.name)){doHalo(CHAIR.name);cmdSit();return}
      const n=h.face?h.face.normal.clone().transformDirection(h.object.matrixWorld):new THREE.Vector3(0,1,0);
      if(n.y<0.6)continue;
      const p=h.point;marker.position.set(p.x,p.y+0.02,p.z);marker.visible=true;markT=1.2;
      cmdMove(p.x,p.z,p.y>2?1:0,run);return;
    }
  }
  renderer.domElement.addEventListener('pointerup',e=>{
    if(!down||down.b!==0)return;if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;
    pick(e,e.detail>=2||e.shiftKey);
  });
  $('bWalk').onclick=()=>{runMode.v=false;local.plan.forEach(i=>{if(i.t==='wp')i.run=false})};
  $('bRun').onclick=()=>{runMode.v=true;local.plan.forEach(i=>{if(i.t==='wp')i.run=true})};
  $('bSleep').onclick=cmdSleep;$('bWake').onclick=cmdWake;
  $('bSit').onclick=()=>cmdSit();$('bType').onclick=()=>{if(P.mode==='type')cmdSit('sit');else cmdSit('type')};
  $('bOff').onclick=cmdOffChair;$('bBlink').onclick=()=>local.blink();
  document.querySelectorAll('input[data-k]').forEach(el=>{const k=el.dataset.k;el.max=Math.max(+el.max,k==='run'?10:k==='walk'?6:3);el.value=CFG[k];$('v'+k).textContent=el.value;el.oninput=()=>{CFG[k]=+el.value;$('v'+k).textContent=el.value;try{localStorage.setItem('vyCfg',JSON.stringify({v:3,walk:CFG.walk,run:CFG.run,walkAnim:CFG.walkAnim,runAnim:CFG.runAnim}))}catch(e){}}});
  try{const sv=JSON.parse(localStorage.getItem('vyCfg')||'null');if(sv&&sv.v===3){['walk','run','walkAnim','runAnim'].forEach(k=>{if(sv[k]!=null){CFG[k]=sv[k];const el=document.querySelector('input[data-k='+k+']');if(el){el.value=sv[k];$('v'+k).textContent=sv[k]}}})}}catch(e){}

  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);const pr=Math.min(curPR,1.25);composer.setPixelRatio(pr);composer.setSize(innerWidth,innerHeight);fxaaP.material.uniforms['resolution'].value.set(1/(innerWidth*pr),1/(innerHeight*pr))});


  // ===== BẦU TRỜI stylized (dải màu + mặt trời + mây khối) + sương + nền cỏ vô hạn =====
  const SKY={top:'#86b3ea',mid:'#c9d6f2',pink:'#f5c6c6',hor:'#ffe3c4'};
  const skyU={cTop:{value:new THREE.Color(SKY.top)},cMid:{value:new THREE.Color(SKY.mid)},cPink:{value:new THREE.Color(SKY.pink)},cHor:{value:new THREE.Color(SKY.hor)},
    cCl:{value:new THREE.Color('#ffffff')},cClSh:{value:new THREE.Color('#e8d8e8')},cth:{value:0.58},uStar:{value:0},uSunV:{value:1},
    sunDir:{value:new THREE.Vector3(0.55,0.5,0.65).normalize()},moonDir:{value:new THREE.Vector3(-0.5,0.4,-0.3).normalize()},uT:{value:0}};
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1,32,16),new THREE.ShaderMaterial({uniforms:skyU,side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false,toneMapped:false,
    vertexShader:'varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying vec3 vD;uniform vec3 cTop,cMid,cPink,cHor,cCl,cClSh,sunDir,moonDir;uniform float uT,cth,uStar,uSunV;
    float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float h31(vec3 p){p=fract(p*0.3183099+vec3(.1,.2,.3));p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
    float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
    void main(){vec3 d=normalize(vD);float h=d.y;
      float t=clamp(h,0.0,1.0);
      vec3 c=cHor;c=mix(c,cPink,smoothstep(0.02,0.06,t));c=mix(c,cMid,smoothstep(0.1,0.16,t));c=mix(c,cTop,smoothstep(0.3,0.38,t));
      if(h<0.0)c=cHor;
      float up=step(0.0,h);
      // sao
      vec3 sp=d*150.0;float st=step(0.9968,h31(floor(sp)));st*=0.55+0.45*sin(uT*2.5+h31(floor(sp)+7.0)*40.0);
      c+=vec3(st)*uStar*smoothstep(0.03,0.3,h)*up;
      // mặt trời + quầng bậc thang
      float sd=dot(d,normalize(sunDir));
      c+=vec3(1.0,0.78,0.5)*smoothstep(0.93,0.99,sd)*0.28*uSunV*up;
      c=mix(c,vec3(1.0,0.97,0.82),smoothstep(0.9975,0.9982,sd)*uSunV*up);
      // mặt trăng
      float md=dot(d,normalize(moonDir));
      c=mix(c,vec3(0.95,0.96,1.0),smoothstep(0.9988,0.9991,md)*uStar*up);
      c+=vec3(0.5,0.6,0.9)*smoothstep(0.985,0.9995,md)*0.18*uStar*up;
      // mây khối 2 mức
      vec2 cp=d.xz/(max(h,0.0)+0.25)*1.4+vec2(uT*0.004,0.0);
      float n=vn(cp*vec2(1.2,2.4))*0.6+vn(cp*vec2(2.4,4.8))*0.4;
      float cl=step(cth,n)*smoothstep(0.02,0.12,h);
      vec2 cp2=d.xz/(max(h,0.0)+0.45)*0.9+vec2(-uT*0.0025,0.37);
      float n2=vn(cp2*vec2(1.0,2.0))*0.65+vn(cp2*vec2(2.2,4.4))*0.35;
      float cl2=step(cth+0.09,n2)*smoothstep(0.04,0.2,h)*0.85;
      float lit=step(cth,vn(cp*vec2(1.2,2.4)+vec2(0.05,0.18))*0.6+vn(cp*vec2(2.4,4.8)+vec2(0.1,0.3))*0.4);
      float rimL=pow(max(sd,0.0),5.0)*uSunV;
      c=mix(c,cClSh*1.05,cl2);
      c=mix(c,mix(cClSh,cCl,lit)+vec3(1.0,0.75,0.45)*0.22*rimL*lit,cl*0.92);
      // sao băng
      float kk=fract(uT*0.045);if(kk<0.05&&uStar>0.2){float u=kk/0.05;vec2 pos=vec2(-0.5+u*0.7,0.78-u*0.33);vec2 dr=normalize(vec2(0.7,-0.33));vec2 r=d.xy-pos;float a=dot(r,dr),bb=abs(dot(r,vec2(-dr.y,dr.x)));
        c+=vec3(1.0,0.95,0.85)*exp(min(a,0.0)*28.0)*(1.0-smoothstep(0.0,0.004,bb))*step(a,0.004)*(1.0-u)*uStar*up*smoothstep(0.1,0.3,h);}
      gl_FragColor=vec4(c,1.0);
      #include <colorspace_fragment>
    }`}));
  sky.renderOrder=-1000;sky.frustumCulled=false;sky.scale.setScalar(700);scene.add(sky);scene.background=null;
  scene.fog=new THREE.Fog(SKY.hor,70,300);
  
  let grassCol=null;const grassTex=(()=>{let t=null;const gn=MC.gtex||'Plane001';env.traverse(o=>{if(o.isMesh&&o.name===gn&&o.material.map){t=o.material.map;grassCol=o.material.color.clone()}});return t})();
  const gTex=grassTex?grassTex.clone():null;if(gTex){gTex.channel=0;gTex.wrapS=gTex.wrapT=THREE.RepeatWrapping;gTex.repeat.set(110,110);gTex.needsUpdate=true}
  const ground=new THREE.Mesh(new THREE.CircleGeometry(650,48),new THREE.MeshStandardMaterial({map:gTex,color:(MC.gtex&&grassCol)||0xffffff,roughness:1,metalness:0}));ground.material.userData.ground=true;toonify(ground);
  ground.rotation.x=-Math.PI/2;ground.position.set(0,-0.3,0);ground.renderOrder=-999;ground.receiveShadow=false;scene.add(ground);

  // ===== TỐI ƯU: gộp mesh tĩnh theo material (batching), tắt matrix auto, ngoại cảnh: bỏ bóng + cull theo khoảng cách =====
  const OPT={far:[],inst:[]};
  const maxAniso=renderer.capabilities.getMaxAnisotropy();
  const optStats={before:0,after:0};
  (function optimizeEnv(){
    // shading: mặt phẳng giữ phẳng (crease 45°), organic giữ smooth
    {const ORG=/Plant|Pouf|Sofa|Armchair|Pillow|Cushion|Blanket|Duvet|Mattress|Lamp|Toilet|Pendant|Stool|Rug|Curtain|Fairy|Bulb|Globe|Knob|Hook|Sphere/i;
     const OUT0=MC.out;
     const isOrg=o=>{if(o.material&&ORG.test(o.material.name||''))return true;for(let p=o,i=0;p&&p!==env&&i<5;p=p.parent,i++)if(ORG.test(p.name))return true;return false};
     const isOut=o=>{for(let p=o;p&&p!==env;p=p.parent)if(OUT0.test(p.name))return true;return false};
     const cache=new Map();let nf=0;
     env.traverse(o=>{if(!o.isMesh||o.isSkinnedMesh||o.isInstancedMesh||!o.geometry.attributes.normal||isOut(o)||isOrg(o))return;
       let g=cache.get(o.geometry);
       if(g===undefined){try{g=toCreasedNormals(o.geometry,0.785)}catch(e){g=null}cache.set(o.geometry,g)}
       if(g){o.geometry=g;nf++}});
     console.log('flat-shaded meshes: '+nf)}
    if(MC.lift){const LIFT=MC.lift;env.children.forEach(c=>{if(/^(Plane|tree|bush|SF_)/.test(c.name))c.position.y+=LIFT});env.updateMatrixWorld(true)}
    const keep=new Set();doorList.forEach(d=>keep.add(d.node));if(CHAIR)keep.add(CHAIR);if(byName['Bed'])keep.add(byName['Bed']);
    envG.animations.forEach(c=>c.tracks.forEach(t=>{const pn=THREE.PropertyBinding.parseTrackName(t.name);const n=THREE.PropertyBinding.findNode(env,pn.nodeName);if(n)keep.add(n)}));
    const prot=o=>{for(let p=o;p;p=p.parent)if(keep.has(p))return true;return false};
    const OUT=MC.out;
    const outsideRoot=o=>{for(let p=o;p&&p!==env;p=p.parent)if(OUT.test(p.name))return true;return false};
    // texture: anisotropy cao để cảnh ngoài cửa sổ không bị sạn/nhấp nháy
    const tex=new Set();env.traverse(o=>{if(!o.isMesh)return;(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{if(!m)return;['map','normalMap','emissiveMap','roughnessMap','metalnessMap','aoMap'].forEach(k=>{if(m[k])tex.add(m[k])})})});
    tex.forEach(t=>{t.anisotropy=maxAniso;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.needsUpdate=true});
    const groups=new Map();const out=[];let before=0;
    env.traverse(o=>{if(!o.isMesh)return;before++;
      if(outsideRoot(o)){o.castShadow=false;o.receiveShadow=false;return}
      if(o.isSkinnedMesh||o.isInstancedMesh||o.userData.glass||Array.isArray(o.material)||!o.material||o.material.transparent||prot(o)||!o.visible)return;
      const g=o.geometry;if(!g.attributes.position||!g.attributes.normal||g.morphAttributes&&Object.keys(g.morphAttributes).length)return;
      if(o.matrixWorld.determinant()<=0)return;
      const key=o.material.uuid+'|'+(o.castShadow?1:0)+(o.receiveShadow?1:0);
      let gr=groups.get(key);if(!gr){gr={mat:o.material,cs:o.castShadow,rs:o.receiveShadow,list:[]};groups.set(key,gr)}gr.list.push(o)});
    const removed=new Set();let made=0;
    for(const gr of groups.values()){if(gr.list.length<2)continue;
      const gs=gr.list.map(o=>{const g0=o.geometry;const g=new THREE.BufferGeometry();
        let pos=g0.attributes.position,nor=g0.attributes.normal,uv=g0.attributes.uv;
        if(pos.isInterleavedBufferAttribute||nor.isInterleavedBufferAttribute||(uv&&uv.isInterleavedBufferAttribute)){const cp=a=>{const r=new THREE.BufferAttribute(new Float32Array(a.count*a.itemSize),a.itemSize);for(let i=0;i<a.count;i++)for(let k=0;k<a.itemSize;k++)r.array[i*a.itemSize+k]=a.getComponent(i,k);return r};pos=cp(pos);nor=cp(nor);if(uv)uv=cp(uv)}
        g.setAttribute('position',pos.clone());g.setAttribute('normal',nor.clone());
        g.setAttribute('uv',uv?uv.clone():new THREE.BufferAttribute(new Float32Array(pos.count*2),2));
        if(g0.index)g.setIndex(g0.index.clone());else{const n=pos.count,ix=new Uint32Array(n);for(let i=0;i<n;i++)ix[i]=i;g.setIndex(new THREE.BufferAttribute(ix,1))}
        g.applyMatrix4(o.matrixWorld);return g});
      let merged;try{merged=mergeGeometries(gs,false)}catch(e){console.warn('merge fail',e);continue}
      if(!merged)continue;
      const mm=new THREE.Mesh(merged,gr.mat);mm.castShadow=gr.cs;mm.receiveShadow=gr.rs;mm.matrixAutoUpdate=false;mm.name='MERGED_'+gr.mat.name;
      mm.userData.merged=true;scene.add(mm);mm.updateMatrix();out.push(mm);made++;
      gr.list.forEach(o=>removed.add(o));gs.forEach(g=>g.dispose())}
    removed.forEach(o=>{o.parent&&o.parent.remove(o)});
    for(let i=envMeshes.length-1;i>=0;i--)if(removed.has(envMeshes[i]))envMeshes.splice(i,1);
    out.forEach(m=>envMeshes.push(m));
    optStats.before=before;optStats.after=before-removed.size+made;
    // ===== InstancedMesh khổng lồ (cỏ/bụi rải trong GLB) -> chia ô 8m: frustum-cull theo ô + LOD mật độ theo khoảng cách + chỉ ô gần mới đổ bóng =====
    {const lst=[];env.traverse(o=>{if(o.isInstancedMesh&&o.count>24)lst.push(o)});
     const CELL=8,M=new THREE.Matrix4(),T=new THREE.Vector3();let rs=12345;const rnd=()=>{rs=(rs*16807)%2147483647;return rs/2147483647};
     let before2=0,cellsN=0;
     for(const m of lst){m.updateWorldMatrix(true,false);const W=m.matrixWorld,cells=new Map();before2+=m.count;
       for(let i=0;i<m.count;i++){m.getMatrixAt(i,M);M.premultiply(W);T.setFromMatrixPosition(M);
         const k=Math.floor(T.x/CELL)+','+Math.floor(T.z/CELL);let c=cells.get(k);if(!c){c={m:[],cx:0,cz:0};cells.set(k,c)}c.m.push(M.clone());c.cx+=T.x;c.cz+=T.z}
       for(const c of cells.values()){
         for(let i=c.m.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[c.m[i],c.m[j]]=[c.m[j],c.m[i]]}   // xáo trộn: n phần tử đầu = tập con đồng đều (LOD mật độ)
         const im=new THREE.InstancedMesh(m.geometry,m.material,c.m.length);c.m.forEach((mm,i)=>im.setMatrixAt(i,mm));
         im.instanceMatrix.needsUpdate=true;im.castShadow=false;im.receiveShadow=m.receiveShadow;im.matrixAutoUpdate=false;im.computeBoundingSphere();
         im.userData.n=c.m.length;im.userData.cx=c.cx/c.m.length;im.userData.cz=c.cz/c.m.length;im.name=m.name+'_cell';env.add(im);OPT.inst.push(im);cellsN++}
       m.removeFromParent()}
     if(lst.length)console.log('instanced: '+lst.length+' fields ('+before2+' inst) -> '+cellsN+' cells')}
    // ngoại cảnh: cull theo khoảng cách tới camera
    OPT.far=[];env.children.forEach(c=>{if(OUT.test(c.name))OPT.far.push(c)});
    console.log('optimize: meshes '+before+' -> '+optStats.after+' (merged '+removed.size+' into '+made+'), outside roots '+OPT.far.length);
  })();
  // ===== VƯỜN: asset TREE_ASSET.glb (cây/bụi/hoa/đá/khúc gỗ) + props procedural, rải bằng InstancedMesh theo ô để frustum-cull =====
  const garden=new THREE.Group();garden.name='GARDEN';scene.add(garden);
  const gardenAnim={lamp:null};
  (function buildGarden(){
    if(!MC.garden)return;
    const Y0=-0.25;let seed=20241029;const rnd=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
    const R=(a,b)=>a+rnd()*(b-a);
    const TR=treeG?treeG.scene:null;if(TR)TR.updateMatrixWorld(true);
    const by={};if(TR)TR.traverse(o=>{if(o.name)by[o.name]=o});
    // cây/cỏ gốc của map: bake cỏ tuft trước khi ẩn
    const bake=(root,hT)=>{if(!root)return null;root.updateMatrixWorld(true);const ms=[];root.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh)ms.push(o)});if(!ms.length)return null;
      const bb=new THREE.Box3().setFromObject(root),cx=(bb.min.x+bb.max.x)/2,cz=(bb.min.z+bb.max.z)/2,by0=bb.min.y,h0=Math.max(1e-3,bb.max.y-bb.min.y);
      return{h0,parts:ms.map(m=>{const g=m.geometry.clone();g.applyMatrix4(m.matrixWorld);g.translate(-cx,-by0,-cz);return{geo:g,mat:m.material}})}};
    const matCache=new Map();
    const fixMat=(m,kind)=>{const key=m.uuid+kind;if(matCache.has(key))return matCache.get(key);const c=m.clone();const n=m.name||'';
      c.userData={};if(/^PolyShader/.test(n)){c.roughness=1;c.metalness=0;c.metalnessMap=null;c.roughnessMap=null;c.emissiveIntensity=1.0;c.userData.keepEmi=true}else if(/^PolyFoliage/.test(n)){c.metalness=0;c.roughness=1}else{c.metalness=0;c.roughness=1;c.metalnessMap=null;c.roughnessMap=null;c.emissive&&c.emissive.set(0x000000)}
      if(/^Plant_01/.test(n)){c.color.set('#9dc04a');c.userData.sway=true}
      else if(/^Plant_03/.test(n)){c.color.set('#a3c94e');c.userData.sway=true}
      else if(/^Leaves/.test(n)){c.color.set('#88b441');c.userData.sway=true}
      else if(/^Rock/.test(n)&&!/Wind/.test(n)){c.color.set('#4d545e')}
      else if(kind==='rock'){c.name='RockPoly'}
      else if(kind==='flower'&&/PolyFoliage/.test(n)){c.name='PolyFoliage_flower';c.userData.sway=true;c.userData.noLeaf=true}
      matCache.set(key,c);return c};
    const addQ=g=>{if(g.attributes.aQ)return;const n=g.attributes.position.count,uv=g.attributes.uv,ix=g.index?g.index.array:null,par=new Int32Array(n);for(let i=0;i<n;i++)par[i]=i;
      const fd=x=>{while(par[x]!==x){par[x]=par[par[x]];x=par[x]}return x};
      if(ix)for(let t=0;t+2<ix.length;t+=3){const a=fd(ix[t]),b=fd(ix[t+1]),c=fd(ix[t+2]);par[b]=a;par[fd(c)]=a}
      const mn=new Map();for(let i=0;i<n;i++){const r=fd(i),u=uv.getX(i),v=uv.getY(i);let m=mn.get(r);if(!m){m=[1e9,1e9,-1e9,-1e9];mn.set(r,m)}m[0]=Math.min(m[0],u);m[1]=Math.min(m[1],v);m[2]=Math.max(m[2],u);m[3]=Math.max(m[3],v)}
      const q=new Float32Array(n*3);let k=0;const hh=new Map();
      for(let i=0;i<n;i++){const r=fd(i),m=mn.get(r);let h=hh.get(r);if(h==null){h=(k++*0.61803)%1;hh.set(r,h)}const du=m[2]-m[0],dv=m[3]-m[1];
        if(du<1e-5||dv<1e-5){q[i*3+2]=-1;continue}q[i*3]=(uv.getX(i)-m[0])/du;q[i*3+1]=(uv.getY(i)-m[1])/dv;q[i*3+2]=h}
      g.setAttribute('aQ',new THREE.BufferAttribute(q,3))};
    const asset=(name,kind)=>{const a=bake(by[name]);if(!a)return null;a.parts.forEach(p=>{p.mat=fixMat(p.mat,kind);if(kind==='tree'&&/PolyFoliage/.test(p.mat.name)){p.mat.userData.noLeaf=true;p.mat.userData.leafMask=true;p.mat.side=THREE.DoubleSide;p.mat.color.setRGB(1.35,1.8,1.1);addQ(p.geo)}if(kind==='tree'&&/Foliage/.test(p.mat.name)){p.geo.computeBoundingBox();a.crown=p.geo.boundingBox}});return a};
    const TUFT=bake(byName['SF_BiomeProxy_grass-generic-small-sprig-a']);
    // ẩn thảm thực vật cũ của map (giữ nền cỏ Plane001)
    env.children.forEach(o=>{if(/^(Plane006|Plane013|tree-|bush-|SF_)/.test(o.name)){o.visible=false;o.traverse(q=>{q.visible=false})}});
    const gp=env.children.find(o=>o.name==='Plane001');if(gp){gp.receiveShadow=true;gp.traverse(q=>{if(q.isMesh)q.receiveShadow=true})}
    ground.receiveShadow=true;
    const AS={oak:asset('tree-oak-english-generic-young-a','tree'),jA:asset('tree-juniper-common-generic-sapling-a','tree'),jB:asset('tree-juniper-common-generic-sapling-b','tree'),
      leafy:asset('Plant_Assets_B_020','plant'),
      small:['Plant_Assets_B_061','Plant_Assets_B_062','Plant_Assets_B_063'].map(n=>asset(n,'plant')).filter(Boolean),
      flowers:['flower-dandelion-mature-a','flower-dandelion-single-mature-a','flower-poppy-mature-a'].map(n=>asset(n,'flower')).filter(Boolean),
      rocks:['rock-generic-flat-b','rock-generic-small-b','rock-generic-small-c','rock-generic-small-e','rock-generic-small-f','Rock_024','Rock_026','Rock_031'].map(n=>asset(n,'rock')).filter(Boolean),
      logs:['tree-oak-english-part-log-pile-a','tree-pine-scots-part-log-a'].map(n=>asset(n,'rock')).filter(Boolean)};
    // ---- bố cục ----
    const LOT={x0:-15,x1:27,z0:-22,z1:13.5};
    const PATH=[[7.7,13.5],[7.5,11],[6.6,8.6],[5.6,6],[5.1,3.3],[4.9,2.2]];
    const PATH2=[[5.6,6],[1.5,5.6],[-3,4],[-5.5,0],[-6.5,-4],[-6.8,-7]];
    const DECK={cx:-8.7,cz:-10.2,w:8.2,d:6.2};
    const CIRC=[[-6.5,9.6,2.4],[-2.4,9.3,1.0],[-13.3,-8.2,1.9],[21.5,3.2,2.6],[21.5,-1.6,2.6],[7.7,13.5,2.2],[-3.6,-2,0.0]];
    const segD=(px,pz,ax,az,bx,bz)=>{const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((px-ax)*dx+(pz-az)*dz)/(dx*dx+dz*dz)));return Math.hypot(px-(ax+t*dx),pz-(az+t*dz))};
    const pathD=(x,z)=>{let d=1e9;for(const P of [PATH,PATH2])for(let i=0;i<P.length-1;i++)d=Math.min(d,segD(x,z,P[i][0],P[i][1],P[i+1][0],P[i+1][1]));return d};
    const inLot=(x,z)=>x>LOT.x0+0.5&&x<LOT.x1-0.5&&z>LOT.z0+0.5&&z<LOT.z1-0.5;
    const MARG={tree:4.2,leafy:1.6,small:1.1,flower:0.5,rock:1.1,tuft:0.5,log:1.5};
    const blocked=(x,z,kind)=>{const m=MARG[kind]||1;
      if(x>-1.2-m&&x<16.6+m&&z>-9.2-m&&z<2.4+m)return true;
      if(Math.abs(x-DECK.cx)<DECK.w/2+m&&Math.abs(z-DECK.cz)<DECK.d/2+m)return true;
      for(const c of CIRC)if(Math.hypot(x-c[0],z-c[1])<c[2]+m*0.6)return true;
      if(pathD(x,z)<(kind==='tree'?3.2:kind==='tuft'?0.45:0.85))return true;
      if(z>14.2&&z<19.8&&kind!=='tree')return true;                                // đường
      if(!inLot(x,z)&&(kind==='flower'||kind==='small'))return true;
      if(Math.abs(z-LOT.z1)<0.55&&x>LOT.x0&&x<LOT.x1)return true;                    // tường trước
      return false};
    const camCone=(x,z,lim)=>{const vx=x-5,vz=z+4,vl=Math.hypot(vx,vz)||1;return (vx*0.405+vz*0.914)/vl>lim&&vl<55};
    const wallD=(x,z)=>Math.min(Math.abs(x-LOT.x0),Math.abs(x-LOT.x1),Math.abs(z-LOT.z0),Math.abs(z-LOT.z1));
    const houseD=(x,z)=>Math.max(0,Math.max(-1.2-x,x-16.6,-9.2-z,z-2.4));
    const pts=[];
    function dart(kind,n,{spacing,x0=-40,x1=52,z0=-52,z1=34,edge=0,rng=1e9,cone=1.1,tries}){const own=[];let t=0,lim=tries||n*120;
      while(own.length<n&&t++<lim){const x=R(x0,x1),z=R(z0,z1);if(blocked(x,z,kind))continue;if(camCone(x,z,cone))continue;
        const d=Math.hypot(x-5,z+4);if(d>rng)continue;
        const near=Math.max(Math.exp(-wallD(x,z)/3.5),Math.exp(-houseD(x,z)/3.2));
        if(rnd()>(1-edge)+edge*near)continue;
        let ok=true;for(const p of pts){const dx=p.x-x,dz=p.z-z,r=p.r+spacing;if(dx*dx+dz*dz<r*r){ok=false;break}}if(!ok)continue;
        const p={kind,x,z,r:spacing,ry:R(0,6.283),c:R(0.88,1.12)};own.push(p);pts.push(p)}return own};
    const mk=(kind,list,as,h0,h1)=>{list.forEach(p=>{p.as=as[(rnd()*as.length)|0];p.hT=p.as.h0*R(h0,h1)});return list};
    // cây: oak lớn + juniper làm điểm nhấn; bụi lá viền tường/nhà; cây nhỏ, hoa, đá
    const Ls=[];
    // cây neo cố định (khung cảnh quanh nhà) + cây rải thêm
    [[-9.5,8,'oak'],[22,8.5,'oak'],[-12.5,-2.5,'jA'],[-12,3,'jB'],[11.5,-18,'oak'],[-3,-17.5,'oak'],[23.5,-12.5,'oak'],[20,11,'jA'],[26,-4,'jB'],[3,-19,'jA'],[-12,-15,'oak']].forEach(([x,z,k])=>{
      const as=AS[k];if(!as||blocked(x,z,'tree'))return;const p={kind:'tree',x,z,r:2.6,ry:R(0,6.283),c:1,as,hT:as.h0*R(0.95,1.12)};Ls.push(p);pts.push(p)});
    if(AS.oak){const l=dart('tree',16,{spacing:3.4,edge:0.65,cone:0.5});Ls.push(...mk('tree',l,[AS.oak],0.9,1.15))}
    const jj=[AS.jA,AS.jB].filter(Boolean);if(jj.length){const l=dart('tree',9,{spacing:2.6,edge:0.7,cone:0.5});Ls.push(...mk('tree',l,jj,0.9,1.15))}
    if(AS.leafy){const l=dart('leafy',80,{spacing:1.0,edge:0.85,cone:0.82});Ls.push(...mk('leafy',l,[AS.leafy],1.0,1.5))}
    if(AS.small.length){const l=dart('small',60,{spacing:1.3,edge:0.55,rng:26,cone:0.95});Ls.push(...mk('small',l,AS.small,0.6,0.95))}
    if(AS.rocks.length){const l=dart('rock',44,{spacing:1.0,edge:0.4,rng:30,cone:0.97});Ls.push(...mk('rock',l,AS.rocks,0.8,1.5))}
    const logsL=[];if(AS.logs.length){for(const [x,z] of [[19.5,-14],[-11,-15.5]]){const p={kind:'log',x,z,r:1,ry:R(0,6),c:1,as:AS.logs[0],hT:AS.logs[0].h0};logsL.push(p)}}
    // hàng rào bụi dọc tường + trồng quanh chân nhà
    if(AS.leafy){const hl=(ax,az,bx,bz,step,jit)=>{const L=Math.hypot(bx-ax,bz-az),n=Math.max(1,Math.floor(L/step));for(let i=0;i<n;i++){const t=(i+0.5)/n,x=ax+(bx-ax)*t+R(-jit,jit),z=az+(bz-az)*t+R(-jit,jit);
        if(blocked(x,z,'leafy')||pathD(x,z)<1.9||(z>11&&x>4.8&&x<10.6))continue;if(pts.some(p=>p.kind==='tree'&&Math.hypot(p.x-x,p.z-z)<2.4))continue;
        Ls.push({kind:'leafy',x,z,r:1,ry:R(0,6.283),c:R(0.9,1.1),as:AS.leafy,hT:AS.leafy.h0*R(1.0,1.55)})}};
      hl(LOT.x0+1.3,LOT.z1-1.1,LOT.x1-1.3,LOT.z1-1.1,1.55,0.12);hl(LOT.x0+1.2,LOT.z0+1.2,LOT.x1-1.2,LOT.z0+1.2,1.9,0.2);
      hl(LOT.x0+1.2,LOT.z0+2,LOT.x0+1.2,LOT.z1-2,1.9,0.2);hl(LOT.x1-1.2,LOT.z0+2,LOT.x1-1.2,LOT.z1-2,1.9,0.2);
      hl(-2.5,-8,-2.5,1.5,1.5,0.1);hl(17.8,-8,17.8,1.5,1.7,0.1)}
    // hoa: cụm quanh bụi
    const bushes=Ls.filter(p=>p.kind==='leafy');const fl=[];
    if(AS.flowers.length){for(let i=0;i<340&&bushes.length;i++){const b=bushes[(rnd()*bushes.length)|0],a=R(0,6.283),r=R(0.5,1.9),x=b.x+Math.cos(a)*r,z=b.z+Math.sin(a)*r;if(blocked(x,z,'flower'))continue;
      fl.push({kind:'flower',x,z,ry:R(0,6.28),c:R(0.9,1.1),as:AS.flowers[(rnd()*AS.flowers.length)|0],hT:AS.flowers[0].h0*R(1.0,1.5)})}}
    const tufts=[];if(TUFT){let t=0;while(tufts.length<1700&&t++<9000){const x=R(-30,44),z=R(-44,30);if(blocked(x,z,'tuft'))continue;if(Math.hypot(x-5,z+4)>R(14,38))continue;
      tufts.push({kind:'tuft',x,z,ry:R(0,6.28),c:R(0.82,1.1),as:TUFT,hT:R(0.36,0.62)})}}
    // luống hoa/ rau: cây nhỏ đặt cố định trong 2 luống
    const bedPlants=[];if(AS.small.length&&AS.leafy){for(const [bx,bz] of [[21.5,3.2],[21.5,-1.6]])for(let i=0;i<9;i++){const gx=bx-1.1+(i%3)*1.1,gz=bz-0.45+Math.floor(i/3)*0.45;bedPlants.push({kind:'small',x:gx,z:gz,ry:R(0,6.28),c:R(0.9,1.1),as:AS.small[(rnd()*AS.small.length)|0],hT:R(0.5,0.7),y:0.18})}}
    // ---- instanced theo ô ----
    const CH=20;const all=[...Ls,...logsL,...fl,...tufts,...bedPlants];
    const buckets=new Map();all.forEach(p=>{if(!p.as)return;const key=Math.floor(p.x/CH)+','+Math.floor(p.z/CH)+'|'+p.kind;let b=buckets.get(key);if(!b){b=[];buckets.set(key,b)}b.push(p)});
    const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),E=new THREE.Euler(),Pv=new THREE.Vector3(),Sv=new THREE.Vector3(),C=new THREE.Color();
    buckets.forEach((arr,key)=>{const kind=key.split('|')[1];const byAs=new Map();arr.forEach(p=>{let l=byAs.get(p.as);if(!l){l=[];byAs.set(p.as,l)}l.push(p)});
      byAs.forEach((list,as)=>{as.parts.forEach(pt=>{const im=new THREE.InstancedMesh(pt.geo,pt.mat,list.length);
        list.forEach((p,i)=>{const sc=p.hT/as.h0;E.set(0,p.ry,0);Q.setFromEuler(E);Pv.set(p.x,Y0+(p.y||0),p.z);Sv.set(sc,sc*R(0.92,1.1),sc);M.compose(Pv,Q,Sv);im.setMatrixAt(i,M);
          C.setScalar(p.c);if(kind==='flower'){C.setHSL(R(0,1)<0.5?0.08:0.0,0,0);C.setScalar(p.c)}im.setColorAt(i,C)});
        im.instanceMatrix.needsUpdate=true;im.instanceColor.needsUpdate=true;im.computeBoundingSphere();
        im.castShadow=(kind==='tree'||kind==='leafy'||kind==='log');im.receiveShadow=false;im.matrixAutoUpdate=false;im.userData.garden=true;garden.add(im)})})});
    // ---- props procedural (gộp theo material) ----
    const mats={};const mkMat=(name,col,extra)=>{const m=new THREE.MeshStandardMaterial(Object.assign({color:col,roughness:1,metalness:0},extra||{}));m.name=name;mats[name]=m;return m};
    mkMat('wood','#c98d52');mkMat('woodDk','#8a5a34');mkMat('stone','#d3c8b6');mkMat('stoneDk','#a99d8e');mkMat('cream','#f3ead7',{side:THREE.DoubleSide});mkMat('soil','#5b4331');mkMat('pot','#e9e2d4');mkMat('metal','#3b3430');mkMat('road','#bfb4a4');mkMat('glow','#ffd89a',{emissive:new THREE.Color('#ffc26b'),emissiveIntensity:0.4});mkMat('plank','#d09a5e');
    const bucket={};const add=(mat,geo,x,y,z,ry=0,sx=1,sy=1,sz=1)=>{const g=geo.clone();g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,ry,0)),new THREE.Vector3(sx,sy,sz)));(bucket[mat]||(bucket[mat]=[])).push(g)};
    const BX=new THREE.BoxGeometry(1,1,1),CY=(r,h,s=10)=>new THREE.CylinderGeometry(r,r,h,s);
    const box=(mat,x,y0,z,w,h,d,ry=0)=>add(mat,BX,x,y0+h/2,z,ry,w,h,d);
    // tường lô đất + trụ + cổng
    const wallSeg=(ax,az,bx,bz,gap)=>{const L=Math.hypot(bx-ax,bz-az),n=Math.ceil(L/1.6),ang=Math.atan2(bx-ax,bz-az);
      for(let i=0;i<n;i++){const t0=i/n,t1=(i+1)/n,mx=ax+(bx-ax)*(t0+t1)/2,mz=az+(bz-az)*(t0+t1)/2;if(gap&&mx>gap[0]&&mx<gap[1]&&Math.abs(mz-az)<0.1)continue;
        const hh=0.85+Math.sin(i*1.7)*0.04;box('stone',mx,Y0,mz,0.38,hh,L/n+0.02,ang);box('stoneDk',mx,Y0+hh,mz,0.46,0.07,L/n+0.02,ang)}
      for(let i=0;i<=Math.ceil(L/6.5);i++){const t=i/Math.ceil(L/6.5),px=ax+(bx-ax)*t,pz=az+(bz-az)*t;if(gap&&px>gap[0]-0.4&&px<gap[1]+0.4&&Math.abs(pz-az)<0.1)continue;box('stone',px,Y0,pz,0.7,1.35,0.7);box('stoneDk',px,Y0+1.35,pz,0.82,0.12,0.82)}};
    wallSeg(LOT.x0,LOT.z1,LOT.x1,LOT.z1,[6.0,9.4]);wallSeg(LOT.x0,LOT.z0,LOT.x1,LOT.z0);wallSeg(LOT.x0,LOT.z0,LOT.x0,LOT.z1);wallSeg(LOT.x1,LOT.z0,LOT.x1,LOT.z1);
    // cổng gỗ + trụ + hộp thư
    box('stone',5.9,Y0,LOT.z1,0.8,1.6,0.8);box('stoneDk',5.9,Y0+1.6,LOT.z1,0.95,0.14,0.95);box('stone',9.5,Y0,LOT.z1,0.8,1.6,0.8);box('stoneDk',9.5,Y0+1.6,LOT.z1,0.95,0.14,0.95);
    for(let i=0;i<7;i++){box('wood',6.45+i*0.42,Y0,LOT.z1,0.36,1.15+(i%2)*0.04,0.1)}box('woodDk',7.7,Y0+0.3,LOT.z1+0.07,3.0,0.12,0.08);box('woodDk',7.7,Y0+0.85,LOT.z1+0.07,3.0,0.12,0.08);
    box('metal',5.2,Y0,LOT.z1+0.35,0.08,1.0,0.08);box('woodDk',5.2,Y0+1.0,LOT.z1+0.35,0.34,0.26,0.26);
    // đường nhựa/ vỉa hè ngoài tường
    box('road',5,Y0-0.02,17.4,90,0.05,4.6);box('stoneDk',5,Y0,15.0,90,0.1,0.35);
    // bậc thềm
    box('stone',5,Y0,1.6,4.6,0.2,0.62);box('stone',5,Y0,2.15,4.0,0.11,0.55);box('stoneDk',5,Y0+0.2,1.6,4.7,0.04,0.7);
    // deck + dù + bàn ghế
    const plankCount=13;const deckGeo=new THREE.BoxGeometry(1,1,1);
    for(let i=0;i<plankCount;i++){const w=DECK.w/plankCount;box(i%2?'wood':'plank',DECK.cx-DECK.w/2+w*(i+0.5),Y0,DECK.cz,w-0.04,0.17,DECK.d)}
    box('woodDk',DECK.cx,Y0,DECK.cz,DECK.w+0.1,0.06,DECK.d+0.1);
    add('metal',CY(0.045,2.6,8),DECK.cx,Y0+0.17+1.3,DECK.cz);add('cream',new THREE.ConeGeometry(2.3,0.75,8,1,true),DECK.cx,Y0+0.17+2.55,DECK.cz,0.2);add('metal',CY(0.07,0.14,8),DECK.cx,Y0+0.17+2.95,DECK.cz);
    add('woodDk',CY(0.78,0.07,14),DECK.cx,Y0+0.17+0.78,DECK.cz);add('woodDk',CY(0.1,0.78,8),DECK.cx,Y0+0.17+0.39,DECK.cz);add('woodDk',CY(0.42,0.06,10),DECK.cx,Y0+0.17+0.03,DECK.cz);
    const chair=(x,z,ry)=>{const c=Math.cos(ry),s=Math.sin(ry),L=(lx,lz)=>[x+lx*c+lz*s,z-lx*s+lz*c];
      let p=L(0,0);box('wood',p[0],Y0+0.17+0.42,p[1],0.5,0.06,0.5,ry);p=L(0,-0.23);box('woodDk',p[0],Y0+0.17+0.7,p[1],0.5,0.5,0.05,ry);
      for(const [lx,lz] of [[-0.21,-0.21],[0.21,-0.21],[-0.21,0.21],[0.21,0.21]]){p=L(lx,lz);box('metal',p[0],Y0+0.17,p[1],0.05,0.42,0.05,ry)}};
    for(let i=0;i<4;i++){const a=i*Math.PI/2+0.4;chair(DECK.cx+Math.sin(a)*1.25,DECK.cz+Math.cos(a)*1.25,a+Math.PI)}
    // kệ cây
    box('woodDk',-13.3,Y0,-8.2,2.0,0.08,0.55);box('wood',-13.3,Y0+0.55,-8.2,2.0,0.06,0.55);box('wood',-13.3,Y0+1.1,-8.2,2.0,0.06,0.55);
    for(const sx of [-0.95,0.95])box('woodDk',-13.3+sx,Y0,-8.2,0.07,1.25,0.5);
    for(let i=0;i<4;i++){add('pot',CY(0.17,0.25,10),-13.9+i*0.4,Y0+0.55+0.03+0.125,-8.2);add('pot',CY(0.17,0.25,10),-13.9+i*0.4,Y0+1.1+0.03+0.125,-8.2)}
    // ghế dài + đèn cột
    const bx=-6.5,bz=9.6,bry=0.5;const bl=(lx,lz)=>[bx+lx*Math.cos(bry)+lz*Math.sin(bry),bz-lx*Math.sin(bry)+lz*Math.cos(bry)];
    for(let i=0;i<5;i++){const p=bl(0,-0.2+i*0.12);box('wood',p[0],Y0+0.45,p[1],2.0*Math.cos(0)+0.0,0.05,0.1,bry)}
    for(let i=0;i<3;i++){const p=bl(0,-0.34);box('wood',p[0],Y0+0.65+i*0.14,p[1],2.0,0.09,0.04,bry)}
    for(const lx of [-0.85,0.85]){const p=bl(lx,0);box('woodDk',p[0],Y0,p[1],0.07,0.45,0.5,bry);const q=bl(lx,-0.34);box('woodDk',q[0],Y0,q[1],0.07,1.0,0.07,bry)}
    add('stoneDk',CY(0.5,0.22,12),-2.4,Y0+0.11,9.3);add('metal',CY(0.05,2.1,8),-2.4,Y0+1.2,9.3);add('metal',new THREE.ConeGeometry(0.34,0.26,6),-2.4,Y0+2.38,9.3);add('glow',new THREE.CylinderGeometry(0.2,0.2,0.34,6),-2.4,Y0+2.15,9.3);
    // luống trồng + rào
    for(const [cx,cz] of [[21.5,3.2],[21.5,-1.6]]){box('wood',cx,Y0,cz-0.8,3.2,0.5,0.1);box('wood',cx,Y0,cz+0.8,3.2,0.5,0.1);box('wood',cx-1.55,Y0,cz,0.1,0.5,1.7);box('wood',cx+1.55,Y0,cz,0.1,0.5,1.7);box('soil',cx,Y0,cz,3.0,0.42,1.5)}
    for(let i=0;i<16;i++){box('wood',24.4,Y0,-4.5+i*0.5,0.09,0.95,0.07);}box('woodDk',24.4,Y0+0.25,2.0,0.06,0.07,16*0.5);box('woodDk',24.4,Y0+0.65,2.0,0.06,0.07,16*0.5);
    // đá lót đường (instanced)
    const stoneList=[];const stoneAlong=(P,off)=>{for(let i=0;i<P.length-1;i++){const [ax,az]=P[i],[bx,bz]=P[i+1],L=Math.hypot(bx-ax,bz-az),n=Math.max(1,Math.round(L/0.95));for(let k=0;k<n;k++){const t=(k+0.5)/n;stoneList.push([ax+(bx-ax)*t+R(-0.12,0.12),az+(bz-az)*t+R(-0.12,0.12),R(0.75,1.2),R(0,6.3)])}}};
    stoneAlong(PATH);stoneAlong(PATH2);
    // merge buckets
    Object.keys(bucket).forEach(k=>{const g=mergeGeometries(bucket[k],false);if(!g)return;const m=new THREE.Mesh(g,mats[k]);m.castShadow=!(k==='road'||k==='glow');m.receiveShadow=false;m.matrixAutoUpdate=false;m.userData.garden=true;garden.add(m);bucket[k].forEach(x=>x.dispose())});
    gardenAnim.lamp=mats.glow;
    const stoneMat=mkMat('pathStone','#d9cfbd');const sI=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.46,0.5,0.1,7),stoneMat,stoneList.length);
    stoneList.forEach((s,i)=>{E.set(0,s[3],0);Q.setFromEuler(E);Pv.set(s[0],Y0+0.03,s[1]);Sv.set(s[2],1,s[2]*R(0.85,1.1));M.compose(Pv,Q,Sv);sI.setMatrixAt(i,M);C.setScalar(R(0.88,1.08));sI.setColorAt(i,C)});
    sI.instanceMatrix.needsUpdate=true;sI.instanceColor.needsUpdate=true;sI.computeBoundingSphere();sI.receiveShadow=false;sI.userData.garden=true;garden.add(sI);
    // chùm hoa trắng/hồng nhỏ trên bụi (blossom puffs)
    const blos=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09,0),mkMat('blossom','#ffffff'),900);let bk=0;const bcol=['#ffffff','#ffd6e2','#fff1b8','#ffffff','#f6b9cc'];
    for(let i=0;i<900&&bushes.length;i++){const b=bushes[(rnd()*bushes.length)|0],a=R(0,6.283),r=R(0.0,0.62)*b.hT,y=R(0.35,0.98)*b.hT;Pv.set(b.x+Math.cos(a)*r,Y0+y,b.z+Math.sin(a)*r);Q.identity();Sv.setScalar(R(0.7,1.5));M.compose(Pv,Q,Sv);blos.setMatrixAt(bk,M);C.set(bcol[(rnd()*bcol.length)|0]);blos.setColorAt(bk++,C)}
    blos.count=bk;blos.instanceMatrix.needsUpdate=true;blos.instanceColor.needsUpdate=true;blos.computeBoundingSphere();blos.userData.garden=true;garden.add(blos);
    // texture anisotropy cho asset cây
    if(TR){const seen=new Set();TR.traverse(o=>{if(!o.isMesh)return;const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{['map','normalMap'].forEach(k=>{const t=m[k];if(t&&!seen.has(t)){seen.add(t);t.anisotropy=renderer.capabilities.getMaxAnisotropy();t.needsUpdate=true}})})})}
    toonify(garden);
    console.log('garden: '+all.length+' instances (trees '+Ls.filter(p=>p.kind==='tree').length+', bush '+bushes.length+', tuft '+tufts.length+', flowers '+fl.length+'), chunks '+garden.children.length+', treeAsset '+(TR?'ok':'MISSING'));
  })();
  function updInst(){const t=controls.target;for(const c of OPT.inst){const u=c.userData,d=Math.hypot(u.cx-t.x,u.cz-t.z);
      const f=Math.min(1,Math.max(0.05,1.05-d/26));const vis=d<62,sh=d<13;let n=Math.ceil(u.n*f);
      if(c.visible!==vis)c.visible=vis;if(c.count!==n)c.count=n;if(c.castShadow!==sh)c.castShadow=sh}}
  function updCull(){updInst();const cx=controls.target;OPT.far.forEach(o=>{if(!o.userData.c){const b=new THREE.Box3().setFromObject(o);o.userData.c=b.getCenter(new THREE.Vector3());o.userData.r=b.getSize(new THREE.Vector3()).length()/2}
      const d=o.userData.c.distanceTo(camera.position)-o.userData.r;o.visible=d<300})}

  // ===== MÔI TRƯỜNG: ngày/đêm · thời tiết · light shafts · post-fx =====
  const KEYS=[
   [0,   {top:'#0b1030',mid:'#1a2250',pink:'#26275a',hor:'#34305f',sun:'#5a6cb0',sunI:.30,ambS:'#4f5f9a',ambG:'#2c2848',fog:'#2a2c58',day:0,lamp:1,gt:-.06}],
   [5,   {top:'#0d1334',mid:'#1d2656',pink:'#2e2c5e',hor:'#3e3868',sun:'#5a6cb0',sunI:.28,ambS:'#4f5f9a',ambG:'#2c2848',fog:'#2e3060',day:0,lamp:1,gt:-.05}],
   [6.2, {top:'#6a80c0',mid:'#d9a3b8',pink:'#f5b09a',hor:'#ffd0a0',sun:'#ffb98a',sunI:.75,ambS:'#a6add8',ambG:'#b88c88',fog:'#f4cdb0',day:.6,lamp:.5,gt:.08}],
   [8,   {top:'#78acea',mid:'#c4d9f0',pink:'#f7d6c6',hor:'#ffe6c8',sun:'#ffe2b8',sunI:1,ambS:'#cfe0ff',ambG:'#d2b79a',fog:'#f6e6d0',day:1,lamp:0,gt:.04}],
   [12,  {top:'#6aa6f0',mid:'#b9d8f8',pink:'#dfeaf6',hor:'#f4efe4',sun:'#fff6e6',sunI:1.05,ambS:'#dbe8ff',ambG:'#cdbb9d',fog:'#e8eee8',day:1,lamp:0,gt:0}],
   [16,  {top:'#7aaeea',mid:'#d0dcee',pink:'#f9d9bd',hor:'#ffe0b0',sun:'#ffe0a8',sunI:1,ambS:'#d8dcf0',ambG:'#d6b48f',fog:'#f8e2c2',day:1,lamp:0,gt:.08}],
   [18,  {top:'#6f8fd0',mid:'#e6b8c0',pink:'#ffb890',hor:'#ffc888',sun:'#ffb060',sunI:.92,ambS:'#b8a0c8',ambG:'#c79a78',fog:'#ffd2a0',day:.8,lamp:.3,gt:.14}],
   [19.6,{top:'#33407e',mid:'#8a5f95',pink:'#e08a7a',hor:'#ffa870',sun:'#ff8a60',sunI:.35,ambS:'#7a78b8',ambG:'#6a5070',fog:'#c88a8a',day:.3,lamp:.85,gt:.06}],
   [21,  {top:'#121a42',mid:'#252e64',pink:'#2f2f64',hor:'#3b3668',sun:'#5a6cb0',sunI:.30,ambS:'#4f5f9a',ambG:'#2c2848',fog:'#2c2e5a',day:0,lamp:1,gt:-.05}],
   [24,  null]];
  KEYS[KEYS.length-1][1]=KEYS[0][1];
  const _ca=new THREE.Color(),_cb=new THREE.Color();
  function keyAt(t){let a=KEYS[0],b=KEYS[1];for(let i=0;i<KEYS.length-1;i++)if(t>=KEYS[i][0]&&t<=KEYS[i+1][0]){a=KEYS[i];b=KEYS[i+1];break}
    const u=(t-a[0])/Math.max(b[0]-a[0],1e-4),o={};
    for(const k in a[1]){const va=a[1][k],vb=b[1][k];if(typeof va==='string'){o[k]=new THREE.Color(va).lerp(new THREE.Color(vb),u)}else o[k]=va+(vb-va)*u}return o}
  const WEATHER={
    clear:{cov:.60,dim:1,des:0,fn:70,ff:300,rain:0,snow:0,wind:.4,wet:0,cs:.5},
    cloudy:{cov:.46,dim:.65,des:.3,fn:55,ff:240,rain:0,snow:0,wind:.7,wet:0,cs:.9},
    overcast:{cov:.30,dim:.45,des:.45,fn:45,ff:200,rain:0,snow:0,wind:.6,wet:0,cs:.2},
    drizzle:{cov:.38,dim:.72,des:.28,fn:55,ff:230,rain:.28,int:.5,snow:0,wind:.4,wet:.5,cs:.6},
    'light rain':{cov:.34,dim:.58,des:.4,fn:45,ff:190,rain:.5,int:.75,snow:0,wind:.6,wet:.8,cs:.4},
    rain:{cov:.30,dim:.42,des:.52,fn:35,ff:150,rain:.8,int:1,snow:0,wind:.9,wet:1,cs:.2},
    'heavy rain':{cov:.24,dim:.32,des:.62,fn:22,ff:110,rain:1,int:1.5,snow:0,wind:1.4,wet:1,cs:.1},
    storm:{cov:.2,dim:.25,des:.68,fn:18,ff:95,rain:1,int:2,snow:0,wind:2.0,wet:1,cs:.1,flash:1},
    snow:{cov:.32,dim:.55,des:.4,fn:30,ff:140,rain:0,snow:1,wind:.5,wet:.2,cs:.3},
    blizzard:{cov:.2,dim:.35,des:.6,fn:14,ff:90,rain:0,snow:1.8,wind:2.4,wet:.2,cs:.1},
    fog:{cov:.35,dim:.5,des:.3,fn:12,ff:75,rain:0,snow:0,wind:.15,wet:.3,cs:.1},
    windy:{cov:.5,dim:.9,des:.1,fn:70,ff:300,rain:0,snow:0,wind:2.2,wet:0,cs:.7}};
  const WC=Object.assign({int:0},WEATHER.clear);   // giá trị hiện tại (mượt dần)
  const grayOf=c=>{const l=c.r*.299+c.g*.587+c.b*.114;return new THREE.Color(l,l,l)};
  const sunPos=new THREE.Vector3(),moonPos=new THREE.Vector3();
  function sunPath(t,lo,hi,elMax){const u=(((t-lo)%24+24)%24)/((hi-lo+24)%24||24);const el=Math.sin(Math.PI*Math.min(Math.max(u,0),1))*elMax*Math.PI/180;const az=(110-220*u)*Math.PI/180;
    return {u,v:new THREE.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)),el}}

  // post-fx
  const GradeShader={uniforms:{tDiffuse:{value:null},uExpo:{value:1},uCon:{value:1},uSat:{value:1},uTemp:{value:0},uVig:{value:.3},uTime:{value:0},uTintAmt:{value:.3},uFlash:{value:0},uTintSh:{value:new THREE.Vector3(.4,.35,.6)},uTintHi:{value:new THREE.Vector3(1,.7,.45)}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`uniform sampler2D tDiffuse;uniform float uExpo,uCon,uSat,uTemp,uVig,uTime,uTintAmt,uFlash;uniform vec3 uTintSh,uTintHi;varying vec2 vUv;
    float hs(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;
      c*=uExpo*(1.0+uFlash);
      c*=vec3(1.0+uTemp,1.0+uTemp*0.25,1.0-uTemp);
      float l=dot(c,vec3(.2126,.7152,.0722));
      c=mix(vec3(l),c,uSat);
      c=max((c-0.18)*uCon+0.18,0.0);
      l=dot(c,vec3(.2126,.7152,.0722));
      float sw=1.0-smoothstep(0.02,0.4,l),hw=smoothstep(0.3,1.3,l);
      c*=mix(vec3(1.0),uTintSh*1.8,uTintAmt*sw);
      c*=mix(vec3(1.0),uTintHi*1.4,uTintAmt*hw);
      vec2 q=vUv-0.5;c*=1.0-uVig*smoothstep(0.25,0.78,length(q*vec2(1.25,1.0)));
      gl_FragColor=vec4(max(c,0.0),1.0);}`};
  const SANITIZE={uniforms:{tDiffuse:{value:null}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec3 r=texture2D(tDiffuse,vUv).rgb;gl_FragColor=vec4(r.r>=0.0?min(r.r,16.0):0.0,r.g>=0.0?min(r.g,16.0):0.0,r.b>=0.0?min(r.b,16.0):0.0,1.0);}'};
  let curPR=Math.min(devicePixelRatio,1.5),maxPR=curPR,composer=null,bloomP=null,fxaaP=null,GU=GradeShader.uniforms,postLevel=0;
  try{postLevel=+(localStorage.getItem('vyPostLvl')||0)}catch(e){}
  function buildComposer(){
    if(composer){try{composer.renderTarget1.dispose();composer.renderTarget2.dispose()}catch(e){}}
    const type=postLevel===0?THREE.HalfFloatType:THREE.UnsignedByteType,pr=Math.min(curPR,1.25);
    const rt=new THREE.WebGLRenderTarget(Math.max(1,Math.floor(innerWidth*pr)),Math.max(1,Math.floor(innerHeight*pr)),{type,samples:0});
    composer=new EffectComposer(renderer,rt);composer.setPixelRatio(pr);composer.setSize(innerWidth,innerHeight);
    composer.addPass(new RenderPass(scene,camera));composer.addPass(new ShaderPass(SANITIZE));
    bloomP=new UnrealBloomPass(new THREE.Vector2(innerWidth*pr/2,innerHeight*pr/2),0.35,0.6,0.82);composer.addPass(bloomP);
    const gp=new ShaderPass(GradeShader);GU=gp.uniforms;composer.addPass(gp);
    composer.addPass(new OutputPass());
    fxaaP=new ShaderPass(FXAAShader);fxaaP.material.uniforms['resolution'].value.set(1/(innerWidth*pr),1/(innerHeight*pr));composer.addPass(fxaaP);
      }
  buildComposer();

  // light shafts: lăng trụ additive từ mỗi cửa sổ theo hướng nắng/trăng
  const beamU={uDir:{value:new THREE.Vector3(0,-1,0)},uT:{value:0},uCol:{value:new THREE.Color('#ffd9a0')}};
  const beams=[];
  const beamVS='attribute float side;uniform vec3 uDir;varying float vS;varying vec3 vWp;void main(){vS=side;vec3 p=position+uDir*7.0*side;vWp=p;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.0);}';
  const beamFS=`varying float vS;varying vec3 vWp;uniform float uI,uT;uniform vec3 uCol;
    float h31(vec3 p){p=fract(p*0.3183099+vec3(.1,.2,.3));p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
    float vn3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);}
    void main(){float f=pow(clamp(1.0-vS,0.0,1.0),1.4)*smoothstep(0.0,0.07,vS);
      float n=vn3(vWp*vec3(2.6,1.0,2.6)+vec3(uT*0.06,uT*0.02,uT*0.045));
      float a=f*(0.35+1.0*n)*uI;gl_FragColor=vec4(uCol*a,a);}`;
  env.traverse(o=>{if(!o.isMesh||!/^Win_\w+_Glass$/.test(o.name))return;
    const b=new THREE.Box3().setFromObject(o),sz=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3());
    const ax=sz.x<sz.y&&sz.x<sz.z?0:(sz.z<sz.y?2:1);if(ax===1)return;
    const hc=new THREE.Vector3(5,2.5,-4);const sg=Math.sign(c.getComponent(ax)-hc.getComponent(ax))||1;
    const nrm=new THREE.Vector3();nrm.setComponent(ax,sg);
    const u=ax===0?2:0,v=1;const P=(a,bb)=>{const p=c.clone();p.setComponent(ax,c.getComponent(ax)-sg*0.04);p.setComponent(u,a);p.setComponent(v,bb);return p};
    const q=[P(b.min.getComponent(u),b.min.y),P(b.max.getComponent(u),b.min.y),P(b.max.getComponent(u),b.max.y),P(b.min.getComponent(u),b.max.y)];
    const pos=[],side=[];q.forEach(p=>{pos.push(p.x,p.y,p.z);side.push(0)});q.forEach(p=>{pos.push(p.x,p.y,p.z);side.push(1)});
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('side',new THREE.Float32BufferAttribute(side,1));
    const idx=[];for(let i=0;i<4;i++){const j=(i+1)%4;idx.push(i,j,4+j,i,4+j,4+i)}g.setIndex(idx);
    const mat=new THREE.ShaderMaterial({uniforms:{uDir:beamU.uDir,uT:beamU.uT,uCol:beamU.uCol,uI:{value:0}},vertexShader:beamVS,fragmentShader:beamFS,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false});
    const m=new THREE.Mesh(g,mat);m.frustumCulled=false;m.renderOrder=5;m.raycast=()=>{};m.visible=false;scene.add(m);beams.push({m,mat,nrm})});
  // bụi sáng
  const MN=160,mseed=new Float32Array(MN*3);for(let i=0;i<MN*3;i++)mseed[i]=Math.random();
  const motesG=new THREE.BufferGeometry();motesG.setAttribute('position',new THREE.BufferAttribute(new Float32Array(MN*3),3));motesG.setAttribute('seed',new THREE.BufferAttribute(mseed,3));
  const motesM=new THREE.ShaderMaterial({uniforms:{uT:beamU.uT,uA:{value:0}},transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,fog:false,
    vertexShader:`attribute vec3 seed;uniform float uT;varying float vF;void main(){vec3 p=vec3(0.3+seed.x*9.4,0.3+seed.y*5.0,-7.6+seed.z*7.8);
      p+=vec3(sin(uT*0.3+seed.y*30.0)*0.4,sin(uT*0.2+seed.z*20.0)*0.3+uT*0.0,cos(uT*0.25+seed.x*25.0)*0.4);vF=0.5+0.5*sin(uT*1.3+seed.x*50.0);
      vec4 mv=viewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(90.0/-mv.z,1.5,4.0);}`,
    fragmentShader:'varying float vF;uniform float uA;void main(){float d=length(gl_PointCoord-0.5);float a=(1.0-smoothstep(0.1,0.5,d))*vF*uA;gl_FragColor=vec4(vec3(1.0,0.88,0.65)*a,a);}'});
  const motes=new THREE.Points(motesG,motesM);motes.frustumCulled=false;motes.raycast=()=>{};motes.renderOrder=6;scene.add(motes);
  // mưa + tuyết (bỏ hạt trong khối nhà vì nhà cắt mái)
  const RN=4200;const rseed=new Float32Array(RN*4*3),rcor=new Float32Array(RN*4*2),ridx=[];
  for(let i=0;i<RN;i++){const a=Math.random(),b=Math.random(),c=Math.random();for(let k=0;k<4;k++){const o=(i*4+k)*3;rseed[o]=a;rseed[o+1]=b;rseed[o+2]=c;rcor[(i*4+k)*2]=(k===0||k===3)?-1:1;rcor[(i*4+k)*2+1]=k<2?0:1}
    const q=i*4;ridx.push(q,q+1,q+2,q,q+2,q+3)}
  const rainG=new THREE.BufferGeometry();rainG.setAttribute('position',new THREE.BufferAttribute(new Float32Array(RN*4*3),3));rainG.setAttribute('seed',new THREE.BufferAttribute(rseed,3));rainG.setAttribute('corner',new THREE.BufferAttribute(rcor,2));rainG.setIndex(ridx);
  const PRE=`uniform vec3 uC;uniform float uT,uAmt,uWind;`;
  const HOUSE='bool inHouse(vec3 p){return p.x>-0.2&&p.x<10.2&&p.z>-8.2&&p.z<0.8&&p.y<6.3;}';
  const rainU={uT:beamU.uT,uWind:{value:0},uInt:{value:1},uPx:{value:1},uRes:{value:new THREE.Vector2(1,1)},uC:{value:new THREE.Vector3()},uAmt:{value:0},uCol:{value:new THREE.Color('#d6e4f5')}};
  const rainM=new THREE.ShaderMaterial({uniforms:rainU,transparent:true,depthWrite:false,fog:false,side:THREE.DoubleSide,
    vertexShader:PRE+HOUSE+`uniform float uInt,uPx;uniform vec2 uRes;attribute vec3 seed;attribute vec2 corner;varying float vA;varying float vX;void main(){
      float H=22.0;float spd=(19.0+seed.y*8.0)*(0.85+0.3*uInt);float y=mod(seed.y*H*7.3-uT*spd,H);
      vec3 p=vec3(uC.x-19.0+mod(seed.x*38.0-(uC.x-19.0),38.0),y-1.2,uC.z-19.0+mod(seed.z*38.0-(uC.z-19.0),38.0));
      float len=(0.5+seed.x*0.45)*(0.65+0.45*uInt);
      vec3 vel=normalize(vec3(uWind*0.22,1.0,0.03))*len;
      float keep=step(fract(seed.x*91.7+seed.z*13.3),uAmt);if(inHouse(p))keep=0.0;
      vec4 ca=projectionMatrix*viewMatrix*vec4(p,1.0),cb=projectionMatrix*viewMatrix*vec4(p+vel,1.0);
      float asp=uRes.x/uRes.y;vec2 sa=ca.xy/ca.w,sb=cb.xy/cb.w;vec2 dir=(sb-sa)*vec2(asp,1.0);float dl=length(dir);dir=dl>1e-5?dir/dl:vec2(0.0,1.0);
      vec2 nr=vec2(-dir.y,dir.x)/vec2(asp,1.0);float wpx=(0.9+uInt*0.45)*uPx*(0.8+seed.z*0.5);
      vec4 c=mix(ca,cb,corner.y);c.xy+=nr*corner.x*wpx*2.0/uRes.y*c.w;
      float df=(1.0-smoothstep(26.0,70.0,ca.w))*smoothstep(9.0,22.0,ca.w);
      vA=mix(0.5,0.0,corner.y)*keep*df*(0.55+0.45*seed.y);vX=corner.x;
      gl_Position=keep>0.5?c:vec4(2.0,2.0,2.0,1.0);}`,
    fragmentShader:'uniform vec3 uCol;varying float vA;varying float vX;void main(){float e=1.0-smoothstep(0.35,1.0,abs(vX));gl_FragColor=vec4(uCol,vA*e);}'});
  const rain=new THREE.Mesh(rainG,rainM);rain.frustumCulled=false;rain.raycast=()=>{};rain.visible=false;rain.renderOrder=7;scene.add(rain);
  // gợn nước trên mặt đất (ripples)
  const RP=520;const pseed=new Float32Array(RP*4*3),pcor=new Float32Array(RP*4*2),pidx=[];
  for(let i=0;i<RP;i++){const a=Math.random(),b=Math.random(),c=Math.random();for(let k=0;k<4;k++){const o=(i*4+k)*3;pseed[o]=a;pseed[o+1]=b;pseed[o+2]=c;pcor[(i*4+k)*2]=(k===0||k===3)?-1:1;pcor[(i*4+k)*2+1]=k<2?-1:1}const q=i*4;pidx.push(q,q+1,q+2,q,q+2,q+3)}
  const ripG=new THREE.BufferGeometry();ripG.setAttribute('position',new THREE.BufferAttribute(new Float32Array(RP*4*3),3));ripG.setAttribute('seed',new THREE.BufferAttribute(pseed,3));ripG.setAttribute('corner',new THREE.BufferAttribute(pcor,2));ripG.setIndex(pidx);
  const ripM=new THREE.ShaderMaterial({uniforms:{uT:beamU.uT,uC:rainU.uC,uAmt:{value:0},uCol:rainU.uCol},transparent:true,depthWrite:false,fog:false,side:THREE.DoubleSide,
    vertexShader:`uniform vec3 uC;uniform float uT,uAmt;attribute vec3 seed;attribute vec2 corner;varying vec2 vC;varying float vA;void main(){
      vec3 p=vec3(uC.x-16.0+mod(seed.x*32.0-(uC.x-16.0),32.0),-0.2,uC.z-16.0+mod(seed.z*32.0-(uC.z-16.0),32.0));
      float ph=fract(uT*(0.8+seed.y*0.5)+seed.y*7.0);float keep=step(fract(seed.x*53.1+seed.z*17.7),uAmt);
      bool slab=p.x>-0.5&&p.x<16.2&&p.z>-8.6&&p.z<1.4;if(slab)keep=0.0;
      p+=vec3(corner.x,0.0,corner.y)*(0.05+ph*0.3);vC=corner;vA=(1.0-ph)*(1.0-ph)*keep*0.4;
      gl_Position=keep>0.5?projectionMatrix*viewMatrix*vec4(p,1.0):vec4(2.0,2.0,2.0,1.0);}`,
    fragmentShader:'uniform vec3 uCol;varying vec2 vC;varying float vA;void main(){float r=length(vC);float ring=smoothstep(0.55,0.8,r)*(1.0-smoothstep(0.85,1.0,r));gl_FragColor=vec4(uCol,ring*vA);}'});
  const ripples=new THREE.Mesh(ripG,ripM);ripples.frustumCulled=false;ripples.raycast=()=>{};ripples.visible=false;ripples.renderOrder=3;scene.add(ripples);
  const SN=2200;const sseed=new Float32Array(SN*3);for(let i=0;i<SN*3;i++)sseed[i]=Math.random();
  const snowG=new THREE.BufferGeometry();snowG.setAttribute('position',new THREE.BufferAttribute(new Float32Array(SN*3),3));snowG.setAttribute('seed',new THREE.BufferAttribute(sseed,3));
  const snowU={uT:beamU.uT,uWind:rainU.uWind,uC:rainU.uC,uAmt:{value:0},uPx:{value:1}};
  const snowM=new THREE.ShaderMaterial({uniforms:snowU,transparent:true,depthWrite:false,fog:false,
    vertexShader:PRE+HOUSE+`uniform float uPx;attribute vec3 seed;void main(){
      float H=20.0;float y=mod(seed.y*H*5.1-uT*(1.2+seed.x*1.2),H);
      vec3 p=vec3(uC.x-18.0+mod(seed.x*36.0-(uC.x-18.0),36.0),y-1.5,uC.z-18.0+mod(seed.z*36.0-(uC.z-18.0),36.0));
      p.x+=sin(uT*0.7+seed.y*40.0)*0.7+uWind*sin(uT*0.4+seed.y*9.0)*2.0;p.z+=cos(uT*0.5+seed.x*40.0)*0.7;
      if(fract(seed.x*91.7+seed.z*13.3)>uAmt)p=vec3(0.0,-999.0,0.0);if(inHouse(p))p=vec3(0.0,-999.0,0.0);
      vec4 mv=viewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(uPx*0.9/-mv.z*40.0,1.5,7.0);}`,
    fragmentShader:'void main(){float d=length(gl_PointCoord-0.5);gl_FragColor=vec4(vec3(1.0),(1.0-smoothstep(0.15,0.5,d))*0.85);}'});
  const snow=new THREE.Points(snowG,snowM);snow.frustumCulled=false;snow.raycast=()=>{};snow.visible=false;snow.renderOrder=7;scene.add(snow);
  // âm thanh mưa/sấm (WebAudio, khởi tạo khi có tương tác)
  const RA={ctx:null,g:null};
  function initRainAudio(){if(RA.ctx)return;try{const ctx=new (window.AudioContext||window.webkitAudioContext)();const len=ctx.sampleRate*2,buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);
      let b=0;for(let i=0;i<len;i++){const w=Math.random()*2-1;b=(b+0.04*w)/1.04;d[i]=w*0.5+b*3}
      const src=ctx.createBufferSource();src.buffer=buf;src.loop=true;const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=500;const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=6500;
      const g=ctx.createGain();g.gain.value=0;src.connect(hp);hp.connect(lp);lp.connect(g);g.connect(ctx.destination);src.start();RA.ctx=ctx;RA.g=g;RA.buf=buf}catch(e){}}
  addEventListener('pointerdown',initRainAudio,{once:true});addEventListener('keydown',initRainAudio,{once:true});
  function thunder(){if(!RA.ctx)return;const ctx=RA.ctx,s=ctx.createBufferSource();s.buffer=RA.buf;const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=180;const g=ctx.createGain();
    const t0=ctx.currentTime+0.25+Math.random()*0.9;g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(0.9,t0+0.08);g.gain.exponentialRampToValueAtTime(0.001,t0+2.6);s.connect(lp);lp.connect(g);g.connect(ctx.destination);s.start(t0);s.stop(t0+2.8)}

  let flash=0,flashT=5,tgtW=WEATHER.clear;
  const sunLight=window.__L.sun,hemiL=window.__L.hemi,ambL=window.__L.amb;
  const _tc=new THREE.Vector3(5,1.5,-4);
  function envApply(dt){
    const t=TP.time;const k=keyAt(t);
    tgtW=WEATHER[TP.weather]||WEATHER.clear;
    const f=dt>0?1-Math.exp(-dt*1.2):1;
    for(const q of ['cov','dim','des','fn','ff','rain','snow','wind','wet','cs','int'])WC[q]+=((tgtW[q]||0)-WC[q])*(dt>0?f:1);
    // mặt trời / mặt trăng
    const S=sunPath(t,5.5,19.5,62),M=sunPath(t-19.5+5.5,5.5,15.5,52);   // trăng: 19.5→5.5
    const isDay=((t-5.5+24)%24)<14;const act=isDay?S:M;
    sunPos.copy(S.v);moonPos.copy(M.v);
    const hAbove=Math.sin(Math.max(act.el,0));const fade=Math.min(1,hAbove/0.12);
    sunLight.position.copy(_tc).addScaledVector(act.v,32);sunLight.target.position.copy(_tc);
    sunLight.color.copy(k.sun);sunLight.intensity=Math.max(0.05,2.2*k.sunI*WC.dim*fade);
    hemiL.color.copy(k.ambS);hemiL.groundColor.copy(k.ambG);hemiL.intensity=0.9;
    // desat theo thời tiết
    const des=c=>c.clone().lerp(grayOf(c),WC.des);
    const sunC=des(k.sun),aS=des(k.ambS),aG=des(k.ambG);const sI=Math.min(1.15,(0.35+0.65*k.sunI)*(0.4+0.6*WC.dim)*Math.max(fade,0.2))*(1+flash*1.2),aI=0.95+flash*0.5;
    const raw=(c,v)=>{const w=c.clone().convertLinearToSRGB();v.value.set(w.r,w.g,w.b)};raw(sunC,TU.uSunC);TU.uSunC.value.multiplyScalar(sI);raw(aS,TU.uAmbS);TU.uAmbS.value.multiplyScalar(aI);raw(aG,TU.uAmbG);TU.uAmbG.value.multiplyScalar(aI);
    const lamp=Math.max(k.lamp,WC.dim<0.5?0.3:0)*0.95;TU.uLampC.value.set(1.0*lamp,0.62*lamp,0.3*lamp);
    // sky
    skyU.cTop.value.copy(des(k.top));skyU.cMid.value.copy(des(k.mid));skyU.cPink.value.copy(des(k.pink));skyU.cHor.value.copy(des(k.hor));
    const dayB=0.25+0.75*k.day;skyU.cCl.value.copy(des(k.hor).lerp(new THREE.Color('#ffffff'),0.45*k.day)).multiplyScalar(dayB*(1-0.25*WC.des));
    skyU.cClSh.value.copy(des(k.mid).lerp(k.pink,0.5)).multiplyScalar(dayB*0.95*(1-0.25*WC.des));
    skyU.cth.value=WC.cov;skyU.uStar.value=(1-k.day)*(1-Math.min(1,WC.cov>0.5?0:(0.6-WC.cov)*3));
    skyU.uSunV.value=(isDay?fade:0)*(1-Math.min(1,(0.6-WC.cov)*3.5));
    skyU.sunDir.value.copy(S.v);skyU.moonDir.value.copy(M.v);
    // sương
    scene.fog.color.copy(des(k.fog));scene.fog.near=WC.fn;scene.fog.far=WC.ff;0;
    // grade
    GU.uExpo.value=TP.expo*(1-(1-WC.dim)*0.3);GU.uCon.value=TP.con;GU.uSat.value=TP.sat*(1-WC.des*0.35);GU.uTemp.value=TP.temp+k.gt;GU.uVig.value=TP.vig;GU.uTintAmt.value=TP.tintAmt;GU.uFlash.value=flash*0.6;
    const hs=h=>{const v=hexV(h);return new THREE.Vector3(v.x,v.y,v.z)};GU.uTintSh.value.copy(hexV(TP.tintSh));GU.uTintHi.value.copy(hexV(TP.tintHi));
    bloomP.strength=TP.bloom*(1+0.8*(1-k.day));bloomP.threshold=TP.bloomTh;bloomP.radius=0.55;
    // light shafts
    const dirL=act.v,ltC=des(k.sun);beamU.uCol.value.copy(ltC);beamU.uDir.value.copy(dirL).multiplyScalar(-1);
    let any=0;for(const b of beams){const fct=Math.max(0,b.nrm.dot(dirL)-0.12);const I=TP.rays*fct*0.42*k.sunI*WC.dim*fade*(1-WC.des*0.4);b.mat.uniforms.uI.value=I;b.m.visible=I>0.01;any=Math.max(any,I)}
    motesM.uniforms.uA.value=Math.min(1,any*1.2)*0.9*TP.motes;motes.visible=motesM.uniforms.uA.value>0.01;
    // thời tiết hạt
    rainU.uAmt.value=Math.min(1,WC.rain);rainU.uInt.value=Math.max(0.4,WC.int);ripM.uniforms.uAmt.value=Math.min(1,WC.rain);rain.visible=WC.rain>0.03;ripples.visible=rain.visible;rainU.uCol.value.setRGB(0.55+0.4*k.day,0.62+0.35*k.day,0.78+0.2*k.day);snowU.uAmt.value=Math.min(1,WC.snow);snow.visible=WC.snow>0.03;
    garden.visible=!!TP.garden;if(gardenAnim.lamp)gardenAnim.lamp.emissiveIntensity=0.25+2.4*Math.max(k.lamp,WC.dim<0.5?0.3:0);TU.uWindA.value=WC.wind;TU.uWet.value=WC.wet;TU.uCloudSh.value=WC.cs*(0.2+0.8*k.day);rainU.uWind.value=WC.wind;
    if(RA.g)RA.g.gain.value=Math.min(1,WC.rain)*0.1*(0.4+0.35*WC.int);
  }
  window.__envApply=envApply;
  function envStep(dt){
    if(TP.auto){TP.time=(TP.time+dt*TP.speed)%24;if(window.__syncTime)window.__syncTime()}
    if(WEATHER[TP.weather]&&WEATHER[TP.weather].flash){flashT-=dt;if(flashT<=0){flash=1;flashT=4+Math.random()*7;thunder()}}
    flash=Math.max(0,flash-dt*3.2);
    beamU.uT.value+=dt;skyU.uT.value=beamU.uT.value;GU.uTime.value=beamU.uT.value;
    rainU.uC.value.copy(controls.target);snowU.uPx.value=innerHeight/700;rainU.uPx.value=curPR;renderer.getDrawingBufferSize(rainU.uRes.value);
    envAcc+=dt;if((tickN&3)===0||flash>0){envApply(envAcc);envAcc=0}
    TU.uWindT.value=beamU.uT.value;
  }
  applyToon(false);window.__composer=composer;

  // prewarm: biên dịch trước mọi shader (mưa, tia nắng...) để không giật khi bật
  {const vis=[...beams.map(b=>b.m),motes,rain,ripples,snow].map(o=>[o,o.visible]);vis.forEach(([o])=>o.visible=true);try{renderer.compile(scene,camera)}catch(e){}vis.forEach(([o,v])=>o.visible=v)}
  const tmp=new THREE.Vector3(),tmp2=new THREE.Vector3(),R=new THREE.Clock();let clockG=0,tickN=0,rf=0,chkN=0,envAcc=0,ftEma=0.0167,adaptCool=120,badWin=0,goodWin=0,rawDt=0.0167;
  if(postLevel>=2)TP.post=false;
  function blackFrac(){const gl=renderer.getContext();const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;gl.bindFramebuffer(gl.FRAMEBUFFER,null);const px=new Uint8Array(4);let bad=0,n=0;
    for(let i=1;i<=8;i++)for(let j=1;j<=6;j++){gl.readPixels(Math.floor(w*i/9),Math.floor(h*j/7),1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);n++;if(px[0]+px[1]+px[2]<3)bad++}return bad/n}
  // dynamic resolution scaling kiểu game: giữ ~60fps bằng cách tăng/giảm pixel ratio
  let pendPR=null;
  function setPR(p){curPR=p;renderer.setPixelRatio(p);renderer.setSize(innerWidth,innerHeight);const pr=Math.min(p,1.25);composer.setPixelRatio(pr);composer.setSize(innerWidth,innerHeight);fxaaP.material.uniforms['resolution'].value.set(1/(innerWidth*pr),1/(innerHeight*pr))}
  function adaptRes(dtr){if(TEST)return;ftEma+=(Math.min(dtr,0.1)-ftEma)*0.08;if(--adaptCool>0)return;
    const q=TP.quality;if(q!=='auto'){const t={low:0.75,medium:1,high:maxPR}[q];if(Math.abs(curPR-t)>0.01){pendPR=Math.min(t,maxPR);}adaptCool=60;return}
    if(ftEma>0.0235){badWin++;goodWin=0}else if(ftEma<0.0185){goodWin++;badWin=0}else{badWin=0;goodWin=0}
    if(badWin>=20&&curPR>0.6){pendPR=Math.max(0.6,+(curPR-0.15).toFixed(2));badWin=0;adaptCool=90}
    else if(badWin>=60&&curPR<=0.6&&TP.post){TP.post=false;applyToon(false);toast('Máy chậm: tắt post-fx để mượt hơn');badWin=0}
    else if(goodWin>=240&&curPR<maxPR){pendPR=Math.min(maxPR,+(curPR+0.1).toFixed(2));goodWin=0;adaptCool=180}}
  const TEST=/[?&]test/.test(location.search);
  function tick(dt,doRender=true){
    clockG+=dt;renderer.shadowMap.needsUpdate=((tickN&1)===0)||doRender===false;
    if(pendPR!=null){setPR(pendPR);pendPR=null}
    try{
    const inp=readInput();
    local.logic(dt,inp);if(remote){if(rinp.mag&&clockG-rinpT>1.6)rinp.mag=0;remote.logic(dt,rinp);rinp.interact=false}
    separate();
    local.finish(dt);if(remote)remote.finish(dt);envMixer.update(dt);updDoors();updHalo(dt);
    if(api.sendInput)api.sendInput(inp);if(api.onTick)api.onTick(dt);
    {const f=local;tmp.set(f.char.position.x,f.char.position.y+0.7,f.char.position.z);
      tmp2.copy(tmp).sub(controls.target).multiplyScalar(Math.min(1,dt*3));controls.target.add(tmp2);camera.position.add(tmp2);}
    controls.update();
    {const t=controls.target,cx=clamp(t.x,0.5,9.5),cy=clamp(t.y,0.3,5.5),cz=clamp(t.z,-7.6,0.3);
      if(!window.__free&&(cx!==t.x||cy!==t.y||cz!==t.z)){tmp.set(cx-t.x,cy-t.y,cz-t.z);t.add(tmp);camera.position.add(tmp);}}
    sky.position.copy(camera.position);envStep(dt);
    if((tickN++&15)===0)updCull();
    if(markT>0){markT-=dt;marker.scale.setScalar(1+Math.sin(clockG*8)*0.1);if(markT<=0)marker.visible=false;}
    const sx=c=>c.P.mode+(c.busy?' ('+c.busy.kind+')':'')+' L'+c.P.level+' | '+(c.cur?c.cur.getClip().name.trim().replace(/^ACT_(BIN_)?/,''):'-')+' | plan '+c.plan.length;
    if((tickN&7)===0){$('st').textContent=local.id.toUpperCase()+': '+sx(local)+(remote?'  ||  '+remote.id.toUpperCase()+': '+sx(remote):'');$('st').style.color=''}
    }catch(err){$('st').textContent='ERR: '+err.message;$('st').style.color='#ff7070';if(!window.__e){window.__e=1;console.error(err)}}
    if(doRender){
      if(TP.post&&composer){composer.render();
        if(chkN<2&&TP.time>7&&TP.time<17.5&&(++rf===8||rf===40)){chkN++;if(blackFrac()>0.5){
          if(postLevel===0){postLevel=1;try{localStorage.setItem('vyPostLvl','1')}catch(e){}buildComposer();rf=0;chkN=0;toast('Post-fx lỗi trên GPU này: chuyển sang chế độ 8-bit')}
          else{TP.post=false;try{localStorage.setItem('vyPostLvl','2')}catch(e){}toast('Post-fx lỗi: đã tắt tự động (giữ nguyên toon + ánh sáng)');}}}}
      else renderer.render(scene,camera);
      if(window.__shot){const f=window.__shot;window.__shot=null;f()}
      adaptRes(rawDt);}
  }
  function loop(){requestAnimationFrame(loop);rawDt=R.getDelta();Perf.frame(rawDt*1000);tick(Math.min(rawDt,0.05));Perf.draw(performance.now());}
  if(!TEST)loop();
  // ===== API cho lớp mạng =====
  api.snapshot=()=>{const p=local.P,mv=p.sp>0.05||!!local.busy||local.plan.length>0,mov=p.sp>0.05&&p.mode==='free'&&!local.busy;
    return{x:r3(p.pos.x),y:r3(p.pos.y),z:r3(p.pos.z),w:r3(p.yaw),l:p.level,m:p.mode,b:local.busy?local.busy.kind:0,vx:mov?r3(Math.sin(p.yaw)*p.sp):0,vz:mov?r3(Math.cos(p.yaw)*p.sp):0,mv:mv?1:0}};
  api.addRemote=(slot,glb)=>{if(remote)return;remote=makeChar(glb,{...DEFS[slot],remote:true});api.remote=remote;rinp.mag=0};
  api.removeRemote=()=>{if(!remote)return;remote.dispose();remote=null;api.remote=null;if(window.__halo)endHalo()};
  api.setRemoteInput=m=>{rinp.x=m.x;rinp.z=m.z;rinp.run=!!m.r;rinp.mag=m.m?1:0;rinpT=clockG};
  api.applyState=m=>{if(remote)remote.setNet({x:m.x,y:m.y,z:m.z,w:m.w,l:m.l,m:m.m,b:m.b,vx:m.vx||0,vz:m.vz||0,t:performance.now()})};
  api.applyCmd=(t,a)=>{if(!remote)return;switch(t){
    case 'move':remote.cmdMove(a[0],a[1],a[2],!!a[3]);break;case 'sleep':remote.cmdSleep();break;case 'sit':remote.cmdSit(a||undefined);break;
    case 'wake':remote.cmdWake();break;case 'off':remote.cmdOffChair();break;case 'blink':remote.blink();break;
    case 'int':rinp.interact=true;break;case 'door':{const d=doorList.find(x=>x.node.name===a);if(d)toggleDoor(d);break}}};
  api.envOut=null;
  window.__envChanged=()=>{if(api.envOut)api.envOut({time:TP.time,weather:TP.weather,auto:TP.auto?1:0})};
  api.applyEnv=m=>{if(m.time!=null&&!window.__realTime)TP.time=m.time;if(m.weather)TP.weather=m.weather;window.__tpSync&&window.__tpSync();applyToon(false)};
  api.syncEnvOut=()=>window.__envChanged();
  api.warm=()=>renderer.compileAsync?renderer.compileAsync(scene,camera):Promise.resolve();
  api.dispose=()=>{try{remote&&remote.dispose();local.dispose()}catch(e){}renderer.dispose()};
  window.VY={Perf,local,get remote(){return remote},api,A,scene,camera,renderer,controls,tick,THREE,doorList,toggleDoor,occ,TP,envApply,rain,ripples,garden,WC};
}
