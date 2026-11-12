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
export const STY_VER = 3;
const SKIP = /glass|mirror|screen|display|frost|bulb|lampshade|lamp_glow|glow|steel|gold|metal|chrome|silver|brass|soil|interior|leaf|leaves|plant|foliage|grass|flower|fern|poly|aero|water/i;   // KHÔNG lọc 'light' (oak_light, wood_light là gỗ sáng màu)
const WOOD = /wood|oak|cane|cork|plank|timber|walnut|teak|bamboo|rattan|trim|^ch_floor$|_floor$|^floor$/i;   // trim = khung/nẹp cửa sổ & viền vỏ nhà

export function makeStylizer(THREE, {aniso = 8} = {}) {
  const L = new THREE.TextureLoader();
  const tex = (f, srgb) => { const t = L.load('assets/tex/' + f + '?v=' + STY_VER); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t; };
  const T = {concD: tex('concrete_d.jpg'), woodD: tex('wood_d.jpg'), concC: tex('concrete_c.jpg', true), roofC: tex('roof_c.jpg', true), roofH: tex('roof_h.jpg'),
    woodC: tex('wood_c.jpg', true), woodDkC: tex('wooddk_c.jpg', true), brickC: tex('brick_c.jpg', true), brickH: tex('brick_h.jpg'), rockC: tex('rock_c.jpg', true)};
  // độ sáng trung bình (tuyến tính) của texture màu gỗ → giữ độ sáng tương đối của gỗ gốc (gỗ sáng / gỗ vừa)
  const REF = {wood: 0.47, wooddk: 0.29};
  // độ mạnh vân (đã chia cho hệ số mã hoá log lúc tạo file: concrete 1.6, wood 0.35)
  const roofPH = {value: 0.075};   // độ sâu parallax mái ngói (theo đơn vị UV)
  // ngói đang bị ngược chiều dốc (mép tròn viên ngói phải chĩa XUỐNG mái hiên) → xoay texture mái 180° (height map đọc cùng vMapUv nên xoay theo)
  T.roofC.center.set(0.5, 0.5); T.roofC.rotation = Math.PI;
  const DK = {conc: 2.0 / 1.6, wood: 0.75 / 0.35, wall: 2.5 / 1.6};
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
    // gỗ: mesh thường là NHIỀU khối gộp chung (khung cửa = 2 thanh đứng + 2 thanh ngang, bàn = mặt + chân…)
    // → tách các mảnh liền nhau theo tam giác (union-find), mỗi mảnh lấy trục thớ theo cạnh dài nhất của chính nó
    let compAx = null;
    if (grain) {
      const par = new Int32Array(n).map((_, i) => i), f = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }, un = (a, b) => { a = f(a); b = f(b); if (a !== b) par[a] = b; };
      // chỉ nối theo tam giác (KHÔNG gộp đỉnh trùng vị trí: thanh đứng chạm thanh ngang sẽ bị coi là một khối → thớ sai hướng)
      const ix = g.index; if (ix) for (let t = 0; t < ix.count; t += 3) { un(ix.getX(t), ix.getX(t + 1)); un(ix.getX(t), ix.getX(t + 2)); } else for (let t = 0; t < n; t += 3) { un(t, t + 1); un(t, t + 2); }
      const bb = new Map();
      for (let i = 0; i < n; i++) { const r = f(i); let b = bb.get(r); if (!b) bb.set(r, b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]); const x = pos.getX(i) * s[0], y = pos.getY(i) * s[1], z = pos.getZ(i) * s[2]; if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (z < b[2]) b[2] = z; if (x > b[3]) b[3] = x; if (y > b[4]) b[4] = y; if (z > b[5]) b[5] = z; }
      const axOf = new Map(); bb.forEach((b, r) => { const e = [b[3] - b[0], b[4] - b[1], b[5] - b[2]]; axOf.set(r, e.indexOf(Math.max(...e))); });
      compAx = new Uint8Array(n); for (let i = 0; i < n; i++) compAx[i] = axOf.get(f(i));
    }
    // gốc toạ độ lệch theo vật (không phải 0,0,0 chung) → các vật giống nhau không lặp vân y hệt nhau
    const o = (mesh.id * 0.618) % 1;
    for (let i = 0; i < n; i++) {
      P[0] = pos.getX(i) * s[0]; P[1] = pos.getY(i) * s[1]; P[2] = pos.getZ(i) * s[2];
      N[0] = Math.abs(nor.getX(i) / s[0]); N[1] = Math.abs(nor.getY(i) / s[1]); N[2] = Math.abs(nor.getZ(i) / s[2]);
      const a = N[0] >= N[1] && N[0] >= N[2] ? 0 : N[1] >= N[2] ? 1 : 2;
      let bu = a === 0 ? 2 : 0, bv = a === 1 ? 2 : 1;            // mặc định: mặt đứng V = trục Y, mặt nằm V = trục Z
      const La = compAx ? compAx[i] : Lx;
      if (grain && La !== a) { bv = La; bu = [0, 1, 2].find(k => k !== a && k !== La); }
      uv[i * 2] = P[bu] / tu + o; uv[i * 2 + 1] = P[bv] / tv + o * 1.7;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.userData.vyUV = 1;
  }

  const kindOf = (m, o) => {
    if (!m || !m.isMeshStandardMaterial || m.userData.vySty) return m && m.userData.vySty;
    const n = m.name || '';
    if (/^(Stylized\s+Concrete|M_Wall_Cream)/i.test(n) || wallNames.has(n)) return 'wall';
    if (/^Stylized Brick Wall/i.test(n)) return 'roof';
    if (/^Stylized Stone Tiles/i.test(n)) return 'brick';   // thân tường rào quanh nhà → Stylized Dark Brick
    if (/^M_Fence_stoneDk/i.test(n)) return 'wall';        // khối đỉnh tường rào / đỉnh trụ cổng → concrete trắng như vỏ nhà
    if (/^ROCK$/i.test(n)) return 'rock';                                     // đá rời (không phải đá dẫn đường) → cliff rocks (triplanar)
    if (m.map || m.transparent || m.opacity < 1 || m.metalness >= 0.5) return null;
    if (m.userData.fol2 || m.userData.grass || m.userData.leaf || m.userData.ground || m.userData.keepEmi) return null;
    if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.02 && m.emissiveIntensity > 0) return null;
    if (SKIP.test(n)) return null;
    { // vật trắng / sáng gần như không có sắc (tủ lạnh, toilet, gốm sứ, giấy…) → TRẮNG TRƠN (không vân)
      const c = m.color, r = Math.pow(c.r, 0.4545), g = Math.pow(c.g, 0.4545), b = Math.pow(c.b, 0.4545), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx > 0.9 && (mx - mn) / mx < 0.055 && !WOOD.test(n)) return 'white'; }
    if (!WOOD.test(n)) return 'conc';
    const c = m.color, l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    return /dark|dk/i.test(n) || l < 0.12 ? 'wooddk' : 'wood';     // gỗ tối → Stylized Wood Darker
  };
  const done = new Set(), wallNames = new Set();
  function setMat(m, k) {
    if (done.has(m)) return; done.add(m); m.userData.vySty = k;
    if (k === 'conc') { m.map = T.concD; m.userData.vyDK = DK.conc; }
    else if (k === 'wood' || k === 'wooddk') { m.map = k === 'wood' ? T.woodC : T.woodDkC; m.userData.vyRef = REF[k]; m.normalMap = null; m.roughnessMap = null; m.metalnessMap = null; m.aoMap = null; }
    else if (k === 'white') { m.color.setRGB(0.97, 0.97, 0.97); m.userData.desat = 1; }
    else if (k === 'brick') { m.map = T.brickC; m.userData.vyHM = T.brickH; m.normalMap = null; m.roughnessMap = null; m.metalnessMap = null; m.aoMap = null; m.color.setRGB(1, 1, 1); }
    else if (k === 'rock') { m.map = T.rockC; m.normalMap = null; m.roughnessMap = null; }
    // tường nhà: trắng ngà sáng (không xám đục) + vân concrete rõ hơn đồ nội thất (mảng tường lớn, nhìn từ xa)
    else if (k === 'wall') { m.map = T.concD; m.userData.vyDK = DK.wall; m.normalMap = null; m.roughnessMap = null; m.metalnessMap = null; m.aoMap = null; m.color.setRGB(1, 1, 1); m.userData.desat = 1; }   // tường / vỏ nhà: TRẮNG THUẦN
    else if (k === 'roof') { m.map = T.roofC; m.userData.vyHM = T.roofH; m.normalMap = null; m.roughnessMap = null; m.metalnessMap = null; }
    if (k !== 'white') m.metalness = 0; m.needsUpdate = true;
  }
  // gắn chất liệu cho cả cây đối tượng (map, ngoại cảnh, nội thất mua ở shop…)
  function apply(root) {
    let n = 0;
    root.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh || !o.geometry) return;
      const ms = [].concat(o.material); if (ms.length !== 1) { ms.forEach(m => { const k = kindOf(m, o); if (k === 'conc' || k === 'wood' || k === 'wooddk' || k === 'white') setMat(m, k); }); }
      const m = ms[0], k = kindOf(m, o); if (!k) return;
      if (k === 'wood' || k === 'wooddk') boxUV(o, 1.0, 1.8, true);   // 1 ô texture = 1 m ngang × 1.8 m dọc thớ
      else if (k === 'brick') boxUV(o, 1.5, 1.5, false);                  // ~10 hàng gạch / 1.5 m (mặt đứng: hàng gạch nằm ngang)
      else if (k === 'conc') boxUV(o, 1.6, 1.6, false);
      else if (k === 'wall') boxUV(o, 2.6, 2.6, false);
      setMat(m, k); n++;
    });
    return n;
  }
  // chèn vào shader toon (gọi trong onBeforeCompile của toonMat)
  function patch(sh, m) {
    const k = m.userData.vySty; if (!k || !m.map) return;
    if (k === 'wood' || k === 'wooddk') {
      sh.uniforms.uRef = {value: m.userData.vyRef || 0.2};
      sh.fragmentShader = 'uniform float uRef;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
      {// STYLIZED WOOD: màu lấy từ texture gỗ; độ sáng đi theo gỗ gốc (gỗ sáng vẫn sáng hơn gỗ vừa), bớt bão hoà nhẹ cho hợp tông toon
       vec3 b0=diffuseColor.rgb;float l0=dot(b0,vec3(0.2126,0.7152,0.0722));
       vec3 t=texture2D(map,vMapUv).rgb;float lt=dot(t,vec3(0.2126,0.7152,0.0722));
       float f=mix(1.0,clamp(l0/uRef,0.9,1.3),0.4);
       diffuseColor.rgb=mix(vec3(lt),t,0.88)*f*1.06;}   // texture đã chỉnh sáng/ít bão hoà; chỉ nhích theo độ sáng gỗ gốc
      #endif`);
    } else if (k === 'brick') {
      sh.uniforms.uHM = {value: m.userData.vyHM};
      sh.fragmentShader = 'uniform sampler2D uHM;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
      {vec3 t=texture2D(map,vMapUv).rgb;float h=texture2D(uHM,vMapUv).r;
       float lt=dot(t,vec3(0.2126,0.7152,0.0722));diffuseColor.rgb*=mix(vec3(lt),t,0.8)*mix(0.82,1.0,smoothstep(0.55,0.95,h));}   // mạch vữa tối nhẹ theo height
      #endif`);
    } else if (k === 'rock') {
      sh.vertexShader = 'varying vec3 vRkP,vRkN;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {vec4 _w=vec4(transformed,1.0);vec3 _n=objectNormal;
       #ifdef USE_INSTANCING
       _w=instanceMatrix*_w;_n=mat3(instanceMatrix)*_n;
       #endif
       _w=modelMatrix*_w;vRkP=_w.xyz;vRkN=mat3(modelMatrix)*_n;}`);
      sh.fragmentShader = 'varying vec3 vRkP,vRkN;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
      {// CLIFF ROCK: triplanar theo toạ độ thế giới (đá instanced, scale khác nhau → không cần UV, mật độ vân đều ~1.3 m / ô)
       vec3 bw=pow(abs(normalize(vRkN)),vec3(4.0));bw/=bw.x+bw.y+bw.z;vec3 P=vRkP/1.3;
       vec3 t=texture2D(map,P.zy).rgb*bw.x+texture2D(map,P.xz+0.37).rgb*bw.y+texture2D(map,P.xy+0.71).rgb*bw.z;
       vec3 b0=diffuseColor.rgb;float l0=max(dot(b0,vec3(0.2126,0.7152,0.0722)),0.02);
       diffuseColor.rgb=t*2.05*mix(vec3(1.0),b0/l0,0.15);}   // giữ chút sắc kem của đá cũ, sáng vừa với tông vườn
      #endif`);
    } else if (k === 'conc' || k === 'wall') {
      sh.uniforms.uDK = {value: m.userData.vyDK || 1};
      sh.fragmentShader = (k === 'wood' ? '#define VY_WOOD\n' : '') + (k === 'wall' ? '#define VY_WALL\n' : '') + 'uniform float uDK;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
      {vec3 b0=diffuseColor.rgb;
       #ifdef VY_WOOD
       {float l0=dot(b0,vec3(0.299,0.587,0.114));float dk=1.0-smoothstep(0.06,0.32,l0);   // gỗ đậm màu: bớt gắt — giảm bão hoà + sáng lên chút
        b0=mix(b0,mix(vec3(l0),b0,0.7)*1.45,dk);}
       #endif
       float s=texture2D(map,vMapUv).r;float f=exp((s-0.5)*uDK);
       // vân tối KHÔNG ngả xám (nhìn như bẩn): nhuộm theo sắc của chính vật; vật trắng/xám → vân ngả ấm nhẹ
       vec3 hue=b0/max(max(b0.r,max(b0.g,b0.b)),1e-3);float sat=1.0-min(hue.r,min(hue.g,hue.b));
       vec3 tint=mix(vec3(1.0,0.84,0.72),hue,smoothstep(0.08,0.35,sat));float dk=clamp(1.0-f,0.0,1.0);
       #ifdef VY_WALL
       f=min(mix(1.0,f,0.7),1.0);tint=vec3(1.0);dk=0.0;   // tường trắng thuần: vân chỉ làm tối nhẹ, trung tính (không ngả vàng/bẩn)
       #endif
       vec3 c=b0*f*mix(vec3(1.0),tint*1.15,dk*0.9);
       diffuseColor.rgb=max(c,vec3(0.0));}
      #endif`);
    } else if (k === 'roof') {
      sh.uniforms.uHM = {value: m.userData.vyHM}; sh.uniforms.uPH = roofPH;
      sh.fragmentShader = '#define VY_ROOF\nuniform sampler2D uHM;uniform float uPH;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      float vyRH=0.75;vec3 vyRN=vec3(0.0);   // độ cao viên ngói (0 = khe, 1 = sống viên) + pháp tuyến nổi theo từng viên (view space) → game.js VY_ROOF: loáng theo từng viên
      #ifdef USE_MAP
      {// PARALLAX OCCLUSION: dựng hệ trục tiếp tuyến từ đạo hàm màn hình (không cần tangent trong mesh), dò độ sâu theo height map
       vec3 pe=-vViewPosition,q0=dFdx(pe),q1=dFdy(pe);vec2 st0=dFdx(vMapUv),st1=dFdy(vMapUv);
       vec3 Nf=normalize(cross(q0,q1));vec3 q1p=cross(q1,Nf),q0p=cross(Nf,q0);
       vec3 Tt=q1p*st0.x+q0p*st1.x,Bt=q1p*st0.y+q0p*st1.y;float dt=max(dot(Tt,Tt),dot(Bt,Bt));float sc=dt==0.0?0.0:inversesqrt(dt);Tt*=sc;Bt*=sc;
       vec3 V=normalize(vViewPosition);vec3 vt=vec3(dot(V,Tt),dot(V,Bt),abs(dot(V,Nf)));
       float nl=mix(26.0,10.0,vt.z),dl=1.0/nl;vec2 dd=vt.xy/max(vt.z,0.2)*uPH*dl;
       vec2 cu=vMapUv;float cd=0.0,hv=1.0-textureGrad(uHM,cu,st0,st1).r;
       for(int i=0;i<26;i++){if(cd>=hv||float(i)>=nl)break;cu-=dd;hv=1.0-textureGrad(uHM,cu,st0,st1).r;cd+=dl;}
       vec2 pu=cu+dd;float af=hv-cd,bf=(1.0-textureGrad(uHM,pu,st0,st1).r)-cd+dl;float w=af/(af-bf+1e-4);vec2 uvp=mix(cu,pu,clamp(w,0.0,1.0));
       vec4 tc=textureGrad(map,uvp,st0,st1);float h=textureGrad(uHM,uvp,st0,st1).r;
       float l=dot(tc.rgb,vec3(0.299,0.587,0.114));tc.rgb=mix(vec3(l),tc.rgb,0.72)*mix(0.7,1.05,h);   // bớt bão hoà + khe giữa các viên tối lại
       diffuseColor*=tc;vyRH=h;
       {float e=0.0035;float hx=textureGrad(uHM,uvp+vec2(e,0.0),st0,st1).r-textureGrad(uHM,uvp-vec2(e,0.0),st0,st1).r,hy=textureGrad(uHM,uvp+vec2(0.0,e),st0,st1).r-textureGrad(uHM,uvp-vec2(0.0,e),st0,st1).r;
        vyRN=normalize(Nf-(Tt*hx+Bt*hy)*5.0);}}   // mặt cong từng viên ngói (đạo hàm height map) — không còn loáng cả mảng phẳng
      #endif`);
    }
  }
  const key = m => m.userData.vySty ? 'S' + m.userData.vySty : '';
  // tên chất liệu tường phòng (map Vy/Bin) dùng CHUNG chất liệu với vỏ nhà → mép tường phòng & vỏ nhà liền một mảng
  const setWallNames = a => { (a || []).forEach(x => wallNames.add(x)); };
  return {apply, patch, key, T, boxUV, setWallNames, roofPH};
}
