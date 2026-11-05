// Xem trước lớp AO đã bake (giống ảnh "AO pass"): render nhân vật chỉ bằng màu đỉnh COLOR_0 (không đèn).
// Dùng: node tools/bake/char_ao_preview.cjs <bin|vy> prefix   → prefix_front.png, prefix_side.png, prefix_head.png
const {chromium}=require('playwright');const fs=require('fs');
(async()=>{
const who=process.argv[2]||'bin',pre=process.argv[3]||('aopass_'+who),base=process.env.BASE||'http://localhost:8124';
const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:480,height:360}});p.on('pageerror',e=>console.log('PAGEERR',e.message));
await p.goto(base+'/?solo=1&g=1&m=living&as='+who,{waitUntil:'load'});
let fr=null;for(let i=0;i<150&&!fr;i++){for(const f of p.frames()){if(await f.evaluate(id=>!!(window.VY&&window.VY.local&&window.VY.local.id===id),who).catch(()=>false)){fr=f;break}}if(!fr)await p.waitForTimeout(1000)}
await p.waitForTimeout(6000);
const shots=await fr.evaluate(()=>{
 const V=window.VY,T=V.THREE,L=V.local,char=L.char,scene=V.scene,R=V.renderer;const N=900;
 const mx=new T.AnimationMixer(char);const clip=L.acts[L.K.IDLE].getClip();const a=mx.clipAction(clip);a.play();a.time=Math.min(0.4,clip.duration*0.5);mx.update(0);char.updateMatrixWorld(true);
 const keep=new Set();let o=char;while(o){keep.add(o);o=o.parent}const hid=[];scene.children.forEach(c=>{if(!keep.has(c)&&c.visible){hid.push(c);c.visible=false}});
 const sw=[];const white=new T.MeshBasicMaterial({color:0xffffff,skinning:true}),vc=new T.MeshBasicMaterial({vertexColors:true});
 char.traverse(m=>{if(m.isMesh){sw.push([m,m.material]);m.material=(m.geometry.attributes.color?vc:white)}});
 const rt=new T.WebGLRenderTarget(N,N,{type:T.UnsignedByteType});const buf=new Uint8Array(N*N*4);
 const old={bg:scene.background,fog:scene.fog,cc:R.getClearColor(new T.Color()),ca:R.getClearAlpha(),rt:R.getRenderTarget(),sh:R.shadowMap.enabled};scene.background=null;scene.fog=null;R.shadowMap.enabled=false;R.setClearColor(0x000000,1);
 const ctr=char.getWorldPosition(new T.Vector3());const out={};
 const cv=document.createElement('canvas');cv.width=N;cv.height=N;const cx=cv.getContext('2d');
 for(const [name,az,cy,half] of [['front',0,0.72,0.85],['side',60,0.72,0.85],['head',20,1.12,0.3]]){
  const cam=new T.OrthographicCamera(-half,half,half,-half,0.05,6);const t=new T.Vector3(ctr.x,ctr.y+cy,ctr.z);const r=3,a=az*Math.PI/180;
  cam.position.set(t.x+Math.sin(a)*r,t.y,t.z+Math.cos(a)*r);cam.lookAt(t);cam.updateMatrixWorld(true);cam.updateProjectionMatrix();
  R.setRenderTarget(rt);R.render(scene,cam);R.readRenderTargetPixels(rt,0,0,N,N,buf);
  const id=cx.createImageData(N,N);for(let y=0;y<N;y++)for(let x=0;x<N;x++){const s=((N-1-y)*N+x)*4,d=(y*N+x)*4;id.data[d]=buf[s];id.data[d+1]=buf[s+1];id.data[d+2]=buf[s+2];id.data[d+3]=255}
  cx.putImageData(id,0,0);out[name]=cv.toDataURL('image/png')}
 sw.forEach(([m,mat])=>m.material=mat);hid.forEach(c=>c.visible=true);scene.background=old.bg;scene.fog=old.fog;R.setRenderTarget(old.rt);R.setClearColor(old.cc,old.ca);R.shadowMap.enabled=old.sh;rt.dispose();
 return out});
for(const k in shots)fs.writeFileSync(pre+'_'+k+'.png',Buffer.from(shots[k].split(',')[1],'base64'));
console.log('ok',Object.keys(shots).join(','));
await b.close()})()
