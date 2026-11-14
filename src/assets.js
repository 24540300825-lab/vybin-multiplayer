// Asset registry: manifest + tải theo yêu cầu + đếm tham chiếu + giải phóng GPU/RAM.
// Mỗi asset: {id, url, type, owner(map|null), deps, size, priority, refs, state}
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {FILES} from './manifest.js';

const REG = new Map();
const def = (id, o = {}) => {
  const f = FILES[id];
  if (!f) throw new Error('asset không có trong manifest: ' + id);
  REG.set(id, {id, url: `assets/${f.file}?v=${f.v}`, type: 'glb', owner: null, deps: [], priority: 5, cache: 'immutable',
    size: f.size, refs: 0, state: 'unloaded', value: null, promise: null, ...o});
};
// owner = map sở hữu; null = dùng chung (nhân vật). priority nhỏ = nạp trước.
def('map-living', {owner: 'living', priority: 1});
def('map-vy', {owner: 'vy', priority: 1});
def('map-bin', {owner: 'bin', priority: 1});
def('map-exterior', {owner: null, priority: 1});     // dùng chung: map vườn + ngoại cảnh của 3 phòng
def('map-exterior-l2', {owner: null, priority: 1});  // nhà L2: = map-exterior bản chính (vườn giữ nguyên), chỉ thay phần nhà bằng nhà L2
def('map-game', {owner: 'game', priority: 1});
def('map-workshop', {owner: 'workshop', priority: 1});
def('map-memory', {owner: 'memory', priority: 1});
def('map-greenhouse', {owner: 'greenhouse', priority: 1});
def('map-exterior-l3', {owner: null, priority: 1});
def('map-exterior-l4', {owner: null, priority: 1});
def('map-master', {owner: 'master', priority: 1});
def('map-pets', {owner: 'pets', priority: 1});
def('map-cafe', {owner: 'cafe', priority: 1});
def('map-bowling', {owner: 'bowling', priority: 1});  // nhà L4: = map-exterior-l3 + khu nghỉ dưỡng 130 × 80 m (trang trại, khu vui chơi, hồ, đồi hoa, rừng, tàu)  // nhà L3: = map-exterior-l2 + đất mới, vườn rải lại, nhà vườn / tháp / hoạt động ngoài vườn
def('map-karaoke', {owner: 'karaoke', priority: 1});
def('map-spa', {owner: 'spa', priority: 1});
def('map-library', {owner: 'library', priority: 1});
def('map-cinema', {owner: 'cinema', priority: 1});
def('char-vy', {owner: null, priority: 2});
def('char-bin', {owner: null, priority: 2});
def('flora-hana', {owner: null, priority: 2});
def('ground-hana', {owner: null, priority: 2});  // mặt đất HANA Moss (tấm plane 21.5 m của bạn, lặp theo toạ độ thế giới)   // cây cỏ HANA (tools/hana_kit.py): cây/bụi/cỏ/hoa/đá/đá dẫn lối/chậu — dùng chung mọi map

// mùa lễ: đồ trang trí (season-<mùa>.glb) + trang phục (costume-<vy|bin>-<id>.glb) — tự đăng ký mọi file có trong manifest
for (const id of Object.keys(FILES)) if (/^(season|costume)-/.test(id) && FILES[id].file.endsWith('.glb') && !REG.has(id)) def(id, {owner: null, priority: 3});
export const hasAsset = id => REG.has(id);
export const fileUrl = id => (FILES[id] ? `assets/${FILES[id].file}?v=${FILES[id].v}` : null);   // ảnh khung chụp (png) …
export const assetInfo = id => REG.get(id);
export const listAssets = () => [...REG.values()].map(({id, state, refs, size, owner}) => ({id, state, refs, size, owner}));

// parse GLB từ ArrayBuffer. createImageBitmap tạm tắt để texture không bị premultiply/flip lệch (giữ hành vi demo gốc).
const parse = b => new Promise((res, rej) => {
  const c = window.createImageBitmap; window.createImageBitmap = undefined;
  try { new GLTFLoader().parse(b, '', res, rej); } catch (e) { rej(e); } finally { window.createImageBitmap = c; }
});

async function fetchBuf(url, onBytes) {
  const r = await fetch(url, {cache: 'default'});
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  const total = +r.headers.get('content-length') || 0;
  if (!r.body || !r.body.getReader) { const b = await r.arrayBuffer(); onBytes && onBytes(b.byteLength, b.byteLength); return b; }
  const rd = r.body.getReader(), parts = []; let got = 0;
  for (;;) { const {done, value} = await rd.read(); if (done) break; parts.push(value); got += value.length; onBytes && onBytes(got, total); }
  const out = new Uint8Array(got); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out.buffer;
}

// file đã qua tools/quantize_normals.py lưu NORMAL dạng int8 (xen kẽ, stride 4) cho nhẹ lúc tải → đổi lại Float32 thường ngay sau parse,
// để mọi chỗ dùng geometry (mergeGeometries, raycast, shader, tính toán CPU) hoạt động y như trước.
function toFloatNormals(g) {
  const seen = new Set();
  g.scene.traverse(o => {
    const geo = o.geometry; if (!geo || seen.has(geo)) return; seen.add(geo);
    const n = geo.attributes.normal;
    if (!n || (!n.isInterleavedBufferAttribute && !n.normalized && n.array instanceof Float32Array)) return;
    const f = new Float32Array(n.count * 3);
    for (let i = 0; i < n.count; i++) { f[i * 3] = n.getX(i); f[i * 3 + 1] = n.getY(i); f[i * 3 + 2] = n.getZ(i); }
    geo.setAttribute('normal', new THREE.BufferAttribute(f, 3));
  });
}

// load: trả về gltf (cache trong bộ nhớ). onProgress(frac 0..1)
export function load(id, onProgress) {
  const a = REG.get(id); if (!a) return Promise.reject(new Error('unknown asset ' + id));
  if (a.value) { onProgress && onProgress(1); return Promise.resolve(a.value); }
  if (a.promise) return a.promise;
  a.state = 'loading';
  a.promise = (async () => {
    const buf = await fetchBuf(a.url, (g, t) => onProgress && onProgress(Math.min(0.99, g / (t || a.size)) * 0.85));
    onProgress && onProgress(0.9);
    const g = await parse(buf);
    toFloatNormals(g);
    a.value = g; a.state = 'loaded'; onProgress && onProgress(1);
    return g;
  })().catch(e => { a.state = 'error'; a.promise = null; throw e; });
  return a.promise;
}

// retain/release: asset chỉ bị dispose khi không còn ai tham chiếu
export function retain(id) { const a = REG.get(id); if (a) a.refs++; return id; }
export function release(id) {
  const a = REG.get(id); if (!a) return;
  a.refs = Math.max(0, a.refs - 1);
  if (a.refs === 0 && a.value) disposeAsset(id);
}
export function disposeAsset(id) {
  const a = REG.get(id); if (!a || !a.value || a.refs > 0) return;
  const seen = new Set();
  a.value.scene.traverse(o => {
    if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) {
      if (seen.has(m)) continue; seen.add(m);
      for (const k in m) { const t = m[k]; if (t && t.isTexture && !seen.has(t)) { seen.add(t); t.dispose(); if (t.image && t.image.close) try { t.image.close(); } catch (e) {} } }
      m.dispose();
    }
  });
  a.value = null; a.promise = null; a.state = 'unloaded';
}

// nạp 1 nhóm theo thứ tự ưu tiên với tiến trình tổng (theo byte). Trả về {id: gltf}
export async function loadGroup(ids, onProgress) {
  const all = [...new Set(ids.flatMap(i => [i, ...(REG.get(i)?.deps || [])]))].sort((x, y) => REG.get(x).priority - REG.get(y).priority);
  const tot = all.reduce((s, i) => s + REG.get(i).size, 0), prog = {};
  const rep = () => onProgress && onProgress(all.reduce((s, i) => s + (prog[i] || 0) * REG.get(i).size, 0) / tot);
  const out = {};
  await Promise.all(all.map(async i => { out[i] = await load(i, p => { prog[i] = p; rep(); }); retain(i); }));
  return out;
}
