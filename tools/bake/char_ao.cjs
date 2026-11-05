// Bake AO cho nhân vật (Bin / Vy): render độ sâu (depth) toàn bộ nhân vật từ ~128 hướng quanh người (kiểu shadow-map),
// mỗi đỉnh kiểm tra "nhìn thấy trời" theo từng hướng thuộc nửa cầu quanh pháp tuyến → AO = tỉ lệ hướng không bị che (có trọng số cos).
// Dùng: server dev chạy ở :8124 →  node tools/bake/char_ao.cjs <bin|vy> out.json   (cần playwright + chromium)
// Sau đó:  python3 tools/bake_char_ao.py assets/char-<id>.glb out.json assets/char-<id>.glb  (ghi COLOR_0 vào GLB)
const {chromium}=require('playwright');const fs=require('fs');
(async()=>{
const who=process.argv[2]||'bin',out=process.argv[3]||('ao-'+who+'.json'),base=process.env.BASE||'http://localhost:8124';
const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:480,height:360}});p.on('pageerror',e=>console.log('PAGEERR',e.message));
await p.goto(base+'/?solo=1&g=1&m=living&as='+who,{waitUntil:'load'});
let fr=null;for(let i=0;i<150&&!fr;i++){for(const f of p.frames()){if(await f.evaluate(id=>!!(window.VY&&window.VY.local&&window.VY.local.id===id),who).catch(()=>false)){fr=f;break}}if(!fr)await p.waitForTimeout(1000)}
if(!fr){console.log('không thấy nhân vật',who);process.exit(1)}
await p.waitForTimeout(6000);
const res=await fr.evaluate(()=>{
 const V=window.VY,T=V.THREE,L=V.local,char=L.char,scene=V.scene,R=V.renderer;
 const N=1024,K=128,RAD=1.1,BIAS=0.007,NB=0.004;
 // tư thế nền: IDLE (tay buông tự nhiên) tại t=0.4
 const mx=new T.AnimationMixer(char);const clip=L.acts[L.K.IDLE].getClip();const a=mx.clipAction(clip);a.play();a.time=Math.min(0.4,clip.duration*0.5);mx.update(0);
 char.updateMatrixWorld(true);
 const meshes=[];char.traverse(o=>{if(o.isMesh&&o.geometry&&o.geometry.attributes.position)meshes.push(o)});
 meshes.forEach(m=>{if(m.isSkinnedMesh)m.skeleton.update()});
 const ctr=char.getWorldPosition(new T.Vector3());ctr.y+=0.72;     // tâm người (cao ~1.45 m, chân ở gốc) — không dùng Box3 vì hộp bao có thể gồm vật phụ ở xa
 // vị trí + pháp tuyến đã skin
 const pos=[],nor=[];
 for(const m of meshes){const g=m.geometry,pa=g.attributes.position,na=g.attributes.normal,n=pa.count,P=new Float32Array(n*3),Nn=new Float32Array(n*3);
  const v=new T.Vector3(),w=new T.Vector3(),nm=new T.Vector3(),nmat=new T.Matrix3().getNormalMatrix(m.matrixWorld);
  for(let i=0;i<n;i++){
   if(m.isSkinnedMesh){v.fromBufferAttribute(pa,i);m.applyBoneTransform(i,v);v.applyMatrix4(m.matrixWorld);
     if(na){nm.fromBufferAttribute(na,i);w.fromBufferAttribute(pa,i).addScaledVector(nm,0.01);m.applyBoneTransform(i,w);w.applyMatrix4(m.matrixWorld);nm.copy(w).sub(v).normalize()}else nm.set(0,1,0)}
   else{v.fromBufferAttribute(pa,i).applyMatrix4(m.matrixWorld);if(na)nm.fromBufferAttribute(na,i).applyMatrix3(nmat).normalize();else nm.set(0,1,0)}
   P.set([v.x,v.y,v.z],i*3);Nn.set([nm.x,nm.y,nm.z],i*3)}
  pos.push(P);nor.push(Nn)}
 // chỉ hiện nhân vật
 const hid=[];const keep=new Set();let o=char;while(o){keep.add(o);o=o.parent}
 scene.children.forEach(c=>{if(!keep.has(c)&&c.visible){hid.push(c);c.visible=false}});
 const hidden=[];char.traverse(c=>{if(c.isMesh&&!c.visible)hidden.push(c)});   // mesh ẩn sẵn trong game thì không che
 const rt=new T.WebGLRenderTarget(N,N,{type:T.UnsignedByteType,format:T.RGBAFormat,minFilter:T.NearestFilter,magFilter:T.NearestFilter,depthBuffer:true});
 const dm=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking});dm.side=T.DoubleSide;
 const cam=new T.OrthographicCamera(-RAD,RAD,RAD,-RAD,0.05,2*RAD+0.1);
 const old={ov:scene.overrideMaterial,bg:scene.background,fog:scene.fog,rt:R.getRenderTarget(),cc:R.getClearColor(new T.Color()),ca:R.getClearAlpha(),sh:R.shadowMap.enabled,ac:R.autoClear};
 scene.overrideMaterial=dm;scene.background=null;scene.fog=null;R.shadowMap.enabled=false;R.autoClear=true;R.setClearColor(0xffffff,1);
 const dirs=[];for(let i=0;i<K;i++){const y=1-2*(i+0.5)/K,r=Math.sqrt(1-y*y),ph=i*2.399963229728653;dirs.push(new T.Vector3(Math.cos(ph)*r,y,Math.sin(ph)*r))}
 const tot=pos.map(P=>new Float32Array(P.length/3)),vis=pos.map(P=>new Float32Array(P.length/3));
 const buf=new Uint8Array(N*N*4),up=new T.Vector3(),right=new T.Vector3(),q=new T.Vector3();
 for(const d of dirs){
  cam.position.copy(ctr).addScaledVector(d,RAD+0.05);up.set(0,1,0);if(Math.abs(d.y)>0.97)up.set(1,0,0);cam.up.copy(up);cam.lookAt(ctr);cam.updateMatrixWorld(true);cam.updateProjectionMatrix();
  R.setRenderTarget(rt);R.render(scene,cam);R.readRenderTargetPixels(rt,0,0,N,N,buf);
  right.setFromMatrixColumn(cam.matrixWorld,0);const upv=new T.Vector3().setFromMatrixColumn(cam.matrixWorld,1);
  const near=cam.near,far=cam.far;
  for(let mi=0;mi<pos.length;mi++){const P=pos[mi],Nn=nor[mi],n=P.length/3;
   for(let i=0;i<n;i++){const nx=Nn[i*3],ny=Nn[i*3+1],nz=Nn[i*3+2],c=nx*d.x+ny*d.y+nz*d.z;if(c<=0.02)continue;
    const x=P[i*3]+nx*NB-ctr.x,y=P[i*3+1]+ny*NB-ctr.y,z=P[i*3+2]+nz*NB-ctr.z;
    const u=x*right.x+y*right.y+z*right.z,w=x*upv.x+y*upv.y+z*upv.z,dep=(RAD+0.05)-(x*d.x+y*d.y+z*d.z);
    const px=Math.min(N-1,Math.max(0,Math.floor((u/RAD+1)*0.5*N))),py=Math.min(N-1,Math.max(0,Math.floor((w/RAD+1)*0.5*N)));
    const k=(py*N+px)*4;const val=(buf[k+3]/255+buf[k+2]/255/256+buf[k+1]/255/65536+buf[k]/255/16777216)*255/256;   // RGBADepthPacking: A = byte cao nhất
    const md=near+val*(far-near);
    tot[mi][i]+=c;if(dep<=md+BIAS)vis[mi][i]+=c}}}
 // khôi phục
 scene.overrideMaterial=old.ov;scene.background=old.bg;scene.fog=old.fog;R.setRenderTarget(old.rt);R.setClearColor(old.cc,old.ca);R.shadowMap.enabled=old.sh;R.autoClear=old.ac;hid.forEach(c=>c.visible=true);rt.dispose();dm.dispose();
 const out=meshes.map((m,mi)=>{const pa=m.geometry.attributes.position,n=pa.count,ao=new Array(n);for(let i=0;i<n;i++)ao[i]=tot[mi][i]>0?+(vis[mi][i]/tot[mi][i]).toFixed(3):1;
  const mats=Array.isArray(m.material)?m.material.map(x=>x.name):[m.material.name];
  return {name:m.name,n,mat:mats.join('|'),p0:[pa.getX(0),pa.getY(0),pa.getZ(0)],pN:[pa.getX(n-1),pa.getY(n-1),pa.getZ(n-1)],hid:!m.visible,ao}});
 return out});
fs.writeFileSync(out,JSON.stringify(res));
let s=0,c=0;for(const m of res)for(const v of m.ao){s+=v;c++}
console.log(who,'meshes',res.length,'verts',c,'mean AO',(s/c).toFixed(3));
await b.close()})()
