// ===== CHẤT LIỆU STYLIZED cho mọi vật màu phẳng =====
// • Vật màu phẳng chung chung (vải, sơn, gốm, nhựa, đá…)  → vân STYLIZED CONCRETE nhân lên màu gốc (giữ đúng tông màu, chỉ thêm vân)
// • Vật bằng gỗ (nhận theo tên chất liệu: wood/oak/cane/cork/floor…)  → vân STYLIZED WOOD nhân lên màu gỗ gốc, thớ gỗ chạy DỌC thân vật
// • Tường ngoài nhà ('Stylized Concrete')  → texture concrete trắng mới (sáng, không xám đục)
// • Mái ngói ('Stylized Brick Wall')  → roof_tiles_02 + PARALLAX (nhìn ra khối từng viên ngói), giảm bão hoà nhẹ
// Giữ nguyên: kính, gương, màn hình, đèn phát sáng, kim loại, đất, cây cỏ lá, vật đã có texture riêng.
//
// UV: tính lại theo MÉT thật (box mapping theo pháp tuyến mặt, có tính scale của vật) → mật độ vân như nhau trên vật to/nhỏ, không méo.
// Gỗ: trục thớ = cạnh DÀI nhất của vật (chân bàn: thớ dọc; mặt bàn/thanh dầm: thớ theo chiều dài).
// Vân "detail" lưu dạng log quanh 0.5 (trung tính) → shader: màu *= exp((s-0.5)*k) — sáng/tối quanh màu gốc, vùng tối hơi đậm sắc hơn (giữ mood màu).
export const STY_VER = 1;
const SKIP = /glass|mirror|screen|display|frost|bulb|lampshade|lamp_glow|glow|steel|gold|metal|chrome|silver|brass|soil|interior|leaf|leaves|plant|foliage|grass|flower|fern|poly|aero|water|ice|emit|light/i;
const WOOD = /wood|oak|cane|cork|plank|timber|walnut|teak|bamboo|rattan|^ch_floor$|_floor$|^floor$/i;

export function makeStylizer(THREE, {aniso = 8} = {}) {
  const L = new THREE.TextureLoader();
  const tex = (f, srgb) => { const t = L.load('assets/tex/' + f + '?v=' + STY_VER); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t; };
  const T = {concD: tex('concrete_d.jpg'), woodD: tex('wood_d.jpg'), concC: tex('concrete_c.jpg', true), roofC: tex('roof_c.jpg', true), roofH: tex('roof_h.jpg')};
  // độ mạnh vân (đã chia cho hệ số mã hoá log lúc tạo file: concrete 1.6, wood 0.35)
  const DK = {conc: 2.6 / 1.6, wood: 0.75 / 0.35, wall: 3.2 / 1.6};
  const v3 = new THREE.Vector3(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sz = new THREE.Vector3();

  // box UV theo mét; grain=true → trục V (dọc ảnh = dọc thớ gỗ) chạy theo cạnh dài nhất
  function boxUV(mesh, tu, tv, grain) {
    const g = mesh.geometry; if (!g || g.userData.vyUV) return;
    const pos = g.attributes.position, nor = g.attributes.normal; if (!pos || !nor) return;
    mesh.updateWorldMatrix(true, false); mesh.matrixWorld.decompose(p, q, v3);
    const s = [Math.abs(v3.x) || 1, Math.abs(v3.y) || 1, Math.abs(v3.z) || 1];
    if (!g.boundingBox) g.computeBoundingBox(); g.boundingBox.getSize(sz);
    const S = [sz.x * s[0], sz.y * s[1], sz.z * s[2]], Lx = S.indexOf(Math.max(...S));
    const n = pos.count, uv = new Float32Array(n * 2), P = [0, 0, 0], N = [0, 0, 0];
    // gốc toạ độ lệch theo vật (không phải 0,0,0 chung) → các vật giống nhau không lặp vân y hệt nhau
    const o = (mesh.id * 0.618) % 1;
    for (let i = 0; i < n; i++) {
      P[0] = pos.getX(i) * s[0]; P[1] = pos.getY(i) * s[1]; P[2] = pos.getZ(i) * s[2];
      N[0] = Math.abs(nor.getX(i) / s[0]); N[1] = Math.abs(nor.getY(i) / s[1]); N[2] = Math.abs(nor.getZ(i) / s[2]);
      const a = N[0] >= N[1] && N[0] >= N[2] ? 0 : N[1] >= N[2] ? 1 : 2;
      let bu = a === 0 ? 2 : 0, bv = a === 1 ? 2 : 1;            // mặc định: mặt đứng V = trục Y, mặt nằm V = trục Z
      if (grain && Lx !== a) { bv = Lx; bu = [0, 1, 2].find(k => k !== a && k !== Lx); }
      uv[i * 2] = P[bu] / tu + o; uv[i * 2 + 1] = P[bv] / tv + o * 1.7;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.userData.vyUV = 1;
  }

  const kindOf = (m, o) => {
    if (!m || !m.isMeshStandardMaterial || m.userData.vySty) return m && m.userData.vySty;
    const n = m.name || '';
    if (/^Stylized\s+Concrete/i.test(n)) return 'wall';
    if (/^Stylized Brick Wall/i.test(n)) return 'roof';
    if (m.map || m.transparent || m.opacity < 1 || m.metalness >= 0.5) return null;
    if (m.userData.fol2 || m.userData.grass || m.userData.leaf || m.userData.ground || m.userData.keepEmi) return null;
    if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.02 && m.emissiveIntensity > 0) return null;
    if (SKIP.test(n)) return null;
    return WOOD.test(n) ? 'wood' : 'conc';
  };
  const done = new Set();
  function setMat(m, k) {
    if (done.has(m)) return; done.add(m); m.userData.vySty = k;
    if (k === 'conc') { m.map = T.concD; m.userData.vyDK = DK.conc; }
    else if (k === 'wood') { m.map = T.woodD; m.userData.vyDK = DK.wood; }
    // tường nhà: trắng ngà sáng (không xám đục) + vân concrete rõ hơn đồ nội thất (mảng tường lớn, nhìn từ xa)
    else if (k === 'wall') { m.map = T.concD; m.userData.vyDK = DK.wall; m.normalMap = null; m.roughnessMap = null; m.metalnessMap = null; m.aoMap = null; m.color.setRGB(0.97, 0.95, 0.91); m.userData.desat = 1; }
    else if (k === 'roof') { m.map = T.roofC; m.userData.vyHM = T.roofH; m.normalMap = null; m.roughnessMap = null; m.metalnessMap = null; }
    m.metalness = 0; m.needsUpdate = true;
  }
  // gắn chất liệu cho cả cây đối tượng (map, ngoại cảnh, nội thất mua ở shop…)
  function apply(root) {
    let n = 0;
    root.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh || !o.geometry) return;
      const ms = [].concat(o.material); if (ms.length !== 1) { ms.forEach(m => { const k = kindOf(m, o); if (k === 'conc' || k === 'wood') setMat(m, k); }); }
      const m = ms[0], k = kindOf(m, o); if (!k) return;
      if (k === 'wood') boxUV(o, 0.9, 2.2, true);
      else if (k === 'conc') boxUV(o, 1.6, 1.6, false);
      else if (k === 'wall') boxUV(o, 2.6, 2.6, false);
      setMat(m, k); n++;
    });
    return n;
  }
  // chèn vào shader toon (gọi trong onBeforeCompile của toonMat)
  function patch(sh, m) {
    const k = m.userData.vySty; if (!k || !m.map) return;
    if (k === 'conc' || k === 'wood' || k === 'wall') {
      sh.uniforms.uDK = {value: m.userData.vyDK || 1};
      sh.fragmentShader = 'uniform float uDK;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
      {float s=texture2D(map,vMapUv).r;float f=exp((s-0.5)*uDK);vec3 c=diffuseColor.rgb*f;
       float l=dot(c,vec3(0.299,0.587,0.114));c=mix(vec3(l),c,1.0+clamp(1.0-f,0.0,0.6)*0.45);   // vân tối: đậm sắc hơn chút (không xỉn)
       diffuseColor.rgb=max(c,vec3(0.0));}
      #endif`);
    } else if (k === 'roof') {
      sh.uniforms.uHM = {value: m.userData.vyHM}; sh.uniforms.uPH = {value: 0.045};
      sh.fragmentShader = 'uniform sampler2D uHM;uniform float uPH;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
      {// PARALLAX OCCLUSION: dựng hệ trục tiếp tuyến từ đạo hàm màn hình (không cần tangent trong mesh), dò độ sâu theo height map
       vec3 pe=-vViewPosition,q0=dFdx(pe),q1=dFdy(pe);vec2 st0=dFdx(vMapUv),st1=dFdy(vMapUv);
       vec3 Nf=normalize(cross(q0,q1));vec3 q1p=cross(q1,Nf),q0p=cross(Nf,q0);
       vec3 Tt=q1p*st0.x+q0p*st1.x,Bt=q1p*st0.y+q0p*st1.y;float dt=max(dot(Tt,Tt),dot(Bt,Bt));float sc=dt==0.0?0.0:inversesqrt(dt);Tt*=sc;Bt*=sc;
       vec3 V=normalize(vViewPosition);vec3 vt=vec3(dot(V,Tt),dot(V,Bt),abs(dot(V,Nf)));
       float nl=mix(18.0,8.0,vt.z),dl=1.0/nl;vec2 dd=vt.xy/max(vt.z,0.2)*uPH*dl;
       vec2 cu=vMapUv;float cd=0.0,hv=1.0-textureGrad(uHM,cu,st0,st1).r;
       for(int i=0;i<18;i++){if(cd>=hv||float(i)>=nl)break;cu-=dd;hv=1.0-textureGrad(uHM,cu,st0,st1).r;cd+=dl;}
       vec2 pu=cu+dd;float af=hv-cd,bf=(1.0-textureGrad(uHM,pu,st0,st1).r)-cd+dl;float w=af/(af-bf+1e-4);vec2 uvp=mix(cu,pu,clamp(w,0.0,1.0));
       vec4 tc=textureGrad(map,uvp,st0,st1);float h=textureGrad(uHM,uvp,st0,st1).r;
       float l=dot(tc.rgb,vec3(0.299,0.587,0.114));tc.rgb=mix(vec3(l),tc.rgb,0.72)*mix(0.7,1.05,h);   // bớt bão hoà + khe giữa các viên tối lại
       diffuseColor*=tc;}
      #endif`);
    }
  }
  const key = m => m.userData.vySty ? 'S' + m.userData.vySty : '';
  return {apply, patch, key, T, boxUV};
}
