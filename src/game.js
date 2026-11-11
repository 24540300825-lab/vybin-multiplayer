import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries,toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';
import {makeBelt} from './belt.js';
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
import {FU,vertFol2,FRAG_PARS,FRAG_COLOR,OCC_GLSL,makeDepthMat,bindTU} from './foliage.js';
import {setupExterior,LEVELS} from './exterior.js';
import {makeStylizer} from './stylize.js';
import {patchDecal} from './decals.js';
import './hud.js';
import {SFX} from './sfx.js';
import {makeAO,aoGrid,AOU} from './ao.js';
import {initPins} from './ui/pins.js';
import {LazyMouth} from './lazyrig.js';

// API công khai cho lớp mạng (sync.js) — game không biết gì về Supabase.
export const api={local:null,remote:null,emit:null,sendInput:null,onTick:null,envOut:null,peerChanged:null};
const r3=v=>Math.round(v*1000)/1000;
// tường/mái nhà hàng xóm chắn giữa camera và nhân vật (map trong nhà có ngoại cảnh): khoét một "ống" quanh tia nhìn, mép hoà dither
const OCCW_GLSL=`
{ vec3 cp=uOcc.xyz; vec3 ab=uOccPl-cp; float tt=clamp(dot(vWP-cp,ab)/max(dot(ab,ab),1e-3),0.0,1.0);
  float dl=distance(vWP,cp+ab*tt); float al=mix(1.0,smoothstep(3.0,4.8,dl),(1.0-smoothstep(0.86,0.97,tt))*uOcc.w);
  float th=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715))));
  if(al<th) discard; }
`;
export function init(ctx){
  const envG=ctx.env,treeG=ctx.tree,MAPID=window.MAPID;
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  Perf.attach(renderer);
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  document.body.appendChild(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x1a2030);
  const camera=new THREE.PerspectiveCamera(18,innerWidth/innerHeight,1,900);
  camera.position.set((MAP_CONFIGS[window.MAPID]||{}).camMirror?-7:17,16,23);   // camMirror: nhìn từ bên trái (phòng Bin: cánh nhà bên phải sẽ che nếu nhìn từ phải)
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.target.set(5,2,-4);controls.enableDamping=true;controls.minDistance=14;controls.maxDistance=38;controls.enablePan=true;controls.screenSpacePanning=false;controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};controls.update();
  {const az=controls.getAzimuthalAngle(),po=controls.getPolarAngle();controls.minAzimuthAngle=az-CFG.camPan;controls.maxAzimuthAngle=az+CFG.camPan;controls.minPolarAngle=po-CFG.camTilt;controls.maxPolarAngle=po+CFG.camTilt;}
  // phòng Vy / phòng Bin nằm sát cánh nhà bên cạnh (Vy: bên trái, Bin: bên phải): không cho xoay camera vòng sang phía đó
  // — xoay sang là tường nhà bên chắn ngang cầu thang (nhân vật bị khoét/nhấp nháy trong tường, trông như đi xuyên)
  {const mc=MAP_CONFIGS[window.MAPID]||{},dx=mc.ext&&mc.ext.dx;if(dx){const az=controls.getAzimuthalAngle();if(dx<0)controls.minAzimuthAngle=az-0.24;else controls.maxAzimuthAngle=az+0.24}}   // vỏ ngoài hông + sau của chính cánh đang đứng được ẩn (MC.ext.hide) → nhìn chéo từ bên ngoài vẫn thấy rõ trong phòng

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
  const STY=makeStylizer(THREE,{aniso:Math.min(8,renderer.capabilities.getMaxAnisotropy())});window.__roofPH=STY.roofPH;api.stylize=r=>{try{const n=STY.apply(r);return n}catch(e){console.warn('[stylize]',e);return 0}};

  // Toon painterly 3 tông (Shadow/Mid/Highlight) + ambient bounce + noise cọ theo world-space; giữ texture gốc
  const NOISE_GLSL=`
    float h31(vec3 p){p=fract(p*0.3183099+vec3(.1,.2,.3));p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
    float vn3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
      return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);}`;
  function toonify(root){const done=new Set();root.traverse(o=>{if(!(o.isMesh||o.isSkinnedMesh))return;
    (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
      if(m&&m.userData&&m.userData.leafMask&&!o.customDepthMaterial){o.customDepthMaterial=DEPTH_LEAF}
      if(!m||done.has(m)||!m.isMeshStandardMaterial)return;done.add(m);toonMat(m)})})}
  const aoOn=m=>!m.userData.fol2&&!m.userData.grass&&!m.userData.vyDec&&!m.userData.noAO&&!m.userData.ground&&!m.userData.leaf&&!/PolyFoliage|Leaves|Plant_|Fern|Stylized Grass/i.test(m.name||'');
  function toonMat(m){
      m.onBeforeCompile=sh=>{if(m.userData.leafMask)patchLeafMask(sh);Object.assign(sh.uniforms,TU);if(aoOn(m))Object.assign(sh.uniforms,AOU);
        const F2=!!m.userData.fol2,GB=!!m.userData.grass,FOL=!F2&&!GB&&(/PolyFoliage|Leaves|Plant_|Fern/i.test(m.name||'')||m.userData.leaf)&&!m.userData.noLeaf,SW=!F2&&!GB&&(/Wind/i.test(m.name||'')||m.userData.sway||FOL),GRD=!!m.userData.ground||/Stylized Grass/i.test(m.name||'');
        const VS0=(F2||GB)?vertFol2(sh.vertexShader,!!m.userData.cloudV,NOISE_GLSL,GB||!!m.userData.squash,!!m.userData.stemR):sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
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
        if(F2||GB){sh.uniforms.uCenter={value:m.userData.center||new THREE.Vector3(0,0.65,0)};sh.uniforms.uHInv={value:m.userData.hInv||0.66};sh.uniforms.uWindDir=FU.uWindDir;sh.uniforms.uHybrid=FU.uHybrid;sh.uniforms.uBaseShade=FU.uBaseShade;sh.uniforms.uFolEmi=FU.uFolEmi;sh.uniforms.uGMap=FU.uGMap;sh.uniforms.uGK=FU.uGK;sh.uniforms.uGTint=FU.uGTint;if(m.userData.occW&&!(F2||GB)){sh.uniforms.uOcc=FU.uOcc;sh.uniforms.uOccPl=FU.uOccPl}sh.uniforms.uPl=FU.uPl;sh.uniforms.uFolTint=FU.uFolTint;sh.uniforms.uFolVar=FU.uFolVar;sh.uniforms.uGrTint=FU.uGrTint;sh.uniforms.uGrVar=FU.uGrVar;sh.uniforms.uOcc=FU.uOcc;sh.uniforms.uOccPl=FU.uOccPl}
        sh.vertexShader=(SW?'#define SWAYX\n':'')+'varying vec3 vWP;uniform float uWindT,uWindA;\n'+VS0;
        sh.uniforms.uGTint=FU.uGTint;sh.uniforms.uDesat={value:m.userData.desat==null?1:m.userData.desat};sh.fragmentShader='uniform float uDesat;uniform vec3 uGTint;\n'+(FOL?'#define FOLIAGE\n':'')+(F2?'#define FOL2\n':'')+(m.userData.bush?'#define BUSHF\n':'')+(GB?'#define GRASSB\n':'')+(GRD?'#define GROUNDX\n':'')+((F2||GB)?FRAG_PARS:(m.userData.occW?'uniform vec4 uOcc;uniform vec3 uOccPl;\n':''))+(aoOn(m)?'#define VY_AO\nuniform sampler2D uAOT;uniform vec3 uAOB,uAOS,uAOC;uniform vec4 uAOG;uniform vec2 uAOA;uniform float uAOK;\nfloat aoFetch(vec3 q){float fy=clamp(q.y*uAOG.w-0.5,0.0,uAOG.w-1.0);float i0=floor(fy),a=fy-i0,i1=min(i0+1.0,uAOG.w-1.0);vec2 t=vec2(clamp(q.x*uAOG.x,0.5,uAOG.x-0.5),clamp(q.z*uAOG.y,0.5,uAOG.y-0.5));vec2 o0=vec2(mod(i0,uAOG.z),floor(i0/uAOG.z))*uAOG.xy,o1=vec2(mod(i1,uAOG.z),floor(i1/uAOG.z))*uAOG.xy;return mix(texture2D(uAOT,(o0+t)/uAOA).r,texture2D(uAOT,(o1+t)/uAOA).r,a);}\n':'')+'uniform float uInHK;uniform vec3 uSh,uMid,uHi,uGCol,uRimCol,uSunC,uAmbS,uAmbG,uLampC;uniform vec4 uLP[10];uniform float uLN,uLK,uLOff;uniform vec3 uLeafA,uLeafB,uGrassA,uGrassB;uniform float uDS,uDM,uHiS,uGS,uGM,uGStr,uRim,uRimPow,uLeafMix,uWindT,uWet,uCloudSh;varying vec3 vWP;\n'+NOISE_GLSL+'\n'+sh.fragmentShader.replace('#include <normal_fragment_begin>',(F2||GB)?'#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\nnormal*=(gl_FrontFacing?1.0:-1.0);\n#endif\n'+(m.userData.occ?OCC_GLSL:''):'#include <normal_fragment_begin>'+(m.userData.occW?OCCW_GLSL:'')).replace('#include <opaque_fragment>',`
        {float I=1.0,Ih=1.0,vis=1.0,Ig=0.0;
         #ifdef FOLIAGE
         {float lm=dot(diffuseColor.rgb,vec3(0.299,0.587,0.114));vec3 lf=mix(uLeafA,uLeafB,smoothstep(0.03,0.4,lm));
          diffuseColor.rgb=mix(diffuseColor.rgb,lf,uLeafMix)*mix(0.7,1.0,smoothstep(-0.25,0.9,vWP.y));}
         #endif
         #ifdef GROUNDX
         {float lm=dot(diffuseColor.rgb,vec3(0.299,0.587,0.114));diffuseColor.rgb=mix(diffuseColor.rgb,mix(uGrassA,uGrassB,smoothstep(0.08,0.6,lm)),0.75)*uGTint;}
         #endif
         #if defined(FOL2)||defined(GRASSB)
${FRAG_COLOR}
         #endif
         #if defined(FOLIAGE)||defined(FOL2)||defined(GRASSB)||defined(GROUNDX)||defined(BUSHF)
         diffuseColor.rgb*=vec3(0.93,1.0,1.09);   // cỏ cây lá: ngả nhẹ sang teal
         #endif
         #if ( NUM_DIR_LIGHTS > 0 )
          vec3 Ld=directionalLights[0].direction;
          float ndl=dot(geometryNormal,Ld);
          float ang=acos(clamp(ndl,-1.0,1.0));
          float maxA=uDS*1.5708,sm=uDM*1.5708;
          I=ang<maxA?1.0:((sm>0.0001&&ang<maxA+sm)?1.0-(ang-maxA)/sm:0.0);
          float hiA=maxA*uHiS;
          Ih=ang<hiA?1.0:((sm>0.0001&&ang<hiA+sm)?1.0-(ang-hiA)/sm:0.0);
          diffuseColor.rgb=mix(vec3(dot(diffuseColor.rgb,vec3(0.299,0.587,0.114))),diffuseColor.rgb,uDesat);
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
         vec3 shC=min(uSh*amb,uMid*uSunC*0.78);   // vùng bóng luôn TỐI hơn vùng sáng (ban đêm/mưa ánh trăng yếu hơn ambient → trước đây bóng lại sáng hơn)
         vec3 tone=mix(shC,uMid*uSunC,I*vis);
         tone=mix(tone,uHi*uSunC,Ih*vis);
         #if (defined(GRASSB)||defined(BUSHF))&&(NUM_DIR_LIGHTS>0)
         // cỏ + bụi: chiếu sáng Y HỆT mặt thảm phía dưới (pháp tuyến hướng lên, cùng ánh nắng/ambient) → luôn cùng tông với thảm ở mọi giờ & thời tiết; không tự đổ bóng lên chính nó
         {vec3 upV=normalize((viewMatrix*vec4(0.0,1.0,0.0,0.0)).xyz);float aU=acos(clamp(dot(upV,Ld),-1.0,1.0));
          float Iu=aU<maxA?1.0:((sm>0.0001&&aU<maxA+sm)?1.0-(aU-maxA)/sm:0.0),Ihu=aU<hiA?1.0:((sm>0.0001&&aU<hiA+sm)?1.0-(aU-hiA)/sm:0.0);
          tone=mix(min(uSh*uAmbS,uMid*uSunC*0.78),uMid*uSunC,Iu);tone=mix(tone,uHi*uSunC,Ihu);}
         #endif
         float inH=smoothstep(-0.2,0.2,vWP.x)*(1.0-smoothstep(9.8,10.2,vWP.x))*smoothstep(-8.2,-7.8,vWP.z)*(1.0-smoothstep(0.4,0.8,vWP.z))*step(vWP.y,6.2)*step(-0.3,vWP.y)*uInHK;
         #if defined(FOL2)||defined(GRASSB)
         tone*=1.0-0.28*vCS*(1.0-inH);
         #else
         if(uCloudSh>0.01){float csn=vn3(vec3(vWP.x*0.05+uWindT*0.5,0.0,vWP.z*0.05+uWindT*0.2));tone*=1.0-0.28*smoothstep(0.5,0.62,csn)*uCloudSh*(1.0-inH);}
         #endif
         vec3 col=diffuseColor.rgb*tone;
         #if defined(FOL2)&&!defined(BUSHF)   // phần "phát sáng" chỉ cho cây/hoa; cỏ & bụi tính sáng như thảm
         col+=diffuseColor.rgb*uFolEmi*mix(amb,uSunC,0.5*vis)*1.15;   // phần "phát sáng" của lá cũng ăn theo tông môi trường (sáng/tối/hoàng hôn/mưa)
         #endif
         #if defined(FOL2)&&!defined(BUSHF)
         col*=1.0-0.06*uWet*(1.0-inH); col=mix(col,col*vec3(0.9,1.1,0.9),uWet*0.6);   // lá ướt: không tối/xám bẩn, hơi tươi hơn
         #else
         col*=1.0-0.2*uWet*(1.0-inH);
         #endif
         #if defined(FOL2)||defined(GRASSB)
         col+=uGCol*uSunC*Ig*vis*uGStr*0.12;
         #else
         col+=uGCol*uSunC*Ig*vis*uGStr*(1.0+uWet*3.0*(1.0-inH));
         #endif
         float rim=pow(1.0-clamp(dot(geometryNormal,geometryViewDir),0.0,1.0),uRimPow)*uRim;
         #if defined(FOL2)||defined(GRASSB)
         rim*=0.25;
         #endif
         col+=uRimCol*uSunC*rim*(0.35+0.65*I);
         col+=diffuseColor.rgb*uLampC*inH*(0.2+0.35*I);
         {float lp=0.0;for(int li=0;li<10;li++){if(float(li)>=uLN)break;vec3 ld=uLP[li].xyz-vWP;float q=clamp(1.0-dot(ld,ld)/(uLP[li].w*uLP[li].w),0.0,1.0);lp+=q*q;}
          lp=min(lp,1.4);
          col*=1.0-0.15*uLK*inH*(1.0-min(lp,1.0));
          col*=1.0-0.6*uLOff*inH;
          col+=diffuseColor.rgb*vec3(1.0,0.8,0.52)*lp*uLK*0.85;}
         #ifdef VY_AO
         if(uAOK>0.001){// AO bake sẵn (nhân vào TỔNG màu, sau cả ánh đèn nội thất) (khối 3D, src/ao.js): đọc tại vị trí + pháp tuyến×0.12 m; mờ dần ra ngoài khối; yếu hơn ở chỗ đang có nắng để nổi highlight
          vec3 qA=(vWP+wn*0.12-uAOB)*uAOS;
          float wA=smoothstep(0.0,0.03,qA.x)*smoothstep(1.0,0.97,qA.x)*smoothstep(0.0,0.03,qA.y)*smoothstep(1.0,0.97,qA.y)*smoothstep(0.0,0.03,qA.z)*smoothstep(1.0,0.97,qA.z);
          float dA=clamp(aoFetch(qA)*1.7,0.0,1.0)*wA*uAOK*mix(1.0,0.6,I*vis);
          col*=mix(vec3(1.0),uAOC,clamp(dA,0.0,1.0));}
         #endif
         outgoingLight=col+totalEmissiveRadiance;}
        #include <opaque_fragment>`);if(STY)STY.patch(sh,m);if(m.userData.vyDec)patchDecal(sh,m)};
      m.customProgramCacheKey=()=>'vytoon10'+(aoOn(m)?'A':'')+(STY?STY.key(m):'')+(m.userData.vyDec?'D'+m.userData.vyDec:'')+(m.userData.occW?'W':'')+(m.userData.fol2?'F':'')+(m.userData.stemR?'R':'')+(m.userData.grass?'G':'')+(m.userData.cloudV?'c':'')+(m.userData.squash||m.userData.grass?'q':'')+(m.userData.occ?'o':'')+(m.userData.leafMask?'L':'')+((/Wind/i.test(m.name||'')||m.userData.sway||/PolyFoliage|Leaves|Plant_|Fern/i.test(m.name||''))?'s':'')+(((/PolyFoliage|Leaves|Plant_|Fern/i.test(m.name||'')||m.userData.leaf)&&!m.userData.noLeaf)?'f':'')+((m.userData.ground||/Stylized Grass/i.test(m.name||''))?'g':'');m.needsUpdate=true;}

  // mái ngói cánh Vy/Bin: GLB ngoại cảnh chỉ có mái cánh phòng khách (Roof_Living) → nhân bản sang 2 cánh kia
  // (khớp kích thước mái gốc Roof_Vy/Roof_Bin trong LIVING_ROOM.glb: rộng 10.85, lệch tâm ±0.425, cao 6.4). skipX = x tâm cánh đang ở (giữ hở để nhìn vào)
  function addWingRoofs(root,skipX){const L=root.getObjectByName('Roof_Living');if(!L)return;
    const fit={WING_VY:[0.575,15],WING_BIN:[-0.575,-5]};   // mép trong lùi 0.3 m khỏi tường cánh phòng khách (trước đây mái chĩa xuyên đỉnh tường → lộ răng cưa ngói trong phòng)
    for(const w in fit){const W=root.getObjectByName(w);if(!W||W.getObjectByName('Roof_'+w.slice(5,6)+w.slice(6).toLowerCase()))continue;if(skipX!=null&&Math.abs(fit[w][1]-skipX)<3)continue;
      const R=new THREE.Group();R.name='Roof_'+w.slice(5,6)+w.slice(6).toLowerCase();R.position.set(fit[w][0],6.4,0.015);R.scale.set(10.55/11,1,1);
      const parts=L.isMesh?[L]:L.children.filter(c=>c.isMesh&&!/Gable/i.test(c.name));
      parts.forEach(m=>{const c=new THREE.Mesh(m.geometry,m.material);c.name=R.name+'_'+m.name.split('_').pop();c.position.copy(m.position);c.quaternion.copy(m.quaternion);c.scale.copy(m.scale);c.castShadow=m.castShadow;c.receiveShadow=m.receiveShadow;R.add(c)});
      W.add(R)}
    root.updateMatrixWorld(true)}
  if(MAP_CONFIGS[MAPID]&&MAP_CONFIGS[MAPID].outdoor)addWingRoofs(envG.scene,null);
  // env
  const env=envG.scene;toonify(env);scene.add(env);env.updateMatrixWorld(true);
  // mẫu Scatter (SF_BiomeProxy_* / SF_SourceProxy_* / SF_BiomeSurface_*: đá, cỏ Plant_01, hoa, bụi, cây) nằm ở gốc toạ độ GLB = góc trước-trái phòng khách → hiện thành cụm đá + lá phẳng dính tường. Chỉ là mẫu cho instancing → ẩn (mesh thường, không đụng InstancedMesh).
  {const wp=new THREE.Vector3();let n=0;env.traverse(o=>{if(!o.isMesh||o.isInstancedMesh||!o.visible)return;let tpl=false;for(let q=o;q&&q!==scene;q=q.parent)if(/^\.?SF_(Biome|Source)/.test(q.name||'')){tpl=true;break}
    if(!tpl)return;o.getWorldPosition(wp);env.worldToLocal(wp);if(Math.abs(wp.x)<0.01&&Math.abs(wp.z)<0.01){o.visible=false;n++}});if(n)console.log('env: ẩn '+n+' mẫu scatter ở gốc toạ độ')}
  const envMeshes=[];const byName={};
  env.traverse(o=>{byName[o.name]=o;if(o.isMesh){envMeshes.push(o);const m=o.material;const tr=m&&(m.transparent||m.opacity<1);o.userData.glass=tr||/glass/i.test(o.name);
    if(!tr){o.castShadow=true;}o.receiveShadow=true;}});
  const isUnder=(o,name)=>{while(o){if(o.name===name)return true;o=o.parent}return false};
  const box=n=>new THREE.Box3().setFromObject(byName[n]);

  // anchors
  const MAPS=MAP_CONFIGS;
  const MC=MAPS[MAPID]||MAPS.living;const OUTD=!!MC.outdoor;STY.setWallNames(MC.wallMats);if(!OUTD)sun.shadow.mapSize.set(2048,2048);TU.uInHK.value=OUTD?0:1;bindTU(TU);
  if(OUTD){const sp=MC.spawn.vy;controls.target.set(sp[0],A0y(MC)+1,sp[1]);camera.fov=30;camera.updateProjectionMatrix();camera.position.set(sp[0]+7.2,A0y(MC)+9,sp[1]+11.4);controls.minDistance=5;controls.maxDistance=28;controls.update();
    controls.minAzimuthAngle=-Infinity;controls.maxAzimuthAngle=Infinity;controls.minPolarAngle=0.12;controls.maxPolarAngle=1.5;CFG.camPan=Math.PI*2;CFG.camTilt=0.9}
  function A0y(c){return c.floorY||0}
  if(MC.tint)env.traverse(o=>{if(o.isMesh&&o.material&&MC.tint[o.material.name]!=null)o.material.color.set(MC.tint[o.material.name])});
  if(MC.hideFlat)env.traverse(o=>{if(o.isMesh&&!(o.material&&o.material.name)){const b=new THREE.Box3().setFromObject(o);if((b.max.x-b.min.x)*(b.max.z-b.min.z)>20&&b.max.y-b.min.y<1.2)o.visible=false}});
  if(MC.hide)env.traverse(o=>{if(MC.hide.test(o.name)||(o.isMesh&&o.material&&MC.hide.test(o.material.name||'')))o.visible=false});
  // MC.cutTop={node,y}: bỏ các tam giác nằm hẳn trên cao độ y của node đó (vd. thanh ngang trên cùng của khung mặt trước phòng Bin)
  if(MC.cutTop){env.updateMatrixWorld(true);const C=MC.cutTop,v=new THREE.Vector3();env.traverse(o=>{if(!o.isMesh)return;let hit=false;for(let q=o;q&&q!==env;q=q.parent)if(C.node.test(q.name))hit=true;if(!hit)return;
    const g=o.geometry.index?o.geometry.clone():o.geometry.clone().toNonIndexed();const pa=g.attributes.position;let ix=g.index?[...g.index.array]:[...Array(pa.count).keys()];
    const out=[];for(let t=0;t<ix.length;t+=3){let lo=1e9;for(let k=0;k<3;k++){v.fromBufferAttribute(pa,ix[t+k]).applyMatrix4(o.matrixWorld);lo=Math.min(lo,v.y)}if(lo<C.y)out.push(ix[t],ix[t+1],ix[t+2])}
    g.setIndex(out);o.geometry=g;console.log('[cutTop] '+o.name+': '+(ix.length-out.length)/3+' tam giác bỏ')})}
  env.updateMatrixWorld(true);
  let EXT=null;
  if(OUTD){const _t0=performance.now();EXT=setupExterior({scene,env,MC,toonMat});api.stylize(EXT.group);console.log('[ext] setup '+Math.round(performance.now()-_t0)+'ms');if(/[?&]tune\b/.test(location.search))import('./tune.js').then(m=>m.mountTune(EXT,FU));for(let i=envMeshes.length-1;i>=0;i--)if(!envMeshes[i].parent)envMeshes.splice(i,1);
    env.traverse(o=>{if(o.isMesh&&/^Stylized Grass$/.test((o.material&&o.material.name)||''))o.visible=false;if(o.isMesh&&/^\.SF_/.test(o.name))o.visible=false});env.updateMatrixWorld(true)}
  // ===== map TRONG NHÀ có ngoại cảnh: dùng lại nguyên map ngoài vườn (map-exterior, đúng như bản đang chạy) quanh căn nhà =====
  // MC.ext = {dx,dz: dời ngoại cảnh cho khớp toạ độ phòng; hide: regex node vỏ nhà phải ẩn (cánh nhà đang ở bị cắt); roofX: x tâm mái (instancing) cần ẩn}
  let EXTV=null,extG=null;
  if(!OUTD&&MC.ext&&ctx.ext){const X=MC.ext,_t0=performance.now();extG=ctx.ext.scene;extG.name='__EXTERIOR__';
    extG.traverse(o=>{if((X.hide&&X.hide.test(o.name))||/^Interior_(Bin|Living|Vy)/.test(o.name))o.visible=false});   // hộp tối giả nội thất sau cửa sổ: kính đã đặc nên không cần, và để chỗ 'khoét' tường hàng xóm không lộ mảng đen
    addWingRoofs(extG,X.roofX);
    extG.position.set(X.dx||0,0,X.dz||0);extG.updateMatrixWorld(true);
    if(X.roofX!=null){const c=new THREE.Vector3(),M=new THREE.Matrix4();extG.traverse(o=>{if(!o.isInstancedMesh)return;let p=o.parent,inHouse=false;for(;p;p=p.parent)if(/^HOUSE_L1/.test(p.name))inHouse=true;if(!inHouse)return;
      o.geometry.computeBoundingBox();const gc=o.geometry.boundingBox.getCenter(new THREE.Vector3());
      for(let i=0;i<o.count;i++){o.getMatrixAt(i,M);c.copy(gc).applyMatrix4(M).applyMatrix4(o.matrixWorld);if(Math.abs(c.x-(X.roofX+(X.dx||0)))<3){M.makeScale(0,0,0);o.setMatrixAt(i,M);o.instanceMatrix.needsUpdate=true}}})}
    // chỉ khoét TƯỜNG khi chắn camera — mái ngói (instancing / tên Roof) luôn giữ nguyên: khoét mái lộ ra bên trong rỗng, rất xấu
    // vật liệu mái dùng CHUNG với tường (vd 'Stylized  wood') → nhân bản riêng cho mái (instancing + node Roof*) để cờ khoét không lan sang mái
    {const cl=new Map(),isRoof=o=>{if(o.isInstancedMesh)return true;for(let p=o;p;p=p.parent)if(/Roof/i.test(p.name))return true;return false};
     extG.traverse(o=>{if(!o.isMesh)return;let inHouse=false;for(let p=o.parent;p;p=p.parent)if(/^HOUSE_L1/.test(p.name))inHouse=true;if(!inHouse||!isRoof(o))return;
       const f=m=>{if(!m)return m;let c=cl.get(m);if(!c){c=m.clone();c.userData={...m.userData,noOcc:true};cl.set(m,c)}return c};o.material=Array.isArray(o.material)?o.material.map(f):f(o.material)})}
    extG.traverse(o=>{if(!o.isMesh||!o.visible||o.isInstancedMesh)return;let p=o.parent,inHouse=false,roof=/Roof|Tile/i.test(o.name);for(;p;p=p.parent){if(/^HOUSE_L1/.test(p.name))inHouse=true;if(/Roof|Tile/i.test(p.name))roof=true}
      if(inHouse&&!roof)[].concat(o.material).forEach(mm=>{if(mm&&!mm.userData.noOcc&&!/Roof|Tile/i.test(mm.name||''))mm.userData.occW=true})});
    toonify(extG);console.log('[sty] ngoại cảnh: '+api.stylize(extG));scene.add(extG);extG.updateMatrixWorld(true);
    const E0=MAPS.exterior,dx=X.dx||0,dz=X.dz||0,f=E0.fence;
    const EMC={...E0,fence:[f[0]+dx,f[1]+dx,f[2]+dz,f[3]+dz,f[4]+dx],dropTrees:(E0.dropTrees||[]).map(q=>[q[0]+dx,q[1]+dz]),noPlant:(E0.noPlant||[]).map(b=>[b[0]+dx,b[1]+dx,b[2]+dz,b[3]+dz]),porch:null,indoor:true};
    EXTV=setupExterior({scene,env:extG,MC:EMC,toonMat});api.stylize(EXTV.group);EXTV.setLevel(TP.quality==='low'?'low':'indoor');
    // cây/bụi lẻ (không nằm trong ô instancing) ở XA nhà: bỏ hẳn — từ camera trên cao nhìn xuống chỉ thấy khối thô xấu; gần nhà giữ nguyên
    {const C=new THREE.Vector3(5,0,-4),sp=new THREE.Sphere();let n=0;extG.updateMatrixWorld(true);env.updateMatrixWorld(true);
     [extG,env].forEach(R=>R&&R.traverse(o=>{if(!o.isMesh||!o.visible)return;for(let p=o;p;p=p.parent)if(p.name==='EXT_CELLS')return;
       const fol=[].concat(o.material).some(m=>m&&/^Poly(Foliage|Shader)|Stylized\s+wood|^ROCK$/i.test(m.name||''));if(!fol)return;
       const g=o.geometry;if(!g.boundingSphere)g.computeBoundingSphere();sp.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
       if(o.isInstancedMesh){if(sp.radius>40)return}           // instancing rải rộng: để nguyên (ô của setupExterior đã lo)
       if(Math.hypot(sp.center.x-C.x,sp.center.z-C.z)-sp.radius*0.3>26){o.visible=false;n++}}));
     console.log('[ext] bỏ cây/bụi lẻ ở xa: '+n)}
    extG.traverse(o=>{if(o.isMesh&&/^Stylized Grass$/.test((o.material&&o.material.name)||''))o.visible=false;if(o.isMesh&&/^\.SF_/.test(o.name))o.visible=false});extG.updateMatrixWorld(true);
    console.log('[ext] ngoại cảnh cho map trong nhà '+Math.round(performance.now()-_t0)+'ms')}
  // kính cửa sổ/cửa chính nhìn từ ngoài: đặc (không thấy nội thất), màu xanh trời theo giờ & thời tiết, hơi bóng
  const WGLASS=[];if(OUTD||extG)(extG||env).traverse(o=>{if(!o.isMesh)return;[].concat(o.material).forEach(m=>{if(m&&/^M_Glass/.test(m.name)&&!WGLASS.includes(m)){m.transparent=false;m.opacity=1;m.depthWrite=true;m.alphaMap=null;m.needsUpdate=true;WGLASS.push(m)}})});
  const _gc1=new THREE.Color(),_gc2=new THREE.Color();
  const updGlass=(day,dim,des)=>{if(!WGLASS.length)return;_gc1.setRGB(0.55,0.78,0.97).multiplyScalar(0.28+0.72*day*(0.55+0.45*dim));_gc2.setRGB(0.5,0.56,0.62).multiplyScalar(0.3+0.5*day*dim);_gc1.lerp(_gc2,Math.min(1,des*0.9));
    WGLASS.forEach(m=>{m.color.copy(_gc1);if(m.emissive){m.emissive.copy(_gc1).multiplyScalar(0.22);m.emissiveIntensity=1}if('roughness' in m)m.roughness=0.12;if('metalness' in m)m.metalness=0.35})};
  const A={};A.L0=OUTD?(MC.floorY||0):0;A.L1=OUTD?A.L0+3:box(MC.mezz[0]).max.y;
  // cầu thang: gom thành danh sách; profile độ cao lấy bằng raycast rồi làm mượt
  const stairs=[];
  {const groups=OUTD?[]:MC.treadNames?MC.treadNames.filter(n=>byName[n]).map(n=>[byName[n]]):[Object.keys(byName).filter(n=>MC.tread.test(n)).map(n=>byName[n])];
    const rc=new THREE.Raycaster();
    groups.forEach(ms=>{if(!ms.length)return;const sb=new THREE.Box3(),meshes=[];ms.forEach(o=>{sb.union(new THREE.Box3().setFromObject(o));o.traverse(q=>{if(q.isMesh)meshes.push(q)})});
      const S={x0:sb.min.x,x1:sb.max.x,z0:sb.min.z,z1:sb.max.z};S.cx=(S.x0+S.x1)/2;S.botZ=S.z1+0.15;S.topZ=S.z0-0.35;S.midZ=(S.z0+S.z1)/2;
      const n=Math.max(8,Math.ceil((S.z1-S.z0)/0.05)),ys=[];
      for(let k=0;k<=n;k++){const z=S.z1-k*(S.z1-S.z0)/n;rc.set(new THREE.Vector3(S.cx,30,z),new THREE.Vector3(0,-1,0));const h=rc.intersectObjects(meshes,false)[0];ys.push(h?h.point.y:null)}
      for(let k=0;k<=n;k++)if(ys[k]==null){let a=k-1,b=k+1;while(a>=0&&ys[a]==null)a--;while(b<=n&&ys[b]==null)b++;ys[k]=a<0?(b<=n?ys[b]:0):b>n?ys[a]:ys[a]+(ys[b]-ys[a])*(k-a)/(b-a)}
      // đường dốc THẲNG (bình phương tối thiểu qua mặt các bậc), không còn "bậc nhô lên" nên không giật; nâng nhẹ để chân không lún
      {const dz=(S.z1-S.z0)/n;let sx=0,sy=0,sxx=0,sxy=0;for(let k=0;k<=n;k++){const d=k*dz;sx+=d;sy+=ys[k];sxx+=d*d;sxy+=d*ys[k]}
        const m=n+1,b=(m*sxy-sx*sy)/(m*sxx-sx*sx),a=(sy-b*sx)/m;S.a=a+0.03;S.b=b;S.top=A.L1}
      S.n=n;S.raw=ys;stairs.push(S)})}
  const stairAt=(x,z)=>{for(const S of stairs)if(x>S.x0-0.05&&x<S.x1+0.05&&z>S.z0&&z<S.z1)return S;return null};
  const inStair=(x,z)=>!!stairAt(x,z);
  const stairY=(S,z)=>Math.min(S.top,Math.max(0,S.a+S.b*(S.z1-z)));
  const heightAt=(x,z,lv)=>{const S=stairAt(x,z);if(S)return stairY(S,z);
    if(!lv)for(const T of stairs){if(x>T.x0&&x<T.x1&&z>=T.z1&&z<T.z1+0.34)return stairY(T,T.z1)*(1-(z-T.z1)/0.34)}   // chân chạm bậc đầu êm trước khi vào cầu thang
    if(!lv&&EXT){const y=EXT.walkHeight(x,z);if(y!=null)return y}
    return lv?A.L1:A.L0};
  A.stairs=stairs;
  const pickStair=(x0,z0,x1,z1,up)=>{let best=stairs[0],bd=1e9;for(const S of stairs){const a=up?S.botZ:S.topZ,b=up?S.topZ:S.botZ,d=Math.hypot(x0-S.cx,z0-a)+Math.hypot(S.cx-x1,b-z1);if(d<bd){bd=d;best=S}}return best};
  // ===== đèn trong nhà → các "vũng sáng" cục bộ (đèn thả bếp, đèn sàn, đèn bàn…): gần đèn sáng ấm, xa đèn tối dần =====
  // công tắc đèn trong nhà (nhớ lại giữa các lần chơi): tắt → chỉ còn ánh nắng/ánh trời
  // đèn nhà 2 nhóm: a = ánh đèn chung (sáng ấm phủ cả nhà) · b = các đèn có bóng (đèn thả, đèn cây, đèn bàn, đèn ngủ: chao phát sáng + vũng sáng quanh đèn). Tắt cả 2 → phòng tối.
  const LI={a:true,b:true,ka:1,kb:1,mats:null};
  try{const o=localStorage.getItem('vyLamps');const ga=localStorage.getItem('vyLampA'),gb=localStorage.getItem('vyLampB');LI.a=ga!=null?ga!=='0':o!=='0';LI.b=gb!=null?gb!=='0':o!=='0'}catch(e){}LI.ka=LI.a?1:0;LI.kb=LI.b?1:0;
  const lampsEv=()=>window.dispatchEvent(new CustomEvent('vylamps',{detail:{a:LI.a,b:LI.b}}));
  const lampsSave=()=>{try{localStorage.setItem('vyLampA',LI.a?'1':'0');localStorage.setItem('vyLampB',LI.b?'1':'0');localStorage.setItem('vyLamps',LI.a||LI.b?'1':'0')}catch(e){}};
  api.lamps=v=>{if(v===undefined)return LI.a||LI.b;LI.a=LI.b=!!v;lampsSave();lampsEv();return LI.a||LI.b};     // bật/tắt tất cả (phím L)
  api.lampGroup=(g,v)=>{const k=g==='b'?'b':'a';if(v===undefined)return LI[k];LI[k]=!!v;lampsSave();lampsEv();return LI[k]};
  const LAMPS=[];
  {env.updateMatrixWorld(true);const pend=[],other=[],studioP=[],studioO=[];
   env.traverse(o=>{const n=o.name||'';
     if(/^Pendant_(?:[A-Za-z0-9]+_)?Bulb(?:\.?\d+)?$/.test(n))pend.push(o);
     else if(/^(FloorLamp_Shade|SideLamp_Shade|BedsideLamp_Shade(?:\.?\d+)?|Bedside_Lamp_Shade|DeskLamp_Head)$/.test(n))other.push(o);
     // phòng Vy / Bin: đèn liền khối (dây + chao + bóng) → lấy đáy chao làm bóng đèn
     else if(/^Pendant_(?:L\d+|\d+|Bar_?\d+)$/.test(n))studioP.push(o);
     else if(/^(Floor_Lamp|Bedside_Lamp(?:_\d)?|Bedside_\d)$/.test(n))studioO.push(o)});
   const add=(o,r)=>{const b=new THREE.Box3().setFromObject(o);if(b.isEmpty())return;const c=b.getCenter(new THREE.Vector3());LAMPS.push(new THREE.Vector4(c.x,c.y-0.05,c.z,r))};
   pend.forEach(o=>add(o,2.4));other.forEach(o=>add(o,/Floor|Side/.test(o.name)?2.0:1.3));
   const addAt=(o,r,f)=>{const b=new THREE.Box3().setFromObject(o);if(b.isEmpty())return;const c=b.getCenter(new THREE.Vector3());LAMPS.push(new THREE.Vector4(c.x,f(b),c.z,r))};
   studioP.forEach(o=>addAt(o,/Bar/.test(o.name)?1.6:2.4,b=>b.min.y+0.12));
   studioO.forEach(o=>addAt(o,/Floor/.test(o.name)?2.0:1.3,b=>b.max.y-0.15));
   LAMPS.length=Math.min(LAMPS.length,10);
   LAMPS.forEach((v,i)=>TU.uLP.value[i].copy(v));TU.uLN.value=LAMPS.length;window.__LAMPS=LAMPS}
  const seat=OUTD?null:box(MC.seat);A.seatC=seat?seat.getCenter(new THREE.Vector3()):null;A.seatTop=seat?seat.max.y:0;
  A.chairL=A.seatC&&A.seatC.y>(A.L0+A.L1)/2?1:0;A.CY=[A.L0,A.L1][A.chairL];
  const CHAIR=OUTD?Object.assign(new THREE.Object3D(),{name:'__NO_CHAIR__'}):(Object.values(byName).find(o=>MC.chair.test(o.name)&&!o.isMesh)||byName['Desk_Chair']);
  const q=new THREE.Quaternion();if(!OUTD)CHAIR.getWorldQuaternion(q);
  const fw=new THREE.Vector3(0,0,1).applyQuaternion(q);fw.y=0;fw.normalize();if(MC.chairFlip)fw.negate();if(MC.chairToward&&byName[MC.chairToward]){const dc=box(MC.chairToward).getCenter(new THREE.Vector3()),cc=new THREE.Box3().setFromObject(CHAIR).getCenter(new THREE.Vector3());fw.set(dc.x-cc.x,0,dc.z-cc.z).normalize()}   // ghế nhà 2 tầng dựng quay lưng về phía +z: mặt ghế hướng -z (về phía bàn)
  A.chairYaw=Math.atan2(fw.x,fw.z);A.fwd=fw;
  A.bedBox=OUTD||!byName['Bed']?new THREE.Box3():box('Bed');A.mattress=OUTD?new THREE.Box3():byName['Bed_Mattress']?box('Bed_Mattress'):(()=>{const b=A.bedBox.clone();b.max.y=b.min.y+0.55;return b})();   // giường gộp 1 mesh: đệm ≈ 0.55m trên sàn

  // colliders + A*
  const G=OUTD?{...MC.grid,R:0.13}:{x0:-1,z0:-9,c:0.1,W:125,H:100,R:0.13};
  const blocked=[new Uint8Array(G.W*G.H),new Uint8Array(G.W*G.H)],cols=[[],[]];
  // NHẢY QUA VẬT CẢN THẤP: jh = độ cao đỉnh vật cản (cm trên mặt sàn) ở từng ô chặn; 255 = quá cao (tường, tủ, cây); hard = ô chặn cứng (ranh giới, thân cầu thang) không bao giờ nhảy qua được
  const jh=[new Uint8Array(G.W*G.H),new Uint8Array(G.W*G.H)],hard=[new Uint8Array(G.W*G.H),new Uint8Array(G.W*G.H)];
  const jumpOK=(lv,i,j,clr)=>{if(i<0||j<0||i>=G.W||j>=G.H)return false;const k=j*G.W+i;return !hard[lv][k]&&jh[lv][k]>0&&clr>jh[lv][k]/100+0.05};
  if(OUTD){for(const b of EXT.colliders.boxes){const gy=EXT.walkHeight((b.min.x+b.max.x)/2,(b.min.z+b.max.z)/2);b._h=b.max.y-(gy!=null?gy:A.L0);cols[0].push(b)}}
  // MC.triCol (phòng Vy/Bin): đồ đạc trong file bị GỘP thành khối lớn (vd. cột + dầm mép gác chung 1 mesh) → hộp bao chặn oan cả dải phòng.
  // Thay bằng quét đúng tam giác thật nằm trong dải cao chân→hông (0.12–0.9 m trên mặt sàn) rồi nở ra bằng bán kính nhân vật.
  const triRaw=MC.triCol?[new Uint8Array(G.W*G.H),new Uint8Array(G.W*G.H)]:null,triH=MC.triCol?[new Uint8Array(G.W*G.H),new Uint8Array(G.W*G.H)]:null;
  function rasterMesh(m){const g=m.geometry,pa=g&&g.attributes.position;if(!pa)return;const idx=g.index,n=idx?idx.count:pa.count,M=m.matrixWorld;
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),p=new THREE.Vector3();
    for(let t=0;t<n;t+=3){const ia=idx?idx.getX(t):t,ib=idx?idx.getX(t+1):t+1,ic=idx?idx.getX(t+2):t+2;
      a.fromBufferAttribute(pa,ia).applyMatrix4(M);b.fromBufferAttribute(pa,ib).applyMatrix4(M);c.fromBufferAttribute(pa,ic).applyMatrix4(M);
      const y0=Math.min(a.y,b.y,c.y),y1=Math.max(a.y,b.y,c.y);
      [A.L0,A.L1].forEach((fy,lv)=>{const lo=fy+0.06,hi=fy+1.0;if(y1<lo||y0>hi)return;
        const e=Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a)),k=Math.max(1,Math.ceil(e/0.05));
        for(let i=0;i<=k;i++)for(let j=0;j<=k-i;j++){const u=i/k,v=j/k,w=1-u-v;p.set(a.x*w+b.x*u+c.x*v,a.y*w+b.y*u+c.y*v,a.z*w+b.z*u+c.z*v);
          if(p.y<lo||p.y>hi)continue;const ci=Math.floor((p.x-G.x0)/G.c),cj=Math.floor((p.z-G.z0)/G.c);if(ci>=0&&cj>=0&&ci<G.W&&cj<G.H){triRaw[lv][cj*G.W+ci]=1;const th=y1>=hi?255:Math.max(1,Math.round((y1-fy)*100));if(th>triH[lv][cj*G.W+ci])triH[lv][cj*G.W+ci]=th}}})}}
  if(triRaw)env.updateMatrixWorld(true);
  for(const m of (OUTD?[]:envMeshes)){
    if(/^Stair/.test(m.name)||isUnder(m,CHAIR.name))continue;
    if(triRaw){if(!m.isInstancedMesh&&!/^Stair/.test((m.parent&&m.parent.name)||''))rasterMesh(m);continue}
    if(m.isInstancedMesh)continue;      // cây/cỏ instancing: Box3 chỉ tính bản mẫu ở gốc toạ độ (0,0,0) → vật cản "ma" chặn nhầm miệng cầu thang trái (các bản thật nằm ngoài nhà)
    const b=new THREE.Box3().setFromObject(m);if(b.isEmpty())continue;
    if((b.max.x-b.min.x)*(b.max.z-b.min.z)>14)continue;
    [A.L0,A.L1].forEach((fy,lv)=>{if(b.max.y>fy+0.12&&b.min.y<fy+0.9){const bb=b.clone();bb._h=b.max.y-fy;cols[lv].push(bb)}});
  }
  const cl=(v,a,b)=>Math.min(b,Math.max(a,v));
  cols.forEach((arr,lv)=>{for(const b of arr){
    const i0=cl(Math.floor((b.min.x-G.R-G.x0)/G.c),0,G.W-1),i1=cl(Math.floor((b.max.x+G.R-G.x0)/G.c),0,G.W-1);
    const j0=cl(Math.floor((b.min.z-G.R-G.z0)/G.c),0,G.H-1),j1=cl(Math.floor((b.max.z+G.R-G.z0)/G.c),0,G.H-1);
    const hh=b._h==null?255:Math.min(255,Math.max(1,Math.round(b._h*100)));
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const k=j*G.W+i;blocked[lv][k]=1;if(hh>jh[lv][k])jh[lv][k]=hh}}});
  if(triRaw){const r=Math.ceil(G.R/G.c);for(let lv=0;lv<2;lv++){const R0=triRaw[lv];for(let j=0;j<G.H;j++)for(let i=0;i<G.W;i++){if(!R0[j*G.W+i])continue;
      for(let dj=-r;dj<=r;dj++)for(let di=-r;di<=r;di++){if(di*di+dj*dj>r*r+1)continue;const x=i+di,z=j+dj;if(x>=0&&z>=0&&x<G.W&&z<G.H){const k=z*G.W+x;blocked[lv][k]=1;const th=triH[lv][j*G.W+i];if(th>jh[lv][k])jh[lv][k]=th}}}}}
  if(OUTD){for(const cc of EXT.colliders.circles){const rr=cc.r+G.R,i0=cl(Math.floor((cc.x-rr-G.x0)/G.c),0,G.W-1),i1=cl(Math.floor((cc.x+rr-G.x0)/G.c),0,G.W-1),j0=cl(Math.floor((cc.z-rr-G.z0)/G.c),0,G.H-1),j1=cl(Math.floor((cc.z+rr-G.z0)/G.c),0,G.H-1);
      for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const x=G.x0+(i+.5)*G.c,z=G.z0+(j+.5)*G.c;if((x-cc.x)**2+(z-cc.z)**2<=rr*rr){blocked[0][j*G.W+i]=1;const hh=Math.min(255,Math.round((cc.h==null?99:cc.h)*100));if(hh>jh[0][j*G.W+i])jh[0][j*G.W+i]=hh}}
      cols[0].push(new THREE.Box3(new THREE.Vector3(cc.x-cc.r,A.L0,cc.z-cc.r),new THREE.Vector3(cc.x+cc.r,A.L0+1,cc.z+cc.r)))}
    {const w=MC.walk0;for(let j=0;j<G.H;j++)for(let i=0;i<G.W;i++){const x=G.x0+(i+.5)*G.c,z=G.z0+(j+.5)*G.c;if(x<w[0]||x>w[1]||z<w[2]||z>w[3]){blocked[0][j*G.W+i]=1;blocked[1][j*G.W+i]=1;hard[0][j*G.W+i]=1;hard[1][j*G.W+i]=1}}}}
  if(!OUTD){const fl=MC.mezz.map(n=>box(n));
    for(let j=0;j<G.H;j++)for(let i=0;i<G.W;i++){const x=G.x0+(i+.5)*G.c,z=G.z0+(j+.5)*G.c;let ok=false;for(const b of fl)if(x>b.min.x+0.12&&x<b.max.x-0.12&&z>b.min.z+0.12&&z<b.max.z-0.12){ok=true;break}if(!ok){blocked[1][j*G.W+i]=1;hard[1][j*G.W+i]=1}}}
  for(let lv=0;lv<2;lv++)for(let j=0;j<G.H;j++)for(let i=0;i<G.W;i++){const x=G.x0+(i+.5)*G.c,z=G.z0+(j+.5)*G.c;
    for(const S of stairs)if(x>S.x0-0.02&&x<S.x1+0.02&&z>S.z0-0.4&&z<S.z1+0.2)blocked[lv][j*G.W+i]=0;}
  // lối vào chân cầu thang từ phía giữa nhà (dải trước chân thang): vật trang trí (bụi cây ở gốc toạ độ) từng chặn kín lối này nên A*/WASD không vào được cầu thang trái
  for(const S of stairs){const dir=S.cx<(MC.walk0[0]+MC.walk0[1])/2?1:-1,e=dir>0?S.x1:S.x0;
    for(let j=0;j<G.H;j++)for(let i=0;i<G.W;i++){const x=G.x0+(i+.5)*G.c,z=G.z0+(j+.5)*G.c;if((x-e)*dir>-0.02&&(x-e)*dir<0.7&&z>S.z1-0.02&&z<S.z1+0.3&&z<MC.walk0[3])blocked[0][j*G.W+i]=0}}
  // thân cầu thang (giữa chân và đỉnh) là VẬT CẢN với đường đi A* / click-để-đi: chỉ miệng cầu thang (chân & đỉnh) được mở. Trước đây thân cầu thang để trống nên đường đi cắt ngang qua cầu thang ở tầng 0.
  for(let lv=0;lv<2;lv++)for(let j=0;j<G.H;j++)for(let i=0;i<G.W;i++){const x=G.x0+(i+.5)*G.c,z=G.z0+(j+.5)*G.c;
    for(const S of stairs){if(x>S.x0-0.02&&x<S.x1+0.02&&z>S.z0&&z<S.z1+0.02){blocked[lv][j*G.W+i]=1;hard[lv][j*G.W+i]=1}
      else if(x>S.x0-0.16&&x<S.x1+0.16&&z>S.z0&&z<S.z1-0.03){blocked[lv][j*G.W+i]=1;hard[lv][j*G.W+i]=1}}}      // vành đệm bán kính nhân vật dọc hông cầu thang: đường đi không sượt/cắt góc hông
  console.log('colliders',cols[0].length,cols[1].length);
  window.__G={G,blocked,A,cols,envMeshes,isUnder,CHAIR,stairs,jh,hard,findPath};
  const colGroup=new THREE.Group();colGroup.visible=false;scene.add(colGroup);
  cols.forEach((arr,lv)=>arr.forEach(b=>colGroup.add(new THREE.Box3Helper(b,lv?0x44ff88:0xff5555))));
  $('cCol').onchange=e=>colGroup.visible=e.target.checked;
  const cell=(x,z)=>[Math.floor((x-G.x0)/G.c),Math.floor((z-G.z0)/G.c)];
  const free=(lv,i,j)=>i>=0&&j>=0&&i<G.W&&j<G.H&&!blocked[lv][j*G.W+i];
  // Cầu thang sát tường trước (phòng Vy / phòng Bin): trước chân thang không có chỗ đứng thẳng trục → đi DỌC MÉP TRƯỚC tới đúng
  // trục cầu thang rồi mới quay lên (đường xanh). Không bao giờ bước chéo/ngang vào thân thang (đường đỏ = dễ glitch).
  stairs.forEach(S=>{const zF=Math.min(S.botZ,MC.walk0[3]-0.04);let room=0;for(let d=0.1;d<=0.5;d+=0.1){const c=cell(S.cx,zF+d);if(free(0,c[0],c[1])&&zF+d<MC.walk0[3]-0.04)room=d;else break}
    if(room>=0.3)return;const dir=S.cx<(MC.walk0[0]+MC.walk0[1])/2?1:-1;let lx=null;
    for(let d=0.7;d<=1.6;d+=0.1){const x=S.cx+dir*d,c=cell(x,zF);if(free(0,c[0],c[1])){lx=x;break}}
    if(lx==null)return;S.front={zF,lx};
    for(let j=0;j<G.H;j++)for(let i=0;i<G.W;i++){const x=G.x0+(i+.5)*G.c,z=G.z0+(j+.5)*G.c;if(Math.abs(z-zF)<0.1&&(x-S.cx)*dir>=-0.05&&(x-lx)*dir<=0.05)blocked[0][j*G.W+i]=0}
    console.log('[stair] chân thang sát tường → đi dọc mép trước',JSON.stringify(S.front))});
  function los(lv,x0,z0,x1,z1,skipA,skipB){const d=Math.hypot(x1-x0,z1-z0),n=Math.max(1,Math.ceil(d/0.05));
    // skipA/skipB: chỉ bỏ qua đoạn ô KẸT liền ngay điểm đầu/cuối (đang đứng/đích nằm sát vật cản, tối đa 0.25 m) — không cho cắt xuyên đồ đạc giữa đường
    let a=0,b=n;if(skipA)while(a<n&&a/n*d<0.25){const [i,j]=cell(x0+(x1-x0)*a/n,z0+(z1-z0)*a/n);if(free(lv,i,j))break;a++}
    if(skipB)while(b>a&&(n-b)/n*d<0.25){const [i,j]=cell(x0+(x1-x0)*b/n,z0+(z1-z0)*b/n);if(free(lv,i,j))break;b--}
    for(let k=a;k<=b;k++){const t=k/n;const [i,j]=cell(x0+(x1-x0)*t,z0+(z1-z0)*t);if(!free(lv,i,j))return false}return true}
  function findPath(x0,z0,x1,z1,lv,exact){
    let [gi,gj]=cell(x1,z1),gx=x1,gz=z1;
    if(!free(lv,gi,gj)&&!exact){let best=null,bd=1e9;
      for(let r=1;r<50&&!best;r++)for(let dj=-r;dj<=r;dj++)for(let di=-r;di<=r;di++){if(Math.max(Math.abs(di),Math.abs(dj))!==r)continue;
        if(free(lv,gi+di,gj+dj)){const d=di*di+dj*dj;if(d<bd){bd=d;best=[gi+di,gj+dj]}}}
      if(best){[gi,gj]=best;gx=G.x0+(gi+.5)*G.c;gz=G.z0+(gj+.5)*G.c}}
    if(los(lv,x0,z0,gx,gz,true,exact))return [{x:gx,z:gz}];
    let [si,sj]=cell(x0,z0);const N=G.W*G.H,g=new Float32Array(N).fill(1e9),par=new Int32Array(N).fill(-1),done=new Uint8Array(N);
    // đang đứng lấn vào lề vùng chặn (vd. vừa đi đường tắt sát đồ đạc, hay bị ngắt giữa lộ trình): A* từ ô bị chặn không lan ra được → trước đây trả [] → bước sau (ngồi/xem TV) đặt thẳng vị trí = giật vài mét. Bắt đầu từ ô trống gần nhất.
    if(!free(lv,si,sj)){let best=null,bd=1e9;for(let r=1;r<12&&!best;r++)for(let dj=-r;dj<=r;dj++)for(let di=-r;di<=r;di++){if(Math.max(Math.abs(di),Math.abs(dj))!==r)continue;if(free(lv,si+di,sj+dj)){const d=di*di+dj*dj;if(d<bd){bd=d;best=[si+di,sj+dj]}}}if(best)[si,sj]=best}
    const h=(i,j)=>{const dx=Math.abs(i-gi),dz=Math.abs(j-gj);return (dx+dz)+(1.414-2)*Math.min(dx,dz)};
    const heap=[];const push=(f,k)=>{heap.push([f,k]);let c=heap.length-1;while(c>0){const p=(c-1)>>1;if(heap[p][0]<=heap[c][0])break;[heap[p],heap[c]]=[heap[c],heap[p]];c=p}};
    const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let c=0;for(;;){let l=2*c+1,r=l+1,m=c;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===c)break;[heap[m],heap[c]]=[heap[c],heap[m]];c=m}}return top};
    const s0=sj*G.W+si;g[s0]=0;push(h(si,sj),s0);let found=false,gk=gj*G.W+gi,bk=s0,bh=1e9;
    while(heap.length){const [,k]=pop();if(done[k])continue;done[k]=1;if(k===gk){found=true;break}
      {const hh=h(k%G.W,(k/G.W)|0);if(hh<bh){bh=hh;bk=k}}
      const i=k%G.W,j=(k/G.W)|0;
      for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){if(!di&&!dj)continue;const ni=i+di,nj=j+dj;
        if(!free(lv,ni,nj))continue;if(di&&dj&&(!free(lv,i+di,j)||!free(lv,i,j+dj)))continue;
        const nk=nj*G.W+ni,ng=g[k]+(di&&dj?1.414:1);if(ng<g[nk]){g[nk]=ng;par[nk]=k;push(ng+h(ni,nj),nk)}}}
    // không tới được đích (vùng bị chặn kín): đi tới ô gần đích nhất với tới được — KHÔNG đi thẳng xuyên tường/đồ đạc như trước
    if(!found){if(bk===s0)return [];gk=bk;gx=G.x0+((bk%G.W)+.5)*G.c;gz=G.z0+(((bk/G.W)|0)+.5)*G.c}
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
  const occ={bedL:null,bedR:null,chair:null,sofa0:null,sofa1:null};
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
    {const w=new THREE.Vector3();d.node.getWorldPosition(w);const L=api.local;const dist=L?Math.hypot(L.P.pos.x-w.x,L.P.pos.z-w.z):0;if(d.st==='closed')SFX.playAt('doorOpen',dist,{range:16});else if(d.st==='open')SFX.playAt('doorClose',dist,{range:16});}
    if(d.st==='closed'||d.st==='closing'&&false){d.a.reset();d.a.paused=false;d.a.play();d.st='opening'}
    else if(d.st==='open'){d.a.paused=false;d.st='closing'}
    else if(d.st==='opening'){/* đang mở: bỏ qua */}
    else if(d.st==='closing'){/* đang đóng */}}
  function updDoors(){for(const d of doorList){
    if(d.st==='opening'&&d.a.time>=d.peak){d.a.time=d.peak;d.a.paused=true;d.st='open'}
    else if(d.st==='closing'&&(d.a.time>=d.end-0.02||!d.a.isRunning())){d.a.stop();d.st='closed'}
    // lệnh từ máy kia đến lúc cửa đang chạy dở → đợi cửa đứng yên rồi mới chuyển tiếp cho đúng trạng thái đích
    if(d.want!==undefined&&(d.st==='open'||d.st==='closed')){if(doorOpenish(d)!==d.want)toggleDoor(d);else d.want=undefined}}}
  // ĐỒNG BỘ CỬA (trước đây chỉ gửi "đảo trạng thái": rớt/đến lệch 1 gói là 2 máy thấy cửa ngược nhau mãi). Giờ gửi TRẠNG THÁI ĐÍCH + số phiên bản của từng cửa;
  // snapshot cũng mang bảng trạng thái cửa, nên mất gói thì lần snapshot sau tự khớp lại. Phiên bản cao hơn thắng; bằng nhau mà khác trạng thái → BIN thắng (cố định, không dao động).
  const doorOpenish=d=>d.st==='open'||d.st==='opening';
  const doorsSorted=[...doorList].sort((a,b)=>a.node.name<b.node.name?-1:a.node.name>b.node.name?1:0);
  doorList.forEach(d=>{d.v=0;const m=/^(.*)_Leaf_[LR]$/.exec(d.node.name);d.grp=m?m[1]:null});
  function doorApply(d,want,v,senderIsBin){
    if(v<d.v)return;
    if(v===d.v&&(doorOpenish(d)===want||!senderIsBin))return;     // cùng phiên bản: khớp rồi thì thôi; khác nhau thì chỉ nhận của BIN
    d.v=v;
    if(doorOpenish(d)===want){d.want=undefined;return}
    d.want=want;if(d.st==='open'||d.st==='closed')toggleDoor(d)}
  function playChair(tag,side){const a=chairActs['ACT_CHAIR_'+tag+'_'+side];if(!a){console.warn('missing chair clip',tag,side);return}
    Object.values(chairActs).forEach(x=>{if(x!==a)x.stop()});a.reset();a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.timeScale=1;a.play();}


  // ===== SOFA (xem TV): 2 đệm ngồi Sofa_Seat / Sofa_Seat001, hướng nhìn = từ sofa về phía màn TV =====
  // mặt màn TV: TV_Screen (phòng khách) hoặc MC.tv {node, mat}: mesh con có vật liệu mat (TV liền khối với kệ)
  const tvScreenMeshes=(()=>{if(OUTD)return [];const o=byName['TV_Screen']||byName['TV_Panel']||(MC.tv&&byName[MC.tv.node]);if(!o)return [];const ms=[];
    o.traverse(m=>{if(m.isMesh&&(!MC.tv||!MC.tv.mat||[].concat(m.material).some(x=>x&&x.name===MC.tv.mat)))ms.push(m)});return ms})();
  const SOFA=(()=>{if(OUTD||!tvScreenMeshes.length)return null;env.updateMatrixWorld(true);
    const tb=new THREE.Box3();tvScreenMeshes.forEach(m=>tb.union(new THREE.Box3().setFromObject(m)));const tc=tb.getCenter(new THREE.Vector3());
    let S=['Sofa_Seat','Sofa_Seat001'].map(n=>byName[n]).filter(Boolean).map(o=>{const b=new THREE.Box3().setFromObject(o);return{c:b.getCenter(new THREE.Vector3()),top:b.max.y}});
    if(!S.length&&MC.sofa&&byName[MC.sofa.node]){      // sofa liền khối: chia đôi theo chiều dài; tâm đệm lệch về mép trước (phía TV) ~40% bề sâu
      const b=new THREE.Box3().setFromObject(byName[MC.sofa.node]),sz=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3()),longX=sz.x>sz.z;
      const front=longX?Math.sign(tc.z-c.z):Math.sign(tc.x-c.x),depth=longX?sz.z:sz.x,len=(longX?sz.x:sz.z)-0.4;
      S=[-1,1].map(k=>{const p=c.clone();if(longX){p.x+=k*len/4;p.z+=front*depth*0.1}else{p.z+=k*len/4;p.x+=front*depth*0.1}p.y=b.min.y+(MC.sofa.seatY||0.45);return{c:p,top:p.y}})}
    if(!S.length)return null;
    const sc=S.reduce((a,x)=>a.add(x.c),new THREE.Vector3()).multiplyScalar(1/S.length);
    const yaw=Math.atan2(tc.x-sc.x,tc.z-sc.z),fwd=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
    // chừa ô đứng trước mỗi đệm (lưới va chạm bơm phồng quanh sofa chặn mất chỗ đứng để ngồi xuống)
    S.forEach(x=>{const st=x.c.clone().addScaledVector(fwd,0.55);const R=0.24;
      for(let j=0;j<G.H;j++)for(let i=0;i<G.W;i++){const X=G.x0+(i+.5)*G.c,Z=G.z0+(j+.5)*G.c;if(Math.hypot(X-st.x,Z-st.z)<R)blocked[0][j*G.W+i]=0}});
    return{yaw,fwd,tv:tc,tvBox:tb,center:sc,seats:S}})();
  const DEF_VY={id:'vy',K,eye:{close:'ACT_EYE_CLOSE',open:'ACT_EYE_OPEN',blink:'ACT_BLINK'},eyeMeshes:['Sphere','Sphere001'],trim:null,foot:{walk:[0.255,0.76],run:[0.29,0.70]},pos:new THREE.Vector3(2.5,0,-1.5),yaw:0.4,ctrl:'wasd'};
  const KB={WATCH:'ACT_BIN_WATCHING',WATCH_IDLE:'ACT_BIN_WATCHING_IDLE',OFFWATCH:'ACT_BIN_OFFWATCH',REST:'ACT_BIN_RESTPOSE',IDLE:'ACT_BIN_IDLE',WALK:'ACT_BIN_WALK',RUN:'ACT_BIN_RUN',
    CLIMBCHAIR_L:'ACT_BIN_CLIMB ON CHAIR_L',CLIMBCHAIR_R:'ACT_BIN_CLIMB ON CHAIR_R',OFFCHAIR_L:'ACT_BIN_OFF CHAIR_L',OFFCHAIR_R:'ACT_BIN_OFF CHAIR_R',
    CLIMBBED_L:'ACT_BIN_SLEEP_CLIMB ON BED_L',CLIMBBED_R:'ACT_BIN_SLEEP_CLIMB ON BED_R',SLEEP_L:'ACT_BIN_SLEEP-LOOP BREATHE_L',SLEEP_R:'ACT_BIN_SLEEP-LOOP BREATHE_R',
    OFFBED_L:'ACT_BIN_SLEEP_OFF BED_L',OFFBED_R:'ACT_BIN_SLEEP_OFF BED_R',
    JUMP:'ACT_BIN_JUMP',DJUMP:'ACT_BIN_DOUBLEJUMP',DIVE:'ACT_BIN_DIVE'};
  const DEF_BIN={id:'bin',K:KB,eye:{close:'ACT_BIN_EYE_CLOSE',open:'ACT_BIN_EYE_OPEN',blink:'ACT_BIN_BLINK'},eyeMeshes:['Sphere002','Sphere003'],trim:null,idleBurst:true,foot:{walk:[0.29,0.77],run:[0.20,0.68]},colors:{BLACK:'#16161b',SKIN:'#f2c9b3',BLUE:'#2b37b5',ORANGE:'#f26b1d'},pos:new THREE.Vector3(4.5,0,-1.5),yaw:0.4,ctrl:'wasd'};
  {let from='';try{from=sessionStorage.getItem('vyFrom')||''}catch(e){}const sp=MC.spawnFrom&&(MC.spawnFrom[from]||MC.spawnFrom.default);
   if(sp){[DEF_VY,DEF_BIN].forEach((D,k)=>{D.pos.set(sp[0]+(k?0.45:0)*Math.cos(sp[2]),sp[3]?A.L1:A.L0,sp[1]-(k?0.45:0)*Math.sin(sp[2]));D.yaw=sp[2];D.level=sp[3]||0})}}
  if(OUTD&&MC.spawn&&!(MC.spawnFrom)){DEF_VY.pos.set(MC.spawn.vy[0],A.L0,MC.spawn.vy[1]);DEF_VY.yaw=MC.spawn.vy[2];DEF_BIN.pos.set(MC.spawn.bin[0],A.L0,MC.spawn.bin[1]);DEF_BIN.yaw=MC.spawn.bin[2]}
  function makeChar(chrG,DEF){
  const K=DEF.K;
  let emitOff=0;const em=(t,a)=>{if(!DEF.remote&&!emitOff&&api.emit)api.emit(t,a)};
  let net=null,netMis=0,lvMis=0;
  // ===== NỘI SUY SNAPSHOT cho bản sao (remote) =====
  // Trước đây bản sao vừa TỰ MÔ PHỎNG bằng phím của đối phương (gói 'i' thưa, đến trễ) vừa bị correct() kéo về snapshot ngoại suy → 2 hệ thống cùng ghi
  // vị trí: đi trễ, dừng quá đà rồi bị kéo ngược (rubberband), khác tầng thì rơi xuống sàn dưới, nhảy qua đá thì bị pushOut đẩy ngược…
  // Giờ khi bản sao ở trạng thái tự do (không leo/ngồi/nằm, không chạy lộ trình click), vị trí–độ cao–tầng–hướng–tốc độ CHỈ lấy từ snapshot của chủ nhân vật,
  // phát lại trễ ~0.1–0.4s (tự chỉnh theo độ rung mạng) và nội suy giữa 2 gói → liên tục, dừng đúng chỗ, không xuyên sàn. Animation chọn theo tốc độ nội suy.
  const NB=[];let nOff=null,nJit=0.02,nSeq=-1;
  // hệ số tốc độ tạm thời (Turbo của minigame Khoai nóng…): mL = bản của mình, mR = bản sao đối phương (nhận qua mạng) — dùng để phân biệt đi/chạy đúng khi đang tăng tốc
  window.__spd=window.__spd||{mL:1,mR:1};const SPM=()=>DEF.remote?window.__spd.mR:window.__spd.mL,ANM=()=>Math.pow(SPM(),0.85);
  const RUN_SPf=()=>(CFG.walk+CFG.run)/2*0.85;
  const netI=()=>DEF.remote&&NB.length>0&&P.mode==='free'&&!busy&&!plan[0];
  const netWP=()=>DEF.remote&&NB.length>0&&!busy&&plan[0]&&plan[0].t==='wp';
  let nStill=0;
  const nTgt={x:0,y:0,z:0,w:0,l:0,sp:0};
  function netSample(){
    const now=performance.now(),delay=Math.min(400,Math.max(110,110+2.5*nJit*1000));
    const tR=now-nOff-delay,last=NB[NB.length-1];
    if(tR>=last.ts||NB.length===1){
      nTgt.x=last.x;nTgt.y=last.y;nTgt.z=last.z;nTgt.w=last.w;nTgt.l=last.l;nTgt.sp=0;
      if(last.mv&&last.sp>0.05){const e=Math.min(0.25,(tR-last.ts)/1000);      // gói kế chưa tới (mất gói / rung): ngoại suy ngắn ≤0.25s, cắt ở vật cản
        const c=clipSeg(last.l,last.x,last.z,last.x+last.vx*e,last.z+last.vz*e);nTgt.x=c[0];nTgt.z=c[1];nTgt.sp=e<0.25?last.sp:0}
      return}
    let i=NB.length-2;while(i>0&&NB[i].ts>tR)i--;
    const a=NB[i],b=NB[i+1],u=Math.max(0,Math.min(1,(tR-a.ts)/Math.max(1,b.ts-a.ts)));
    nTgt.x=a.x+(b.x-a.x)*u;nTgt.y=a.y+(b.y-a.y)*u;nTgt.z=a.z+(b.z-a.z)*u;nTgt.w=a.w+angDiff(b.w,a.w)*u;nTgt.l=u<0.5?a.l:b.l;
    // tốc độ: theo quãng đường thật giữa 2 gói (gói đứng yên 2.5s/lần thì ~0), không tin vx/vz khi khoảng cách 2 gói dài
    const dtab=(b.ts-a.ts)/1000;nTgt.sp=dtab<0.6?Math.hypot(b.x-a.x,b.z-a.z)/Math.max(0.03,dtab):(b.mv?b.sp:0);
    if(!a.mv&&!b.mv)nTgt.sp=0;}
  function netFree(dt,anim){
    netSample();
    const dx=nTgt.x-P.pos.x,dz=nTgt.z-P.pos.z,dy=nTgt.y-P.pos.y,d=Math.hypot(dx,dz);
    if(d>2.5||Math.abs(dy)>1.5||nTgt.l!==P.level&&d>0.6){P.pos.set(nTgt.x,nTgt.y,nTgt.z)}     // lệch lớn (vừa chuyển từ leo/ngồi, mới vào): đặt thẳng
    else{const k=1-Math.exp(-dt*(d>0.5?14:30));P.pos.x+=dx*k;P.pos.z+=dz*k;P.pos.y+=dy*(1-Math.exp(-dt*30))}
    P.level=nTgt.l;P.sp=nTgt.sp;nStill=P.sp<0.05?nStill+dt:0;
    P.yaw+=angDiff(nTgt.w,P.yaw)*(1-Math.exp(-dt*18));
    if(!anim)return;
    if(P.sp>0.05){play(P.sp/SPM()>RUN_SPf()?'RUN':'WALK',{fade:0.15});idleHeld=false;stopT=0}
    else{stopT+=dt;if(stopT>0.14||(cur!==acts[K.WALK]&&cur!==acts[K.RUN]))idleTick(dt)}
  }
  const char=chrG.scene;
  if(DEF.colors)char.traverse(o=>{if(!(o.isMesh))return;(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
    const c=DEF.colors[m.name];if(c&&m.color){m.color.set(c);if('metalness' in m){m.metalness=0;m.roughness=1;}}})});
  toonify(char);scene.add(char);
  const beltWind={a:0,t:0,x:1,z:0};let belt=null;try{belt=makeBelt(char)}catch(e){console.warn('[belt]',e)}   // đai lưng Bin: vật lý lò xo nhẹ (src/belt.js)
  char.traverse(o=>{if((o.isMesh||o.isSkinnedMesh)&&(()=>{for(let p=o;p&&p!==char;p=p.parent)if(/^cs_/.test(p.name))return true;return false})()){o.visible=false;o.layers.disable(0);}
    else if(o.isMesh||o.isSkinnedMesh){o.frustumCulled=false;o.castShadow=true;o.receiveShadow=false;}});
  ['Workstation','Workstation001','LIVING_STUDIO','SleepingArea'].forEach(n=>{const o=char.getObjectByName(n);if(o)o.removeFromParent()});
  // hộp bắp: 3 object đã bake theo tay — POPCORN_IN (clip lấy bắp), POPCORN_IDLE (cầm lúc ngồi xem), POPCORN_OUT (clip cất bắp)
  const popFind=re=>{let r=null;char.traverse(o=>{if(!r&&re.test(o.name))r=o});return r};
  const POPM={IN:popFind(/^POPCORN[ _]?IN$/i),IDLE:popFind(/^POPCORN[ _]?IDLE$/i),OUT:popFind(/^POPCORN[ _]?OUT$/i)};
  Object.values(POPM).forEach(o=>{if(o){o.visible=false;o.traverse(m=>{if(m.isMesh){m.castShadow=true;m.frustumCulled=false}})}});
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

  // Khử "khung rác" trong dữ liệu clip: vài khoá xoay (1–2 khung ở 30fps) văng ra rồi quay lại đúng như cũ (vd. cẳng tay giật 60° trong 2 khung ở clip off giường / idle / ngồi dậy) → thay bằng nội suy giữa khung trước & sau
  const deglitch=c=>{if(c._dg)return;c._dg=1;let fixed=0;const qa=(v,i,j)=>2*Math.acos(Math.min(1,Math.abs(v[4*i]*v[4*j]+v[4*i+1]*v[4*j+1]+v[4*i+2]*v[4*j+2]+v[4*i+3]*v[4*j+3])));
    const q0=new THREE.Quaternion(),q1=new THREE.Quaternion(),qo=new THREE.Quaternion();
    for(const t of c.tracks){if(!t.name.endsWith('.quaternion'))continue;const v=t.values,n=t.times.length;
      for(let i=1;i<n-1;i++)for(const w of [1,2]){if(i+w>=n)continue;
        if(Math.min(qa(v,i-1,i),qa(v,i+w-1,i+w))-qa(v,i-1,i+w)>0.3){q0.fromArray(v,4*(i-1));q1.fromArray(v,4*(i+w));
          for(let k=0;k<w;k++){qo.copy(q0).slerp(q1,(k+1)/(w+1)).toArray(v,4*(i+k))}fixed++;break}}}
    return fixed};
  chrG.animations.forEach(c=>{if(!/EYE|BLINK/.test(c.name)){const f=deglitch(c);if(f)console.log('deglitch',c.name,f)}});
  // clip lặp mà khung cuối ≠ khung đầu (vd. Vy ngồi: tay xoay ~60° mỗi lần vòng lặp 9 giây) → kéo dần 0.4s cuối về đúng khung đầu để vòng lặp liền mạch
  const seamLoop=c=>{if(c._sl||!/SITTING|TYPING|STANDING|WALK|RUN|LOOP/.test(c.name)||/EYE|BLINK/.test(c.name))return;c._sl=1;const TAIL=0.4,D=c.duration,sm=x=>x*x*(3-2*x);let n=0;
    const q0=new THREE.Quaternion(),q1=new THREE.Quaternion();
    for(const t of c.tracks){const v=t.values,m=t.times.length;if(m<4)continue;
      if(t.name.endsWith('.quaternion')){q0.fromArray(v,0);
        for(let i=m-1;i>0&&t.times[i]>D-TAIL;i--){const f=sm(Math.min(1,(t.times[i]-(D-TAIL))/TAIL));q1.fromArray(v,4*i);q1.slerp(q0,f).toArray(v,4*i);n++}}
      else if(t.name.endsWith('.position')){for(let i=m-1;i>0&&t.times[i]>D-TAIL;i--){const f=sm(Math.min(1,(t.times[i]-(D-TAIL))/TAIL));for(let k=0;k<3;k++)v[3*i+k]+=(v[k]-v[3*i+k])*f;n++}}}
    return n};
  chrG.animations.forEach(c=>{const wasWrap=(()=>{let mx=0;for(const t of c.tracks)if(t.name.endsWith('.quaternion')&&t.times.length>3){const v=t.values,e=4*(t.times.length-1);mx=Math.max(mx,2*Math.acos(Math.min(1,Math.abs(v[0]*v[e]+v[1]*v[e+1]+v[2]*v[e+2]+v[3]*v[e+3]))))}return mx})();
    if(wasWrap>0.12){const n=seamLoop(c);if(n)console.log('seamLoop',c.name,n)}});
  chrG.animations.forEach(c=>{const n=c.name.trim();
    if(n.startsWith(DEF.eye.close))eye.CLOSE.push(mixer.clipAction(c));
    else if(n.startsWith(DEF.eye.open))eye.OPEN.push(mixer.clipAction(c));
    else if(n.startsWith(DEF.eye.blink))eye.BLINK.push(mixer.clipAction(c));
    else if(n.startsWith('ACT_')&&!n.includes('__'))acts[n]=mixer.clipAction(c);});
  const HAS_AIR=!!(K.JUMP&&acts[K.JUMP]&&acts[K.DJUMP]&&acts[K.DIVE]);   // chỉ Bin có clip nhảy / nhảy đôi / lao
  // KHÔNG stop() action ngay trong sự kiện 'finished': sự kiện bắn ra GIỮA lúc mixer.update đang duyệt danh sách action,
  // stop() đổi chỗ action trong danh sách → action thân (WATCHING_IDLE, REST…) bị bỏ qua đúng 1 khung → nhân vật chớp về tư thế gốc.
  // Gom lại, chạy sau khi mixer.update xong.
  const afterMix=[];const later=f=>afterMix.push(f);
  mixer.addEventListener('finished',e=>{const n=e.action.getClip().name;if(/EYE_OPEN|BLINK/.test(n))later(()=>e.action.stop());});
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

  // ===== bắp rang: clip của POPCORN_IN chạy cùng WATCHING; xong thì đổi sang POPCORN_IDLE (đặt đúng chỗ IN kết thúc); OFFWATCH chạy clip của POPCORN_OUT =====
  const popA={};
  chrG.animations.forEach(c=>{const tn=c.tracks[0]&&THREE.PropertyBinding.parseTrackName(c.tracks[0].name).nodeName;
    if(POPM.IN&&tn===POPM.IN.name)popA.IN=mixer.clipAction(c);else if(POPM.OUT&&tn===POPM.OUT.name)popA.OUT=mixer.clipAction(c)});
  let popSt='off';
  const popShow=k=>{for(const n in POPM)if(POPM[n])POPM[n].visible=n===k};
  function popIn(){if(!POPM.IN||!popA.IN){if(POPM.IDLE){popShow('IDLE');popSt='held'}return}popA.OUT&&popA.OUT.stop();popShow('IN');once(popA.IN);popA.IN.setEffectiveWeight(1);popSt='in'}
  function popHeld(){const a=POPM.IN,b=POPM.IDLE;if(b&&a){b.position.copy(a.position);b.quaternion.copy(a.quaternion);b.scale.copy(a.scale)}popShow(b?'IDLE':'IN');popSt='held'}
  function popOut(){if(popSt==='off')return;popA.IN&&popA.IN.stop();if(!POPM.OUT||!popA.OUT){popHide();return}popShow('OUT');once(popA.OUT);popA.OUT.setEffectiveWeight(1);popSt='out'}
  function popHide(){popA.IN&&popA.IN.stop();popA.OUT&&popA.OUT.stop();popShow(null);popSt='off'}
  mixer.addEventListener('finished',e=>{if(e.action===popA.IN&&popSt==='in')later(()=>{if(popSt!=='in')return;popHeld();if(POPM.IDLE)popA.IN.stop()});else if(e.action===popA.OUT&&popSt==='out')later(()=>{if(popSt==='out')popHide()})});

  // ===== MIỆNG (LazyRig): biểu cảm tự động theo ngữ cảnh — người chơi không điều khiển =====
  // Ô atlas (giống nhau ở 2 file, 15 ô đầu): 0 cười hở răng · 1 cười mím · 2 nhếch mép · 3 nhe răng · 4 buồn · 5 há "ồ" · 6 khóc · 7 cười lớn
  // 8 chu môi · 9 lè lưỡi · 10 gầm · 11 méo · 12 ngáp · 13 nhăn · 14 mèo "w". Bin có thêm khung nhép nói (vòng lặp đầu tiên trong file).
  let mouth=null;try{mouth=new LazyMouth(char)}catch(e){console.warn('[mouth]',e.message)}
  const MZ={rest:mouth?(mouth.meta.rest??0):0,talk:mouth&&mouth.loops&&mouth.loops[0]?mouth.loops[0].name:null,n:mouth?mouth.cells.length:0,burst:null,next:4+Math.random()*6,talking:false,prevMode:'free',prevBusy:null};
  const mzOk=i=>i>=0&&i<MZ.n;
  function mouthSay(seq){if(!mouth)return;MZ.burst={seq:seq.filter(s=>mzOk(s[0])),i:0,t:0}}
  function mouthBase(){const k=busy&&busy.kind;
    if(k==='climbBed'||k==='offBed')return 12;
    if(P.mode==='bed')return DEF.id==='vy'?14:1;
    if(P.mode==='type'||P.mode==='sit'||k==='climbChair')return 1;
    if(P.mode==='watch'||k==='climbWatch'||k==='offWatch')return 1;
    if(cur===acts[K.RUN])return 0;
    return MZ.rest}
  function mouthTick(dt){
    if(!mouth)return;
    const talk=!!(DEF.remote?(api.peerTalk&&api.peerTalk()):(api.meTalk&&api.meTalk()));
    if(talk&&MZ.talk){if(!MZ.talking){MZ.talking=true;mouth.playLoop(MZ.talk,{repeat:true,speed:1})}mouth.update(dt);return}
    if(MZ.talking){MZ.talking=false;mouth.stop(false)}
    // phản ứng theo sự kiện (đổi tư thế)
    const bk=busy&&busy.kind;
    if(bk!==MZ.prevBusy){if(bk==='climbChair'||bk==='climbWatch')mouthSay([[2,0.9]]);else if(bk==='offBed')mouthSay([[12,1.1],[0,0.6]]);MZ.prevBusy=bk}
    if(P.mode!==MZ.prevMode){if(P.mode==='watch')mouthSay([[0,1.2]]);MZ.prevMode=P.mode}
    // thỉnh thoảng đổi nét mặt theo tình huống
    MZ.next-=dt;
    if(MZ.next<=0&&!MZ.burst&&!busy){const r=Math.random();
      if(P.mode==='watch'){MZ.next=7+Math.random()*12;
        if(r<0.3)mouthSay([[5,0.14],[1,0.14],[5,0.14],[1,0.14],[5,0.14],[1,0.3]]);          // nhai bắp
        else if(r<0.55)mouthSay([[7,1.4]]);else if(r<0.75)mouthSay([[0,1.6]]);else if(r<0.88)mouthSay([[5,0.9]]);else mouthSay([[14,1.4]])}
      else if(P.mode==='bed'){MZ.next=20}
      else if(P.mode==='type'||P.mode==='sit'){MZ.next=8+Math.random()*10;mouthSay(r<0.5?[[2,1.2]]:r<0.8?[[8,0.9]]:[[3,0.8]])}
      else{MZ.next=6+Math.random()*10;mouthSay(r<0.45?[[1,1.5]]:r<0.75?[[2,1.1]]:r<0.9?[[0,1.2]]:[[9,0.8]])}}
    let e=mouthBase();
    const b=MZ.burst;if(b){if(b.i<b.seq.length){e=b.seq[b.i][0];b.t+=dt;if(b.t>=b.seq[b.i][1]){b.i++;b.t=0}}else MZ.burst=null}
    if(mzOk(e))mouth.setExpression(e)}

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
  const P={sp:0,pos:DEF.pos.clone(),yaw:DEF.yaw,level:DEF.level||0,mode:'free',side:'L',stand:null};
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
    // clip lặp đang còn chạy dở (đang mờ dần) mà chọn lại thì GIỮ NGUYÊN thời gian — trước đây reset() về khung 0 làm pose giật/chớp 1–2 khung (đặc biệt khi WALK↔REST đổi liên tục)
    if(o.once||o.restart||!layers.includes(a)||!a.isRunning())a.reset();
    a.play();
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
  let restT=0,idleHeld=false,stopT=1;
  const toRest=(instant)=>{play('REST',{fade:instant?0:0.25});restT=0;idleHeld=false};
  // idle: Vy lặp liên tục sau 5s; Bin (idleBurst) đứng RESTPOSE rồi cứ 5–10s diễn trọn clip IDLE 1 lần (đủ 106 khung) rồi về RESTPOSE
  // ----- âm thanh nhân vật: tiếng bước theo pha chạm đất của clip đi/chạy; remote nhỏ dần theo khoảng cách tới người chơi -----
  const hearD=()=>{if(!DEF.remote)return 0;const L=api.local;return L?Math.hypot(L.P.pos.x-P.pos.x,L.P.pos.z-P.pos.z)+Math.abs(L.P.level-P.level)*4:99};
  const sfxAt=(n,o)=>SFX.playAt(n,hearD(),o);
  let footPh=0,wasType=false;
  function sfxTick(){
    const a=cur,run=a===acts[K.RUN];
    if(P.mode==='free'&&!busy&&(a===acts[K.WALK]||run)&&a.getEffectiveWeight()>0.4){
      const dur=a.getClip().duration,ph=((a.time%dur)+dur)%dur/dur,list=DEF.foot&&DEF.foot[run?'run':'walk'];
      if(list&&Math.abs(ph-footPh)<0.6){for(const t of list)if(footPh<t&&ph>=t){const S=stairAt(P.pos.x,P.pos.z);sfxAt('step',{f:{s:S?'stair':'wood',run},range:13})}}
      footPh=ph;}
    else footPh=0;
    const ty=P.mode==='type';
    if(ty!==wasType){wasType=ty;const d=hearD();SFX.typing(DEF.id,ty,Math.max(0,1-d/12)**2)}
  }
  let idleDone=false,nextIdleAt=5+Math.random()*5;
  mixer.addEventListener('finished',e=>{if(DEF.idleBurst&&e.action===acts[K.IDLE])idleDone=true});
  function idleTick(dt){
    if(cur===acts[K.IDLE]&&idleHeld){if(DEF.idleBurst&&idleDone){idleDone=false;toRest();nextIdleAt=5+Math.random()*5}}
    else if(cur===acts[K.REST]){restT+=dt;if(restT>(DEF.idleBurst?nextIdleAt:5)){idleDone=false;play('IDLE',DEF.idleBurst?{fade:0.12,once:true}:{fade:0.1});idleHeld=true}}
    else toRest();
  }
  const wp=(x,z,setLevel,run,strict)=>({t:'wp',x,z,setLevel,run:run||runMode.v,strict});

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
  // ghế sofa xem TV: gốc đứng sao cho hông cuối clip WATCHING rơi đúng tâm đệm (clip lùi ~0.5 m rồi ngồi xuống)
  // chỗ ngồi THÊM từ nội thất đặt trong nhà (src/build/furniture.js): id dạng chuỗi 'f…' → {c, top, yaw, lv, fy}; dùng chung clip ngồi lùi WATCH của sofa
  const XSEAT={};api.seatSet=(id,o)=>{XSEAT[id]={c:new THREE.Vector3(o.x,o.y,o.z),top:o.y,yaw:o.yaw,lv:o.lv|0,fy:o.fy}};api.seatDel=id=>{delete XSEAT[id]};api.seatFree=id=>!occ['sofa'+id];
  const isX=i=>typeof i==='string';
  const seatOf=i=>isX(i)?XSEAT[i]:SOFA.seats[i],seatYaw=i=>isX(i)?XSEAT[i].yaw:SOFA.yaw,seatFY=i=>isX(i)?XSEAT[i].fy:A.L0,seatLv=i=>isX(i)?XSEAT[i].lv:0;
  function watchPose(i){const se=seatOf(i),an=HIP.WATCH?HIP.WATCH.e:new THREE.Vector3(0,0.5,-0.52),y=seatYaw(i),c=Math.cos(y),s=Math.sin(y);
    return new THREE.Vector3(se.c.x-(an.x*c+an.z*s),seatFY(i),se.c.z-(-an.x*s+an.z*c))}
  const watchDY=i=>{const an=HIP.WATCH?HIP.WATCH.e:null;if(!an)return 0;return clamp(seatOf(i).top+0.06-(seatFY(i)+an.y),-0.15,0.15)};
  const bedPose=side=>new THREE.Vector3(side==='L'?A.bedBox.min.x-CFG.bedSide:A.bedBox.max.x+CFG.bedSide,A.L1,A.bedBox.min.z+CFG.bedHeadZ);
  const bedRootY=()=>A.mattress.max.y-CFG.bedHipH;

  function startPos(){return (P.mode==='bed'||P.mode==='sit'||P.mode==='type'||P.mode==='watch')&&P.stand?P.stand.clone():P.pos.clone()}
  function pickSide(fn){const p=startPos();return ['L','R'].map(s=>{const v=fn(s);return{s,d:Math.hypot(v.x-p.x,v.z-p.z)}}).sort((a,b)=>a.d-b.d)[0].s}
  // điểm "chờ" thẳng trục trước miệng cầu thang (xa nhất còn trống, tối đa 0.5 m); nếu chật hơn 0.3 m thì dùng luôn điểm miệng
  const approachZ=(cx,z0,dir,lv)=>{let best=z0;for(let d=0.1;d<=0.5;d+=0.1){const zz=z0+dir*d,c=cell(cx,zz);if(free(lv,c[0],c[1])&&zz<(lv?MC.l1[3]:MC.walk0[3])-0.05&&zz>MC.walk0[2])best=zz;else break}return Math.abs(best-z0)>=0.3?best:z0};
  function route(x,z,lv,run,exact){const it=[],s=startPos();let L=P.level,x0=s.x,z0=s.z;
    const add=pts=>pts.forEach(p=>it.push(wp(p.x,p.z,null,run)));
    if(L===0&&lv===1){const S=pickStair(x0,z0,x,z,true),cx=S.cx;
      if(S.front){const F=S.front;add(findPath(x0,z0,F.lx,F.zF,0,true));it.slice(-1).forEach(w=>w.strict=1);it.push(wp(cx,F.zF,null,run,1),wp(cx,S.z1-0.05,null,run,1),wp(cx,S.midZ,1,run),wp(cx,S.topZ,null,run));x0=cx;z0=S.topZ}
      else{const ap=approachZ(cx,S.botZ,1,0);add(findPath(x0,z0,cx,ap,0,true));it.slice(-2).forEach(w=>w.strict=1);it.push(wp(cx,S.botZ,null,run,1),wp(cx,S.midZ,1,run),wp(cx,S.topZ,null,run));x0=cx;z0=S.topZ}}
    else if(L===1&&lv===0){const S=pickStair(x0,z0,x,z,false),cx=S.cx,ok=approachZ(cx,S.topZ,-1,1);
      // đã đứng sát đầu thang, gần trục (≤0.45 m): xuống thẳng — trước đây vẫn lùi ra điểm tiếp cận phía sau (~0.5 m) rồi mới quay lại → khựng 1–2 s lúc bắt đầu
      if(Math.abs(x0-cx)<0.45&&z0>ok-0.05&&z0<S.z0+0.6){if(Math.abs(x0-cx)>0.05||z0<S.topZ-0.05)it.push(wp(cx,Math.max(z0,S.topZ),null,run,1))}
      else{add(findPath(x0,z0,cx,ok,1,true));it.slice(-2).forEach(w=>w.strict=1)}
      const near=Math.abs(x0-cx)<0.45&&z0>S.topZ+0.02,top0=near?[]:[wp(cx,S.topZ,null,run,1)];
      if(S.front){const F=S.front;it.push(...top0,wp(cx,S.midZ,0,run),wp(cx,F.zF,null,run,1),wp(F.lx,F.zF,null,run,1));x0=F.lx;z0=F.zF}
      else{it.push(...top0,wp(cx,S.midZ,0,run),wp(cx,S.botZ,null,run),wp(cx,approachZ(cx,S.botZ,1,0),null,run,1));x0=cx;z0=approachZ(cx,S.botZ,1,0)}}
    add(findPath(x0,z0,x,z,lv,exact));
    // tới chỗ ngồi/giường/sofa: điểm đứng thường nằm sát (hoặc lẹm) vùng chặn của đồ → A* chỉ tới được ô trống gần nhất, rồi bước leo/ngồi đặt thẳng vị trí = giật. Nối thêm 1 đoạn đi thẳng tới đúng điểm đứng (ngắn) để nhân vật tự bước vào chỗ.
    if(exact){const l=it.length?it[it.length-1]:{x:x0,z:z0},d=Math.hypot(l.x-x,l.z-z);if(d>0.02&&d<1.5)it.push(wp(x,z,null,run))}
    return it;}
  const leave=()=>{const k=busy&&busy.kind;return (P.mode==='bed'||k==='climbBed')?[{t:'offBed'}]:(P.mode==='sit'||P.mode==='type'||k==='climbChair')?[{t:'offChair'}]:(P.mode==='watch'||k==='climbWatch')?[{t:'offWatch'}]:[]};
  function cmdMove(x,z,lv,run){
    em('move',[r3(x),r3(z),lv,run?1:0]);
    if(lv===0){x=clamp(x,MC.walk0[0],MC.walk0[1]);z=clamp(z,MC.walk0[2],MC.walk0[3]);} else {x=clamp(x,MC.cl1[0],MC.cl1[1]);z=clamp(z,MC.cl1[2],MC.cl1[3]);}
    {const S=stairAt(x,z);if(S){lv=z>S.midZ?0:1;x=S.cx;z=lv?S.topZ:S.botZ;}}
    plan=[...leave(),...route(x,z,lv,run||runMode.v)];
  }
  function cmdSleep(){if(OUTD)return;em('sleep');if(P.mode==='bed')return;const p0=startPos();const sides=['L','R'].filter(x=>!occ['bed'+x]||occ['bed'+x]===DEF.id).sort((a,b)=>{const va=bedPose(a),vb=bedPose(b);return Math.hypot(va.x-p0.x,va.z-p0.z)-Math.hypot(vb.x-p0.x,vb.z-p0.z)});if(!sides.length){toast('Giường đã có 2 người');return}const side=sides[0],s=bedPose(side);occ['bed'+side]=DEF.id;
    plan=[...leave(),...route(s.x,s.z,1,false,true),{t:'face',yaw:0},{t:'climbBed',side}];}
  function cmdSit(type){if(OUTD)return;em('sit',type||0);if(P.mode==='sit'||P.mode==='type'){if(type)plan=[{t:type==='type'?'type':'sitidle'}];return}
    if(occ.chair&&occ.chair!==DEF.id){toast('Ghế đang có người');return}
    const side=pickSide(chairStandOf),s=chairStandOf(side);
    plan=[...leave(),...route(s.x,s.z,A.chairL,false,true),{t:'face',yaw:A.chairYaw},{t:'climbChair',side}];if(type==='type')plan.push({t:'type'});}
  const cmdWake=()=>{em('wake');if(P.mode==='bed'||(busy&&busy.kind==='climbBed'))plan=[{t:'offBed'}];else if(plan.some(s=>s.t==='climbBed')){plan=[];['bedL','bedR'].forEach(k=>{if(occ[k]===DEF.id)occ[k]=null})}};
  // xem TV: đi tới trước đệm sofa còn trống gần nhất → quay mặt về TV → ngồi lùi lên sofa (WATCHING) → WATCHING_IDLE
  function cmdWatch(seat){
    if(isX(seat)){if(!XSEAT[seat])return false;if(P.mode==='watch'&&P.seat===seat)return true;if(occ['sofa'+seat]&&occ['sofa'+seat]!==DEF.id){toast('Chỗ đó có người rồi');return false}
      em('watch',seat);occ['sofa'+seat]=DEF.id;const s=watchPose(seat);plan=[...leave(),...route(s.x,s.z,seatLv(seat),false,true),{t:'face',yaw:seatYaw(seat)},{t:'climbWatch',seat}];return true}
    if(!SOFA)return false;
    if(P.mode==='watch'||(busy&&busy.kind==='climbWatch')||plan.some(x=>x.t==='climbWatch'))return true;
    const p0=startPos(),free=[0,1].filter(i=>i<SOFA.seats.length&&(!occ['sofa'+i]||occ['sofa'+i]===DEF.id));
    if(seat!=null&&free.includes(seat|0))seat=seat|0;else{if(!free.length){toast('Sofa đã kín chỗ');return false}
      seat=free.sort((a,b)=>{const va=watchPose(a),vb=watchPose(b);return Math.hypot(va.x-p0.x,va.z-p0.z)-Math.hypot(vb.x-p0.x,vb.z-p0.z)})[0]}
    em('watch',seat);occ['sofa'+seat]=DEF.id;const s=watchPose(seat);
    plan=[...leave(),...route(s.x,s.z,0,false,true),{t:'face',yaw:SOFA.yaw},{t:'climbWatch',seat}];return true}
  function cmdUnwatch(){em('unwatch');
    if(P.mode==='watch'||(busy&&busy.kind==='climbWatch'))plan=[{t:'offWatch'}];
    else if(plan.some(x=>x.t==='climbWatch')){plan=[];for(const k of ['sofa0','sofa1'])if(occ[k]===DEF.id)occ[k]=null}}
  const cmdOffChair=()=>{em('off');if(P.mode==='sit'||P.mode==='type'||(busy&&busy.kind==='climbChair'))plan=[{t:'offChair'}];else if(plan.some(s=>s.t==='climbChair')){plan=[];if(occ.chair===DEF.id)occ.chair=null}};

  // clip nhân vật + clip ghế (nếu có) bắt đầu CÙNG MỘT LÚC
  function startBusy(kind,key,chairTag,y0,y1){
    const a=play(key,{once:true,fade:0.15,restart:true});
    if(chairTag)playChair(chairTag,P.side);
    busy={kind,a,dur:a.getClip().duration,y0,y1};P.pos.y=y0;
    sfxAt({climbBed:'bedClimb',offBed:'bedOff',climbChair:'sit',offChair:'standUp',climbWatch:'sit',offWatch:'standUp'}[kind],{range:14});
  }
  // clip off kết thúc lệch root (hông ở xa gốc) -> dời root theo đúng chỗ hông đã tới, tránh bị kéo/snap khi về REST
  function endDrift(key){const e=HIP[key]&&HIP[key].e,r=HIP.REST&&HIP.REST.s;if(!e||!r)return false;
    const dx=e.x-r.x,dz=e.z-r.z;if(Math.hypot(dx,dz)<0.02)return false;const c=Math.cos(P.yaw),s=Math.sin(P.yaw);
    P.pos.x+=dx*c+dz*s;P.pos.z+=-dx*s+dz*c;return true;}
  // bắt đầu leo/ngồi khi chưa đứng đúng điểm đứng (bản sao mạng tới gần ~0.3 m, hay đường đi chỉ tới được ô sát đồ đạc): không đặt thẳng vị trí (giật) mà trượt mượt về đúng chỗ trong ~0.3 s đầu clip
  function easeIn(fx,fz,fw){if(!busy)return;const d=Math.hypot(P.pos.x-fx,P.pos.z-fz),dw=Math.abs(angDiff(P.yaw,fw));if(d<0.01&&dw<0.02)return;
    if(d>2.5)return;   // quá xa (kẹt chỗ kín): đành đặt thẳng
    busy.ez={fx,fz,fw,sx:P.pos.x,sz:P.pos.z,sw:P.yaw,T:clamp(0.18+d*0.5,0.18,0.45)};P.pos.x=fx;P.pos.z=fz;P.yaw=fw}
  function updateBusy(dt){
    const b=busy,p=clamp(b.a.time/b.dur,0,1);
    if(b.ez){const e=b.ez,w=sstep(0,1,Math.min(1,b.a.time/e.T));P.pos.x=e.fx+(e.sx-e.fx)*w;P.pos.z=e.fz+(e.sz-e.fz)*w;P.yaw=e.fw+angDiff(e.sw,e.fw)*w;if(w>=1)b.ez=null}
    P.pos.y=THREE.MathUtils.lerp(b.y0,b.y1,sstep(0.2,0.8,p));
    if(b.kind==='climbBed'&&p>=CFG.eyeCloseAt)eyeClose();
    if(b.kind==='climbWatch'&&!b.cued&&p>=0.3){b.cued=true;if(!DEF.remote&&api.onWatchSitting)api.onWatchSitting()}     // lúc lấy bắp ra: camera bắt đầu lướt
    if(p>=0.995||(!b.a.isRunning()&&p>0.9)){
      busy=null;P.pos.y=b.y1;
      if(b.kind==='climbBed'){P.mode='bed';if(plan[0]&&plan[0].t==='offBed'){}else{play('SLEEP_'+P.side,{fade:0.05});eyeClose();sfxAt('sleep',{range:12});}}
      else if(b.kind==='climbChair'){if(plan[0]&&plan[0].t==='offChair'){P.mode='sit'}else if(!K.SIT){P.mode='sit';}else if(plan[0]&&plan[0].t==='type'){plan.shift();P.mode='type';play('TYPE',{fade:0.05});}else{P.mode='sit';play('SIT',{fade:0.1});}if(!DEF.remote&&api.onChairSeated)api.onChairSeated()}
      else if(b.kind==='offBed'){sfxAt('wake',{range:12});occ['bed'+P.side]=null;const dr=endDrift('OFFBED_'+P.side);P.mode='free';P.level=1;P.stand=null;anchor=null;toRest(dr);}
      else if(b.kind==='climbWatch'){P.mode='watch';if(!(plan[0]&&plan[0].t==='offWatch'))play('WATCH_IDLE',{fade:0.15});if(!DEF.remote&&api.onWatchSeated&&!isX(P.seat))api.onWatchSeated()}
      else if(b.kind==='offWatch'){const wasX=isX(P.seat),lv=wasX&&XSEAT[P.seat]?XSEAT[P.seat].lv:0;for(const k in occ)if(/^sofa/.test(k)&&occ[k]===DEF.id)occ[k]=null;const dr=endDrift('OFFWATCH');P.mode='free';P.level=lv;P.stand=null;P.seat=undefined;anchor=null;toRest(dr);if(!DEF.remote&&api.onWatchLeft&&!wasX)api.onWatchLeft()}
      else if(b.kind==='offChair'){if(!DEF.remote&&api.onChairLeft)api.onChairLeft();occ.chair=null;const dr=endDrift('OFFCHAIR_'+P.side);P.mode='free';P.level=A.chairL;P.stand=null;anchor=null;toRest(dr);}
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
        if(netWP()){            // bản sao đi lộ trình (click-đi / tới giường, ghế, sofa): vị trí theo snapshot, chỉ dùng lộ trình để biết lúc nào tới đích cuối
          let j=0;while(plan[j+1]&&plan[j+1].t==='wp')j++;const fin=plan[j];
          netFree(dt,false);
          if(P.sp>0.05)play(P.sp/SPM()>RUN_SPf()?'RUN':'WALK',{fade:0.2});
          const dF=Math.hypot(fin.x-P.pos.x,fin.z-P.pos.z);
          // tới đích: sát điểm cuối, hoặc gần đích mà chủ nhân vật đã bắt đầu hành động kế (leo giường/ghế…) hay đã đứng hẳn (mv=0)
          const ownBusy=net&&net.b,ownStill=net&&!net.mv;
          if(dF<0.05||(dF<0.35&&(ownBusy||(ownStill&&nStill>0.3)))){if(fin.setLevel!=null)P.level=fin.setLevel;plan.splice(0,j+1)}      // không kéo giật về điểm cuối: bước kế (leo/ngồi) tự đặt tư thế, còn lại nội suy tự do khớp dần
          else if(ownStill&&!ownBusy&&nStill>1.0)plan.splice(0,j+1);       // chủ nhân vật đã dừng hẳn ở chỗ khác (huỷ lộ trình): bỏ lộ trình, về nội suy tự do
          break}
        const dx=it.x-P.pos.x,dz=it.z-P.pos.z,d=Math.hypot(dx,dz);
        const last=!(plan[1]&&plan[1].t==='wp');
        const arrive=last?0.02:it.strict?0.04:Math.max(0.1,P.sp*0.12);
        if(d<=arrive){if(last){P.pos.x=it.x;P.pos.z=it.z;}if(it.setLevel!=null)P.level=it.setLevel;plan.shift();break}
        const diff=angDiff(Math.atan2(dx,dz),P.yaw);
        P.yaw+=clamp(diff*(1-Math.exp(-dt*30)),-22*dt,22*dt);
        P.sp=(it.run?CFG.run:CFG.walk)*SPM()*(stairAt(P.pos.x,P.pos.z)?0.85:1);
        const mx=(last&&d<0.5)?dx/d:Math.sin(P.yaw),mz=(last&&d<0.5)?dz/d:Math.cos(P.yaw);
        const st=Math.min(P.sp*dt,d)*(it.strict?Math.max(0.05,1-Math.abs(diff)/0.5):1);P.pos.x+=mx*st;P.pos.z+=mz*st;      // điểm vào cầu thang: quay mặt về hướng đi rồi mới bước (không vòng ra ngoài trục)
        play(it.run?'RUN':'WALK',{fade:0.2});
        break;}
      case 'face':{const diff=angDiff(it.yaw,P.yaw);
        if(Math.abs(diff)<0.04){P.yaw=it.yaw;plan.shift();break}
        P.yaw+=clamp(diff,-9*dt,9*dt);play(DEF.idleBurst?'REST':'IDLE',{fade:0.2});break;}
      case 'climbBed':{plan.shift();const fx=P.pos.x,fz=P.pos.z,fw=P.yaw;if(occ['bed'+it.side]&&occ['bed'+it.side]!==DEF.id){plan=[];toast('Phía giường này có người');break}occ['bed'+it.side]=DEF.id;P.yaw=0;P.level=1;P.side=it.side;const s=bedPose(it.side);P.stand=s.clone();P.pos.x=s.x;P.pos.z=s.z;
        anchor=HIP['CLIMBBED_'+it.side].e.clone();startBusy('climbBed','CLIMBBED_'+it.side,null,A.L1,bedRootY());easeIn(fx,fz,fw);break;}
      case 'climbChair':{plan.shift();const fx=P.pos.x,fz=P.pos.z,fw=P.yaw;if(occ.chair&&occ.chair!==DEF.id){plan=[];toast('Ghế đang có người');break}occ.chair=DEF.id;P.yaw=A.chairYaw;P.side=it.side;const s=chairStandOf(it.side);P.stand=s.clone();P.pos.x=s.x;P.pos.z=s.z;
        anchor=HIP['CLIMBCHAIR_'+it.side].e.clone();startBusy('climbChair','CLIMBCHAIR_'+it.side,'CLIMBUP',A.CY,A.CY+CFG.sitYAdj);easeIn(fx,fz,fw);break;}
      case 'offBed':{plan.shift();eyeOpen();startBusy('offBed','OFFBED_'+P.side,null,bedRootY(),A.L1);break;}
      case 'offChair':{plan.shift();startBusy('offChair','OFFCHAIR_'+P.side,'OFF',A.CY+CFG.sitYAdj,A.CY);break;}
      case 'climbWatch':{plan.shift();const fx=P.pos.x,fz=P.pos.z,fw=P.yaw;const i=isX(it.seat)?it.seat:it.seat|0;if(isX(i)&&!XSEAT[i]){plan=[];break}if(occ['sofa'+i]&&occ['sofa'+i]!==DEF.id){plan=[];toast('Chỗ đó có người rồi');break}occ['sofa'+i]=DEF.id;
        P.yaw=seatYaw(i);P.seat=i;const s=watchPose(i),fy=seatFY(i);P.stand=s.clone();P.pos.x=s.x;P.pos.z=s.z;P.level=seatLv(i);
        startBusy('climbWatch','WATCH',null,fy,fy+watchDY(i));easeIn(fx,fz,fw);if(!isX(i))popIn();break;}
      case 'offWatch':{plan.shift();startBusy('offWatch','OFFWATCH',null,P.pos.y,isX(P.seat)&&XSEAT[P.seat]?XSEAT[P.seat].fy:A.L0);popOut();break;}
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
  let airClr=0;      // độ cao lòng bàn chân so với mặt sàn khi đang nhảy (m) — lớn hơn đỉnh vật cản thì bước qua được
  function walkable(ox,oz,x,z){
    const S=stairAt(x,z),W=stairAt(ox,oz),ins=!!S,was=!!W,lv=(was&&!ins)?(z<W.midZ?1:0):P.level;
    if(ins){
      if(x<S.x0+0.1||x>S.x1-0.1)return false;
      if(was&&W!==S)return false;
      if(!was){const fromBottom=P.level===0&&oz>=S.z1-0.03&&z<oz,fromTop=P.level===1&&oz<=S.z0+0.08&&z>oz;
        // chỉ vào thang ở dải giữa (không lách từ mép/tay vịn)
        if(!fromBottom&&!fromTop)return false;if(Math.abs(x-S.cx)>(S.x1-S.x0)/2-0.18)return false;}
      return true;}
    if(was&&!ins){const atBot=z>=W.z1&&oz<W.z1,atTop=z<=W.z0&&oz>W.z0;
      if((!atBot&&!atTop)||x<W.x0+0.02||x>W.x1-0.02)return false}   // đang ở trên cầu thang: chỉ được ra ở chân/đỉnh, đúng bề ngang bậc
    if(lv===0){const w=MC.walk0;if(x<w[0]||x>w[1]||z<w[2]||z>w[3])return false}
    else{const w=MC.l1;if(x<w[0]||x>w[1]||z<w[2]||z>(w[3]==null?stairs[0].z0+0.02:w[3]))return false}
    if(lv===A.chairL&&CHB&&x>CHB[0]&&x<CHB[2]&&z>CHB[1]&&z<CHB[3]&&!(ox>CHB[0]&&ox<CHB[2]&&oz>CHB[1]&&oz<CHB[3]))return false;
    const c=cell(x,z);return free(lv,c[0],c[1])||(airClr>0.05&&jumpOK(lv,c[0],c[1],airClr));}
  function stepMove(dx,dz){
    // ĐANG Ở TRÊN CẦU THANG (WASD): chỉ đi DỌC trục thang (lên/xuống), thành phần ngang bị bỏ, nhân vật tự trượt về giữa bậc.
    // → không thể lạng sang tay vịn / tường / mép (vùng hay glitch); ra khỏi thang chỉ ở chân hoặc đỉnh.
    {const W0=stairAt(P.pos.x,P.pos.z);if(W0){const ox=P.pos.x,oz=P.pos.z,mv=Math.hypot(dx,dz),along=Math.abs(dz)>=Math.abs(dx)*0.35?Math.sign(dz)*mv:0;
      const nx=ox+(W0.cx-ox)*Math.min(1,0.35+mv*4),nz=oz+along;
      if(along&&walkable(ox,oz,nx,nz)){P.pos.x=nx;P.pos.z=nz;P.yaw+=angDiff(along<0?Math.PI:0,P.yaw)*0.35;return}
      if(along&&walkable(ox,oz,W0.cx,nz)){P.pos.x=W0.cx;P.pos.z=nz;P.yaw+=angDiff(along<0?Math.PI:0,P.yaw)*0.35;return}
      P.sp*=0.5;return}}
    const ox=P.pos.x,oz=P.pos.z,nx=ox+dx,nz=oz+dz,W=stairAt(ox,oz),M=0.2;
    // phễu cầu thang: vào/ở trong cầu thang thì tự căn giữa (cách mép/tay vịn M), không bị kẹt
    // chỉ được vào cầu thang qua ĐẦU dưới (đang ở tầng 0, đi lên) hoặc ĐỈNH (đang ở tầng 1, đi xuống). Hông cầu thang đặc hoàn toàn.
    // Bên trong / sát cửa vào thì kéo nhẹ vào giữa (từ từ, không dịch chuyển đột ngột).
    const fx=(x,z)=>{let S=W;if(!S){const T=stairAt(x,z);if(T&&((P.level===0&&oz>=T.z1-0.03)||(P.level===1&&oz<=T.z0+0.08)))S=T;
        if(!S){for(const T of stairs){const nearBot=P.level===0&&oz>T.z1&&oz<T.z1+0.5&&nz<oz,nearTop=P.level===1&&oz<T.z0&&oz>T.z0-0.5&&nz>oz;if((nearBot||nearTop)&&x>T.x0-0.02&&x<T.x1+0.02){S=T;break}}}}
      if(!S)return x;const t=Math.min(S.x1-M,Math.max(S.x0+M,x)),lim=Math.max(0.02,Math.abs(nz-oz)*0.7);return x+Math.max(-lim,Math.min(lim,t-x))};
    let x1=fx(nx,nz);if(walkable(ox,oz,x1,nz)){P.pos.x=x1;P.pos.z=nz;return}
    x1=fx(nx,oz);if(walkable(ox,oz,x1,oz)){P.pos.x=x1;return}
    x1=fx(ox,nz);if(walkable(ox,oz,x1,nz)){P.pos.x=x1;P.pos.z=nz;return}
    // cửa vào cầu thang lệch trục: trượt ngang về giữa (không đi tới) để lọt vào miệng thay vì kẹt ở mép
    for(const T of stairs){const nb=P.level===0&&oz>=T.z1-0.03&&oz<T.z1+0.5&&dz<0,nt=P.level===1&&oz<=T.z0+0.08&&oz>T.z0-0.5&&dz>0;
      if((nb||nt)&&ox>T.x0-0.2&&ox<T.x1+0.2){const t=Math.min(T.x1-0.3,Math.max(T.x0+0.3,ox)),sx=ox+Math.sign(t-ox)*Math.min(Math.abs(t-ox),Math.hypot(dx,dz)*0.7);if(Math.abs(sx-ox)>1e-5&&walkable(ox,oz,sx,oz)){P.pos.x=sx;return}}}
    P.sp*=0.5;}
    function pushOut(){
    if(inStair(P.pos.x,P.pos.z))return;
    const c=cell(P.pos.x,P.pos.z);if(free(P.level,c[0],c[1])||(airClr>0.05&&jumpOK(P.level,c[0],c[1],airClr)))return;
    let best=null,bd=1e9;
    for(let r=1;r<8&&!best;r++)for(let dj=-r;dj<=r;dj++)for(let di=-r;di<=r;di++){if(Math.max(Math.abs(di),Math.abs(dj))!==r)continue;
      if(free(P.level,c[0]+di,c[1]+dj)){const d=di*di+dj*dj;if(d<bd){bd=d;best=[c[0]+di,c[1]+dj]}}}
    if(best){const tx=G.x0+(best[0]+.5)*G.c,tz=G.z0+(best[1]+.5)*G.c;P.pos.x+=(tx-P.pos.x)*0.35;P.pos.z+=(tz-P.pos.z)*0.35;}}
  const nearestDist=fn=>Math.min(...['L','R'].map(s=>{const v=fn(s);return Math.hypot(v.x-P.pos.x,v.z-P.pos.z)}));

  // ===== NHẢY / NHẢY ĐÔI / LAO (DIVE) — nhân vật có clip JUMP, DOUBLEJUMP, DIVE (Bin) =====
  // Clip tự mang chuyển động đứng (hông lên/xuống) nên KHÔNG cộng thêm độ cao; code chỉ lo chuyển động ngang + chuyển cảnh:
  //  • JUMP: khung đầu & cuối = khung 10 của RUN → từ đang chạy chỉ cần blend ngắn; xong thì trả về RUN đúng khung 10 (không giật pha chân)
  //  • DOUBLEJUMP: khung đầu = khung 11 của JUMP mới (đỉnh nhảy, khớp tư thế đầu DOUBLEJUMP) → bấm Space lần 2 trước đỉnh thì chờ tới đỉnh rồi nối liền, sau đỉnh thì blend rất ngắn
  //  • DIVE: clip chỉ lăn về phía trước → xoay nhân vật về hướng phím (90° trái/phải, 180° lùi, 45° khi giữ 2 phím) rồi lăn; lao ~2.6 m theo đường cong sin
  let air=null;
  const footL=char.getObjectByName('footl'),footR=char.getObjectByName('footr');      // đo độ cao chân (Bin) để biết nhảy qua được vật cản nào
  const AF=30,J_APEX=11/AF,J_LAND=16/AF,DJ_LAND=18/AF,DV_T0=3/AF,DV_T1=25/AF,DV_END=28/AF,DIVE_D=2.6,DIVE_V=DIVE_D*Math.PI/(2*(DV_T1-DV_T0));
  const clipDur=k=>acts[K[k]].getClip().duration;
  const landSfx=()=>{const S=stairAt(P.pos.x,P.pos.z);sfxAt('step',{f:{s:S?'stair':'wood',run:true},range:13})};
  function startJump(){play('JUMP',{once:true,restart:true,fade:0.08});air={k:'jump',t:0,dur:clipDur('JUMP'),dj:false,landed:false};stopT=0;idleHeld=false}
  function startDJ(fade){play('DJUMP',{once:true,restart:true,fade});air={k:'djump',t:0,dur:clipDur('DJUMP'),dj:true,landed:false};stopT=0}
  function startDive(dx,dz){const m=Math.hypot(dx,dz)||1;play('DIVE',{once:true,restart:true,fade:0.08});air={k:'dive',t:0,dur:clipDur('DIVE'),dx:dx/m,dz:dz/m,landed:false};stopT=0;idleHeld=false}
  function endAir(inp){air=null;airClr=0;P.sp=0;stopT=0;idleHeld=false;
    if(inp.mag>0.1){if(inp.run){const a=play('RUN',{fade:0.04,restart:true});if(a)a.time=10/AF}else play('WALK',{fade:0.1,restart:true})}}
  function airUpdate(dt,inp){
    let A=air;A.t+=dt;const rq=inp.air;
    if(A.k!=='dive'&&footL&&footR)airClr=Math.max(0,Math.min(footL.matrixWorld.elements[13],footR.matrixWorld.elements[13])-char.position.y-0.17);else airClr=0;
    if(A.k==='jump'&&rq&&rq.k==='j'&&!A.dj){A.dj=true;em('air',['j'])}
    if(A.k==='jump'&&A.dj&&A.t>=J_APEX){startDJ(A.t-J_APEX<0.04?0:0.06);A=air}
    if(DEF.remote&&netI()){}          // bản sao: vị trí/hướng/tốc độ do nội suy snapshot của chủ nhân vật quyết định (netFree), ở đây chỉ chạy đồng hồ clip
    else if(A.k==='dive'){
      P.yaw+=angDiff(Math.atan2(A.dx,A.dz),P.yaw)*(1-Math.exp(-dt*34));
      let v=0;if(A.t>=DV_T0&&A.t<=DV_T1)v=DIVE_V*Math.sin(Math.PI*(A.t-DV_T0)/(DV_T1-DV_T0));
      P.sp=v;if(v>0.05)stepMove(A.dx*v*dt,A.dz*v*dt)}
    else if(inp.mag>0.1){const diff=angDiff(Math.atan2(inp.x,inp.z),P.yaw);P.yaw+=clamp(diff*(1-Math.exp(-dt*30)),-22*dt,22*dt);
      P.sp=(inp.run?CFG.run:CFG.walk)*SPM();stepMove(Math.sin(P.yaw)*P.sp*dt,Math.cos(P.yaw)*P.sp*dt)}
    else P.sp=0;
    if(!A.landed&&A.t>=(A.k==='jump'?J_LAND:A.k==='djump'?DJ_LAND:DV_T1-0.05)){A.landed=true;landSfx()}
    if(A.t>=A.dur-1e-3||(A.k==='dive'&&A.t>=DV_END&&inp.mag>0.1))endAir(DEF.remote&&netI()?{mag:P.sp>0.05?1:0,run:P.sp/SPM()>RUN_SPf()}:inp)}
  // ----- WASD control -----
  function manualUpdate(dt,inp){if(inp.interact){em('int');emitOff++;try{manualUpdate0(dt,inp)}finally{emitOff--}}else manualUpdate0(dt,inp)}
  function manualUpdate0(dt,inp){
    const lockW=(P.mode==='watch'||(busy&&busy.kind==='climbWatch'))&&api.cineLock;      // đang mở màn rạp: phím không làm nhân vật đứng dậy
    if(lockW){inp.mag=0;inp.interact=false}
    if(busy&&(inp.mag>0.1||inp.interact)&&!plan[0]){if(busy.kind==='climbBed')plan=[{t:'offBed'}];else if(busy.kind==='climbChair')plan=[{t:'offChair'}];else if(busy.kind==='climbWatch')plan=[{t:'offWatch'}]}
    if(air&&(busy||plan[0]))air=null;
    if(busy||plan[0]){
      if(!busy&&plan[0]&&plan[0].t==='wp'&&inp.mag>0.1)plan=[];
      else{updatePlan(dt);return}}
    if(air){airUpdate(dt,inp);if(netI())netFree(dt,false);return}
    if(HAS_AIR&&inp.air&&P.mode==='free'&&(DEF.remote||!stairAt(P.pos.x,P.pos.z))){const r=inp.air;
      if(r.k==='j'){startJump();em('air',['j'])}
      else if(r.k==='d'&&(r.dx||r.dz)){startDive(r.dx,r.dz);em('air',['d',Math.round(r.dx*100)/100,Math.round(r.dz*100)/100])}
      if(air){airUpdate(dt,{...inp,air:null});if(netI())netFree(dt,false);return}}
    if(inp.interact){
      if(P.mode==='bed'){plan=[{t:'offBed'}];return}
      if(P.mode==='sit'||P.mode==='type'){plan=[{t:'offChair'}];return}
      if(P.mode==='watch'){cmdUnwatch();return}
      const dB=nearestDist(bedPose),dC=nearestDist(chairStandOf),bOK=P.level===1&&dB<2.2,cOK=P.level===A.chairL&&dC<2.2;
      if(cOK&&(!bOK||dC<=dB)){cmdSit();return}if(bOK){cmdSleep();return}}
    if(P.mode==='bed'||P.mode==='sit'||P.mode==='type'||P.mode==='watch'){
      if(inp.mag>0.1){if(P.mode==='watch')cmdUnwatch();else plan=[{t:P.mode==='bed'?'offBed':'offChair'}]}
      return;}
    if(netI()){netFree(dt,true);return}
    if(inp.mag>0.1){
      const diff=angDiff(Math.atan2(inp.x,inp.z),P.yaw);
      P.yaw+=clamp(diff*(1-Math.exp(-dt*30)),-22*dt,22*dt);
      P.sp=(inp.run?CFG.run:CFG.walk)*SPM()*(stairAt(P.pos.x,P.pos.z)?0.85:1);
      stepMove(Math.sin(P.yaw)*P.sp*dt,Math.cos(P.yaw)*P.sp*dt);
      play(inp.run?'RUN':'WALK',{fade:0.15});idleHeld=false;
      stopT=0;
    }else{
      P.sp=0;stopT+=dt;
      // vừa thả phím (≤0.14s) vẫn giữ dáng đi → phím/cần gạt chớp tắt vài khung không làm nhân vật nháy sang REST rồi quay lại
      if(stopT>0.14||(cur!==acts[K.WALK]&&cur!==acts[K.RUN]))idleTick(dt);
    }
  }

  // ----- update: logic trước, apply sau (để tách va chạm giữa 2 nhân vật) -----
  function logic(dt,inp){
    clock+=dt;
    if(DEF.ctrl==='wasd')manualUpdate(dt,inp);else updatePlan(dt);
    for(const x of ['L','R'])if(occ['bed'+x]===DEF.id&&P.mode!=='bed'&&!(busy&&busy.kind==='climbBed')&&!plan.some(i=>i.t==='climbBed'))occ['bed'+x]=null;
    const NI=netI();
    if(!busy&&!plan[0]&&P.mode==='free'&&!NI)pushOut();
    if(DEF.ctrl==='wasd'){const S=stairAt(P.pos.x,P.pos.z);if(P._S&&!S&&!plan[0]&&!NI)P.level=P.pos.z<P._S.midZ?1:0;P._S=S;}
    if(!busy&&P.mode==='free'&&!NI&&!netWP()){const h=heightAt(P.pos.x,P.pos.z,P.level);P.pos.y+=(h-P.pos.y)*(1-Math.exp(-dt*(stairAt(P.pos.x,P.pos.z)?40:16)));}
    if(DEF.remote&&net)correct(dt);
  }
  // ----- nhân vật remote: nắn dần về snapshot của chủ nhân vật (chủ là authority) -----
  // Bản sao KHÔNG được xuyên tường/đồ đạc: trước đây nó đoán vị trí = snapshot + vận tốc×tuổi (tới 0.8s ≈ 1–3m) rồi lướt thẳng tới đó, bỏ qua va chạm,
  // nên khi người kia dừng sát tường/bồn cầu mà gói tin trễ/rớt, nhân vật kia hiện ra "đi xuyên" rồi giật về. Giờ: đoạn ngoại suy bị cắt ở ô bị chặn đầu tiên,
  // và mỗi bước lướt cũng phải qua kiểm tra va chạm (kẹt >0.5s mới bỏ qua, phòng khi hai bên lệch đường đi).
  function clipSeg(lv,x0,z0,x1,z1){const d=Math.hypot(x1-x0,z1-z0);if(d<0.02)return [x1,z1];const n=Math.ceil(d/0.05);let lx=x0,lz=z0;
    for(let k=1;k<=n;k++){const t=k/n,x=x0+(x1-x0)*t,z=z0+(z1-z0)*t,c=cell(x,z);if(!free(lv,c[0],c[1])&&!(airClr>0.05&&jumpOK(lv,c[0],c[1],airClr)))return [lx,lz];lx=x;lz=z}return [x1,z1]}
  let corBlk=0;
  // Gói vị trí tới TRƯỚC lệnh (đi/ngồi/ngủ…) là cũ so với lộ trình đang chạy: đừng kéo bản sao về đó (gây "đóng băng rồi nhảy"); đợi gói gửi sau lệnh.
  let cmdT=0;function netCmd(){cmdT=performance.now();nStill=0}      // lệnh mới (đi/ngồi/ngủ…): đếm lại thời gian 'chủ đứng yên' cho lộ trình mới
  function correct(dt){const s=net;if((plan[0]||busy)&&s.rt<cmdT)return;if(netI()||netWP()){netModeSync(dt,s);return}const age=Math.min(0.8,(performance.now()-s.t)/1000);
    let tx=s.x+s.vx*age,tz=s.z+s.vz*age;
    if(P.mode==='free'&&(s.vx||s.vz)&&!stairAt(s.x,s.z)&&!stairAt(tx,tz)){const c=clipSeg(s.l,s.x,s.z,tx,tz);tx=c[0];tz=c[1]}
    const dx=tx-P.pos.x,dz=tz-P.pos.z,d=Math.hypot(dx,dz);
    if(d>9||(d>3&&s.l!==P.level)){P.pos.set(tx,s.y,tz);P.level=s.l;P.yaw=s.w;plan=[];return}      // chỉ 'dịch chuyển' khi lệch rất xa / khác tầng; còn lại lướt nhanh về đúng chỗ
    if(busy)return;
    if(P.mode==='free'){
      const k=1-Math.exp(-dt*(d>3?16:d>0.6?8:(s.mv?3.5:9))),nx=P.pos.x+dx*k,nz=P.pos.z+dz*k,ox=P.pos.x,oz=P.pos.z;
      if(stairAt(nx,nz)||stairAt(ox,oz)||walkable(ox,oz,nx,nz)){P.pos.x=nx;P.pos.z=nz;corBlk=0}
      else if(walkable(ox,oz,nx,oz)){P.pos.x=nx;corBlk=0}
      else if(walkable(ox,oz,ox,nz)){P.pos.z=nz;corBlk=0}
      else if((corBlk+=dt)>0.5){P.pos.x=tx;P.pos.z=tz;corBlk=0}      // kẹt lâu: hai bên lệch đường đi → nhận vị trí chủ nhân vật
      // tầng của bản sao tự suy ra từ lúc rời cầu thang; chỉ nhận tầng từ snapshot khi lệch KÉO DÀI (snapshot cũ 0.1–0.2s đã làm nhân vật tụt/nhảy tầng)
      if(!stairAt(P.pos.x,P.pos.z)&&!plan[0]){
        if(s.l===P.level)lvMis=0;
        else if(!stairAt(s.x,s.z)&&Math.hypot(s.x-P.pos.x,s.z-P.pos.z)<0.8){lvMis+=dt;if(lvMis>0.7){P.level=s.l;lvMis=0}}
        else lvMis=0;}
      if(P.sp<0.05&&!plan[0])P.yaw+=angDiff(s.w,P.yaw)*(1-Math.exp(-dt*6));}
    netModeSync(dt,s);}
  // đồng bộ chế độ (nằm/ngồi/xem phim) nếu lệch kéo dài
  function netModeSync(dt,s){
    if(s.m!==P.mode&&!s.b&&!plan[0]){netMis+=dt;if(netMis>0.8){netMis=0;
      if(s.m==='watch')cmdWatch(s.s);else if(P.mode==='watch')cmdUnwatch();
      else if(s.m==='bed')cmdSleep();else if(s.m==='sit'||s.m==='type')cmdSit(s.m==='type'?'type':0);else if(P.mode==='bed')cmdWake();else cmdOffChair();}}
    else netMis=0;}
  function setNet(s){
    if(s.n!=null&&nSeq>=0){if(s.n<nSeq-500||s.n===1){NB.length=0;nOff=null}else if(s.n<=nSeq)return}   // gói cũ/đến sai thứ tự: bỏ; số thứ tự quay về đầu = đối phương tải lại trang
    if(s.n!=null)nSeq=s.n;net=s;
    if(s.ts==null)return;
    const o=s.rt-s.ts;                                  // lệch đồng hồ + trễ một chiều của gói này
    if(nOff==null||o<nOff)nOff=o;else nOff+=(o-nOff)*0.01;   // ước lượng theo gói nhanh nhất (trôi lên chậm khi đường truyền đổi)
    nJit+=(Math.min(400,o-nOff)/1000-nJit)*0.1;          // độ rung trễ (s)
    if(NB.length&&s.ts<=NB[NB.length-1].ts)return;
    NB.push({ts:s.ts,x:s.x,y:s.y,z:s.z,w:s.w,l:s.l,mv:s.mv,vx:s.vx,vz:s.vz,sp:Math.hypot(s.vx,s.vz)});
    while(NB.length>2&&NB[1].ts<s.ts-3000)NB.shift();
  }
  function dispose(){
    for(const x of ['L','R'])if(occ['bed'+x]===DEF.id)occ['bed'+x]=null;if(occ.chair===DEF.id)occ.chair=null;for(const k of ['sofa0','sofa1'])if(occ[k]===DEF.id)occ[k]=null;
    SFX.typing(DEF.id,false);mixer.stopAllAction();mixer.uncacheRoot(char);scene.remove(char);
    const seen=new Set();char.traverse(o=>{if(o.geometry&&!seen.has(o.geometry)){seen.add(o.geometry);o.geometry.dispose()}
      const ms=Array.isArray(o.material)?o.material:o.material?[o.material]:[];ms.forEach(m=>{if(seen.has(m))return;seen.add(m);for(const k in m){const t=m[k];if(t&&t.isTexture&&!seen.has(t)){seen.add(t);t.dispose()}}m.dispose()})});
  }
  function finish(dt){
    if(offT<1){offT=Math.min(1,offT+dt/offD);off.lerpVectors(offFrom,offTo,offT);}
    char.rotation.y=P.yaw;
    const c=Math.cos(P.yaw),s=Math.sin(P.yaw);
    char.position.set(P.pos.x+off.x*c+off.z*s,P.pos.y+off.y,P.pos.z-off.x*s+off.z*c);
    if(cur===acts[K.WALK])cur.timeScale=CFG.walkAnim*ANM();else if(cur===acts[K.RUN])cur.timeScale=CFG.runAnim*ANM();
    updateLayers(dt);mixer.update(dt);if(afterMix.length){const q=afterMix.splice(0);q.forEach(f=>{try{f()}catch(e){console.error(e)}})}
    if(belt){beltWind.a=OUTD?TU.uWindA.value:0;beltWind.t=TU.uWindT.value;beltWind.x=FU.uWindDir.value.x;beltWind.z=FU.uWindDir.value.y;belt.update(dt,char.visible&&char.position.distanceToSquared(camera.position)<1600,beltWind)}
    updateEyes(dt);blinkTick();sfxTick();mouthTick(dt);
  }
  play('REST',{fade:0});
  return{id:DEF.id,DEF,char,P,K,acts,runMode,logic,finish,belt:()=>belt,air:()=>air,setNet,netCmd,dispose,cmdMove,cmdSleep,cmdSit,cmdWake,cmdOffChair,cmdWatch,cmdUnwatch,mouthSay,mouth:()=>mouth,blink:()=>{em('blink');blink(clock)},
    get plan(){return plan},get cur(){return cur},get busy(){return busy}};
  }
  const DEFS={vy:DEF_VY,bin:DEF_BIN};
  const local=makeChar(ctx.localGlb,{...DEFS[ctx.localSlot]});api.local=local;let remote=null;
  const rinp={x:0,z:0,mag:0,run:false,interact:false,air:null};let rinpT=0;
  const runMode=local.runMode,P=local.P,{cmdMove,cmdSleep,cmdSit,cmdWake,cmdOffChair}=local;
  // tách 2 nhân vật không chồng lên nhau
  function separate(){if(!remote)return;const a=local.P,b=remote.P;if(a.mode!=='free'||b.mode!=='free'||local.busy||remote.busy||a.level!==b.level||local.plan.length||(local.air&&local.air()))return;   // đang đi lộ trình (click/tới giường…) hay đang nhảy: cho đi lướt qua nhau, không chặn đứng giữa đường
    const dx=b.pos.x-a.pos.x,dz=b.pos.z-a.pos.z,d=Math.hypot(dx,dz),m=0.38;if(d>=m||d<1e-4)return;
    const k=(m-d)/d;a.pos.x-=dx*k;a.pos.z-=dz*k;}      // chỉ đẩy nhân vật CỦA MÌNH (bản sao do máy kia quyết định — đẩy nó làm 2 bên lệch nhau)
  // phím
  const keys=new Set();let interactFlag=false,pendAir=null;const lastTap={};
  const _fv=new THREE.Vector3();
  function keyDir(){camera.getWorldDirection(_fv);let fx=_fv.x,fz=_fv.z;const fl=Math.hypot(fx,fz)||1;fx/=fl;fz/=fl;
    const ix=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),iz=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0);
    let x=fx*iz+(-fz)*ix,z=fz*iz+fx*ix;const m=Math.hypot(x,z);if(m>0){x/=m;z/=m}return{x,z,m}}
  addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
    if(e.code==='KeyE'&&!e.repeat)interactFlag=true;keys.add(e.code);if(/^Key[WASD]$/.test(e.code))e.preventDefault();
    // Space = nhảy (bấm lần 2 trên không = nhảy đôi); bấm đôi nhanh một phím WASD = lao (dive) theo hướng phím (giữ thêm phím khác → chéo 45°)
    if(e.code==='Space'){if(!e.repeat)pendAir={k:'j'};e.preventDefault()}
    else if(/^Key[WASD]$/.test(e.code)&&!e.repeat){const t=e.timeStamp;if(t-(lastTap[e.code]||-1e9)<280){lastTap[e.code]=0;const d=keyDir();if(d.m>0)pendAir={k:'d',dx:d.x,dz:d.z}}else lastTap[e.code]=t}});
  addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
  function readInput(){
    const {x,z,m}=keyDir();
    const inp={x,z,mag:m>0?1:0,run:runMode.v||keys.has('ShiftLeft')||keys.has('ShiftRight'),interact:interactFlag,air:pendAir};interactFlag=false;pendAir=null;return inp;}

  // input
  const ray=new THREE.Raycaster(),mv=new THREE.Vector2();
  const marker=new THREE.Mesh(new THREE.RingGeometry(0.1,0.14,24).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0x4fc3ff,depthTest:false,transparent:true}));
  marker.renderOrder=999;marker.visible=false;scene.add(marker);let markT=0;
  let down=null;
  renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,b:e.button}});
  function pick(e,run){
    if(api.pickHook&&api.pickHook(e,run))return;   // chế độ sắp xếp nội thất (src/build/furniture.js) giành cú bấm
    mv.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight)*2+1);ray.setFromCamera(mv,camera);
    const hits=ray.intersectObjects(envMeshes,false);
    for(const h of hits){
      if(h.object.userData.glass)continue;
      {const dr=doorOf(h.object);if(dr){const want=!doorOpenish(dr);const grp=doorList.filter(x=>x===dr||(dr.grp&&x.grp===dr.grp));   // cánh đôi (cửa chính, cổng): bấm 1 cánh thì cả hai cùng mở/đóng
      grp.forEach(x=>{doHalo(x.node);if(doorOpenish(x)!==want||x===dr){if(doorOpenish(x)!==want)toggleDoor(x);x.v++;x.want=undefined;if(api.emit)api.emit('door',[x.node.name,doorOpenish(x)?1:0,x.v])}});return}}
      if(isUnder(h.object,'Bed')){doHalo('Bed');cmdSleep();return}
      if(isUnder(h.object,CHAIR.name)){doHalo(CHAIR.name);cmdSit();return}
      const n=h.face?h.face.normal.clone().transformDirection(h.object.matrixWorld):new THREE.Vector3(0,1,0);
      if(n.y<0.6)continue;
      const p=h.point;
      if(OUTD){   // ngoài trời: chỉ nhận bấm trên mặt đất/lối đi; bấm lên mái nhà/tường hoặc vật cản thì bỏ qua (tránh bị dẫn đi vòng ra sau nhà)
        if(p.y>A.L0+0.7)return;const [ci,cj]=cell(p.x,p.z);let ok=free(0,ci,cj);for(let r=1;r<=10&&!ok;r++)for(let dj=-r;dj<=r&&!ok;dj++)for(let di=-r;di<=r;di++){if(Math.max(Math.abs(di),Math.abs(dj))===r&&free(0,ci+di,cj+dj)){ok=true;break}}
        if(!ok)return}
      marker.position.set(p.x,p.y+0.02,p.z);marker.visible=true;markT=1.2;
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
  let pinsUpd=null;
  // ===== nút tương tác ghim 3D: ghế / giường / TV / cửa (src/ui/pins.js; thông số Figma trong docs/UI.md) =====
  {const ctr=n=>{const o=byName[n];if(!o)return null;env.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(o);return b.isEmpty()?null:b};
   const mid=(b,dy)=>b?new THREE.Vector3((b.min.x+b.max.x)/2,b.max.y+dy,(b.min.z+b.max.z)/2):null;
   const sofaB=ctr('Sofa'),bedB=ctr('Bed'),tvB=ctr('TV_Screen')||ctr('TV_Panel')||(MC.tv?ctr(MC.tv.node):null),doorB=OUTD?ctr('Door_Main'):(ctr('Doormat')||ctr('Landing_Doormat')||ctr('Door_Entrance_Leaf')||ctr('GD_Door_Entrance_Leaf'));
   const chairPt=A.seatC?new THREE.Vector3(A.seatC.x,A.seatTop+0.62,A.seatC.z):null;
   const bedPt=mid(bedB,0.25),tvPt=mid(tvB,0.35);
   const doorPt=doorB?new THREE.Vector3((doorB.min.x+doorB.max.x)/2,doorB.max.y+(doorB.max.y-doorB.min.y>0.5?-0.8:0.15),(doorB.min.z+doorB.max.z)/2):null;
   // TV: đi tới đứng trước TV (hướng về phía sofa/giữa phòng). Anim xem TV sẽ làm sau.
   const tvStand=()=>{if(!tvB)return null;const c=tvB.getCenter(new THREE.Vector3()),to=sofaB?sofaB.getCenter(new THREE.Vector3()):new THREE.Vector3(5,0,-3.5);
     const dx=to.x-c.x,dz=to.z-c.z,d=Math.hypot(dx,dz)||1;return{x:c.x+dx/d*Math.min(1.6,d*0.6),z:c.z+dz/d*Math.min(1.6,d*0.6),lv:c.y>2?1:0}};
   const P0=local.P,items=[
    {key:'tv',icon:'tv',label:'Xem TV',at:()=>tvPt,state:()=>api.cinema&&api.cinema.pinState?api.cinema.pinState():null,act:()=>{if(api.cinema&&SOFA)api.cinema.fromPin();else{const s=tvStand();if(s)cmdMove(s.x,s.z,s.lv,false)}}},
    {key:'chair',icon:'chair',label:'Ngồi',at:()=>chairPt,state:()=>P0.mode==='sit'||P0.mode==='type'?{on:true,label:'Đứng dậy'}:(api.chairPin?{label:api.chairPin.label}:null),act:()=>{if(P0.mode==='sit'||P0.mode==='type')cmdOffChair();else if(api.chairPin)api.chairPin.act();else cmdSit()}},
    {key:'bed',icon:'sleep',label:'Ngủ',at:()=>bedPt,state:()=>P0.mode==='bed'?{on:true,label:'Thức dậy'}:null,act:()=>{if(P0.mode==='bed')cmdWake();else cmdSleep()}},
    ...(MC.doors?[]:[{key:'door',icon:'door',label:MC.doorLabel||'Bản đồ',at:()=>doorPt,act:()=>{if(MC.doorTo&&window.__switchMap){window.__switchMap(MC.doorTo);return}const b=$('iMap');if(b)b.click()}}]),
    ...(MC.doors||[]).map((d,i)=>{const b=ctr(d.node),p=b?new THREE.Vector3((b.min.x+b.max.x)/2,b.max.y+(b.max.y-b.min.y>0.5?-0.8:0.15),(b.min.z+b.max.z)/2):null;
      return {key:'door'+i,icon:'door',label:d.label,at:()=>p,act:()=>{if(window.__switchMap)window.__switchMap(d.to)}}})];
   const pn=initPins({camera,items:items.filter(i=>i.at())});pinsUpd=pn.update;api.pins=pn;}
  // phím tắt (src/ui/shortcuts.js) → cùng các lệnh với nút ẩn ở trên
  {const ACT={walk:'bWalk',run:'bRun',sit:'bSit',type:'bType',off:'bOff',sleep:'bSleep',wake:'bWake'};window.__runMode=runMode;addEventListener('vy:act',e=>{let id=e.detail;if(id==='run'&&runMode.v)id='walk';   // R bật/tắt chế độ chạy — dùng chung cho cả WASD lẫn bấm chọn điểm
      const b=ACT[id];if(b)$(b).click();dispatchEvent(new CustomEvent('vy:mode'))})}
  document.querySelectorAll('input[data-k]').forEach(el=>{const k=el.dataset.k;el.max=Math.max(+el.max,k==='run'?10:k==='walk'?6:3);el.value=CFG[k];$('v'+k).textContent=el.value;el.oninput=()=>{CFG[k]=+el.value;$('v'+k).textContent=el.value;try{localStorage.setItem('vyCfg',JSON.stringify({v:3,walk:CFG.walk,run:CFG.run,walkAnim:CFG.walkAnim,runAnim:CFG.runAnim}))}catch(e){}}});
  try{const sv=JSON.parse(localStorage.getItem('vyCfg')||'null');if(sv&&sv.v===3){['walk','run','walkAnim','runAnim'].forEach(k=>{if(sv[k]!=null){CFG[k]=sv[k];const el=document.querySelector('input[data-k='+k+']');if(el){el.value=sv[k];$('v'+k).textContent=sv[k]}}})}}catch(e){}

  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);const pr=Math.min(curPR,1.25);composer.setPixelRatio(pr);composer.setSize(innerWidth,innerHeight);fxaaP.material.uniforms['resolution'].value.set(1/(innerWidth*pr),1/(innerHeight*pr))});


  // ===== BẦU TRỜI stylized (dải màu + mặt trời + mây khối) + sương + nền cỏ vô hạn =====
  const SKY={top:'#86b3ea',mid:'#c9d6f2',pink:'#f5c6c6',hor:'#ffe3c4'};
  const skyU={cTop:{value:new THREE.Color(SKY.top)},cMid:{value:new THREE.Color(SKY.mid)},cPink:{value:new THREE.Color(SKY.pink)},cHor:{value:new THREE.Color(SKY.hor)},
    cCl:{value:new THREE.Color('#ffffff')},cClSh:{value:new THREE.Color('#e8d8e8')},cth:{value:0.58},uStar:{value:0},uSunV:{value:1},uOut:{value:OUTD?1:0},
    sunDir:{value:new THREE.Vector3(0.55,0.5,0.65).normalize()},moonDir:{value:new THREE.Vector3(-0.5,0.4,-0.3).normalize()},uT:{value:0},
    tA:{value:null},tB:{value:null},tC:{value:null},uMix:{value:0},uW:{value:0},uRA:{value:0},uRB:{value:0},uRC:{value:0},uTexK:{value:0},uGK:{value:0.62},
    rH:{value:new THREE.Vector3(.5,.5,.5)},rM:{value:new THREE.Vector3(.5,.5,.5)},rZ:{value:new THREE.Vector3(.5,.5,.5)},uSkyDim:{value:1}};
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1,32,16),new THREE.ShaderMaterial({uniforms:skyU,side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false,toneMapped:false,
    vertexShader:'varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying vec3 vD;uniform vec3 cTop,cMid,cPink,cHor,cCl,cClSh,sunDir,moonDir;uniform float uT,cth,uStar,uSunV,uOut;
    uniform sampler2D tA,tB,tC;uniform float uMix,uW,uRA,uRB,uRC,uTexK,uGK,uSkyDim;uniform vec3 rH,rM,rZ;
    float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float h31(vec3 p){p=fract(p*0.3183099+vec3(.1,.2,.3));p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
    float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
    void main(){vec3 d=normalize(vD);float h=d.y;
      float t=clamp(h*(1.0+0.9*uOut),0.0,1.0);
      vec3 c=cHor;c=mix(c,cPink,smoothstep(0.02,0.06,t));c=mix(c,cMid,smoothstep(0.1,0.16,t));c=mix(c,cTop,smoothstep(0.3,0.38,t));
      if(h<0.0)c=cHor;
      float up=step(0.0,h);
      // ẢNH BẦU TRỜI stylized (bán cầu trên, equirect): 2 ảnh theo giờ (chuyển mượt) + 1 ảnh thời tiết (mây u ám).
      // Xoay ngang để vầng mặt trời vẽ sẵn trùng hướng mặt trời thật; rồi kéo màu một phần về dải màu grading hiện tại (giữ mood theo giờ/thời tiết)
      if(uTexK>0.001){float hh=max(h,0.0015);float vv=asin(clamp(hh,0.0,1.0))*0.63662;float uu=atan(d.z,d.x)*0.159155+0.5;
        vec3 ta=texture2D(tA,vec2(fract(uu+uRA),vv)).rgb,tb=texture2D(tB,vec2(fract(uu+uRB),vv)).rgb,tc=texture2D(tC,vec2(fract(uu+uRC),vv)).rgb;
        vec3 tx=mix(mix(ta,tb,uMix),tc,uW);
        vec3 ref=mix(mix(rH,rM,smoothstep(0.03,0.22,hh)),rZ,smoothstep(0.3,0.65,hh));
        vec3 rat=clamp(c/max(ref,vec3(0.02)),vec3(0.35),vec3(2.6));
        vec3 g=tx*pow(rat,vec3(uGK))*uSkyDim;
        g=mix(g,c,smoothstep(0.0,-0.03,h));          // dưới chân trời: về màu chân trời (khớp sương / mặt đất)
        c=mix(c,g,uTexK);}
      // sao
      vec3 sp=d*150.0;float st=step(0.9968,h31(floor(sp)));st*=0.55+0.45*sin(uT*2.5+h31(floor(sp)+7.0)*40.0);
      c+=vec3(st)*uStar*smoothstep(0.03,0.3,h)*up;
      // mặt trời + quầng bậc thang
      float sd=dot(d,normalize(sunDir));
      c+=vec3(1.0,0.78,0.5)*(smoothstep(0.93,0.99,sd)*0.28+uOut*(smoothstep(0.6,0.97,sd)*0.12+smoothstep(0.985,0.998,sd)*0.2))*uSunV*up;
      c=mix(c,vec3(1.0,0.97,0.82),smoothstep(0.9975,0.9982,sd)*uSunV*up);
      // mặt trăng
      float md=dot(d,normalize(moonDir));
      if(uOut<0.5){c=mix(c,vec3(0.95,0.96,1.0),smoothstep(0.9988,0.9991,md)*uStar*up);
      c+=vec3(0.5,0.6,0.9)*smoothstep(0.985,0.9995,md)*0.18*uStar*up;}
      else{
        // trăng stylized: đĩa lớn có miệng hố, bóng khuyết nhẹ, quầng mềm hai lớp
        vec3 mz=normalize(moonDir),mx=normalize(cross(vec3(0.0,1.0,0.0),mz)),my=cross(mz,mx);
        vec2 mu=vec2(dot(d,mx),dot(d,my))/0.052;float mr=length(mu);
        float disc=(1.0-smoothstep(0.93,1.0,mr))*step(0.0,md);
        float crt=vn(mu*3.1+4.0)*0.55+vn(mu*7.3)*0.3;
        vec3 mc=mix(vec3(0.99,0.97,0.86),vec3(0.80,0.84,0.93),smoothstep(0.35,0.75,crt));
        float ph=smoothstep(-0.35,0.55,dot(mu,vec2(-0.6,0.5))+0.35-0.35*(1.0-mr*mr));
        mc*=mix(0.55,1.0,ph);
        c=mix(c,mc,disc*smoothstep(-0.02,0.12,h)*max(uStar,0.0));
        c+=vec3(0.55,0.65,1.0)*(exp(-pow(max(mr-0.9,0.0)*1.3,1.0)*2.2)*0.22+exp(-mr*0.35)*0.10)*uStar*up*step(0.0,md)*(1.0-disc*0.8);
      }
      // mây khối 2 mức
      if(uOut>0.5){
        // mây khối stylized: fbm + dải sáng theo hướng nắng, mép bạc
        vec2 q=d.xz/(max(h,0.0)+0.32)*1.2+vec2(uT*0.0035,uT*0.0012);
        q+=vec2(vn(q*0.7+3.0),vn(q*0.7+9.0))*0.55;
        float f1=vn(q*vec2(1.0,1.7))*0.5+vn(q*vec2(2.1,3.5))*0.28+vn(q*vec2(4.4,7.3))*0.09+vn(q*vec2(8.7,13.0))*0.03;
        vec2 sl=normalize(sunDir.xz+vec2(0.001))*0.07;
        vec2 q2=q+sl;
        float cov=cth-0.02;
        float f2=f1;if(f1>cov-0.03)f2=vn(q2*vec2(1.0,1.7))*0.5+vn(q2*vec2(2.1,3.5))*0.28+vn(q2*vec2(4.4,7.3))*0.09+vn(q2*vec2(8.7,13.0))*0.03;   // lớp lệch nắng chỉ tính nơi có mây (nửa số lần noise ở nền trời trống)
        float body=smoothstep(cov,cov+0.016,f1)*smoothstep(0.015,0.14,h);
        float lt=smoothstep(-0.012,0.014,f2-f1+0.006);
        float edge=1.0-smoothstep(cov+0.016,cov+0.07,f1);
        vec3 sunC=mix(vec3(1.0),vec3(1.0,0.82,0.62),smoothstep(0.5,-0.05,sunDir.y));
        float thick=smoothstep(cov+0.06,cov+0.2,f1);
        vec3 cdark=cClSh*vec3(0.72,0.7,0.88);
        vec3 cc=mix(mix(cClSh,cdark,thick),cCl*sunC,lt*(1.0-0.55*thick));
        cc+=vec3(1.0,0.86,0.66)*0.30*pow(max(sd,0.0),4.0)*uSunV*edge;
        cc=mix(cc,cc*vec3(0.78,0.84,1.0),smoothstep(0.0,0.5,0.5-sunDir.y)*0.5);
        c=mix(c,cc,body*0.96*(1.0-uTexK));
        // mây ti mỏng kéo sợi + tia sáng toả từ mặt trời (god rays) xuyên qua mây
        float ci=vn(vec2(d.x/(h+0.35)*0.45+uT*0.0016,d.z/(h+0.35)*3.2))*vn(vec2(d.z/(h+0.35)*0.9+5.0,d.x/(h+0.35)*2.1));
        c=mix(c,mix(cHor,vec3(1.0),0.55)*sunC,smoothstep(0.2,0.42,ci)*0.4*smoothstep(0.12,0.4,h)*(1.0-body)*(1.0-uTexK));
        vec3 sdn=normalize(sunDir),sax=normalize(cross(vec3(0.0,1.0,0.0),sdn)),say=cross(sdn,sax);
        float ra=atan(dot(d,say),dot(d,sax));
        float rays=(0.5+0.5*sin(ra*13.0+vn(vec2(ra*5.0,uT*0.03))*5.0))*(0.6+0.4*vn(vec2(ra*21.0,3.0)));
        c+=vec3(1.0,0.8,0.55)*rays*pow(max(sd,0.0),3.0)*0.2*uSunV*up*smoothstep(-0.05,0.08,sunDir.y)*(1.0-body*0.7);
        float hz=smoothstep(0.0,0.05,h)*(1.0-smoothstep(0.05,0.3,h));
        c=mix(c,cHor,hz*body*0.25*(1.0-uTexK));
      }
      vec2 cp=d.xz/(max(h,0.0)+0.25)*1.4+vec2(uT*0.004,0.0);
      float n=vn(cp*vec2(1.2,2.4))*0.6+vn(cp*vec2(2.4,4.8))*0.4;
      float cl=step(cth,n)*smoothstep(0.02,0.12,h);
      vec2 cp2=d.xz/(max(h,0.0)+0.45)*0.9+vec2(-uT*0.0025,0.37);
      float n2=vn(cp2*vec2(1.0,2.0))*0.65+vn(cp2*vec2(2.2,4.4))*0.35;
      float cl2=step(cth+0.09,n2)*smoothstep(0.04,0.2,h)*0.85;
      float lit=step(cth,vn(cp*vec2(1.2,2.4)+vec2(0.05,0.18))*0.6+vn(cp*vec2(2.4,4.8)+vec2(0.1,0.3))*0.4);
      float rimL=pow(max(sd,0.0),5.0)*uSunV;
      if(uOut<0.5){c=mix(c,cClSh*1.05,cl2*(1.0-uTexK));
      c=mix(c,mix(cClSh,cCl,lit)+vec3(1.0,0.75,0.45)*0.22*rimL*lit,cl*0.92*(1.0-uTexK));}
      // sao băng
      float kk=fract(uT*0.045);if(kk<0.05&&uStar>0.2){float u=kk/0.05;vec2 pos=vec2(-0.5+u*0.7,0.78-u*0.33);vec2 dr=normalize(vec2(0.7,-0.33));vec2 r=d.xy-pos;float a=dot(r,dr),bb=abs(dot(r,vec2(-dr.y,dr.x)));
        c+=vec3(1.0,0.95,0.85)*exp(min(a,0.0)*28.0)*(1.0-smoothstep(0.0,0.004,bb))*step(a,0.004)*(1.0-u)*uStar*up*smoothstep(0.1,0.3,h);}
      gl_FragColor=vec4(c,1.0);
      #include <colorspace_fragment>
    }`}));
  sky.renderOrder=-1000;sky.frustumCulled=false;sky.scale.setScalar(700);scene.add(sky);scene.background=null;
  // ===== ẢNH BẦU TRỜI theo giờ =====  (assets/sky/sky_XX.jpg: bán cầu trên 2048×512; meta: màu trung bình chân trời/giữa/đỉnh + vị trí ngang vầng mặt trời)
  const SKYM={"03":{"h":[0.4955,0.4618,0.1879],"m":[0.2928,0.2589,0.1925],"z":[0.2902,0.1597,0.1125],"su":0.1763},"123":{"h":[0.3463,0.4113,0.4655],"m":[0.2492,0.3238,0.5314],"z":[0.5633,0.4214,0.4679],"su":0.9985},"12":{"h":[0.9388,0.2768,0.1153],"m":[0.4093,0.0732,0.1977],"z":[0.1983,0.0457,0.0968],"su":0.7979},"130":{"h":[0.4675,0.6068,0.6715],"m":[0.2695,0.3754,0.5819],"z":[0.4767,0.2421,0.2662],"su":0.106},"131":{"h":[0.4985,0.3439,0.2385],"m":[0.4028,0.4515,0.4337],"z":[0.3494,0.253,0.2971],"su":0.4136},"133":{"h":[0.5477,0.5139,0.3814],"m":[0.4084,0.421,0.4121],"z":[0.3747,0.2661,0.3266],"su":0.314},"23":{"h":[0.3211,0.3616,0.409],"m":[0.3683,0.3717,0.3879],"z":[0.3541,0.3298,0.3552],"su":null},"29":{"h":[0.3082,0.4848,0.3462],"m":[0.3211,0.333,0.3004],"z":[0.295,0.2252,0.223],"su":null},"40":{"h":[0.4917,0.4615,0.3537],"m":[0.4497,0.4374,0.3672],"z":[0.381,0.3294,0.3182],"su":0.1958},"66":{"h":[0.7473,0.4682,0.3404],"m":[0.4326,0.4377,0.4254],"z":[0.2386,0.1843,0.2343],"su":0.605},"87":{"h":[0.0948,0.1561,0.3007],"m":[0.0779,0.1406,0.3083],"z":[0.1347,0.1068,0.1803],"su":0.0708},"97":{"h":[0.7035,0.4221,0.3102],"m":[0.6985,0.4779,0.4071],"z":[0.3526,0.2353,0.3386],"su":0.0513}};
  // lịch trong ngày (giờ game) → ảnh trời; giữa 2 mốc chuyển mượt
  const SKYS=[[0,'87'],[4.7,'87'],[5.6,'97'],[6.5,'130'],[7.6,'40'],[9.4,'123'],[15.2,'123'],[16.3,'40'],[17.2,'29'],[17.9,'03'],[18.6,'131'],[19.25,'12'],[19.9,'66'],[20.7,'87'],[24,'87']];
  const skyTex=new Map(),skyLd=new THREE.TextureLoader();
  const getSky=k=>{let t=skyTex.get(k);if(t)return t.ok?t.tex:null;t={ok:false,tex:skyLd.load('assets/sky/sky_'+k+'.jpg?v=1',()=>{t.ok=true})};
    t.tex.colorSpace=THREE.SRGBColorSpace;t.tex.wrapS=THREE.RepeatWrapping;t.tex.wrapT=THREE.ClampToEdgeWrapping;t.tex.generateMipmaps=false;t.tex.minFilter=THREE.LinearFilter;t.tex.magFilter=THREE.LinearFilter;   // không mipmap: tránh đường nối ở mép ảnh
    skyTex.set(k,t);return null};
  const sunU=v=>Math.atan2(v.z,v.x)/(2*Math.PI)+0.5,rotOf=(k,su)=>SKYM[k].su==null?0:(SKYM[k].su-su);
  const _ra=new THREE.Vector3(),_rb=new THREE.Vector3();
  function skyStep(t,sunV,moonV,isDay,dt){
    t=((t%24)+24)%24;let i=0;while(i<SKYS.length-2&&SKYS[i+1][0]<=t)i++;
    const [t0,a]=SKYS[i],[t1,b]=SKYS[i+1];let m=t1>t0?(t-t0)/(t1-t0):0;m=m*m*(3-2*m);
    const wK=Math.min(1,Math.max(0,(WC.cov-0.55)/0.3)),cK=isDay?'23':'66';
    const A=getSky(a),B=getSky(b),C=wK>0.01?getSky(cK):null;
    // ảnh kế tiếp nạp trước
    getSky(SKYS[Math.min(SKYS.length-1,i+2)][1]);
    const ok=A&&B&&(wK<=0.01||C);const U=skyU;
    U.uTexK.value+=((ok?1:0)-U.uTexK.value)*Math.min(1,(dt||0.016)*2);if(!ok)return;
    U.tA.value=A;U.tB.value=B;U.tC.value=C||A;U.uMix.value=m;U.uW.value=wK;
    const su=sunU(isDay?sunV:moonV);U.uRA.value=rotOf(a,su);U.uRB.value=rotOf(b,su);U.uRC.value=rotOf(cK,su);
    const bl=(f)=>{_ra.fromArray(SKYM[a][f]).lerp(_rb.fromArray(SKYM[b][f]),m);if(wK>0.01)_ra.lerp(_rb.fromArray(SKYM[cK][f]),wK);return _ra};
    U.rH.value.copy(bl('h'));U.rM.value.copy(bl('m'));U.rZ.value.copy(bl('z'));
    U.uSkyDim.value=1-0.35*WC.rain;}
  window.__sky={U:skyU,SKYS,getSky};
  scene.fog=new THREE.Fog(SKY.hor,70,300);
  
  let grassCol=null;const grassTex=(()=>{let t=null;const gn=MC.gtex||'Plane001';(extG||env).traverse(o=>{if(o.isMesh&&o.name===gn&&o.material.map){t=o.material.map;grassCol=o.material.color.clone()}});return t})();
  const gTex=grassTex?grassTex.clone():null;if(gTex){gTex.channel=0;gTex.wrapS=gTex.wrapT=THREE.RepeatWrapping;gTex.repeat.set(110,110);gTex.needsUpdate=true}
  const ground=new THREE.Mesh(new THREE.CircleGeometry(650,48),new THREE.MeshStandardMaterial({map:gTex,color:(MC.gtex&&grassCol)||0xffffff,roughness:1,metalness:0}));ground.material.userData.ground=true;if(OUTD||extG){FU.uGTint.value.setRGB(0.68,0.8,0.52);ground.material.userData.desat=0.95}toonify(ground);
  ground.rotation.x=-Math.PI/2;ground.position.set(0,OUTD?A.L0-0.03:extG?MAPS.exterior.floorY-0.03:-0.3,0);ground.renderOrder=-999;ground.receiveShadow=OUTD||!!extG;scene.add(ground);
  if(OUTD){envMeshes.push(ground)}if(OUTD||extG)FU.uGMap.value=gTex;

  // ===== TỐI ƯU: gộp mesh tĩnh theo material (batching), tắt matrix auto, ngoại cảnh: bỏ bóng + cull theo khoảng cách =====
  const OPT={far:[],inst:[]};
  const maxAniso=renderer.capabilities.getMaxAnisotropy();
  const optStats={before:0,after:0};
  // ===== TƯỜNG KÍNH MỜ + DYNAMIC WALL FADE =====
  // Nhà là mặt cắt (mở phía camera). Thêm "tường kính" ở mặt trước (rất mờ, chỉ đủ biết có tường — viền + ánh phản xạ theo góc nhìn)
  // và cho tường bên phải (hiện có sẵn, nằm giữa camera và nội thất) mờ dần theo vị trí camera. Tường không chắn đường click, không đổi bóng đổ.
  const GLASS={front:null,top:null};
  // Shader kính dùng chung cho mặt trước (đứng) và mặt đỉnh (nằm): khung viền đục màu kem có vạch sáng, chân tường đặc (tầng trệt) + dầm sàn gác,
  // kính xanh nhạt rất mờ ở giữa có vệt phản chiếu mềm + viền sáng theo góc nhìn (Fresnel). Giữa gần như trong suốt để thấy rõ nội thất.
  const GLASS_VS='varying vec2 vUv;varying vec3 vW;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}';
  const GLASS_FS='uniform float uA,uMode;uniform vec3 uGlass,uFrame,uCam;uniform vec2 uSz;varying vec2 vUv;varying vec3 vW;'
    +'float band(float t,float c,float w){float d=(t-c)/w;return exp(-d*d);}'
    +'void main(){'
    +'vec2 m=vUv*uSz;float ed=min(min(m.x,uSz.x-m.x),min(m.y,uSz.y-m.y));'
    +'vec3 V=normalize(uCam-vW);'
    +'float frame=1.0-smoothstep(0.075,0.095,ed);'                         // khung viền ngoài đục
    +'float hl=(smoothstep(0.075,0.09,ed)*(1.0-smoothstep(0.095,0.12,ed)))*0.55;'   // vạch sáng ngay mép trong khung
    +'float glow=(1.0-smoothstep(0.1,0.55,ed))*0.035;'                       // kính hơi đục dần về phía viền
    +'float sill=0.0,sillHl=0.0,beam=0.0,beamHl=0.0,frost=0.0,fr,sheen;'
    +'if(uMode<0.5){float y=vW.y;'
    +'  sill=1.0-smoothstep(0.37,0.4,y);sillHl=smoothstep(0.4,0.415,y)*(1.0-smoothstep(0.43,0.45,y))*0.5;'   // chân tường đặc tầng trệt
    +'  frost=(1.0-smoothstep(0.4,1.4,y))*0.05;'
    +'  fr=pow(1.0-clamp(abs(V.z),0.0,1.0),2.0);'
    +'  sheen=band(vUv.x*uSz.x*0.55+vUv.y*uSz.y*0.35,3.4,0.9)*0.03+band(vUv.x*uSz.x*0.55+vUv.y*uSz.y*0.35,7.2,0.35)*0.02;'
    +'}else{fr=pow(1.0-clamp(abs(V.y),0.0,1.0),2.0);'
    +'  sheen=band(m.x*0.7+m.y*0.5,4.0,1.1)*0.022+band(m.x*0.7+m.y*0.5,8.3,0.4)*0.016;}'
    +'float sa=max(max(frame,max(sill,beam)),0.0);'                         // phần đục (khung, chân tường, dầm)
    +'float ag=0.012+0.03*fr+glow+frost+sheen+max(hl,max(sillHl,beamHl));' // phần kính
    +'float a=sa*0.94+ag*(1.0-sa*0.94);'
    +'vec3 col=mix(uGlass,uFrame,sa);col=mix(col,vec3(1.0),clamp(max(hl,max(sillHl,beamHl))*0.8+sheen*2.0,0.0,0.6)*(1.0-sa));'
    +'gl_FragColor=vec4(col,clamp(a,0.0,0.96)*uA);}';
  function glassMat(w,h,mode){return new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,vertexShader:GLASS_VS,fragmentShader:GLASS_FS,
    uniforms:{uA:{value:1},uMode:{value:mode},uSz:{value:new THREE.Vector2(w,h)},uGlass:{value:new THREE.Vector3(0.93,0.97,1)},uFrame:{value:new THREE.Vector3(1,0.95,0.86)},uCam:{value:new THREE.Vector3()}}})}
  function buildGlass(){
    const GC=MC.glass;if(!GC)return;
    if(GC.front){const F=GC.front,w=F.x1-F.x0,h=F.y1-F.y0,mat=glassMat(w,h,0);
      const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);m.position.set((F.x0+F.x1)/2,F.y0+h/2,F.z);m.renderOrder=4;m.castShadow=false;m.receiveShadow=false;m.frustumCulled=false;m.name='GLASS_FRONT';
      scene.add(m);GLASS.front={m,mat,F}}
    if(GC.top){const T=GC.top,w=T.x1-T.x0,d=T.z1-T.z0,mat=glassMat(w,d,1);
      const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),mat);m.rotation.x=-Math.PI/2;m.position.set((T.x0+T.x1)/2,T.y,(T.z0+T.z1)/2);m.renderOrder=4;m.castShadow=false;m.receiveShadow=false;m.frustumCulled=false;m.name='GLASS_TOP';
      scene.add(m);GLASS.top={m,mat,T}}
  }
  function glassStep(){
    const cam=camera.position,l=TU.uAmbS.value,lum=Math.min(1,Math.max(0.3,(l.x*0.3+l.y*0.59+l.z*0.11)*0.95));
    for(const G of [GLASS.front,GLASS.top]){if(!G)continue;const u=G.mat.uniforms;
      u.uGlass.value.set(0.52*lum,0.56*lum,0.6*lum);u.uFrame.value.set(1*lum,0.95*lum,0.86*lum);u.uCam.value.copy(cam)}
    if(GLASS.front){const d=cam.z-GLASS.front.F.z;GLASS.front.mat.uniforms.uA.value=d>0?Math.min(1,Math.max(0,(d-3)/6)):0}   // camera sát/vào trong tường thì tường biến mất hẳn
    if(GLASS.top){const d=cam.y-GLASS.top.T.y;GLASS.top.mat.uniforms.uA.value=Math.min(1,Math.max(0,(d-1)/4))}               // camera thấp hơn nóc thì nóc biến mất
  }
  buildGlass();
  // MC.seam: mép tường phòng giáp nhà chính bị hở (vỏ ngoài phía trước của chính phòng bị ẩn để nhìn vào) → khối tường lấp kín,
  // mặt trong cùng chất liệu tường phòng, các mặt ngoài cùng chất liệu tường nhà chính → nhìn như một mảng tường liền
  if(MC.seam&&extG)for(const S of [].concat(MC.seam)){let wallM=null,innM=null;
    extG.traverse(o=>{if(!wallM&&o.isMesh&&o.material&&/^Stylized\s+Concrete/i.test(o.material.name||''))wallM=o.material});
    env.traverse(o=>{if(!innM&&o.isMesh&&o.material&&o.material.name===S.inner)innM=o.material});
    if(wallM){const w=S.x1-S.x0,h=S.y1-S.y0,d=S.z1-S.z0,g=new THREE.BoxGeometry(w,h,d);
      const sides=['px','nx','py','ny','pz','nz'],mats=sides.map(f=>f===S.side&&innM?innM:wallM);
      const m=new THREE.Mesh(g,mats);m.position.set((S.x0+S.x1)/2,S.y0+h/2,(S.z0+S.z1)/2);m.name='SEAM_FILL';m.castShadow=true;m.receiveShadow=true;scene.add(m);m.updateMatrixWorld(true);
      STY.boxUV(m,2.6,2.6,false)}}
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
    const keep=new Set();doorList.forEach(d=>keep.add(d.node));if(CHAIR)keep.add(CHAIR);if(byName['Bed'])keep.add(byName['Bed']);tvScreenMeshes.forEach(m=>keep.add(m));
    envG.animations.forEach(c=>c.tracks.forEach(t=>{const pn=THREE.PropertyBinding.parseTrackName(t.name);const n=THREE.PropertyBinding.findNode(env,pn.nodeName);if(n)keep.add(n)}));
    const keepAnc=new Set();keep.forEach(n=>{for(let p=n.parent;p;p=p.parent)keepAnc.add(p)});   // cha của cánh cửa/vật animation (vd Door_Main là mesh có con = 2 cánh) cũng không được gộp, nếu không cả cây con bị gỡ khỏi cảnh
    const prot=o=>{if(keepAnc.has(o))return true;for(let p=o;p;p=p.parent)if(keep.has(p))return true;return false};
    const OUT=MC.out;
    const outsideRoot=o=>{for(let p=o;p&&p!==env;p=p.parent)if(OUT.test(p.name))return true;return false};
    // texture: anisotropy cao để cảnh ngoài cửa sổ không bị sạn/nhấp nháy
    const tex=new Set();env.traverse(o=>{if(!o.isMesh)return;(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{if(!m)return;['map','normalMap','emissiveMap','roughnessMap','metalnessMap','aoMap'].forEach(k=>{if(m[k])tex.add(m[k])})})});
    tex.forEach(t=>{t.anisotropy=maxAniso;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.needsUpdate=true});
    console.log('[sty] map: '+api.stylize(env));
    // chống z-fighting: tấm mỏng nằm áp lên mặt khác (thảm, tranh, bảng ghim, khung, tấm lót…) → vật liệu riêng có polygonOffset
    // (kéo về phía camera trong bộ đệm sâu, không dời hình). Tấm chồng lên tấm khác (thảm trong trên thảm ngoài) được đẩy mạnh thêm 1 bậc.
    {const T=[],bb=new THREE.Box3(),sz=new THREE.Vector3();
     env.traverse(o=>{if(!o.isMesh||!o.visible||o.isSkinnedMesh||o.isInstancedMesh||!o.material||Array.isArray(o.material)||o.userData.glass||outsideRoot(o))return;
       bb.setFromObject(o);bb.getSize(sz);const a=[sz.x,sz.y,sz.z],ax=a.indexOf(Math.min(...a)),o2=a.filter((_,i)=>i!==ax);
       if(a[ax]>0.035||Math.min(...o2)<0.06)return;const area=o2[0]*o2[1];if(area>14)return;   // sàn/tường lớn = mặt nền, không đẩy
       T.push({o,ax,b:bb.clone(),area})});
     const mc=new Map();let nz=0;
     T.forEach(t=>{const c=t.b.min.getComponent(t.ax)+t.b.max.getComponent(t.ax);let L=1;
       T.forEach(u=>{if(u===t||u.ax!==t.ax||u.area<=t.area)return;const d=Math.abs((u.b.min.getComponent(u.ax)+u.b.max.getComponent(u.ax))-c)/2;if(d>0.03)return;
         const ex=t.b.clone().expandByScalar(0.01);if(u.b.intersectsBox(ex))L++});
       L=Math.min(L,4);const m=t.o.material,k=m.uuid+'|'+L;let mm=mc.get(k);
       if(!mm){mm=m.clone();mm.polygonOffset=true;mm.polygonOffsetFactor=-1.5*L;mm.polygonOffsetUnits=-4*L;mm.userData={...m.userData};if(m.onBeforeCompile)mm.onBeforeCompile=m.onBeforeCompile;if(m.customProgramCacheKey)mm.customProgramCacheKey=m.customProgramCacheKey;mc.set(k,mm)}
       t.o.material=mm;nz++});
     console.log('z-fight: '+nz+' tấm mỏng được đẩy lên')}
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
  // GPU rời (NVIDIA / AMD Radeon RX / Intel Arc / Apple M) → cho phép mức 'ultra' khi đang dư sức (độ phân giải đã lên trần); có trễ để không nhảy qua lại
  const DISCRETE=(()=>{try{const g=renderer.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return !!e&&/NVIDIA|GeForce|RTX|GTX|Radeon (RX|Pro)|Arc|Apple M/i.test(g.getParameter(e.UNMASKED_RENDERER_WEBGL))}catch(e){return false}})();
  function autoLvl(){return curPR<0.8?'low':curPR<1.1?'medium':(DISCRETE&&curPR>=(curLvl==='ultra'?1.05:1.2))?'ultra':'high'}
  const lvlOf=()=>TP.quality==='auto'?autoLvl():TP.quality;
  let curIn='';
  function applyIndoor(){const l=lvlOf(),w=l==='low'?'low':l==='ultra'?'indoorUltra':'indoor';if(w!==curIn){curIn=w;EXTV.setLevel(w)}}
  let curLvl='';
  function applyLevel(){const q=TP.quality,lvl=q==='auto'?autoLvl():q;if(lvl===curLvl||!LEVELS[lvl])return;curLvl=lvl;EXT.setLevel(lvl);setRainCount(LEVELS[lvl].rain);
    const ms={low:1536,medium:2048,high:2560,ultra:3072}[lvl],hs={low:13,medium:15,high:17,ultra:19}[lvl],sh=sun.shadow;
    if(sh.mapSize.x!==ms){sh.mapSize.set(ms,ms);if(sh.map){sh.map.dispose();sh.map=null}}Object.assign(sh.camera,{left:-hs,right:hs,top:hs*0.9,bottom:-hs*0.9});sh.camera.updateProjectionMatrix()}
  function updCull(){if(EXT){applyLevel();EXT.update(controls.target,camera.position,scene.fog.color)}else updInst();if(EXTV){if(!EXT)applyIndoor();EXTV.update(controls.target,camera.position,scene.fog.color)}const cx=controls.target;OPT.far.forEach(o=>{if(!o.userData.c){const b=new THREE.Box3().setFromObject(o);o.userData.c=b.getCenter(new THREE.Vector3());o.userData.r=b.getSize(new THREE.Vector3()).length()/2}
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
  // "look" điện ảnh theo thời tiết (chỉ đổi uniform của pass grade sẵn có + màu sương → không tốn thêm pass/hiệu năng)
  // gT: lệch nhiệt màu · gC: hệ số tương phản · gV: + vignette · gL: nâng vùng tối (r,g,b — mây/mù = đen bệt thành xám xanh như phim) · gG: hạt phim · fT/fA: ám màu sương + lượng
  const WLOOK={
    clear:{gT:0,gC:1,gV:0,gL:[0,0,0],gG:0.006,fT:'#ffffff',fA:0},
    cloudy:{gT:-.02,gC:.97,gV:.03,gL:[.010,.012,.018],gG:0.007,fT:'#c4ccd8',fA:.18},
    overcast:{gT:-.045,gC:.94,gV:.06,gL:[.016,.019,.026],gG:0.008,fT:'#aab4c2',fA:.32},
    drizzle:{gT:-.04,gC:1,gV:.06,gL:[.010,.017,.024],gG:0.009,fT:'#a6b4c4',fA:.3},
    'light rain':{gT:-.06,gC:1.02,gV:.09,gL:[.008,.017,.026],gG:0.010,fT:'#97a8bc',fA:.4},
    rain:{gT:-.08,gC:1.05,gV:.12,gL:[.006,.016,.027],gG:0.011,fT:'#8798ae',fA:.48},
    'heavy rain':{gT:-.1,gC:1.08,gV:.16,gL:[.004,.013,.027],gG:0.013,fT:'#71839a',fA:.56},
    storm:{gT:-.12,gC:1.1,gV:.2,gL:[.003,.010,.026],gG:0.015,fT:'#5f6f88',fA:.6},
    snow:{gT:-.06,gC:.95,gV:.04,gL:[.010,.012,.017],gG:0.007,fT:'#e2e8f2',fA:.3},
    blizzard:{gT:-.09,gC:.9,gV:.08,gL:[.018,.021,.028],gG:0.010,fT:'#d4dce8',fA:.62},
    fog:{gT:-.01,gC:.9,gV:.1,gL:[.030,.031,.034],gG:0.008,fT:'#d6d2cc',fA:.12},
    windy:{gT:.01,gC:1.03,gV:.03,gL:[0,0,0],gG:0.007,fT:'#ffffff',fA:0}};
  const WL={gT:0,gC:1,gV:0,gL:new THREE.Vector3(),gG:.012,fT:new THREE.Color('#ffffff'),fA:0},_wlL=new THREE.Vector3(),_wlC=new THREE.Color();
  const WC=Object.assign({int:0},WEATHER.clear);   // giá trị hiện tại (mượt dần)
  const grayOf=c=>{const l=c.r*.299+c.g*.587+c.b*.114;return new THREE.Color(l,l,l)};
  const sunPos=new THREE.Vector3(),moonPos=new THREE.Vector3();
  function sunPath(t,lo,hi,elMax){const u=(((t-lo)%24+24)%24)/((hi-lo+24)%24||24);const el=Math.sin(Math.PI*Math.min(Math.max(u,0),1))*elMax*Math.PI/180;const az=(110-220*u)*Math.PI/180;
    return {u,v:new THREE.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)),el}}

  // post-fx
  const GradeShader={uniforms:{tDiffuse:{value:null},uExpo:{value:1},uCon:{value:1},uSat:{value:1},uTemp:{value:0},uVig:{value:.3},uTime:{value:0},uTintAmt:{value:.3},uFlash:{value:0},uLift:{value:new THREE.Vector3()},uGrain:{value:0},uTintSh:{value:new THREE.Vector3(.4,.35,.6)},uTintHi:{value:new THREE.Vector3(1,.7,.45)}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`uniform sampler2D tDiffuse;uniform float uExpo,uCon,uSat,uTemp,uVig,uTime,uTintAmt,uFlash,uGrain;uniform vec3 uTintSh,uTintHi,uLift;varying vec2 vUv;
    float hs(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;
      c*=uExpo*(1.0+uFlash*vec3(0.8,0.92,1.3));   // chớp: ánh xanh lạnh
      c*=vec3(1.0+uTemp,1.0+uTemp*0.25,1.0-uTemp);
      float l=dot(c,vec3(.2126,.7152,.0722));
      c=mix(vec3(l),c,uSat);
      c=max((c-0.18)*uCon+0.18,0.0);
      l=dot(c,vec3(.2126,.7152,.0722));
      float sw=1.0-smoothstep(0.02,0.4,l),hw=smoothstep(0.3,1.3,l);
      c*=mix(vec3(1.0),uTintSh*1.8,uTintAmt*sw);
      c*=mix(vec3(1.0),uTintHi*1.4,uTintAmt*hw);
      vec2 q=vUv-0.5;c*=1.0-uVig*smoothstep(0.25,0.78,length(q*vec2(1.25,1.0)));
      l=dot(c,vec3(.2126,.7152,.0722));c+=uLift*(1.0-smoothstep(0.0,0.55,l));   // nâng vùng tối theo thời tiết (mây/mưa/tuyết/sương)
      c+=(hs(gl_FragCoord.xy+fract(uTime*7.13)*517.0)-0.5)*uGrain*(1.0-0.6*l);   // hạt phim nhẹ (đổi theo khung), bớt ở vùng sáng
      gl_FragColor=vec4(max(c,0.0),1.0);}`};
  const SANITIZE={uniforms:{tDiffuse:{value:null}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec3 r=texture2D(tDiffuse,vUv).rgb;gl_FragColor=vec4(r.r>=0.0?min(r.r,16.0):0.0,r.g>=0.0?min(r.g,16.0):0.0,r.b>=0.0?min(r.b,16.0):0.0,1.0);}'};
  let curPR=Math.min(devicePixelRatio,1.5),maxPR=curPR,composer=null,PRKEY='vyPR:'+TP.quality,bloomP=null,fxaaP=null,GU=GradeShader.uniforms,postLevel=0;
  try{postLevel=+(localStorage.getItem('vyPostLvl')||0)}catch(e){}
  // nhớ độ phân giải đã ổn định của máy này ở lần chơi trước → vào là dùng luôn, không phải chờ bộ tự co dò lại từ đầu (10–30 s giật)
  try{const sv=parseFloat(localStorage.getItem(PRKEY));if(sv>=0.5&&sv<curPR){curPR=sv;renderer.setPixelRatio(sv);renderer.setSize(innerWidth,innerHeight)}}catch(e){}
  function buildComposer(){
    if(composer){try{composer.renderTarget1.dispose();composer.renderTarget2.dispose()}catch(e){}}
    const type=postLevel===0?THREE.HalfFloatType:THREE.UnsignedByteType,pr=Math.min(curPR,1.25);
    const rt=new THREE.WebGLRenderTarget(Math.max(1,Math.floor(innerWidth*pr)),Math.max(1,Math.floor(innerHeight*pr)),{type,samples:0});
    composer=new EffectComposer(renderer,rt);composer.setPixelRatio(pr);composer.setSize(innerWidth,innerHeight);
    composer.addPass(new RenderPass(scene,camera));composer.addPass(new ShaderPass(SANITIZE));
    bloomP=new UnrealBloomPass(new THREE.Vector2(innerWidth*pr/4,innerHeight*pr/4),0.35,0.6,0.82);composer.addPass(bloomP);
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
  // cửa kính: Win_*_Glass (phòng khách) hoặc mesh kính (vật liệu *glass*) nằm trong node Win_* (phòng Vy/Bin: khung + kính liền 1 node)
  const isWinGlass=o=>{if(/^Win_\w+_Glass$/.test(o.name))return true;if(!o.isMesh||![].concat(o.material).some(m=>m&&/(^|_)glass$/i.test(m.name||'')))return false;for(let p=o;p&&p!==env;p=p.parent)if(/^Win_/.test(p.name))return true;return false};
  env.traverse(o=>{if(!o.isMesh||!isWinGlass(o))return;
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
  // MƯA kiểu Foliage Test: LineSegments (mỗi giọt 1 vệt nghiêng theo gió), rơi theo chu kỳ trong hộp 30×16×30 bám theo tâm nhìn (nên luôn quanh người chơi).
  // Số giọt tuỳ mức đồ họa (setRainCount); độ dày mưa = tỉ lệ giọt giữ lại (aRnd < uAmt); giọt trong khối nhà (nhà cắt mái) bị bỏ.
  const RN=6000;
  const rseed=new Float32Array(RN*2*3),rEnd=new Float32Array(RN*2),rRnd=new Float32Array(RN*2);
  for(let i=0;i<RN;i++){const a=Math.random(),b=Math.random(),c=Math.random(),r=Math.random();for(let k=0;k<2;k++){const o=(i*2+k)*3;rseed[o]=a;rseed[o+1]=b;rseed[o+2]=c;rEnd[i*2+k]=k;rRnd[i*2+k]=r}}
  const rainG=new THREE.BufferGeometry();rainG.setAttribute('position',new THREE.BufferAttribute(new Float32Array(RN*2*3),3));rainG.setAttribute('seed',new THREE.BufferAttribute(rseed,3));rainG.setAttribute('aEnd',new THREE.BufferAttribute(rEnd,1));rainG.setAttribute('aRnd',new THREE.BufferAttribute(rRnd,1));
  const PRE=`uniform vec3 uC;uniform float uT,uAmt,uWind;`;
  const HOUSE=OUTD?'bool inHouse(vec3 p){return p.x>-10.8&&p.x<20.8&&p.z>-10.8&&p.z<1.6&&p.y<10.5;}':'bool inHouse(vec3 p){return p.x>-0.2&&p.x<10.2&&p.z>-8.2&&p.z<0.8&&p.y<6.3;}';
  const rainU={uT:beamU.uT,uWind:{value:0},uInt:{value:1},uPx:{value:1},uRes:{value:new THREE.Vector2(1,1)},uC:{value:new THREE.Vector3()},uAmt:{value:0},uCol:{value:new THREE.Color('#d6e4f5')},uFloor:{value:A.L0},uWindDir:FU.uWindDir};
  const rainM=new THREE.ShaderMaterial({uniforms:rainU,transparent:true,depthWrite:false,fog:false,
    vertexShader:PRE+HOUSE+`uniform float uInt,uFloor;uniform vec2 uWindDir;attribute vec3 seed;attribute float aEnd;attribute float aRnd;varying float vA;void main(){
      vec3 p;p.x=uC.x-15.0+mod(seed.x*30.0-(uC.x-15.0),30.0);p.z=uC.z-15.0+mod(seed.z*30.0-(uC.z-15.0),30.0);
      p.y=mod(seed.y*16.0-uT*(16.0+aRnd*6.0)*(0.9+0.2*uInt),16.0);
      p.xz+=uWindDir*uWind*0.12*p.y;
      p+=aEnd*vec3(uWindDir.x*uWind*0.05,0.55+0.25*uInt,uWindDir.y*uWind*0.05);
      p.y+=uFloor+0.1;
      float keep=(aRnd<uAmt?1.0:0.0);if(inHouse(p))keep=0.0;
      vec4 mv=viewMatrix*vec4(p,1.0);float dz=-mv.z;
      vA=keep*(1.0-0.7*aEnd)*smoothstep(0.6,2.2,dz)*(1.0-0.55*smoothstep(9.0,16.0,dz));   // giọt sát ống kính mờ đi (không thành vệt thô), xa nhạt dần → có chiều sâu
      gl_Position=keep>0.5?projectionMatrix*mv:vec4(2.0,2.0,2.0,1.0);}`,
    fragmentShader:'uniform vec3 uCol;varying float vA;void main(){if(vA<0.01)discard;gl_FragColor=vec4(uCol,vA*0.62);}'});
  const rain=new THREE.LineSegments(rainG,rainM);rain.frustumCulled=false;rain.raycast=()=>{};rain.visible=false;rain.renderOrder=7;scene.add(rain);
  const setRainCount=n=>rainG.setDrawRange(0,Math.min(RN,n)*2);setRainCount(4200);
  // gợn nước trên mặt đất (ripples)
  const RP=520;const pseed=new Float32Array(RP*4*3),pcor=new Float32Array(RP*4*2),pidx=[];
  for(let i=0;i<RP;i++){const a=Math.random(),b=Math.random(),c=Math.random();for(let k=0;k<4;k++){const o=(i*4+k)*3;pseed[o]=a;pseed[o+1]=b;pseed[o+2]=c;pcor[(i*4+k)*2]=(k===0||k===3)?-1:1;pcor[(i*4+k)*2+1]=k<2?-1:1}const q=i*4;pidx.push(q,q+1,q+2,q,q+2,q+3)}
  const ripG=new THREE.BufferGeometry();ripG.setAttribute('position',new THREE.BufferAttribute(new Float32Array(RP*4*3),3));ripG.setAttribute('seed',new THREE.BufferAttribute(pseed,3));ripG.setAttribute('corner',new THREE.BufferAttribute(pcor,2));ripG.setIndex(pidx);
  const ripM=new THREE.ShaderMaterial({uniforms:{uT:beamU.uT,uC:rainU.uC,uAmt:{value:0},uCol:rainU.uCol},transparent:true,depthWrite:false,fog:false,side:THREE.DoubleSide,
    vertexShader:`uniform vec3 uC;uniform float uT,uAmt;attribute vec3 seed;attribute vec2 corner;varying vec2 vC;varying float vA;void main(){
      vec3 p=vec3(uC.x-16.0+mod(seed.x*32.0-(uC.x-16.0),32.0),-0.2,uC.z-16.0+mod(seed.z*32.0-(uC.z-16.0),32.0));
      float ph=fract(uT*(0.8+seed.y*0.5)+seed.y*7.0);float keep=step(fract(seed.x*53.1+seed.z*17.7),uAmt);
      bool slab=${OUTD?'p.x>-10.8&&p.x<20.8&&p.z>-10.8&&p.z<1.6':'p.x>-0.5&&p.x<16.2&&p.z>-8.6&&p.z<1.4'};if(slab)keep=0.0;
      p+=vec3(corner.x,0.0,corner.y)*(0.05+ph*0.3);vC=corner;vA=(1.0-ph)*(1.0-ph)*keep*0.4;
      gl_Position=keep>0.5?projectionMatrix*viewMatrix*vec4(p,1.0):vec4(2.0,2.0,2.0,1.0);}`,
    fragmentShader:'uniform vec3 uCol;varying vec2 vC;varying float vA;void main(){float r=length(vC);float ring=smoothstep(0.62,0.82,r)*(1.0-smoothstep(0.86,1.0,r));float ring2=smoothstep(0.3,0.4,r)*(1.0-smoothstep(0.44,0.54,r))*0.55;gl_FragColor=vec4(mix(uCol,vec3(1.0),0.35),(ring+ring2)*vA);}'});
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
      const src=ctx.createBufferSource();src.buffer=buf;src.loop=true;const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=650;const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=3800;
      const g=ctx.createGain();g.gain.value=0;src.connect(hp);hp.connect(lp);lp.connect(g);g.connect(ctx.destination);src.start();RA.ctx=ctx;RA.g=g;RA.buf=buf}catch(e){}}
  addEventListener('pointerdown',initRainAudio,{once:true});addEventListener('keydown',initRainAudio,{once:true});
  function thunder(){if(!RA.ctx)return;const ctx=RA.ctx,s=ctx.createBufferSource();s.buffer=RA.buf;const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=180;const g=ctx.createGain();
    const t0=ctx.currentTime+0.25+Math.random()*0.9;g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(0.9,t0+0.08);g.gain.exponentialRampToValueAtTime(0.001,t0+2.6);s.connect(lp);lp.connect(g);g.connect(ctx.destination);s.start(t0);s.stop(t0+2.8)}

  let flash=0,flash2=-1,flashT=5,tgtW=WEATHER.clear;
  const sunLight=window.__L.sun,hemiL=window.__L.hemi,ambL=window.__L.amb;
  const _tc=new THREE.Vector3(5,1.5,-4);
  let sfxW=null,sfxAmbT=0;
  function envApply(dt){
    const t=TP.time;const k=keyAt(t);
    tgtW=WEATHER[TP.weather]||WEATHER.clear;
    const f=dt>0?1-Math.exp(-dt*1.2):1;
    for(const q of ['cov','dim','des','fn','ff','rain','snow','wind','wet','cs','int'])WC[q]+=((tgtW[q]||0)-WC[q])*(dt>0?f:1);
    {const L=WLOOK[TP.weather]||WLOOK.clear,ff=dt>0?f:1;WL.gT+=(L.gT-WL.gT)*ff;WL.gC+=(L.gC-WL.gC)*ff;WL.gV+=(L.gV-WL.gV)*ff;WL.gG+=(L.gG-WL.gG)*ff;WL.fA+=(L.fA-WL.fA)*ff;
     WL.gL.lerp(_wlL.set(L.gL[0],L.gL[1],L.gL[2]),ff);WL.fT.lerp(_wlC.set(L.fT),ff)}
    // mặt trời / mặt trăng
    const S=sunPath(t,5.5,19.5,62),M=sunPath(t-19.5+5.5,5.5,15.5,52);   // trăng: 19.5→5.5
    const isDay=((t-5.5+24)%24)<14;const act=isDay?S:M;
    sunPos.copy(S.v);moonPos.copy(M.v);
    const hAbove=Math.sin(Math.max(act.el,0));const fade=Math.min(1,hAbove/0.12);
    if(OUTD){const g=2;_tc.set(Math.round(controls.target.x/g)*g,A.L0+1,Math.round(controls.target.z/g)*g)}
    sunLight.position.copy(_tc).addScaledVector(act.v,32);sunLight.target.position.copy(_tc);
    sunLight.color.copy(k.sun);sunLight.intensity=Math.max(0.05,2.2*k.sunI*WC.dim*fade);
    hemiL.color.copy(k.ambS);hemiL.groundColor.copy(k.ambG);hemiL.intensity=0.9;
    // desat theo thời tiết
    const des=c=>c.clone().lerp(grayOf(c),WC.des);
    const sunC=des(k.sun),aS=des(k.ambS),aG=des(k.ambG);const sI=Math.min(1.15,(0.35+0.65*k.sunI)*(0.4+0.6*WC.dim)*Math.max(fade,0.2))*(1+flash*1.2),aI=0.95+flash*0.5;
    const raw=(c,v)=>{const w=c.clone().convertLinearToSRGB();v.value.set(w.r,w.g,w.b)};raw(sunC,TU.uSunC);TU.uSunC.value.multiplyScalar(sI);raw(aS,TU.uAmbS);TU.uAmbS.value.multiplyScalar(aI);raw(aG,TU.uAmbG);TU.uAmbG.value.multiplyScalar(aI);
    {const fl=dt>0?Math.min(1,dt*5):1;LI.ka+=((LI.a?1:0)-LI.ka)*fl;LI.kb+=((LI.b?1:0)-LI.kb)*fl}   // bật/tắt đèn nhà: mờ dần ~0.4s
    const lamp=Math.max(k.lamp,WC.dim<0.5?0.3:0)*0.95*LI.ka;TU.uLampC.value.set(1.0*lamp,0.62*lamp,0.3*lamp);TU.uLK.value=(0.7+0.5*Math.min(1,Math.max(k.lamp,WC.dim<0.5?0.3:0)))*LI.kb;
    TU.uLOff.value=(1-LI.ka)*(0.35+0.65*(1-LI.kb))*(0.55+0.45*(1-k.day));   // tắt ánh chung → tối bớt; tắt thêm đèn có bóng → tối hẳn
    if(LI.mats===null){LI.mats=[];if(!OUTD)scene.traverse(o=>{if(!o.isMesh)return;[].concat(o.material).forEach(m=>{if(m&&/^(CH_lampshade|CH_bulb|FWS_lamp_glow)$/.test(m.name)&&!LI.mats.some(q=>q.m===m))LI.mats.push({m,e:m.emissiveIntensity})})})}
    LI.mats.forEach(q=>{q.m.emissiveIntensity=q.e*(0.06+0.94*LI.kb)});
    // sky
    skyU.cTop.value.copy(des(k.top));skyU.cMid.value.copy(des(k.mid));skyU.cPink.value.copy(des(k.pink));skyU.cHor.value.copy(des(k.hor));
    const dayB=0.25+0.75*k.day;skyU.cCl.value.copy(des(k.hor).lerp(new THREE.Color('#ffffff'),0.45*k.day)).multiplyScalar(dayB*(1-0.25*WC.des));
    skyU.cClSh.value.copy(des(k.mid).lerp(k.pink,0.5)).multiplyScalar(dayB*0.95*(1-0.25*WC.des));
    skyU.cth.value=WC.cov;skyU.uStar.value=(1-k.day)*(1-Math.min(1,WC.cov>0.5?0:(0.6-WC.cov)*3));
    skyU.uSunV.value=(isDay?fade:0)*(1-Math.min(1,(0.6-WC.cov)*3.5));
    skyU.sunDir.value.copy(S.v);skyU.moonDir.value.copy(M.v);skyStep(t,S.v,M.v,isDay,dt);
    // sương
    scene.fog.color.copy(des(k.fog));
    if(WL.fA>0.001){const fl=scene.fog.color.r*.299+scene.fog.color.g*.587+scene.fog.color.b*.114,tl=WL.fT.r*.299+WL.fT.g*.587+WL.fT.b*.114;_wlC.copy(WL.fT).multiplyScalar(fl/Math.max(tl,1e-3));scene.fog.color.lerp(_wlC,WL.fA)}   // ám màu sương theo thời tiết, giữ độ sáng theo giờscene.fog.near=WC.fn*(OUTD?0.8:1);scene.fog.far=WC.ff*(OUTD?0.55:1);
    // grade
    GU.uExpo.value=TP.expo*(1-(1-WC.dim)*0.3);GU.uCon.value=TP.con*(OUTD?0.97:1);GU.uSat.value=TP.sat*(1-WC.des*0.35)*(OUTD?0.9:1);GU.uCon.value*=WL.gC;GU.uTemp.value=TP.temp+k.gt+WL.gT;GU.uVig.value=TP.vig+WL.gV;GU.uLift.value.copy(WL.gL).multiplyScalar(0.5+0.5*k.day);GU.uGrain.value=WL.gG;GU.uTintAmt.value=TP.tintAmt;GU.uFlash.value=flash*0.6;
    const hs=h=>{const v=hexV(h);return new THREE.Vector3(v.x,v.y,v.z)};GU.uTintSh.value.copy(hexV(TP.tintSh));GU.uTintHi.value.copy(hexV(TP.tintHi));
    bloomP.strength=TP.bloom*(1+0.8*(1-k.day));bloomP.threshold=TP.bloomTh;bloomP.radius=0.55;
    // light shafts
    const dirL=act.v,ltC=des(k.sun);beamU.uCol.value.copy(ltC);beamU.uDir.value.copy(dirL).multiplyScalar(-1);
    let any=0;for(const b of beams){const fct=Math.max(0,b.nrm.dot(dirL)-0.12);const I=TP.rays*fct*0.42*k.sunI*WC.dim*fade*(1-WC.des*0.4);b.mat.uniforms.uI.value=I;b.m.visible=I>0.01;any=Math.max(any,I)}
    motesM.uniforms.uA.value=OUTD?0:Math.min(1,any*1.2)*0.9*TP.motes;motes.visible=motesM.uniforms.uA.value>0.01;
    // thời tiết hạt
    rainU.uAmt.value=Math.min(1,WC.rain);rainU.uInt.value=Math.max(0.4,WC.int);ripM.uniforms.uAmt.value=Math.min(1,WC.rain);rain.visible=WC.rain>0.03;ripples.visible=rain.visible;rainU.uCol.value.setRGB(0.55+0.4*k.day+0.5*flash,0.62+0.35*k.day+0.55*flash,0.78+0.2*k.day+0.6*flash);snowU.uAmt.value=Math.min(1,WC.snow);snow.visible=WC.snow>0.03;
    garden.visible=!!TP.garden;if(gardenAnim.lamp)gardenAnim.lamp.emissiveIntensity=0.25+2.4*Math.max(k.lamp,WC.dim<0.5?0.3:0);TU.uWindA.value=WC.wind;TU.uWet.value=WC.wet;TU.uCloudSh.value=WC.cs*(0.2+0.8*k.day);rainU.uWind.value=WC.wind;updGlass(k.day,WC.dim,WC.des);
    if(RA.g)RA.g.gain.value=Math.min(1,WC.rain)*0.1*(0.4+0.35*WC.int);
    // âm môi trường (gió, chim ban ngày, dế ban đêm) + tiếng báo khi thời tiết đổi
    if(TP.weather!==sfxW){if(sfxW!=null&&dt>0)SFX.play('weather');sfxW=TP.weather}
    sfxAmbT-=dt;if(sfxAmbT<=0){sfxAmbT=0.3;SFX.ambience({wind:WC.wind,rain:WC.rain,snow:WC.snow>0.3,fog:TP.weather==='fog',day:t>6.3&&t<18.2,night:t>19.5||t<5,clear:WC.cov>0.45})}
  }
  window.__envApply=envApply;
  function envStep(dt){
    if(TP.auto){TP.time=(TP.time+dt*TP.speed)%24;if(window.__syncTime)window.__syncTime()}
    if(WEATHER[TP.weather]&&WEATHER[TP.weather].flash){flashT-=dt;if(flashT<=0){flash=1;flash2=Math.random()<0.7?0.09+Math.random()*0.12:-1;flashT=4+Math.random()*7;thunder()}}
    if(flash2>0){flash2-=dt;if(flash2<=0){flash=Math.max(flash,0.6+Math.random()*0.5);flash2=-1}}   // chớp đôi (nháy 2 lần như sét thật)
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
  function setPR(p){curPR=p;try{localStorage.setItem(PRKEY,String(p))}catch(e){}renderer.setPixelRatio(p);renderer.setSize(innerWidth,innerHeight);const pr=Math.min(p,1.25);composer.setPixelRatio(pr);composer.setSize(innerWidth,innerHeight);fxaaP.material.uniforms['resolution'].value.set(1/(innerWidth*pr),1/(innerHeight*pr))}
  // Tự co độ phân giải render để giữ ≥30 fps. 'Tự động': mục tiêu ~45fps; các preset cố định (Điện ảnh/Đẹp…): giữ trần độ phân giải của preset nhưng vẫn tự hạ khi máy tụt dưới ~30fps (rồi nâng lại khi thoải mái).
  function adaptRes(dtr){if(TEST||throttled)return;ftEma+=(Math.min(dtr,0.1)-ftEma)*0.08;if(--adaptCool>0)return;
    const q=TP.quality,auto=q==='auto',cap0=auto?Math.min(maxPR,1.25):Math.min(maxPR,{low:0.75,medium:1,high:maxPR}[q]||maxPR),cap=media?Math.min(cap0,0.85):cap0,bad=auto?0.0235:0.033,good=auto?0.0185:0.026,floor=auto?0.6:0.7;
    if(ftEma>bad){badWin++;goodWin=0}else if(ftEma<good){goodWin++;badWin=0}else{badWin=0;goodWin=0}
    if(curPR>cap+0.01){pendPR=cap;adaptCool=60;return}
    if(badWin>=20&&curPR>floor){pendPR=Math.max(floor,+(curPR-0.15).toFixed(2));badWin=0;adaptCool=90}
    else if(auto&&badWin>=60&&curPR<=floor&&TP.post){TP.post=false;applyToon(false);toast('Máy chậm: tắt post-fx để mượt hơn');badWin=0}
    else if(goodWin>=240&&curPR<cap){pendPR=Math.min(cap,+(curPR+0.1).toFixed(2));goodWin=0;adaptCool=180}}
  const TEST=/[?&]test/.test(location.search);
  function tick(dt,doRender=true){
    clockG+=dt;renderer.shadowMap.needsUpdate=((tickN&1)===0)||doRender===false;
    if(pendPR!=null){setPR(pendPR);pendPR=null}
    try{
    const inp=readInput();
    local.logic(dt,inp);if(remote){if(rinp.mag&&clockG-rinpT>1.6)rinp.mag=0;remote.logic(dt,rinp);rinp.interact=false;rinp.air=null}
    separate();
    local.finish(dt);if(remote)remote.finish(dt);envMixer.update(dt);updDoors();updHalo(dt);
    if(api.sendInput)api.sendInput(inp);if(api.onTick)api.onTick(dt);
    if(CINE.active)CINE.step(dt);else{
    {const f=local;tmp.set(f.char.position.x,f.char.position.y+0.7,f.char.position.z);
      tmp2.copy(tmp).sub(controls.target).multiplyScalar(Math.min(1,dt*3));controls.target.add(tmp2);camera.position.add(tmp2);}
    controls.update();}
    if(OUTD||extG){const lp=local.char.position;FU.uPl.value[0].set(lp.x,lp.y,lp.z);if(remote&&remote.char.visible){const rp=remote.char.position;FU.uPl.value[1].set(rp.x,rp.y,rp.z)}else FU.uPl.value[1].set(1e5,0,1e5);
      FU.uOcc.value.set(camera.position.x,camera.position.y,camera.position.z,1);FU.uOccPl.value.set(lp.x,lp.y+0.9,lp.z)}
    {const t=controls.target,cb=OUTD?MC.camBox:[0.5,9.5,-7.6,0.3],cx=clamp(t.x,cb[0],cb[1]),cy=clamp(t.y,OUTD?A.L0:0.3,OUTD?A.L0+4:5.5),cz=clamp(t.z,cb[2],cb[3]);
      if(!window.__free&&!CINE.active&&(cx!==t.x||cy!==t.y||cz!==t.z)){tmp.set(cx-t.x,cy-t.y,cz-t.z);t.add(tmp);camera.position.add(tmp);}}
    sky.position.copy(camera.position);envStep(dt);glassStep();if(TVS)TVS.step(dt);
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
      adaptRes(rawDt);if(pinsUpd)pinsUpd();}
  }
  // Quay lại tab sau một lúc ở tab khác: vài khung đầu luôn khựng (trình duyệt nạp lại tài nguyên GPU đã bị thu hồi, GC, kênh mạng nối lại…).
  // Trước đây: (1) bước bắt kịp thời gian chạy dồn 0.25s mô phỏng ngay khung đầu, (2) bộ tự co độ phân giải coi các khung khựng đó là "máy yếu"
  // → hạ pixel ratio rồi mất vài chục giây mới nâng lại = cảm giác lag/mờ/giật kéo dài. Giờ: bỏ qua thời gian lúc ẩn, và cho bộ tự co nghỉ ~4s.
  // ===== CUTSCENE camera xem TV: lướt ra sau lưng sofa nhìn về màn TV; thoát thì lướt về góc mặc định đang theo nhân vật =====
  const CAM0={fov:camera.fov,near:camera.near};
  const CINE={active:false,t:0,dur:1.8,fp:new THREE.Vector3(),ft:new THREE.Vector3(),tp:new THREE.Vector3(),tt:new THREE.Vector3(),done:null,hold:false,f0:18,f1:18,n0:1,n1:1,
    go(p,t,dur,hold,done,fov,near){this.active=true;this.t=0;this.dur=Math.max(0.01,dur);this.fp.copy(camera.position);this.ft.copy(controls.target);this.tp.copy(p);this.tt.copy(t);this.hold=hold;this.done=done||null;controls.enabled=false;
      this.f0=camera.fov;this.f1=fov;this.n0=camera.near;this.n1=near},
    step(dt){this.t+=dt;const k=Math.min(1,this.t/this.dur),e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;
      camera.position.lerpVectors(this.fp,this.tp,e);controls.target.lerpVectors(this.ft,this.tt,e);camera.lookAt(controls.target);
      const f=this.f0+(this.f1-this.f0)*e,n=Math.min(this.n0,this.n1)+(k>=1?(this.n1-Math.min(this.n0,this.n1)):0);if(Math.abs(camera.fov-f)>1e-3||camera.near!==n){camera.fov=f;camera.near=n;camera.updateProjectionMatrix()}
      if(k>=1){const d=this.done;this.done=null;if(!this.hold){this.active=false;controls.enabled=true;controls.update()}if(d)d()}}};
  let cineBack=null;
  api.cineCam=(mode,done)=>{if(!SOFA){done&&done();return}
    // góc "sau lưng sofa" như ảnh mẫu: cao hơn đầu, lệch nhẹ sang bên, nhìn chếch xuống về phía TV; ống kính mở rộng (fov 18 → 40) và hạ mặt cắt gần để không xén sofa
    if(mode==='in'){if(!CINE.active)cineBack={p:camera.position.clone().sub(controls.target)};
      const side=new THREE.Vector3(SOFA.fwd.z,0,-SOFA.fwd.x);
      const p=SOFA.center.clone().addScaledVector(SOFA.fwd,-2.05).addScaledVector(side,0.55);p.y=A.L0+1.85;
      const t=SOFA.center.clone().lerp(SOFA.tv,0.62);t.y=A.L0+0.78;CINE.go(p,t,2.4,true,done,40,0.1)}
    else{const L=local.char.position,t=new THREE.Vector3(L.x,L.y+0.7,L.z),off=cineBack?cineBack.p:new THREE.Vector3(12,14,27);
      if(!CINE.active){done&&done();return}CINE.go(t.clone().add(off),t,1.5,false,done,CAM0.fov,CAM0.near)}};
  // cảnh quay ngồi bàn làm việc (Workroom): lướt ra sau lưng nhân vật, cao hơn vai, nhìn vào màn hình trên bàn; 'out' = lướt về góc theo nhân vật
  api.deskCam=(mode,done)=>{if(!A.seatC||OUTD){done&&done();return}
    if(mode==='in'){if(!CINE.active)cineBack={p:camera.position.clone().sub(controls.target)};
      const f=A.fwd,side=new THREE.Vector3(f.z,0,-f.x),y0=A.seatTop||A.seatC.y;
      const p=A.seatC.clone().addScaledVector(f,-1.35).addScaledVector(side,0.32);p.y=y0+1.05;
      const t=A.seatC.clone().addScaledVector(f,0.95);t.y=y0+0.62;CINE.go(p,t,1.9,true,done,42,0.05)}
    else{const L=local.char.position,t=new THREE.Vector3(L.x,L.y+0.7,L.z),off=cineBack?cineBack.p:new THREE.Vector3(12,14,27);
      if(!CINE.active){done&&done();return}CINE.go(t.clone().add(off),t,1.5,false,done,CAM0.fov,CAM0.near)}};
  api.cineActive=()=>CINE.active;
  // ===== màn TV: tối khi tắt; bật thì sáng dịu, màu chuyển chậm (không vẽ nội dung video lên TV để khỏi tốn GPU) =====
  // TV: mesh TV_Screen = viền/khung (luôn đen). Mặt màn bên trong = tấm phẳng riêng, lùi vào 3 cm so với khung: tắt = đen bóng, bật = phát sáng.
  const TVS=(()=>{if(!SOFA||!tvScreenMeshes.length)return null;
    const black=new THREE.MeshStandardMaterial({color:0x0b0b0d,roughness:0.55,metalness:0.1});toonMat(black);
    tvScreenMeshes.forEach(m=>{if(Array.isArray(m.material))m.material=m.material.map(x=>(!MC.tv||!MC.tv.mat||x.name===MC.tv.mat)?black:x);else m.material=black});
    const INS=MC.tv&&MC.tv.inset!=null?MC.tv.inset:0.03;
    const b=SOFA.tvBox,sz=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3());
    const alongX=sz.x<sz.z,depth=alongX?sz.x:sz.z,face=alongX?(SOFA.center.x>c.x?1:-1):(SOFA.center.z>c.z?1:-1);
    const W=(alongX?sz.z:sz.x)-2*INS,H=sz.y-2*INS;
    const off=new THREE.MeshBasicMaterial({color:0x060608});
    const on=new THREE.ShaderMaterial({uniforms:{uT:{value:0},uI:{value:0}},toneMapped:false,
      vertexShader:'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'uniform float uT,uI;varying vec2 vU;void main(){vec2 p=vU;float a=sin(p.x*3.4+uT*.35)*.5+.5,b2=sin(p.y*2.6-uT*.27+p.x*1.3)*.5+.5;vec3 c=mix(vec3(.08,.17,.34),vec3(.36,.24,.52),a);c=mix(c,vec3(.95,.62,.40),b2*.28);float v=smoothstep(0.,.18,p.x)*smoothstep(1.,.82,p.x)*smoothstep(0.,.18,p.y)*smoothstep(1.,.82,p.y);gl_FragColor=vec4(c*uI*(.7+.4*v),1.0);}'});
    const pan=new THREE.Mesh(new THREE.PlaneGeometry(W,H),off);pan.name='TV_Glow';pan.raycast=()=>{};
    pan.position.copy(c);if(alongX){pan.position.x+=face*(depth/2+0.002);pan.rotation.y=face>0?Math.PI/2:-Math.PI/2}else{pan.position.z+=face*(depth/2+0.002);pan.rotation.y=face>0?0:Math.PI}
    scene.add(pan);
    let st=false;return{set(v){if(v===st)return;st=v;pan.material=v?on:off;if(v)on.uniforms.uI.value=0},step(dt){if(st){on.uniforms.uT.value+=dt;on.uniforms.uI.value=Math.min(1.25,on.uniforms.uI.value+dt*1.6)}},get on(){return st}}})();
  api.tv=v=>{if(TVS)TVS.set(!!v)};api.hasTV=()=>!!(TVS&&SOFA);
  let resumeN=0;
  document.addEventListener('visibilitychange',()=>{if(document.hidden)return;R.getDelta();resumeN=6;adaptCool=Math.max(adaptCool,240);badWin=0;goodWin=0;ftEma=0.0167;renderer.shadowMap.needsUpdate=true});
  // GIỚI HẠN KHUNG HÌNH: màn 120/144 Hz → vẽ ½ tần số (60/72 fps, vẫn chia đều nhịp màn hình nên không giật) thay vì 144 fps;
  // cửa sổ game không được chọn (đang dùng app/cửa sổ khác bên cạnh) → 30 fps. Tab ẩn thì trình duyệt tự dừng.
  let media=false,mediaN=0,rIv=16.7,lastRaf=0,lastDraw=0,focusN=0,hasFoc=true,throttled=false;
  const topFocus=()=>{try{return (window.top||window).document.hasFocus()}catch(e){return document.hasFocus()}};
  function loop(t){requestAnimationFrame(loop);t=t||performance.now();
    if(lastRaf){const iv=t-lastRaf;if(iv>3&&iv<40)rIv+=(iv-rIv)*0.04}lastRaf=t;
    if((focusN++&15)===0)hasFoc=topFocus()||!!document.fullscreenElement;
    // CHẾ ĐỘ ĐA PHƯƠNG TIỆN: đang mở nhạc YouTube (có hình) / gọi video / khung phim thu nhỏ → video chiếm GPU & bộ giải mã cùng game.
    // Giảm tải 3D (trần độ phân giải thấp hơn, màn tần số quét cao thì vẽ 1/3 thay vì 1/2) + CSS bỏ làm mờ nền kính (xem html.media trong ui.css).
    if((mediaN++&15)===0){const m=!!document.querySelector('#hYt.on,#hCall.on,#cine.mini');if(m!==media){media=m;document.documentElement.classList.toggle('media',m);adaptCool=Math.min(adaptCool,10)}}
    const hz=1000/rIv,minDt=!hasFoc?1000/30:hz>100?(media?3000/hz:2000/hz):0;throttled=!hasFoc;
    if(api.lowDraw&&t-lastDraw<240)return;if(minDt&&t-lastDraw<minDt-2)return;lastDraw=t;
    rawDt=R.getDelta();if(resumeN>0){resumeN--;rawDt=Math.min(rawDt,1/60)}Perf.frame(rawDt*1000);
    // BẮT KỊP THỜI GIAN THẬT: máy yếu/khung hình tụt <20fps trước đây bị ép dt<=0.05s => thế giới chạy CHẬM so với đồng hồ thật, trong khi máy kia vẫn chạy đúng tốc độ
    // (nhân vật remote bị dự đoán đi quá xa rồi giật về). Giờ chia nhỏ thành nhiều bước <=0.05s (tối đa 0.25s thực/khung; tab vừa bật lại sau khi ẩn thì không nhảy vọt).
    let acc=Math.min(rawDt,0.25);while(acc>0.0501){tick(0.05,false);acc-=0.05}
    // màn rạp phủ kín màn hình: chỉ chạy logic (nhân vật, mạng), gần như không vẽ 3D (1 khung/giây) → máy dồn sức cho video
    Perf.begin();if(api.theater){theaterAcc+=rawDt;const draw=theaterAcc>1;if(draw)theaterAcc=0;tick(acc,draw)}else tick(acc);Perf.end();Perf.draw(performance.now());}
  let theaterAcc=0;
  Perf.context(()=>({map:MAPID,q:TP.quality,pr:+curPR.toFixed(2)}));
  if(!TEST)loop();
  // ===== API cho lớp mạng =====
  api.snapshot=()=>{const p=local.P,mv=p.sp>0.05||!!local.busy||local.plan.length>0,mov=p.sp>0.05&&p.mode==='free'&&!local.busy;
    return{x:r3(p.pos.x),y:r3(p.pos.y),z:r3(p.pos.z),w:r3(p.yaw),l:p.level,m:p.mode,b:local.busy?local.busy.kind:0,vx:mov?r3(Math.sin(p.yaw)*p.sp):0,vz:mov?r3(Math.cos(p.yaw)*p.sp):0,mv:mv?1:0,mp:MAPID,s:p.mode==='watch'?p.seat:undefined,ts:Math.round(performance.now())}};
  api.addRemote=(slot,glb)=>{if(remote)return;remote=makeChar(glb,{...DEFS[slot],remote:true});api.remote=remote;rinp.mag=0};
  api.setRemoteVisible=v=>{if(remote&&remote.char.visible!==v)remote.char.visible=v};
  api.removeRemote=()=>{if(!remote)return;remote.dispose();remote=null;api.remote=null;if(window.__halo)endHalo()};
  api.setRemoteInput=m=>{rinp.x=m.x;rinp.z=m.z;rinp.run=!!m.r;rinp.mag=m.m?1:0;rinpT=clockG};
  api.applyState=(m,lat)=>{if(remote)remote.setNet({x:m.x,y:m.y,z:m.z,w:m.w,l:m.l,m:m.m,b:m.b,s:m.s,mv:m.mv,vx:m.vx||0,vz:m.vz||0,n:m.n,ts:m.ts,rt:performance.now(),t:performance.now()-(lat||0)*1000})};
  api.applyCmd=(t,a)=>{if(!remote)return;remote.netCmd();switch(t){
    case 'move':remote.cmdMove(a[0],a[1],a[2],!!a[3]);break;case 'sleep':remote.cmdSleep();break;case 'sit':remote.cmdSit(a||undefined);break;
    case 'wake':remote.cmdWake();break;case 'watch':remote.cmdWatch(a);break;case 'unwatch':remote.cmdUnwatch();break;case 'off':remote.cmdOffChair();break;case 'blink':remote.blink();break;
    case 'int':rinp.interact=true;break;case 'air':rinp.air=a[0]==='d'?{k:'d',dx:+a[1]||0,dz:+a[2]||0}:{k:'j'};break;case 'door':{if(Array.isArray(a)){const d=doorList.find(x=>x.node.name===a[0]);if(d)doorApply(d,!!a[1],a[2]|0,!localIsBin())}else{const d=doorList.find(x=>x.node.name===a);if(d)toggleDoor(d)}break}}};
  const localIsBin=()=>local&&local.id==='bin';
  // bảng cửa gửi kèm snapshot: "<0|1><phiên bản base36>" cho từng cửa, theo thứ tự tên
  api.doorSig=()=>doorsSorted.map(d=>(doorOpenish(d)?1:0)+(d.v||0).toString(36)).join(',');
  api.applyDoors=(sig,fromBin)=>{if(!sig)return;const a=String(sig).split(',');if(a.length!==doorsSorted.length)return;
    a.forEach((t,i)=>{const d=doorsSorted[i];doorApply(d,t[0]==='1',parseInt(t.slice(1),36)||0,fromBin)})};
  api.envOut=null;
  window.__envChanged=()=>{if(api.envOut)api.envOut({time:TP.time,weather:TP.weather,auto:TP.auto?1:0})};
  api.applyEnv=m=>{if(m.time!=null&&!window.__realTime)TP.time=m.time;if(m.weather)TP.weather=m.weather;window.__tpSync&&window.__tpSync();applyToon(false)};
  api.syncEnvOut=()=>window.__envChanged();
  // làm nóng TRƯỚC khi hiện game: biên dịch shader cho MỌI ô cây cỏ (kể cả ô đang ẩn / bản giảm tam giác) và đẩy hết texture lên GPU
  // → lúc di chuyển không còn khựng vì biên dịch / tải texture lần đầu (nguyên nhân chính của ~10 giây giật đầu tiên)
  api.warm=()=>{const back=[];const show=o=>{if(o&&!o.visible){o.visible=true;o.count=Math.min(o.count,1);back.push(o)}};      // count=1: chỉ cần biên dịch, đừng bắt máy vẽ cả vườn trong lúc đang tải
    [EXT,EXTV].forEach(E=>E&&E.cells.forEach(ce=>{show(ce.im);show(ce.im1)}));
    const seen=new Set();scene.traverse(o=>{[].concat(o.material||[]).forEach(m=>{if(!m)return;for(const k in m){const t=m[k];if(t&&t.isTexture&&!seen.has(t)){seen.add(t);try{renderer.initTexture(t)}catch(e){}}}})});
    const done=()=>{back.forEach(o=>o.visible=false);if(EXT)EXT.update(controls.target,camera.position,scene.fog.color);if(EXTV)EXTV.update(controls.target,camera.position,scene.fog.color)};
    let p;try{p=renderer.compileAsync?renderer.compileAsync(scene,camera):Promise.resolve(renderer.compile(scene,camera))}catch(e){p=Promise.resolve()}
    return p.then(done,done)};
  api.dispose=()=>{try{remote&&remote.dispose();local.dispose()}catch(e){}renderer.dispose()};
  {const getM=()=>{const l=envMeshes.slice();const pf=scene.getObjectByName('PlacedFurniture');if(pf)pf.traverse(o=>{if(o.isMesh)l.push(o)});return l};
   const ao=makeAO(TU,{getMeshes:getM,groundY:OUTD?ground.position.y:null});api.ao=ao;ao.setStrength(TP.ao==null?0.7:TP.ao);
   let bb;if(OUTD){bb=new THREE.Box3();const t=new THREE.Box3(),sz=new THREE.Vector3();for(const o of envMeshes){if(!o.isMesh||o===ground||o.visible===false||(o.material&&o.material.userData&&o.material.userData.ground))continue;t.setFromObject(o);if(t.isEmpty())continue;t.getSize(sz);if(sz.x>90||sz.z>90)continue;bb.union(t)}bb.expandByScalar(1);bb.min.y=A.L0-0.5;bb.max.y=Math.min(bb.max.y,A.L0+10)}
   else bb=new THREE.Box3(new THREE.Vector3(-0.3,-0.5,-8.3),new THREE.Vector3(10.3,6.7,1.6));
   const cell=aoGrid(bb,0.15);{const cf={bounds:bb,cell,R:0.9,rays:OUTD?24:36};if((TP.ao==null?0.7:TP.ao)>0)setTimeout(()=>ao.bake(cf),400);else ao.bake(Object.assign({},cf,{sync:false,defer:true}));window.__aoEnsure=()=>ao.ensure();}window.__aoDirty=()=>ao.dirty();}
  api.toonMat=toonMat;   // để nội thất đặt thêm (src/build/furniture.js) cùng kiểu đổ bóng toon với nhà
  // cây người chơi rải ngoài vườn đi chung đường ống cây cối của vườn (exterior.js setUser); map trong nhà: ngoại cảnh dời theo MC.ext
  api.ext=EXT||EXTV;api.extOff=extG?{dx:extG.position.x,dz:extG.position.z}:{dx:0,dz:0};
  window.__FU=FU;window.VY={EXT,Perf,local,get remote(){return remote},api,A,scene,camera,renderer,controls,tick,THREE,doorList,toggleDoor,occ,TP,envApply,rain,ripples,garden,WC};
}
