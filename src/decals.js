// ===== DECAL CÂY / CỎ Ở XA (impostor) =====
// Ngoài vườn chỉ cỏ/hoa/bụi THẬT trong ~15 m quanh nhân vật, cây thật trong ~30 m. Xa hơn: tấm phẳng (billboard) xoay theo camera,
// texture bake từ FILE_FOLIAGE_DECAL.glb (tools/bake): màu xám độ sáng + alpha, normal theo trục tiếp tuyến (khối tán) + mặt nạ lá/thân.
// Dùng CHUNG shader toon của game (nắng 3 tông, rim, ánh trăng, thời tiết, sương) → nhận sáng như mesh thật; màu lá/cỏ lấy từ bảng màu
// cỏ cây hiện tại (uLeafA/B, uGrassA/B × uGTint) + ngả teal như cỏ cây 3D. Chuyển 3D ↔ decal bằng dither theo khoảng cách (không giật).
// Mỗi loại 1 lượt vẽ (InstancedMesh): dải cỏ + 3 dáng cây.
import * as THREE from 'three';
import {FU} from './foliage.js';
export const DEC_VER = 2;
const META = {"grass":{"w":8.932,"h":2.076,"bh":1.977},"pine":{"w":4.16,"h":9.424,"bh":9.239},"round1":{"w":5.165,"h":8.369,"bh":8.205},"round2":{"w":5.734,"h":8.293,"bh":8.131},"round3":{"w":3.942,"h":9.797,"bh":9.605},"round4":{"w":2.532,"h":9.003,"bh":8.827},"round5":{"w":3.519,"h":10.237,"bh":10.036}};   // assets/decal/meta.json (tools/bake/pack.py)

// gọi trong onBeforeCompile của toonMat (game.js) khi m.userData.vyDec có
export function patchDecal(sh, m) {
  const U = m.userData.vyDecU, tree = m.userData.vyDec !== 'grass';
  Object.assign(sh.uniforms, U); if (!tree) { sh.uniforms.uGMap = FU.uGMap; sh.uniforms.uGK = FU.uGK; }
  sh.vertexShader = 'uniform vec3 uTgt;varying float vFlip;\n' + sh.vertexShader
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      // billboard trục đứng: tấm luôn quay mặt về camera (chỉ xoay quanh Y → cây không ngả theo góc nhìn)
      vec3 _io=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;vec3 _tc=cameraPosition-_io;float _yaw=atan(_tc.x,_tc.z);float _c=cos(_yaw),_s=sin(_yaw);
      float _tl=0.0;${tree ? '' : `_tl=clamp(atan(_tc.y,length(_tc.xz))*0.75,0.0,1.05);`}   // dải cỏ: ngả về phía camera theo góc nhìn từ trên → nhìn từ cao vẫn thấy cỏ (không thành vệt mỏng)
      float _ct=cos(_tl),_st=sin(_tl);
      objectNormal=vec3(_s*_ct,_st,_c*_ct);`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vFlip=mod(float(gl_InstanceID),2.0);   // nửa số tấm lật ngang → đỡ lặp
      {float ly=transformed.y*_ct,lz=-transformed.y*_st;transformed=vec3(transformed.x*_c+lz*_s,ly,-transformed.x*_s+lz*_c);}`);
  sh.fragmentShader = 'uniform vec3 uTgt;uniform vec4 uBox;uniform float uR0,uR1,uM0,uM1,uMist,uFar;varying float vFlip;\n' + (tree ? '' : 'uniform sampler2D uGMap;uniform float uGK;\n') + sh.fragmentShader
    .replace('#include <map_fragment>', `
      vec2 _uv=vMapUv;${tree ? '' : '_uv.x=vFlip>0.5?1.0-_uv.x:_uv.x;'}vec4 _da=texture2D(map,_uv);float _mk=texture2D(normalMap,_uv).a;
      {// hiện dần theo khoảng cách tới nhân vật (dither ổn định trên màn hình) — gần thì đã có cây cỏ 3D thật
       float dd=distance(vWP.xz,uTgt.xz);if(uBox.y>uBox.x){vec2 _bq=max(max(vec2(uBox.x-vWP.x,uBox.z-vWP.z),vec2(vWP.x-uBox.y,vWP.z-uBox.w)),0.0);dd=length(_bq);}float fz=smoothstep(uR0,uR1,dd)*(1.0-smoothstep(uFar*0.85,uFar,dd));
       float hs=fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(0.06711056,0.00583715))));
       if(fz<=hs*0.98+0.01)discard;}
      ${tree ? `vec3 _lf=mix(uLeafA,uLeafB,smoothstep(0.18,0.95,_da.r))*vec3(0.93,1.0,1.09)*mix(0.82,1.06,_da.r);   // ngả teal như cỏ cây 3D; giữ sáng tối trong tán
      diffuseColor.rgb*=mix(_da.rgb,_lf,_mk);` : `// CỎ: màu lấy THẲNG từ texture thảm ngay dưới (đúng công thức cỏ 3D gần) → luôn tệp màu với thảm ở mọi góc nhìn; chỉ giữ chút sáng tối của cụm
      vec3 _gt=texture2D(uGMap,vec2(55.0+vWP.x*uGK,55.0-vWP.z*uGK)).rgb*uGTint;float _gl=dot(_gt,vec3(0.299,0.587,0.114));
      vec3 _gc=mix(_gt,mix(uGrassA,uGrassB,smoothstep(0.08,0.6,_gl))*uGTint,0.75);
      vec3 _c=mix(_gc*0.93,_gc*vec3(1.05,1.04,0.95),smoothstep(0.0,0.9,_uv.y))*mix(0.94,1.04,smoothstep(0.3,0.9,_da.r))*vec3(0.93,1.0,1.09);
      diffuseColor.rgb*=_c;_da.a*=smoothstep(0.0,0.03,_uv.x)*smoothstep(1.0,0.97,_uv.x);`}
      diffuseColor.a*=_da.a;`)
    .replace('#include <normal_fragment_maps>', tree ? '#include <normal_fragment_maps>' : `#include <normal_fragment_maps>
      normal=normalize((viewMatrix*vec4(0.0,1.0,0.0,0.0)).xyz);   // nhận sáng y hệt mặt thảm (pháp tuyến hướng lên) → không tối/đậm khi nghiêng góc`)
    .replace('#include <fog_fragment>', `#include <fog_fragment>
      #ifdef USE_FOG
      {float dd=distance(vWP.xz,cameraPosition.xz);gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,smoothstep(uM0,uM1,dd)*uMist);}   // mist: xa → phủ màu sương (theo giờ / thời tiết)
      #endif`);
}

export function makeFoliageDecals({scene, toonMat, trees = [], grass = [], indoor = false}) {
  const L = new THREE.TextureLoader();
  const tex = (f, srgb) => { const t = L.load('assets/decal/' + f + '.png?v=' + DEC_VER); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t; };
  const group = new THREE.Group(); group.name = 'FOLIAGE_DECALS'; scene.add(group);
  const U = {
    tree: {uTgt: {value: new THREE.Vector3()}, uBox: {value: new THREE.Vector4(0, -1, 0, -1)}, uR0: {value: 26}, uR1: {value: 31}, uM0: {value: 40}, uM1: {value: 170}, uMist: {value: 0.5}, uFar: {value: 260}},
    grass: {uTgt: {value: new THREE.Vector3()}, uR0: {value: 11}, uR1: {value: 15.5}, uM0: {value: 25}, uM1: {value: 130}, uMist: {value: 0}, uFar: {value: 150}},   // cỏ: chỉ sương chung như thảm (không mist riêng) → không tách màu
  };
  U.grass.uTgt = U.tree.uTgt; U.grass.uBox = U.tree.uBox;                      // dùng chung 1 vector tâm
  const meshes = [];
  function build(kind, list, base) {
    if (!list.length) return;
    const M = META[kind], g = new THREE.PlaneGeometry(M.w, M.h); g.translate(0, M.h / 2, 0);
    const mat = new THREE.MeshStandardMaterial({map: tex(kind + '_a', true), normalMap: tex(kind + '_n'), alphaTest: 0.45, roughness: 1, metalness: 0});
    mat.name = 'VY_DECAL_' + kind; mat.userData.vyDec = base; mat.userData.vyDecU = U[base]; mat.userData.desat = base === 'grass' ? 0.95 : 1;
    toonMat(mat);
    const im = new THREE.InstancedMesh(g, mat, list.length), m4 = new THREE.Matrix4(), c = new THREE.Color();
    list.forEach((p, i) => { m4.makeScale(p.s, p.s, p.s).setPosition(p.x, p.y, p.z); im.setMatrixAt(i, m4); c.setHSL(0, 0, 1).offsetHSL(p.hue || 0, 0, p.val || 0); im.setColorAt(i, c); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = false; im.receiveShadow = !indoor;   // cỏ nhận bóng cây/nhà như thảm im.frustumCulled = false; im.matrixAutoUpdate = false; im.raycast = () => {};
    im.renderOrder = 1; group.add(im); meshes.push(im);
  }
  // cây: chiều cao thật của cây gốc → tỉ lệ tấm; dáng: theo bản thể (cây vườn = tán tròn, cây rải xa có cả thông)
  const by = {pine: [], round1: [], round2: [], round3: [], round4: [], round5: []};
  let s0 = 12345; const rnd = () => (s0 = (s0 * 16807) % 2147483647) / 2147483647;
  // dáng cây theo "khoảnh rừng": mỗi ô ~22 m thiên về 1–2 dáng (cây cùng loài mọc gần nhau), thông chủ yếu ở rừng xa
  const ROUND = ['round1', 'round2', 'round3', 'round4', 'round5'];
  const hsh = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
  const kindAt = t => { const gx = Math.floor(t.x / 22), gz = Math.floor(t.z / 22), h1 = hsh(gx, gz), h2 = hsh(gz + 7, gx - 3);
    if (t.far && h1 < 0.28 && rnd() < 0.75) return 'pine';
    const main = ROUND[Math.floor(h2 * ROUND.length)], alt = ROUND[Math.floor(hsh(gx + 3, gz + 9) * ROUND.length)];
    return rnd() < 0.65 ? main : rnd() < 0.6 ? alt : ROUND[Math.floor(rnd() * ROUND.length)]; };
  trees.forEach(t => { const k = t.kind || kindAt(t); const M = META[k];
    by[k].push({x: t.x, y: t.y, z: t.z, s: Math.max(0.3, t.h / M.bh) * (0.95 + rnd() * 0.1), hue: (rnd() - 0.5) * 0.03, val: (rnd() - 0.5) * 0.08}); });
  Object.keys(by).forEach(k => build(k, by[k], 'tree'));
  build('grass', grass, 'grass');
  return {
    group, meshes, U,
    update(target) { U.tree.uTgt.value.copy(target); },
    setVisible(v) { group.visible = v; },
    count: () => meshes.reduce((n, m) => n + m.count, 0),
  };
}
