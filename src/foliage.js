// Shader cây cỏ "stylized nhận ánh sáng" (chuyển từ artifact Foliage Test) cho map ngoài vườn.
// Ý tưởng: màu lá như phát sáng nhẹ (không bệt: vẫn có tông sáng/tối theo hướng nắng + nhận bóng đổ), normal LAI (hướng lên ↔ toả ra từ tâm tán)
// để tán lá có khối, gió đẩy theo độ cao + rung nhẹ, gradient tối ở gốc → sáng ở ngọn, mỗi bụi lệch sắc nhẹ, ướt thì sẫm lại.
// Dùng chung với toonify() trong game.js (vật liệu có userData.fol2 / userData.grass). Cỏ lấy màu GỐC đúng bằng màu nền tại chỗ nó mọc → cỏ & mặt đất hoà vào nhau.
import * as THREE from 'three';

export const FU = {
  uWindDir: {value: new THREE.Vector2(1, 0.45).normalize()},
  uHybrid: {value: 0.5},       // 0 = normal hướng lên, 1 = toả ra từ tâm
  uBaseShade: {value: 0.86},   // độ tối ở gốc
  uFolEmi: {value: 0.16},      // phần "phát sáng": cộng lại màu gốc để vùng bóng vẫn rực, không xám
  uGMap: {value: null},        // texture nền (cỏ lấy màu theo đúng điểm nền nó đứng)
  uGTint: {value: new THREE.Color(1, 1, 1)},   // chỉnh màu nền ngoài vườn (tươi, đậm hơn) — cỏ lấy màu nền nhân cùng hệ số → cỏ/nền luôn khớp
  uGK: {value: 0.0846},        // 110 / 1300: bước lặp texture nền theo mét (khớp CircleGeometry bán kính 650 với repeat 110)
  uFolTint: {value: new THREE.Color(1, 1, 1)},   // nhân vào màu nền lá/cây/hoa (panel ?tune)
  uFolVar: {value: new THREE.Vector2(0.05, 0.14)},   // biến thiên ngẫu nhiên theo từng cây/bụi: x = lệch hue (vòng), y = lệch sáng
  uGrTint: {value: new THREE.Color(1, 1, 1)},    // nhân vào màu cỏ (cỏ vốn lấy màu theo nền)
  uGrVar: {value: new THREE.Vector2(0.04, 0.10)},
  uPl: {value: [new THREE.Vector3(1e5, 0, 1e5), new THREE.Vector3(1e5, 0, 1e5)]},   // vị trí 2 người chơi: cỏ/hoa quanh chân bị "đạp" thấp xuống để thấy nhân vật
  uOcc: {value: new THREE.Vector4(0, 0, 0, 0)},   // camera (xyz) + bật/tắt
  uOccPl: {value: new THREE.Vector3()},           // điểm ngắm trên người (cây/bụi nằm chắn giữa camera và người sẽ mờ dần kiểu dither)
};

// hàm gió dùng chung cho vật liệu màu và vật liệu bóng (depth) → bóng đung đưa đúng như lá
export const WIND_FN = `
uniform vec2 uWindDir;
vec3 windOffset(vec3 lp, vec3 baseW, float sc){
  float h = clamp(lp.y / 1.5, 0.0, 1.0);
  float w = h * h;
  float ph = dot(baseW.xz, uWindDir) * 0.32 - uWindT * (1.1 + uWindA * 0.9);
  float s = sin(ph) * 0.6 + sin(ph * 2.3 + 1.7) * 0.4;
  float gust = 0.55 + 0.45 * s;
  vec3 d = vec3(uWindDir.x, 0.0, uWindDir.y) * (0.06 + 0.16 * gust) * uWindA;
  float t = uWindT * (4.0 + uWindA * 3.0);
  vec3 fl = vec3(sin(t + lp.x * 9.0 + lp.y * 5.0), sin(t * 1.3 + lp.z * 8.0), cos(t * 0.9 + lp.x * 7.0 + lp.z * 6.0)) * 0.035 * (0.15 + uWindA);
  return (d * w + fl * (0.35 + 0.65 * h)) * sc;
}`;

const WIND_PROJECT = `
vec4 mvPosition = vec4( transformed, 1.0 );
float instScale = 1.0;
vec3 instBase = vec3( 0.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  instScale = length( instanceMatrix[0].xyz );
  instBase = instanceMatrix[3].xyz;
#endif
vec4 wpos = modelMatrix * mvPosition;
vec3 rootW = ( modelMatrix * vec4( instBase, 1.0 ) ).xyz;
wpos.xyz += windOffset( transformed, rootW, instScale );
#ifdef SQUASH
{ vec2 d0 = rootW.xz - uPl[0].xz, d1 = rootW.xz - uPl[1].xz; float r0 = length( d0 ), r1 = length( d1 );
  float k0 = 1.0 - smoothstep( 0.15, 2.4, r0 ), k1 = 1.0 - smoothstep( 0.15, 2.4, r1 ); k0 *= k0; k1 *= k1;
  float hh = clamp( ( wpos.y - rootW.y ) / 1.1, 0.0, 1.0 );
  vec2 push = d0 / max( r0, 0.08 ) * k0 + d1 / max( r1, 0.08 ) * k1;
  wpos.xz += push * hh * hh * 0.6;                                   // ngọn nghiêng toả ra khỏi chân người, mềm dần theo khoảng cách
  wpos.y = rootW.y + ( wpos.y - rootW.y ) * ( 1.0 - 0.5 * max( k0, k1 ) * ( 0.4 + 0.6 * hh ) ); }
#endif
vRoot = rootW.xz;
vHash = fract( sin( dot( rootW.xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
vWP = wpos.xyz;
mvPosition = viewMatrix * wpos;
gl_Position = projectionMatrix * mvPosition;
`;

// vs: vertex shader gốc của three (đã chứa các #include). Trả về shader mới. noise: NOISE_GLSL của game (vn3) để tính bóng mây theo đỉnh.
export function vertFol2(vs, withCloud, noise, squash) {
  return (squash ? '#define SQUASH\n' : '') + 'uniform vec3 uPl[2];uniform vec3 uCenter;uniform float uHInv,uHybrid;varying float vLeafH,vHash,vCS;varying vec2 vRoot;uniform float uCloudSh;\n' + (withCloud ? noise + '\n' : '') + WIND_FN + '\n' + vs
    .replace('#include <beginnormal_vertex>', `
      vec3 objectNormal = vec3( normal );
      { vec3 nRad = normalize( position - uCenter + vec3( 0.0, 1e-3, 0.0 ) ); objectNormal = normalize( mix( vec3( 0.0, 1.0, 0.0 ), nRad, uHybrid ) ); }
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3( tangent.xyz );
      #endif`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vLeafH = clamp( transformed.y * uHInv, 0.0, 1.0 );`)
    .replace('#include <project_vertex>', WIND_PROJECT + (withCloud
      ? `{ float csn = vn3( vec3( vWP.x * 0.05 + uWindT * 0.5, 0.0, vWP.z * 0.05 + uWindT * 0.2 ) ); vCS = uCloudSh > 0.01 ? smoothstep( 0.5, 0.62, csn ) * uCloudSh : 0.0; }` : 'vCS = 0.0;'));
}

// phần cộng thêm vào fragment (đặt ngay trước tính tông toon): chỉnh diffuseColor
export const FRAG_PARS = 'uniform vec3 uFolTint,uGrTint;uniform vec2 uFolVar,uGrVar;\n' + `vec3 varyCol( vec3 c, float h, vec2 v ) {
  float a = ( h - 0.5 ) * 12.566371 * v.x; float cs = cos( a ), sn = sin( a );
  float y = dot( c, vec3( 0.299, 0.587, 0.114 ) ), i = dot( c, vec3( 0.596, -0.274, -0.322 ) ), q = dot( c, vec3( 0.211, -0.523, 0.312 ) );
  float i2 = i * cs - q * sn, q2 = i * sn + q * cs;
  c = vec3( y + 0.956 * i2 + 0.621 * q2, y - 0.272 * i2 - 0.647 * q2, y - 1.106 * i2 + 1.703 * q2 );
  return max( c * ( 1.0 + ( fract( h * 13.7 ) - 0.5 ) * 2.0 * v.y ), 0.0 );
}
` + 'uniform vec4 uOcc;uniform vec3 uOccPl;uniform float uBaseShade,uFolEmi,uGK;uniform sampler2D uGMap;varying float vLeafH,vHash,vCS;varying vec2 vRoot;\n';
export const FRAG_COLOR = `
#ifdef FOL2
 { diffuseColor.rgb *= mix( uBaseShade, 1.0, smoothstep( 0.0, 0.85, vLeafH ) );
   diffuseColor.rgb = varyCol( diffuseColor.rgb * uFolTint, vHash, uFolVar ); }
#endif
#ifdef BUSHF
 // bụi: thay dải gradient của texture bằng "tự đổ bóng" mềm — gốc/bên trong tối, ngọn sáng ấm, thêm mảng sáng/tối theo cụm lá (nhiễu theo toạ độ thế giới)
 { float nh = clamp( vLeafH, 0.0, 1.0 );
   // cùng bảng màu với cỏ & thảm (uGrassA/B × uGTint) → luôn đồng bộ; giữ độ sáng tối của texture (chi tiết lá) và giữ nguyên chấm quả đỏ
   vec3 src = diffuseColor.rgb; float lum = dot( src, vec3( 0.299, 0.587, 0.114 ) );
   vec3 pal = varyCol( mix( uGrassA, uGrassB, 0.22 ) * uGTint * uFolTint * 0.92, vHash, uFolVar * 0.6 ) * clamp( lum / 0.35, 0.65, 1.3 );
   diffuseColor.rgb = mix( pal, src, smoothstep( 0.08, 0.25, src.r - max( src.g, src.b ) ) );
   float ao = mix( 0.62, 1.0, smoothstep( 0.0, 0.8, nh ) );
   float cl = smoothstep( 0.3, 0.7, vn3( vWP * 1.6 ) );
   diffuseColor.rgb *= ao * mix( 0.84, 1.1, cl );
   diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 1.08, 1.04, 0.84 ), smoothstep( 0.55, 1.0, nh ) * 0.5 ); }
#endif
#ifdef GRASSB
 { vec3 gt = texture2D( uGMap, vec2( 55.0 + vRoot.x * uGK, 55.0 - vRoot.y * uGK ) ).rgb * uGTint;
   float glm = dot( gt, vec3( 0.299, 0.587, 0.114 ) );
   vec3 gc = mix( gt, mix( uGrassA, uGrassB, smoothstep( 0.08, 0.6, glm ) ) * uGTint, 0.75 );
   vec3 tip = gc * vec3( 1.06, 1.05, 0.92 );
   vec3 c = mix( gc * 0.88, tip, smoothstep( 0.0, 0.9, vLeafH ) );
   diffuseColor.rgb = varyCol( c * uGrTint, vHash, uGrVar ); }
#endif
`;

// vật liệu bóng đổ: dùng chung hàm gió → bóng lá đung đưa khớp lá
export function makeDepthMat(alphaMap) {
  const d = new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide});
  if (alphaMap) { d.alphaMap = alphaMap; d.alphaTest = 0.4; }
  d.customProgramCacheKey = () => alphaMap ? 'fol2-depth-a' : 'fol2-depth1';
  d.onBeforeCompile = sh => {
    sh.uniforms.uWindT = TUref.uWindT; sh.uniforms.uWindA = TUref.uWindA; sh.uniforms.uWindDir = FU.uWindDir;
    sh.vertexShader = 'uniform float uWindT,uWindA;\n' + WIND_FN + '\n' + sh.vertexShader.replace('#include <project_vertex>', `
vec4 mvPosition = vec4( transformed, 1.0 );
float instScale = 1.0;
vec3 instBase = vec3( 0.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  instScale = length( instanceMatrix[0].xyz );
  instBase = instanceMatrix[3].xyz;
#endif
vec4 wpos = modelMatrix * mvPosition;
wpos.xyz += windOffset( transformed, ( modelMatrix * vec4( instBase, 1.0 ) ).xyz, instScale );
mvPosition = viewMatrix * wpos;
gl_Position = projectionMatrix * mvPosition;`);
  };
  return d;
}
let TUref = null;
export function bindTU(TU) { TUref = TU; }

// mờ dần (dither) phần tán lá nằm giữa camera và người chơi — gọi trong fragment, trước khi tính sáng
export const OCC_GLSL = `
{ vec3 cp = uOcc.xyz; vec3 ab = uOccPl - cp; float tt = clamp( dot( vWP - cp, ab ) / max( dot( ab, ab ), 1e-3 ), 0.0, 1.0 );
  float dl = distance( vWP, cp + ab * tt );
  float nearK = ( 1.0 - smoothstep( 0.9, 0.99, tt ) ) * uOcc.w;
  float al = mix( 1.0, smoothstep( 1.1, 2.9, dl ), nearK );
  float th = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
  if ( al < th ) discard; }
`;
