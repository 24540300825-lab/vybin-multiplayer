// HANA trong game: cây / bụi / cỏ / đá / hoa / chậu vẽ bằng add-on HANA (Blender) — xem docs/HANA.md.
// assets/flora-hana.glb do tools/hana_kit.py tạo từ file export HANA (Dynamic): mỗi "kit" = 1 cây/bụi/khóm cỏ/đá… có 1–3 cấp LOD.
// Lá: dữ liệu từng lá (vị trí, xoay, scale, mass normal, rand/độ sâu/độ cao) → dựng thành 1 hình học / cây lúc tải (game instancing theo CÂY).
// Màu: mô hình của hana-three.js (tone → vùng tối / nền→sáng / highlight → chuyển HSV của pigment → cạnh lồi → rim), nhưng chạy BÊN TRONG
// shader toon của game (toonMat, game.js): cùng mặt trời + bóng đổ, gió, cúi khi đi qua, mờ khi chắn camera, bóng mây, ướt mưa, đèn đêm, sương, hậu kỳ.
// Ánh sáng ngày/đêm/thời tiết: màu HANA = màu lúc 12h trời quang (đúng như Blender) × tỉ lệ ánh sáng hiện tại / ánh sáng 12h (uHRefL, uHRefS).
import * as THREE from 'three';

// ---------- uniform dùng chung mọi vật liệu HANA ----------
export const HU = {
  uHRefL: {value: new THREE.Vector3(1, 1, 1)},   // ánh sáng vùng nắng lúc 12h trời quang (uMid·uSunC) — game.js cập nhật
  uHRefS: {value: new THREE.Vector3(0.5, 0.5, 0.5)},   // vùng bóng lúc 12h
  uHSun: {value: 4.0},      // cường độ mặt trời quy đổi (Blender Sun Strength) — chỉnh trong ?tune
  uHAmb: {value: 0.35},     // ánh sáng trời quy đổi (Blender World)
  uHLift: {value: 1.0},     // nhân độ sáng tổng của cây cỏ HANA
  uHSolidLift: {value: 1.0},
  uHGBot: {value: new THREE.Vector2(0.5, 0.62)},   // cỏ: vùng tối ở gốc — x = độ tối (trừ vào tone), y = cao tới đâu (0 gốc → 1 ngọn)
  uHFolShadow: {value: new THREE.Color(0.002, 0.277, 0.022)},   // màu vùng tối của lá (từ file HANA) — decal xa về đúng màu này khi khuất nắng / ban đêm
  uHDbg: {value: 0},
  // hậu kỳ màu của game (Grade pass, game.js) — HANA bù ngược để màu hiện ra = màu tham chiếu Blender (rồi mới nhân ánh sáng môi trường)
  uHG: {value: new THREE.Vector4(1, 1, 1, 0)},     // expo, con, sat, temp
  uHTSh: {value: new THREE.Vector3(1, 1, 1)}, uHTHi: {value: new THREE.Vector3(1, 1, 1)}, uHTAmt: {value: 0}, uHGLift: {value: new THREE.Vector3()},        // gỡ lỗi: 1 = bỏ bóng đổ, 2 = hiện ndl, 3 = hiện t // nhân thêm cho vật rắn (đá, chậu…) — đá HANA tối/tương phản mạnh hơn nền game → nâng lên
  uPMask: {value: null},    // mặt nạ đá dẫn lối (nhìn từ trên, R>0.5 = có đá) → cọng cỏ mọc trên đá bị thu về gốc (src/hana-ext.js)
  uPMB: {value: new THREE.Vector4(0, 0, 1, 1)},   // x0, z0, rộng, sâu (m) của mặt nạ
};
// cọng cỏ có gốc nằm trên đá dẫn lối → ẩn (thu cả cọng về gốc). Chèn vào WIND_PROJECT (foliage.js), cần rootW, wpos.
export const HANA_PMASK = `
#ifdef HANA_PMASK
 { vec2 pu = ( rootW.xz - uPMB.xy ) / uPMB.zw;
   if ( pu.x > 0.0 && pu.y > 0.0 && pu.x < 1.0 && pu.y < 1.0 && texture2D( uPMask, pu ).r > 0.5 ) wpos.xyz = rootW; }
#endif
`;

const col = (v, d) => { const a = Array.isArray(v) ? v : d; return new THREE.Color(a[0], a[1], a[2]); };   // màu Blender = scene-linear
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

// uniform riêng của 1 vật liệu (từ hana_params_json — khoá = tên socket Blender)
function ownUniforms(p, foliage) {
  const u = {
    uHMidC: {value: col(p['Mid Color'], [0.16, 0.22, 0.1])}, uHShadowC: {value: col(p['Shadow Color'], [0.03, 0.07, 0.06])},
    uHLightC: {value: col(p['Light Color'], [0.4, 0.44, 0.18])}, uHHighC: {value: col(p['Highlight Color'], [0.7, 0.68, 0.4])},
    uHRimC: {value: col(p['Rim Color'], [0.85, 0.9, 0.65])},
    uHThr: {value: num(p.Threshold, 0.42)}, uHSoft: {value: num(p.Softness, 0.12)}, uHShape: {value: num(p['Light Response'], 0.7)},
    uHShStr: {value: num(p['Shadow Strength'], 1)}, uHHThr: {value: num(p['Highlight Threshold'], 0.66)}, uHHSoft: {value: num(p['Highlight Softness'], 0.06)},
    uHHStr: {value: num(p['Highlight Strength'], 0.85)}, uHTexSh: {value: num(p['Texture In Shadow'], 0.55)}, uHTexHi: {value: num(p['Texture In Light'], 0.6)},
    uHCap: {value: num(p['Capture Mix'], 0.85)}, uHK: {value: num(p['Capture Exposure'], 0.9)}, uHWrap: {value: num(p.Wrap, 0.3)}, uHTrans: {value: num(p.Translucency, 0)},
    uHRimI: {value: num(p['Rim Intensity'], 0.25) * num(p['Rim Enable'], 1)}, uHRimW: {value: num(p['Rim Width'], 0.3)}, uHRimS: {value: num(p['Rim Softness'], 0.4)},
    uHRimAw: {value: num(p['Rim Light Aware'], 0.6)},
    uHHue: {value: new THREE.Vector3(0, 1, 1)},
    uHToneOff: {value: 0},   // lệch tone riêng (cỏ / nền hướng thẳng lên trời → hạ xuống để cùng tỉ lệ sáng / vừa / tối với tán cây)   // đồng bộ tông: x = xoay hue (vòng), y = × bão hoà, z = × sáng (cỏ / mặt đất kéo về tông cây bụi)
  };
  if (foliage) Object.assign(u, {
    uHAccent: {value: col(p['Accent Color'], [0.25, 0.3, 0.3])}, uHCavity: {value: col(p['Cavity Color'], [0.05, 0.08, 0.03])},
    uHVolume: {value: num(p['Volume Normal'], 0.9)}, uHFlat: {value: num(p['Leaf Flatness'], 0.7)}, uHInterior: {value: num(p['Interior Darkness'], 0.5)},
    uHTipL: {value: num(p['Tip Light'], 0.2)}, uHHGrad: {value: num(p['Height Gradient'], 0.15)}, uHLeafVar: {value: num(p['Leaf Variation'], 0.3)},
    uHJit: {value: num(p.Jitter, 0.35)}, uHPaint: {value: num(p['Painterly Intensity'], 1)}, uHAOSh: {value: num(p['AO Shading'], 0.3)},
    uHAOCol: {value: num(p['AO Color'], 0.5)}, uHLayer: {value: num(p['Layer Intensity'], 0.6)}, uHMedVar: {value: num(p['Medium Variation'], 0.8)},
    uHColVar: {value: num(p['Color Variation'], 0.5)},
  });
  return u;
}

// ---------- GLSL ----------
// đỉnh: lá/cỏ — pháp tuyến lá giữ nguyên (không dùng normal lai của foliage.js), truyền mass normal + dữ liệu lá xuống fragment
export const HANA_VERT_PARS = 'attribute vec4 _voln;attribute vec4 _leaf;varying vec3 vHVol;varying vec4 vHLeaf;varying vec2 vHUv;\n';
export const HANA_VERT = `
  { vec3 vn = _voln.xyz;
    #ifdef USE_INSTANCING
      vn = mat3( instanceMatrix ) * vn;
    #endif
    vHVol = normalize( ( viewMatrix * vec4( normalize( mat3( modelMatrix ) * vn ), 0.0 ) ).xyz ); vHLeaf = _leaf; vHUv = uv; }`;
// đỉnh: vật rắn có data theo đỉnh (_HANA_DATA)
export const HANA_SOLID_VERT_PARS = '#ifdef HANA_DATTR\nattribute vec3 _hana_data;\n#endif\nvarying vec3 vHData;\n';
export const HANA_SOLID_VERT = `
  #ifdef HANA_DATTR
    vHData = _hana_data;
  #else
    vHData = vec3( 0.5, 0.0, 0.0 );
  #endif`;

// viền lá vẽ tay: hình oval nhọn, mép hơi răng cưa (như hana-three.js HANA_SILHOUETTE)
export const HANA_CUT = `
#ifdef HANA_SIL
 { float hx = ( vHUv.x - 0.5 ) * 2.0, hy = vHUv.y;
   float hw = pow( sin( 3.14159 * clamp( hy, 0.0, 1.0 ) ), 0.75 ) * ( 0.92 - 0.25 * hy );
   hw *= 1.0 + 0.10 * sin( hy * 23.0 + vHLeaf.x * 40.0 );
   if ( abs( hx ) > hw ) discard; }
#endif
`;

export const HANA_FRAG_PARS = `
uniform vec3 uHRefL,uHRefS,uHFolShadow;uniform float uHSun,uHAmb,uHLift,uHSolidLift,uHDbg;uniform vec4 uHG;uniform vec3 uHTSh,uHTHi,uHGLift;uniform float uHTAmt;
uniform vec3 uHMidC,uHShadowC,uHLightC,uHHighC,uHRimC,uHHue;uniform float uHToneOff;
uniform float uHThr,uHSoft,uHShape,uHShStr,uHHThr,uHHSoft,uHHStr,uHTexSh,uHTexHi,uHCap,uHK,uHWrap,uHTrans,uHRimI,uHRimW,uHRimS,uHRimAw;
#ifdef HANA_FOL
uniform vec2 uHGBot;uniform vec3 uHAccent,uHCavity;uniform float uHVolume,uHFlat,uHInterior,uHTipL,uHHGrad,uHLeafVar,uHJit,uHPaint,uHAOSh,uHAOCol,uHLayer,uHMedVar,uHColVar;
varying vec3 vHVol;varying vec4 vHLeaf;varying vec2 vHUv;
#else
varying vec3 vHData;
#ifdef HANA_DMAP
uniform sampler2D uHDataMap;
#endif
#endif
// nghịch đảo ACESFilmicToneMapping của three (game dùng ACES, exposure 1; HANA/Blender dùng 'Standard' = không tone map)
// → màu HANA hiện ra trên màn hình đúng như trong Blender (trước khi hậu kỳ/mood của game nhân vào)
vec3 hanaInvTone( vec3 y ) {
  y = clamp( y, 0.0, 0.93 );
  vec3 z = min( mat3( vec3( 0.643038, 0.059269, 0.005962 ), vec3( 0.311187, 0.931436, 0.063929 ), vec3( 0.045775, 0.009295, 0.930118 ) ) * y, vec3( 0.97 ) );
  vec3 A = 1.0 - 0.983729 * z, B = 0.0245786 - 0.4329510 * z, C = -( 0.000090537 + 0.238081 * z );
  vec3 v = ( -B + sqrt( max( B * B - 4.0 * A * C, 0.0 ) ) ) / ( 2.0 * A );
  return max( mat3( vec3( 1.764741, -0.147028, -0.036337 ), vec3( -0.675778, 1.160252, -0.162436 ), vec3( -0.088963, -0.013224, 1.198773 ) ) * v * 0.6, 0.0 );
}
// nghịch đảo (gần đúng) Grade pass của game: lift → tint vùng tối/sáng → contrast → saturation → nhiệt độ màu → exposure
vec3 hanaInvGrade( vec3 c ) {
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  c -= uHGLift * ( 1.0 - smoothstep( 0.0, 0.55, l ) );
  l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  float sw = 1.0 - smoothstep( 0.02, 0.4, l ), hw = smoothstep( 0.3, 1.3, l );
  c /= max( mix( vec3( 1.0 ), uHTHi * 1.4, uHTAmt * hw ), vec3( 0.05 ) );
  c /= max( mix( vec3( 1.0 ), uHTSh * 1.8, uHTAmt * sw ), vec3( 0.05 ) );
  c = max( ( c - 0.18 ) / max( uHG.y, 0.05 ) + 0.18, 0.0 );
  l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  c = max( l + ( c - l ) / max( uHG.z, 0.05 ), 0.0 );
  c /= vec3( 1.0 + uHG.w, 1.0 + uHG.w * 0.25, max( 1.0 - uHG.w, 0.05 ) );
  return c / max( uHG.x, 0.05 );
}
float hLum( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }
float hSm( float a, float b, float x ) { float t = clamp( ( x - a ) / max( b - a, 1e-5 ), 0.0, 1.0 ); return t * t * ( 3.0 - 2.0 * t ); }
vec3 hRgb2hsv( vec3 c ) { vec4 K = vec4( 0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0 ); vec4 p = mix( vec4( c.bg, K.wz ), vec4( c.gb, K.xy ), step( c.b, c.g ) );
  vec4 q = mix( vec4( p.xyw, c.r ), vec4( c.r, p.yzx ), step( p.x, c.r ) ); float d = q.x - min( q.w, q.y );
  return vec3( abs( q.z + ( q.w - q.y ) / ( 6.0 * d + 1e-10 ) ), d / ( q.x + 1e-10 ), q.x ); }
vec3 hHsv2rgb( vec3 c ) { vec3 p = abs( fract( c.xxx + vec3( 1.0, 2.0 / 3.0, 1.0 / 3.0 ) ) * 6.0 - 3.0 ); return c.z * mix( vec3( 1.0 ), clamp( p - 1.0, 0.0, 1.0 ), c.y ); }
// = hanaShade() của hana-three.js; ánh sáng lấy từ game: sunK/ambK = độ sáng hiện tại so với 12h trời quang, sh = bóng đổ.
// trả về màu (vùng sáng/tối/highlight + rim) và lit (0 bóng → 1 nắng) để nhân tỉ lệ ánh sáng môi trường.
float gHT, gHNdl, gHVal;
vec3 hanaShade( vec3 N, vec3 V, vec3 L, float sh, float sunK, float ambK, float offset, vec3 localC, float convex, out float lit ) {
  float ndl = dot( N, L );
  float f = uHTrans * 0.5;
  float val = uHSun * sunK * mix( max( ndl, 0.0 ), max( -ndl, 0.0 ), f ) * sh * 0.31830989 + uHAmb * ambK;
  float real = val / ( val + max( uHK, 0.001 ) );
  float lam = clamp( ( ndl + uHWrap ) / ( 1.0 + uHWrap ), 0.0, 1.0 );
  float t = clamp( mix( lam, real, uHCap ) + offset + uHToneOff, 0.0, 1.0 ); gHT = t; gHNdl = ndl; gHVal = real;
  float stp = hSm( uHThr - uHSoft, uHThr + uHSoft, t ), cont = hSm( uHThr - 0.35, uHThr + 0.35, t );
  lit = mix( cont, stp, uHShape );
  float shadow = 1.0 - lit, high = hSm( uHHThr - uHHSoft, uHHThr + uHHSoft, t ) * lit, lg = hSm( uHThr, max( uHHThr, uHThr + 0.01 ), t );
  vec3 z = mix( uHMidC, uHLightC, lg ); z = mix( z, uHShadowC, shadow * uHShStr ); z = mix( z, uHHighC, high * uHHStr );
  float term = 1.0 - abs( stp * 2.0 - 1.0 );
  vec3 zh = hRgb2hsv( z ); zh.y = clamp( zh.y * ( 1.0 + 0.2 * term ), 0.0, 1.0 );
  float ta = mix( mix( 1.0, uHTexHi, high ), uHTexSh, shadow );
  vec3 l = mix( uHMidC, localC, ta );
  vec3 mh = hRgb2hsv( uHMidC ), lh = hRgb2hsv( l );
  float dh = zh.x - mh.x; dh -= floor( dh + 0.5 );
  vec3 c = hHsv2rgb( vec3( fract( lh.x + dh ), clamp( lh.y + ( zh.y - mh.y ), 0.0, 1.0 ), lh.z * zh.z / max( mh.z, 0.0005 ) ) );
  c = mix( c, uHHighC, clamp( convex * lit, 0.0, 1.0 ) );
  float facing = 1.0 - abs( dot( N, V ) ), lo = 1.0 - uHRimW;
  float rim = hSm( lo, lo + uHRimS * uHRimW, facing ) * mix( 1.0, hSm( -0.2, 0.8, dot( -V, L ) ), uHRimAw );
  return c + uHRimC * rim * uHRimI;
}
`;

// đặt ngay sau "vec3 col=diffuseColor.rgb*tone;" trong khối sáng toon (game.js) — cần Ld, vis, shC, inH, geometryNormal/ViewDir.
// diffuseColor.rgb = pigment (map / màu đỉnh) với vật rắn.
export const HANA_COLOR = `
#ifdef HANA
 {
  vec3 hL = vec3( 0.0, 1.0, 0.0 );
  #if NUM_DIR_LIGHTS > 0
   hL = directionalLights[ 0 ].direction;
  #endif
  float hSh = 1.0;
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
   { DirectionalLightShadow ds = directionalLightShadows[ 0 ];
     hSh = getShadow( directionalShadowMap[ 0 ], ds.shadowMapSize, ds.shadowBias, ds.shadowRadius, vDirectionalShadowCoord[ 0 ] ); }
  #endif
  if ( uHDbg == 1.0 ) hSh = 1.0;
  vec3 envL = uMid * uSunC, envS = min( uSh * uAmbS, envL * 0.78 );   // như shC của toon, với ánh trời hướng lên (khớp cách tính uHRefS)
  float sunK = hLum( envL ) / max( hLum( uHRefL ), 1e-3 ), ambK = hLum( envS ) / max( hLum( uHRefS ), 1e-3 );
  vec3 hV = geometryViewDir, hN = geometryNormal; float hlit = 1.0; vec3 hc;
  #if defined( HANA_DEC )
   // decal xa: màu bake sẵn (= Blender lúc nắng) → cùng cách đổi vùng như cây cỏ 3D: nắng yếu (chiều tối / đêm) hoặc nằm trong bóng → về màu vùng tối của lá
   { float dl = clamp( sunK, 0.0, 1.0 );      // (không dùng bóng đổ: decal ở xa, tấm nghiêng → răng cưa bóng)
     vec3 hS = mix( uHFolShadow, diffuseColor.rgb * 0.45, 0.45 );
     hlit = smoothstep( 0.2, 0.85, dl ); hc = mix( hS, diffuseColor.rgb, hlit ); }
  #elif defined( HANA_FOL )
   vec3 hNg = hN;
   hN = normalize( mix( hNg, normalize( vHVol ), uHVolume ) );
   float rnd = vHLeaf.x, depth = vHLeaf.y, height = vHLeaf.z, tip = vHLeaf.w;
   #ifdef HANA_GRASS
    height = tip;
   #endif
   float dab = mix( 0.5, rnd, uHFlat ), cav = clamp( depth * uHInterior, 0.0, 1.0 );
   float off = depth * uHInterior * -0.6 + ( tip - 0.5 ) * uHTipL + ( height - 0.5 ) * uHHGrad + ( rnd - 0.5 ) * uHLeafVar;
   off += ( dab - 0.5 ) * uHJit * uHPaint; off -= cav * uHAOSh;
   #ifdef HANA_GRASS
    off -= ( 1.0 - smoothstep( 0.0, uHGBot.y, tip ) ) * uHGBot.x;     // gốc cỏ vào vùng tối cao hơn → cỏ có 2 tông sáng / tối như cây bụi
   #endif
   vec3 loc = uHMidC;
   loc = mix( loc, uHAccent, step( 1.0 - 0.35 * uHLayer, fract( rnd * 13.37 ) ) * 0.75 );
   loc = mix( loc, uHCavity, clamp( cav * uHAOCol, 0.0, 1.0 ) );
   loc *= 1.0 + ( dab - 0.5 ) * uHMedVar * 0.35 * uHPaint;
   vec3 lh = hRgb2hsv( loc ); lh.x = fract( lh.x + ( dab - 0.5 ) * uHColVar * uHPaint * 0.06 ); lh.z *= 1.0 + ( dab - 0.5 ) * uHColVar * uHPaint * 0.2; loc = hHsv2rgb( lh );
   hc = hanaShade( hN, hV, hL, hSh, sunK, ambK, off, loc, 0.0, hlit );
  #else
   vec3 hd = vHData;
   #ifdef HANA_DMAP
    hd = texture2D( uHDataMap, vMapUv ).rgb;
   #endif
   hc = hanaShade( hN, hV, hL, hSh, sunK, ambK, hd.r * 2.0 - 1.0, diffuseColor.rgb, hd.g, hlit );
  #endif
  hc = max( hc, 0.0 );
  if ( uHHue.x != 0.0 || uHHue.y != 1.0 || uHHue.z != 1.0 ) { vec3 hh = hRgb2hsv( hc ); hh.x = fract( hh.x + uHHue.x ); hh.y = clamp( hh.y * uHHue.y, 0.0, 1.0 ); hh.z *= uHHue.z; hc = hHsv2rgb( hh ); }
  // giữ màu Blender lúc 12h trời quang; giờ khác / thời tiết khác: nhân tỉ lệ ánh sáng hiện tại so với 12h (vùng nắng / vùng bóng riêng)
  // MỘT hệ số môi trường chung cho mọi vật HANA (không đổi theo vùng sáng/tối của từng vật) → cây, bụi, cỏ, nền đổi màu theo giờ/thời tiết y như nhau
  vec3 envK = mix( envS / max( uHRefS, vec3( 1e-3 ) ), envL / max( uHRefL, vec3( 1e-3 ) ), 0.6 );
  { float ek = dot( envK, vec3( 0.2126, 0.7152, 0.0722 ) ); envK = mix( vec3( ek ), envK, 0.55 ); }   // giữ sắc môi trường vừa phải (hoàng hôn ấm, đêm lạnh) nhưng không đổi hue lá
  col = hc * clamp( envK, 0.0, 3.0 ) * uHLift;
  #ifndef HANA_FOL
   col *= uHSolidLift;
  #endif
  col = hanaInvGrade( hanaInvTone( col ) );
  { float lm = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) ); if ( lm > 0.96 ) col *= 0.96 / lm; }
  if ( uHDbg == 2.0 ) col = vec3( gHNdl * 0.5 + 0.5 ); if ( uHDbg == 3.0 ) col = vec3( gHT ); if ( uHDbg == 4.0 ) col = vec3( gHVal ); if ( uHDbg == 5.0 ) col = vec3( sunK * 0.5, ambK * 0.5, hSh );   // dưới ngưỡng bloom (0.98): lá sáng không bị loá
  #if defined( FOL2 ) || defined( GRASSB )
   col *= 1.0 - 0.28 * vCS * ( 1.0 - inH );
  #else
   if ( uCloudSh > 0.01 ) { float csn = vn3( vec3( vWP.x * 0.05 + uWindT * 0.5, 0.0, vWP.z * 0.05 + uWindT * 0.2 ) ); col *= 1.0 - 0.28 * smoothstep( 0.5, 0.62, csn ) * uCloudSh * ( 1.0 - inH ); }
  #endif
 }
#endif
`;

// đồng bộ tông cỏ + mặt đất với cây/bụi (cỏ, Moss của file gốc ngả vàng chanh hơn lá cây) — chỉnh nhanh trong ?tune hoặc tại đây
export const HUE_SYNC = {grass: new THREE.Vector3(0, 1, 1), ground: new THREE.Vector3(0, 1, 1)};   // (0,1,1) = không chỉnh: cỏ / nền đã dùng chung bảng màu lá (FOL_KEYS)
export const TONE_OFF = {grass: -0.12, ground: -0.26};
// mặt đất Moss dùng CHUNG bảng màu + cách nhận sáng với lá cây/bụi/cỏ (giữ pigment texture của Moss) → cùng màu, cùng shade
export const FOL_KEYS = ['Mid Color', 'Shadow Color', 'Light Color', 'Highlight Color', 'Accent Color', 'Cavity Color', 'Rim Color', 'Threshold', 'Softness', 'Light Response',
  'Shadow Strength', 'Highlight Threshold', 'Highlight Softness', 'Highlight Strength', 'Capture Mix', 'Capture Exposure', 'Wrap', 'Translucency', 'Texture In Shadow', 'Texture In Light'];

// ---------- vật liệu ----------
// kind: 'leaf' (lá cây/bụi) | 'grass' | 'solid' (đá, cành, chậu, hoa: pigment = map hoặc màu đỉnh, data = data map hoặc _hana_data)
export function hanaMaterial(params, {kind = 'solid', sil = true, map = null, dataMap = null, vcol = false, dattr = false, name = 'HANA'} = {}) {
  const fol = kind === 'leaf' || kind === 'grass';
  const m = new THREE.MeshStandardMaterial({name, color: 0xffffff, map: map || null, vertexColors: !!vcol, roughness: 1, metalness: 0, side: fol ? THREE.DoubleSide : THREE.FrontSide});
  m.userData.hana = {kind, sil: fol && sil, dmap: !fol && !!dataMap, dattr: !fol && !!dattr, U: {...HU, ...ownUniforms(params || {}, fol)}};
  if (dataMap) m.userData.hana.U.uHDataMap = {value: dataMap};
  m.userData.noAO = true; m.userData.desat = 1;
  if (fol) { m.userData.fol2 = kind === 'leaf'; m.userData.grass = kind === 'grass'; m.userData.cloudV = true; if (kind === 'grass') m.userData.stemR = true; }
  return m;
}

// vật liệu bóng đổ của lá: cùng gió + cùng viền lá với vật liệu màu → bóng có hình lá, lay theo gió
export function hanaDepthMat(sil, WIND_FN, TU, FU, grass) {
  const d = new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide});
  d.customProgramCacheKey = () => 'hana-depth' + (sil ? 'S' : '') + (grass ? 'G' : '');
  d.onBeforeCompile = sh => {
    sh.uniforms.uWindT = TU.uWindT; sh.uniforms.uWindA = TU.uWindA; sh.uniforms.uWindDir = FU.uWindDir; sh.uniforms.uPMask = HU.uPMask; sh.uniforms.uPMB = HU.uPMB;
    sh.vertexShader = (grass ? '#define HANA_PMASK\nattribute vec3 _root;\n' : '') + 'uniform sampler2D uPMask;uniform vec4 uPMB;uniform float uWindT,uWindA;attribute vec4 _leaf;varying vec4 vHLeaf;varying vec2 vHUv;\n' + WIND_FN + '\n' + sh.vertexShader
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvHUv = uv; vHLeaf = _leaf;')
      .replace('#include <project_vertex>', `
vec3 rl = vec3( 0.0 ), lp0 = transformed;
#ifdef HANA_PMASK
  rl = _root; lp0 -= _root;
#endif
vec4 mvPosition = vec4( transformed, 1.0 ); float instScale = 1.0; vec3 instBase = rl;
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition; instScale = length( instanceMatrix[0].xyz ); instBase = ( instanceMatrix * vec4( rl, 1.0 ) ).xyz;
#endif
vec4 wpos = modelMatrix * mvPosition;
vec3 rootW = ( modelMatrix * vec4( instBase, 1.0 ) ).xyz;
wpos.xyz += windOffset( lp0, rootW, instScale );
${HANA_PMASK}
mvPosition = viewMatrix * wpos; gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = (sil ? '#define HANA_SIL\n' : '') + 'varying vec4 vHLeaf;varying vec2 vHUv;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n' + HANA_CUT);
  };
  return d;
}

// ---------- dựng kit từ GLB ----------
// trả {kits: {id: {kind, lods: [{parts: [{geometry, material, matrix}], size, min, max}]}}, all: [materials]}
export async function buildHanaKits(gltf, groundGltf = null) {   // vật liệu trả về trong .mats — game.js gọi toonMat() cho từng cái
  const parser = gltf.parser, kits = {}, mats = [], matCache = new Map();
  let folParams = null;   // bảng màu lá (cây/bụi/cỏ dùng chung) — mặt đất lấy theo
  const accArr = async i => (await parser.getDependency('accessor', i));
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), n = new THREE.Vector3();

  async function leafGeometry(d) {
    const [ip, is, iq, iv, il, sp, sn, su, st, si] = await Promise.all(['ip', 'is', 'iq', 'iv', 'il', 'sp', 'sn', 'su', 'st', 'si'].map(k => accArr(d[k])));
    const L = d.n, nU = sp.count, idx = si.array;
    const core = d.cp != null ? await Promise.all([accArr(d.cp), accArr(d.cn), accArr(d.ch)]) : null;
    const nC = core ? core[0].count : 0, NV = L * nU + nC;
    const P = new Float32Array(NV * 3), N = new Float32Array(NV * 3), UV = new Float32Array(NV * 2), VO = new Int8Array(NV * 4), LF = new Uint8Array(NV * 4);
    for (let i = 0; i < L; i++) {
      q.set(iq.getX(i), iq.getY(i), iq.getZ(i), iq.getW(i)).normalize();
      const s = is.getX(i), px = ip.getX(i), py = ip.getY(i), pz = ip.getZ(i);
      const vx = Math.round(iv.getX(i) * 127), vy = Math.round(iv.getY(i) * 127), vz = Math.round(iv.getZ(i) * 127);
      const r = Math.round(il.getX(i) * 255), dp = Math.round(il.getY(i) * 255), h = Math.round(il.getZ(i) * 255);
      for (let k = 0; k < nU; k++) {
        const o = i * nU + k;
        v.set(sp.getX(k) * s, sp.getY(k) * s, sp.getZ(k) * s).applyQuaternion(q);
        P[o * 3] = v.x + px; P[o * 3 + 1] = v.y + py; P[o * 3 + 2] = v.z + pz;
        n.set(sn.getX(k), sn.getY(k), sn.getZ(k)).applyQuaternion(q);
        N[o * 3] = n.x; N[o * 3 + 1] = n.y; N[o * 3 + 2] = n.z;
        UV[o * 2] = su.getX(k); UV[o * 2 + 1] = su.getY(k);
        VO[o * 4] = vx; VO[o * 4 + 1] = vy; VO[o * 4 + 2] = vz;
        LF[o * 4] = r; LF[o * 4 + 1] = dp; LF[o * 4 + 2] = h; LF[o * 4 + 3] = Math.round(st.getX(k) * 255);
      }
    }
    if (core) {
      const [cp, cn, ch] = core, b = L * nU;
      for (let k = 0; k < nC; k++) {
        const o = b + k;
        P[o * 3] = cp.getX(k); P[o * 3 + 1] = cp.getY(k); P[o * 3 + 2] = cp.getZ(k);
        N[o * 3] = cn.getX(k); N[o * 3 + 1] = cn.getY(k); N[o * 3 + 2] = cn.getZ(k);
        UV[o * 2] = 0.5; UV[o * 2 + 1] = 0.5;
        VO[o * 4] = Math.round(cn.getX(k) * 127); VO[o * 4 + 1] = Math.round(cn.getY(k) * 127); VO[o * 4 + 2] = Math.round(cn.getZ(k) * 127);
        LF[o * 4] = 128; LF[o * 4 + 1] = 255; LF[o * 4 + 2] = Math.round(Math.min(1, Math.max(0, ch.getX(k))) * 255); LF[o * 4 + 3] = 0;
      }
    }
    const I = new (NV > 65535 ? Uint32Array : Uint16Array)(L * idx.length + nC);
    for (let i = 0; i < L; i++) for (let k = 0; k < idx.length; k++) I[i * idx.length + k] = i * nU + idx[k];
    for (let k = 0; k < nC; k++) I[L * idx.length + k] = L * nU + k;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
    g.setAttribute('_voln', new THREE.BufferAttribute(VO, 4, true));
    if (d.kind === 'GRASS') {      // gốc từng cọng: gió / cúi khi đi qua / né đá dẫn lối tính theo từng cọng (foliage.js STEMR)
      const RT = new Float32Array(NV * 3);
      for (let i = 0; i < L; i++) for (let k = 0; k < nU; k++) { const o = (i * nU + k) * 3; RT[o] = ip.getX(i); RT[o + 1] = ip.getY(i); RT[o + 2] = ip.getZ(i); }
      g.setAttribute('_root', new THREE.BufferAttribute(RT, 3));
    } g.setAttribute('_leaf', new THREE.BufferAttribute(LF, 4, true));
    g.setIndex(new THREE.BufferAttribute(I, 1)); g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }

  function solidMat(src, kind) {
    const ud = src.userData || {};
    if (ud.hana_mode !== 'dynamic') {       // vật liệu ngoài HANA (PolyShader của cây trong chậu / cuống hoa, quả đỏ, sứ): đi đường toon thường
      if (matCache.has(src)) return matCache.get(src);
      const m = src.isMeshStandardMaterial ? src.clone() : new THREE.MeshStandardMaterial({color: src.color ? src.color.clone() : 0xffffff, map: src.map || null});
      m.vertexColors = false;      // màu đỉnh trong file là pigment của HANA (gần đen) — vật liệu ngoài HANA (PolyShader) không dùng
      m.name = src.name; m.roughness = 1; m.metalness = 0; m.userData.noAO = true; m.userData.noSty = true;
      if (kind === 'flower' || kind === 'pot' || kind === 'bush') m.userData.sway = true;      // cây trong chậu / cuống hoa: lay gió theo độ cao
      matCache.set(src, m); mats.push(m); return m;
    }
    const key = src.uuid;
    if (matCache.has(key)) return matCache.get(key);
    let p = {}; try { p = JSON.parse(ud.hana_params_json || '{}'); } catch (e) {}
    const dm = src.aoMap || null; if (dm) { dm.colorSpace = THREE.NoColorSpace; dm.flipY = false; }
    if (src.map) src.map.colorSpace = THREE.SRGBColorSpace;
    const m = hanaMaterial(p, {kind: 'solid', map: src.map, dataMap: dm, vcol: !src.map && !!src.vertexColors, dattr: !!ud.hana_data_attr, name: src.name});
    if (kind === 'flower' || kind === 'pot') m.userData.sway = true;
    matCache.set(key, m); mats.push(m); return m;
  }

  const roots = gltf.scene.children.filter(o => /^KIT_/.test(o.name));
  for (const r of roots) {
    const ex = r.userData || {}, id = ex.kit, lod = ex.lod | 0;
    const K = kits[id] || (kits[id] = {kind: ex.kind, lods: []});
    const parts = [];
    r.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(r.matrixWorld).invert();
    const jobs = [];
    r.traverse(o => {
      const d = o.userData && o.userData.hana_fol;
      if (d) {
        jobs.push((async () => {
          const g = await leafGeometry(d);
          const kind = d.kind === 'GRASS' ? 'grass' : 'leaf';
          if (!folParams) { folParams = d.params; const sc = d.params['Shadow Color']; if (sc) HU.uHFolShadow.value.setRGB(sc[0], sc[1], sc[2]); }
          const m = hanaMaterial(d.params, {kind, sil: d.sil, name: 'HANA_' + id + '_L' + lod});
          if (kind === 'grass') { m.userData.hana.U.uHHue.value.copy(HUE_SYNC.grass); m.userData.hana.U.uHToneOff.value = TONE_OFF.grass; }
          if (kind === 'leaf' && ex.kind === 'bush') m.userData.bush = false;
          mats.push(m);
          parts.push({geometry: g, material: m, matrix: new THREE.Matrix4(), leaf: kind});
        })());
        return;
      }
      if (o.isMesh) {
        const M = new THREE.Matrix4().copy(o.matrixWorld).premultiply(inv);
        const g = o.geometry; if (g.attributes._hana_data === undefined && g.attributes._HANA_DATA) g.setAttribute('_hana_data', g.attributes._HANA_DATA);
        const ms = [].concat(o.material).map(sm => solidMat(sm, ex.kind));
        parts.push({geometry: g, material: Array.isArray(o.material) ? ms : ms[0], matrix: M});
      }
    });
    await Promise.all(jobs);
    K.lods[lod] = {parts, size: new THREE.Vector3().fromArray(ex.size), min: new THREE.Vector3().fromArray(ex.min || [0, 0, 0]), max: new THREE.Vector3().fromArray(ex.max || ex.size)};
  }
  // mặt đất HANA (Moss): 1 vật liệu, pigment lặp theo toạ độ thế giới (tile = cạnh tấm plane gốc, m)
  let ground = null;
  if (groundGltf) {
    let gm = null, tile = 20;
    groundGltf.scene.traverse(o => { if (o.isMesh && !gm) { gm = o.material; const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); const s = g.boundingBox.getSize(new THREE.Vector3()); o.updateWorldMatrix(true, false); const sc = new THREE.Vector3().setFromMatrixScale(o.matrixWorld); tile = Math.max(s.x * Math.abs(sc.x), s.z * Math.abs(sc.z)) || 20; } });
    if (gm) {
      let p = {}; try { p = JSON.parse((gm.userData || {}).hana_params_json || '{}'); } catch (e) {}
      if (folParams) FOL_KEYS.forEach(k => { if (folParams[k] !== undefined) p[k] = folParams[k]; });
      const map = gm.map; if (map) { map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8; map.needsUpdate = true; }
      const dm = gm.aoMap || null; if (dm) { dm.colorSpace = THREE.NoColorSpace; dm.wrapS = dm.wrapT = THREE.RepeatWrapping; }
      const m = hanaMaterial(p, {kind: 'solid', map, dataMap: dm, name: 'HANA_Ground'}); m.userData.hanaGround = true; m.userData.noSty = true;
      m.userData.hana.U.uHHue.value.copy(HUE_SYNC.ground); m.userData.hana.U.uHToneOff.value = TONE_OFF.ground;
      mats.push(m); ground = {material: m, tile};
    }
  }
  return {kits, mats, ground};
}

// làm phẳng 1 kit thành các mảnh có ma trận cục bộ = đơn vị (InstancedMesh không có ma trận con): áp ma trận vào bản sao hình học
const bakeCache = new Map();
export function kitParts(kit, lod) {
  const L = kit.lods[Math.min(lod, kit.lods.length - 1)]; if (!L) return [];
  return L.parts.map(p => {
    if (p.matrix.equals(IDENT)) return p;
    const k = p.geometry.uuid + '|' + p.matrix.elements.join(',');
    let g = bakeCache.get(k); if (!g) { g = p.geometry.clone(); g.applyMatrix4(p.matrix); bakeCache.set(k, g); }
    return {geometry: g, material: p.material, matrix: IDENT, leaf: p.leaf};
  });
}
const IDENT = new THREE.Matrix4();
