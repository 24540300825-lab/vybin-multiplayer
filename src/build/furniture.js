// NỘI THẤT ĐẶT THÊM (bản đầu của hạng mục 12): đặt đồ từ túi / kho nhà vào phòng, di chuyển, xoay, cất lại.
// Model: Kenney Furniture Kit (CC0) trong assets/furniture/<model>.glb — danh mục món nào dùng model nào nằm ở game_config.items (trường model/scale/solid).
// Máy chủ giữ vị trí (game_placed) + trừ/trả đồ; máy kia nhận tin {k:'furn'} để tải lại → hai người luôn thấy cùng một căn nhà.
// Đồ "solid" chặn đường đi (đánh dấu vào lưới va chạm của game), thảm / gối / sách thì đi qua được.
// TỈ LỆ: mỗi model Kenney có "scale" riêng (đo theo kích thước thật: ghế ngồi cao ~0.45 m như ghế bàn làm việc có sẵn, sofa ~0.72 m, đèn cây ~1.6 m…)
// ORIGIN: model Kenney có gốc ở góc → dời về TÂM ĐÁY để đặt/xoay quanh tâm. Mặt trước model = +Z cục bộ = hướng yaw của nhân vật khi ngồi.
// CÔNG DỤNG (trường "use"): sit = ngồi được (dùng clip ngồi lùi của sofa; seat {n, y: độ cao đệm theo % chiều cao, z/x: lệch tâm theo % sâu/rộng}),
//   light = bật/tắt đèn (chao phát sáng + quầng sáng hắt xuống sàn, đồng bộ 2 máy), music = bật/tắt nhạc của game.
// CÂY & VƯỜN (trường "glb", Poly Nature Pack → assets/nature/glb/<id>.glb, mỗi file nhiều biến thể v0..vN): bán 1 loại, khi RẢI ra vườn
//   mỗi cây tự lấy 1 biến thể + tỉ lệ + góc xoay ngẫu nhiên (lưu trong state {v, s}). Vẽ bằng InstancedMesh (vài trăm cây vẫn nhẹ).
//   scatter.n > 1 (cỏ, hoa, nấm…): chổi tròn bán kính r, mỗi lần bấm rải n khóm cách nhau ≥ gap. n = 1 (cây, bụi): đặt từng cây, đặt liên tục tới khi hết.
//   solidR = bán kính thân chặn đường (cỏ/hoa đi xuyên được). Chỉ trồng ngoài Vườn (out).
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MAP_CONFIGS} from '../map-configs.js';
import {ic} from '../ui/icons.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const ERR = {outdoor_only: 'Cây cối chỉ trồng được ngoài Vườn.', not_your_room: 'Đây là phòng riêng của người kia — chỉ chủ phòng sắp xếp được.', room_full: 'Phòng đã đủ số món tối đa.', bad_spot: 'Chỗ này không đặt được.',
  insufficient: 'Bạn không còn món này trong túi hay kho nhà.', bag_full: 'Túi và kho nhà đều đầy — dọn bớt rồi cất lại.', gone: 'Món này vừa được người kia cất đi.', not_placeable: 'Món này không đặt vào nhà được.'};
const errText = e => { const m = String(e && e.message || e); const k = Object.keys(ERR).find(k => m.includes(k)); return k ? ERR[k] : 'Có lỗi, thử lại sau. (' + m + ')'; };
const ROT = Math.PI / 4;
const body = o => (o && o.userData.inner) || o;   // phần thân món đồ (không tính quầng sáng đèn) — dùng cho va chạm, chọn, khung viền
const ROOM_NAME = {living: 'Phòng khách', vy: 'Phòng Vy', bin: 'Phòng Bin', exterior: 'Vườn'};

export async function mountFurniture({prog, sess, api, mapId, slot, toast}) {
  const VY = window.VY, GG = window.__G;
  if (!VY || !GG || !prog || !prog.sb) return null;
  const {scene, camera, renderer} = VY, {G, blocked, A, envMeshes} = GG, stairs = GG.stairs || [];
  const MC = MAP_CONFIGS[mapId] || {}, OUTD = !!MC.outdoor;
  const rpc = async (fn, args) => { const {data, error} = await prog.sb.rpc(fn, args || {}); if (error) throw new Error(String(error.message || error)); return data; };
  const idem = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  let defs = {}, can = false, max = 40;
  const placed = new Map();     // id → {row, obj, cells:[k…], lv}
  const root = new THREE.Group(); root.name = 'PlacedFurniture'; scene.add(root);

  // ---------- model (tải 1 lần mỗi loại, nhân bản cho từng món) ----------
  const loader = new GLTFLoader(), cache = {}, toonDone = new WeakSet();
  let _glow = null;   // vệt sáng tròn mờ dần (vẽ 1 lần, dùng chung)
  const glowTex = () => _glow ||= (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const loadModel = name => cache[name] ||= loader.loadAsync('assets/furniture/' + name + '.glb?v=1').then(g => g.scene);
  const glbReady = {};   // file cây đã tải xong (để dựng InstancedMesh đồng bộ)
  const loadGlb = path => cache['@' + path] ||= loader.loadAsync('assets/' + path + '.glb?v=1').then(g => (glbReady[path] = g.scene));
  const isG = def => !!(def && def.glb);
  // biến thể cây: node v<k> trong file; vật liệu toon + đổ bóng phẳng low-poly (làm 1 lần cho mỗi vật liệu)
  async function variantOf(def, v) {
    const sc = await loadGlb(def.glb), n = sc.children.length || 1, node = sc.children[((v | 0) % n + n) % n];
    if (!node.userData.prep) {
      node.userData.prep = 1; node.position.set(0, 0, 0); node.rotation.set(0, 0, 0); node.scale.set(1, 1, 1); node.updateMatrixWorld(true);
      node.userData.tb = new THREE.Box3().setFromObject(node);   // khung bao cục bộ (gốc thân cây = 0,0,0)
    }
    return node;
  }
  // lớp vẽ của vườn (exterior.js): cây → 'tree', bụi/dương xỉ → 'bush', cỏ/hoa/lau → 'flower' (lay gió, cúi khi đi qua);
  // đá, gốc, khúc gỗ, nấm, xương rồng → 'rock' + vật liệu cứng (không lay gió)
  const CLS = {g_sapling: 'tree', g_tree: 'tree', g_conifer: 'tree', g_autumn: 'tree', g_palm: 'tree', g_bigtree: 'tree', g_bush: 'bush', g_fern: 'bush',
    g_grass: 'flower', g_flower: 'flower', g_reed: 'flower', g_rock: 'rock', g_stump: 'rock', g_log: 'rock', g_mushroom: 'rock', g_cactus: 'rock'};
  const clsOf = def => def.cls || CLS[def.id] || 'bush';
  const rawOf = def => clsOf(def) === 'rock';
  // các mảnh của 1 biến thể: {geometry, material, raw}. Hình học đã "nướng" ma trận cục bộ (nếu có) → ma trận bản thể = ma trận món.
  // Vật liệu: lớp vườn (styleMat) tự nhân bản + gắn cờ; vật cứng (raw) và đường dự phòng dùng bản toon riêng (làm 1 lần)
  const partCache = new Map(), rawMat = new Map();
  function partsOf(def, v) {
    const sc = glbReady[def.glb]; if (!sc) return null;
    const n = sc.children.length || 1, k = def.id + ':' + (((v | 0) % n + n) % n); if (partCache.has(k)) return partCache.get(k);
    const node = sc.children[((v | 0) % n + n) % n]; node.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(node.matrixWorld).invert(), out = [];
    node.traverse(o => {
      if (!o.isMesh) return;
      const l = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld); let g = o.geometry;
      if (!l.equals(new THREE.Matrix4())) { g = g.clone(); g.applyMatrix4(l); }
      [].concat(o.material).forEach((m, i) => out.push({geometry: g, material: m, raw: rawOf(def)}));
    });
    partCache.set(k, out); return out;
  }
  function toonOf(m, def) {   // bản toon riêng (vật cứng / dự phòng)
    const stone = def && def.id === 'g_rock', key = stone ? 'stone' : m;
    let r = rawMat.get(key); if (r) return r;
    r = m.clone(); r.name = m.name; r.metalness = 0; r.roughness = 1;
    // đá cuội: cùng màu kem + độ rực với đá/đá lát của vườn (exterior.js PATHC, desat 0.82) thay vì xám đậm của atlas
    if (stone) { r.map = null; r.color.setRGB(0.86, 0.84, 0.74).multiplyScalar(1.14); r.userData.desat = 0.82; r.name = 'ROCK_user'; }
    else r.userData.desat = 0.85;
    if (api.toonMat && r.isMeshStandardMaterial) { try { api.toonMat(r); } catch (e) {} }
    rawMat.set(key, r); return r;
  }
  const castOf = def => !!(def.solidR || def.solidBox) || def.id === 'g_rock';
  async function buildG(def, ghost, v, sc) {
    const node = await variantOf(def, v), g = new THREE.Group();
    g.userData.def = def; g.userData.v = v; g.userData.tb = node.userData.tb;
    const sz = node.userData.tb.getSize(new THREE.Vector3()); g.userData.H = sz.y * sc; g.userData.W = sz.x * sc; g.userData.D = sz.z * sc;
    g.scale.setScalar(sc);
    if (ghost) {
      const inner = node.clone(true); inner.position.set(0, 0, 0);
      inner.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = false; o.material = [].concat(o.material).map(m => { const q = new THREE.MeshStandardMaterial({color: 0xffffff, map: m.map || null, transparent: true, opacity: 0.6, depthWrite: false, flatShading: true}); q.userData.ghost = 1; return q; }); if (o.material.length === 1) o.material = o.material[0]; } });
      g.add(inner); g.userData.inner = inner;
    }
    return g;   // món thật: KHÔNG có mesh riêng — vẽ bằng InstancedMesh chung (xem rebuildInst)
  }
  async function build(def, ghost) {
    const src = await loadModel(def.model);
    const inner = src.clone(true);
    let shade = null;
    if (!ghost && def.use === 'light') {   // chao đèn: vật liệu RIÊNG từng cây đèn (bật/tắt độc lập) — nhân bản TRƯỚC khi đổi sang toon
      const f = m => { if (m && /lamp/i.test(m.name)) { shade ||= m.clone(); return shade; } return m; };
      inner.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(f) : f(o.material); });
    }
    inner.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = !ghost; o.receiveShadow = !ghost;
      if (ghost) { o.material = [].concat(o.material).map(m => { const g = new THREE.MeshStandardMaterial({color: m.color ? m.color.clone() : 0xffffff, transparent: true, opacity: 0.6, depthWrite: false}); g.userData.ghost = 1; return g; }); if (o.material.length === 1) o.material = o.material[0]; }
      else [].concat(o.material).forEach(m => { if (m && !toonDone.has(m) && api.toonMat && m.isMeshStandardMaterial) { toonDone.add(m); try { api.toonMat(m); } catch (e) {} } });
    });
    const s = def.scale || 1.9; inner.scale.setScalar(s);
    const b = new THREE.Box3().setFromObject(inner), c = b.getCenter(new THREE.Vector3());
    inner.position.set(-c.x, -b.min.y, -c.z);          // tâm đáy món đồ = gốc nhóm → đặt / xoay quanh tâm
    const g = new THREE.Group(); g.add(inner); g.userData.def = def; g.userData.inner = inner;
    const sz = b.getSize(new THREE.Vector3()); g.userData.H = sz.y; g.userData.W = sz.x; g.userData.D = sz.z;
    if (!ghost && def.use === 'light') {
      // ánh sáng "giả" nhẹ máy: quầng sáng ấm hắt xuống sàn + đốm sáng quanh chao (KHÔNG dùng PointLight — thêm đèn thật bắt mọi shader toon của nhà biên dịch lại, máy yếu sẽ khựng)
      g.userData.shade = shade;
      const r = (def.light && def.light.r) || 3, hy = ((def.light && def.light.y) || 0.85) * sz.y;
      const pool = new THREE.Mesh(new THREE.CircleGeometry(r * 0.55, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({map: glowTex(), color: 0xffb867, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false}));
      pool.position.y = 0.015; pool.renderOrder = 2; g.add(pool);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex(), color: 0xffd79a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false}));
      halo.scale.setScalar(Math.max(0.6, sz.x * 3.2)); halo.position.y = hy; g.add(halo);
      g.userData.glow = [pool, halo];
    }
    return g;
  }

  // ---------- lưới va chạm: đồ "solid" chặn ô; cất đi thì trả lại đúng ô mình đã chặn ----------
  const cnt = [new Map(), new Map()], owned = [new Set(), new Set()];
  const lvOf = y => (!OUTD && y > (A.L0 + A.L1) / 2) ? 1 : 0;
  const cellsOf = (box, pad) => {
    const out = [], i0 = Math.max(0, Math.floor((box.min.x - pad - G.x0) / G.c)), i1 = Math.min(G.W - 1, Math.floor((box.max.x + pad - G.x0) / G.c));
    const j0 = Math.max(0, Math.floor((box.min.z - pad - G.z0) / G.c)), j1 = Math.min(G.H - 1, Math.floor((box.max.z + pad - G.z0) / G.c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push(j * G.W + i);
    return out;
  };
  function block(rec) {
    const d = rec.obj.userData.def; if (!d.solid && !d.solidR && !d.solidBox) return;
    const lv = rec.lv;
    if (d.solidR) rec.cells = cellsCircle(rec.obj.position.x, rec.obj.position.z, d.solidR * (rec.obj.scale.x || 1) + G.R);
    else rec.cells = cellsOf(boxOf(rec.obj), G.R);
    for (const k of rec.cells) { const n = (cnt[lv].get(k) || 0) + 1; cnt[lv].set(k, n); if (n === 1 && !blocked[lv][k]) { blocked[lv][k] = 1; owned[lv].add(k); } }
  }
  function unblock(rec) {
    if (!rec.cells) return; const lv = rec.lv;
    for (const k of rec.cells) { const n = (cnt[lv].get(k) || 1) - 1; if (n <= 0) { cnt[lv].delete(k); if (owned[lv].has(k)) { blocked[lv][k] = 0; owned[lv].delete(k); } } else cnt[lv].set(k, n); }
    rec.cells = null;
  }
  const shadows = () => { try { renderer.shadowMap.needsUpdate = true; } catch (e) {} };
  // khung bao thế giới: cây vườn dùng khung bao biến thể × ma trận (không có mesh riêng); nội thất dùng mesh thân
  function boxOf(o) { o.updateMatrixWorld(true); return o.userData.tb ? o.userData.tb.clone().applyMatrix4(o.matrixWorld) : new THREE.Box3().setFromObject(body(o)); }
  const cellsCircle = (x, z, r) => { const out = []; const i0 = Math.max(0, Math.floor((x - r - G.x0) / G.c)), i1 = Math.min(G.W - 1, Math.floor((x + r - G.x0) / G.c)), j0 = Math.max(0, Math.floor((z - r - G.z0) / G.c)), j1 = Math.min(G.H - 1, Math.floor((z + r - G.z0) / G.c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const cx = G.x0 + (i + 0.5) * G.c, cz = G.z0 + (j + 0.5) * G.c; if ((cx - x) ** 2 + (cz - z) ** 2 <= r * r) out.push(j * G.W + i); } return out; };

  // ---------- công dụng: chỗ ngồi + đèn ----------
  const seatIds = rec => { const d = rec.obj.userData.def; return d.use === 'sit' && d.seat ? Array.from({length: d.seat.n || 1}, (_, k) => 'f' + rec.id + ':' + k) : []; };
  function attach(rec) {
    const o = rec.obj, d = o.userData.def;
    if (d.use === 'sit' && d.seat && api.seatSet) {
      const r = o.rotation.y, c = Math.cos(r), sn = Math.sin(r), S = d.seat, n = S.n || 1, fy = o.position.y;
      seatIds(rec).forEach((id, k) => {
        const lx = n > 1 ? (k ? 1 : -1) * (S.x || 0.16) * o.userData.W : 0, lz = (S.z || 0) * o.userData.D;
        api.seatSet(id, {x: o.position.x + lx * c + lz * sn, y: fy + S.y * o.userData.H, z: o.position.z - lx * sn + lz * c, yaw: r, lv: rec.lv, fy});
      });
    }
    if (d.use === 'light') paintLight(rec);
  }
  function detach(rec) { if (api.seatDel) seatIds(rec).forEach(id => api.seatDel(id)); }
  const seated = rec => seatIds(rec).some(id => api.seatFree && !api.seatFree(id));
  function paintLight(rec) {
    const o = rec.obj, d = o.userData.def, on = !!(rec.row.state && rec.row.state.on);
    (o.userData.glow || []).forEach((m, k) => { m.material.opacity = on ? (k ? 0.85 : 0.32 * Math.min(1.6, ((d.light && d.light.i) || 4) / 4)) : 0; m.visible = on; });
    const m = o.userData.shade; if (m) { m.emissive = new THREE.Color(on ? 0xffd9a0 : 0x000000); m.emissiveIntensity = on ? 0.9 : 0; }
  }

  // ---------- tải danh sách đồ đã đặt của map này ----------
  let loading = null;
  async function reload() {
    if (loading) return loading;
    loading = (async () => {
      let d; try { d = await rpc('game_placed', {p_map: mapId}); } catch (e) { console.warn('[furn]', e); return; }
      can = !!d.can; max = d.max || 40; defs = {}; (d.defs || []).forEach(x => { defs[x.id] = x; });
      const seen = new Set();
      for (const r of d.items || []) {
        seen.add(r.id);
        const cur = placed.get(r.id);
        if (cur && cur.row.x === r.x && cur.row.z === r.z && cur.row.y === r.y && cur.row.rot === r.rot) { cur.row = r; if (cur.obj && !cur.g) paintLight(cur); continue; }
        if (cur && cur.obj) { if (sel && sel.id === r.id) continue; unblock(cur); detach(cur); cur.obj.position.set(r.x, r.y, r.z); cur.obj.rotation.y = r.rot; cur.lv = lvOf(r.y); cur.row = r; block(cur); attach(cur); continue; }
        const def = defs[r.item]; if (!def) continue;
        const rec = {id: r.id, row: r, obj: null, lv: lvOf(r.y), g: isG(def)}; placed.set(r.id, rec);
        const st = r.state || {};
        try { rec.obj = rec.g ? await buildG(def, false, st.v | 0, +st.s || 1) : await build(def, false); } catch (e) { console.warn('[furn] model', def.model || def.glb, e); placed.delete(r.id); continue; }
        if (!placed.has(r.id)) continue;
        rec.obj.position.set(r.x, r.y, r.z); rec.obj.rotation.y = r.rot; rec.obj.userData.pid = r.id; if (!rec.g) root.add(rec.obj); block(rec); attach(rec);
      }
      for (const [id, rec] of [...placed]) if (!seen.has(id) && !(sel && sel.id === id && sel.fresh)) { unblock(rec); if (rec.obj) { detach(rec); root.remove(rec.obj); } placed.delete(id); if (sel && sel.id === id) endSel(); }
      rebuildInst(); shadows(); paintBar();
    })().finally(() => { loading = null; });
    return loading;
  }
  // ---------- vẽ cây vườn: 1 InstancedMesh cho mỗi (loại, biến thể, mảnh mesh) ----------
  const instRoot = new THREE.Group(); instRoot.name = 'PlacedGarden'; scene.add(instRoot);
  let instMeshes = [];
  const EXT = api.ext && api.ext.setUser ? api.ext : null, OFF = api.extOff || {dx: 0, dz: 0};
  let outdoorView = [];     // map trong nhà: cây đã rải ngoài vườn (chỉ để vẽ qua khung cửa — không chặn, không chọn)
  function rebuildInst() {
    instMeshes.forEach(m => { instRoot.remove(m); m.dispose && m.dispose(); }); instMeshes = [];
    const groups = new Map(), add = (rec, dx, dz) => { const k = rec.row.item + ':' + (rec.obj.userData.v | 0); (groups.get(k) || groups.set(k, {def: rec.obj.userData.def, v: rec.obj.userData.v | 0, list: []}).get(k)).list.push({rec, dx, dz}); };
    placed.forEach(rec => { if (rec.g && rec.obj && !rec.hidden) add(rec, 0, 0); });
    outdoorView.forEach(rec => add(rec, OFF.dx, OFF.dz));
    const M = new THREE.Matrix4(), T = new THREE.Matrix4();
    const want = new Set();
    groups.forEach((G0, key) => {
      const parts = partsOf(G0.def, G0.v); if (!parts || !parts.length) return;
      const mats = G0.list.map(({rec, dx, dz}) => { rec.obj.updateMatrix(); const m = rec.obj.matrix.clone(); if (dx || dz) m.premultiply(T.makeTranslation(dx, 0, dz)); m.pid = rec.id; return m; });
      if (EXT) {      // đi chung đường ống cây cối của vườn
        EXT.setUser('u:' + key, parts.map(p => ({geometry: p.geometry, material: p.raw ? toonOf(p.material, G0.def) : p.material, raw: p.raw})), clsOf(G0.def), mats); want.add('u:' + key);
        return;
      }
      for (const p of parts) {   // dự phòng (không có lớp vườn): InstancedMesh riêng, vật liệu toon
        const im = new THREE.InstancedMesh(p.geometry, toonOf(p.material, G0.def), mats.length); im.castShadow = castOf(G0.def); im.receiveShadow = true; im.userData.ids = mats.map(m => m.pid);
        mats.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); instRoot.add(im); instMeshes.push(im);
      }
    });
    if (EXT) EXT.userKeys().forEach(k => { if (!want.has(k)) EXT.removeUser(k); });
  }
  // map trong nhà: tải cây đã rải ngoài vườn để thấy qua cửa sổ / mặt cắt (đúng chỗ, dời theo ngoại cảnh)
  async function loadOutdoorView() {
    if (mapId === 'exterior' || !EXT) return;
    let d; try { d = await rpc('game_placed', {p_map: 'exterior'}); } catch (e) { return; }
    const D = {}; (d.defs || []).forEach(x => { D[x.id] = x; });
    const out = [];
    for (const r of d.items || []) {
      const def = D[r.item]; if (!isG(def)) continue;
      const st = r.state || {}; try { const o = await buildG(def, false, st.v | 0, +st.s || 1); o.position.set(r.x, r.y, r.z); o.rotation.y = r.rot; out.push({id: r.id, row: r, obj: o, g: true}); } catch (e) {}
    }
    outdoorView = out; rebuildInst();
  }
  const poke = () => { try { sess && sess.send({k: 'furn', map: mapId}); } catch (e) {} };
  sess && sess.on && sess.on('msg', m => { if (m && m.k === 'furn' && m.map === mapId) reload(); else if (m && m.k === 'furn' && m.map === 'exterior') loadOutdoorView(); });

  // ---------- tia chuột → điểm trên sàn ----------
  const ray = new THREE.Raycaster(), mv = new THREE.Vector2();
  function floorAt(cx, cy) {
    const r = renderer.domElement.getBoundingClientRect();
    mv.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(mv, camera);
    for (const h of ray.intersectObjects(envMeshes, false)) {
      if (h.object.userData.glass) continue;
      const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      if (n.y < 0.6) continue;
      const y = h.point.y, onL0 = Math.abs(y - A.L0) < 0.35, onL1 = !OUTD && Math.abs(y - A.L1) < 0.35;
      if (!onL0 && !onL1) continue;      // mặt bàn, bậu cửa, mái… → bỏ qua, tìm tiếp sàn phía sau
      return {x: h.point.x, y: onL1 ? A.L1 : A.L0, z: h.point.z};
    }
    return null;
  }
  const onStair = (x, z) => stairs.some(S => x > S.x0 - 0.15 && x < S.x1 + 0.15 && z > S.z0 - 0.3 && z < S.z1 + 0.3);
  // chỗ đặt hợp lệ: nằm trong vùng đi được của tầng, không đè lên đồ cố định / món khác / cầu thang
  const inNoPlant = (x, z) => (MAP_CONFIGS.exterior && OUTD ? (MAP_CONFIGS.exterior.noPlant || []) : []).some(b => x > b[0] && x < b[1] && z > b[2] && z < b[3]);
  function validPoint(def, x, z, sc, selfId, extra) {   // cây vườn: 1 điểm gốc
    const w = MC.walk0; if (w && (x < w[0] || x > w[1] || z < w[2] || z > w[3])) return false;
    if (onStair(x, z) || inNoPlant(x, z)) return false;
    const self = selfId && placed.get(selfId), mine = self && self.cells ? new Set(self.cells) : null;
    const free = k => !blocked[0][k] || (mine && mine.has(k) && owned[0].has(k));
    const cells = cellsCircle(x, z, def.solidR ? def.solidR * sc : 0.06); if (!cells.length) return false;
    for (const k of cells) if (!free(k)) return false;
    const gap = ((def.scatter && def.scatter.gap) || 0.4) * 0.6;
    for (const rec of placed.values()) if (rec.id !== selfId && rec.row.item === def.id && Math.hypot(rec.obj.position.x - x, rec.obj.position.z - z) < gap) return false;
    for (const q of extra || []) if (Math.hypot(q.x - x, q.z - z) < ((def.scatter && def.scatter.gap) || 0.4)) return false;
    const L = api.local && api.local.P; if (L && def.solidR && Math.hypot(L.pos.x - x, L.pos.z - z) < def.solidR * sc + 0.35) return false;
    return true;
  }
  function validSpot(obj, selfId) {
    if (obj.userData.ring) return true;
    if (obj.userData.tb && isG(obj.userData.def)) return validPoint(obj.userData.def, obj.position.x, obj.position.z, obj.scale.x || 1, selfId);
    obj.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(body(obj)), lv = lvOf(obj.position.y), def = obj.userData.def;
    const x = obj.position.x, z = obj.position.z;
    const w = lv === 0 ? MC.walk0 : MC.l1;
    if (w && (x < w[0] || x > w[1] || z < w[2] || (w[3] != null && z > w[3]))) return false;
    if (onStair(x, z)) return false;
    const self = selfId && placed.get(selfId), mine = self && self.cells ? new Set(self.cells) : null;
    const free = k => !blocked[lv][k] || (mine && mine.has(k) && owned[lv].has(k));
    if (!def.solid) { const c = cellsOf(new THREE.Box3(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 0, z)), 0)[0]; return c != null && free(c); }
    const shrink = b.clone(); shrink.min.x += G.R + 0.02; shrink.max.x -= G.R + 0.02; shrink.min.z += G.R + 0.02; shrink.max.z -= G.R + 0.02;
    if (shrink.min.x > shrink.max.x) { shrink.min.x = shrink.max.x = x; } if (shrink.min.z > shrink.max.z) { shrink.min.z = shrink.max.z = z; }
    for (const k of cellsOf(shrink, 0)) if (!free(k)) return false;
    // không đặt đè lên nhân vật của mình
    const L = api.local && api.local.P; if (L && L.level === lv && L.pos.x > b.min.x - 0.1 && L.pos.x < b.max.x + 0.1 && L.pos.z > b.min.z - 0.1 && L.pos.z < b.max.z + 0.1) return false;
    return true;
  }
  const tint = (obj, ok) => obj.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => { if (m.userData.ghost) { m.emissive = new THREE.Color(ok ? 0x2a8f3a : 0xa02a2a); m.emissiveIntensity = 0.7; } }); });

  // ---------- trạng thái: đặt mới (place) / đang chọn 1 món (sel) / chế độ sắp xếp (arrange) ----------
  let placing = null, sel = null, arrange = false, lastPtr = 'mouse';
  function endPlacing() { if (placing && placing.ghost) root.remove(placing.ghost); placing = null; }
  function endSel() {
    if (sel && sel.ghost) { root.remove(sel.ghost); const rec = placed.get(sel.id); if (rec && rec.obj) { rec.obj.visible = true; if (rec.hidden) { rec.hidden = false; rebuildInst(); } } }
    sel = null;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const scaleOf = def => { const s = (def.scatter && def.scatter.s) || [0.9, 1.1]; return rnd(s[0], s[1]); };
  async function countOf(itemId) { try { const b = await prog.bag(); const f = l => ((l || []).find(x => x.id === itemId) || {}).n || 0; return f(b.mine) + f(b.house); } catch (e) { return 0; } }
  async function newGhostG(def) {
    const v = Math.floor(Math.random() * (def.variants || 1)), sc = scaleOf(def), g = await buildG(def, true, v, sc);
    g.rotation.y = Math.random() * Math.PI * 2; return g;
  }
  function ringGhost(def) {
    const r = (def.scatter && def.scatter.r) || 1.2, g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.07, r, 56).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color: 0xffd581, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false}));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 56).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color: 0xffd581, transparent: true, opacity: 0.12, depthWrite: false, depthTest: false}));
    ring.renderOrder = disc.renderOrder = 998; ring.position.y = disc.position.y = 0.04; g.add(disc, ring); g.userData.ring = true; g.userData.def = def; g.userData.r = r; return g;
  }
  async function startPlace(itemId) {
    const def = defs[itemId] || (await reload(), defs[itemId]);
    if (!def) { toast('Món này chưa có hình 3D để đặt.'); return; }
    if (def.out && mapId !== 'exterior') { toast(ERR.outdoor_only); return; }
    if (!can) { toast(ERR.not_your_room); return; }
    if (placed.size >= max) { toast(ERR.room_full); return; }
    endSel(); endPlacing();
    if (isG(def)) {      // cây vườn: chổi rải (nhiều khóm) hoặc đặt từng cây, đặt liên tục tới khi hết
      const left = await countOf(itemId); if (left < 1) { toast(ERR.insufficient); return; }
      const multi = ((def.scatter && def.scatter.n) || 1) > 1, ghost = multi ? ringGhost(def) : await newGhostG(def);
      const L = api.local && api.local.P; ghost.position.set(L ? L.pos.x + Math.sin(L.yaw) * 2 : 5, A.L0, L ? L.pos.z + Math.cos(L.yaw) * 2 : 5);
      root.add(ghost); placing = {item: itemId, def, ghost, multi, left}; if (!multi) tint(ghost, validSpot(ghost)); setArrange(true); paintBar(); return;
    }
    const ghost = await build(def, true); ghost.userData.def = def;
    // xuất hiện ngay trước mặt nhân vật
    const L = api.local && api.local.P; const p = L ? {x: L.pos.x + Math.sin(L.yaw) * 1.2, y: L.level ? A.L1 : A.L0, z: L.pos.z + Math.cos(L.yaw) * 1.2} : {x: 5, y: A.L0, z: -4};
    ghost.position.set(p.x, p.y, p.z); ghost.rotation.y = 0;   // mặc định quay mặt ra phía camera (mặt cắt mở của phòng); R để xoay
    root.add(ghost); placing = {item: itemId, def, ghost}; tint(ghost, validSpot(ghost)); setArrange(true); paintBar();
  }
  function select(id) {
    const rec = placed.get(id); if (!rec || !rec.obj) return;
    endPlacing(); endSel();
    sel = {id, rec, moving: false, ghost: null, rot: rec.obj.rotation.y}; paintBar();
  }
  async function startMove() {
    if (!sel) return; const rec = sel.rec;
    sel.moving = true; sel.ghost = rec.g ? await buildG(rec.obj.userData.def, true, rec.obj.userData.v | 0, rec.obj.scale.x || 1) : await build(rec.obj.userData.def, true); sel.ghost.position.copy(rec.obj.position); sel.ghost.rotation.y = rec.obj.rotation.y;
    rec.obj.visible = false; if (rec.g) { rec.hidden = true; rebuildInst(); } root.add(sel.ghost); tint(sel.ghost, true); paintBar();
  }
  function rotate(d) {
    const g = placing ? placing.ghost : sel && (sel.ghost || null);
    if (g) { g.rotation.y += d * ROT; tint(g, validSpot(g, sel && sel.id)); return; }
    if (sel) {   // xoay tại chỗ (chưa bấm Di chuyển): thử, không hợp lệ thì hoàn lại
      const rec = sel.rec, old = rec.obj.rotation.y; if (seated(rec)) { toast('Đang có người ngồi — đứng dậy rồi hãy xoay.'); return; }
      unblock(rec); detach(rec); rec.obj.rotation.y = old + d * ROT;
      if (!validSpot(rec.obj, null)) { rec.obj.rotation.y = old; block(rec); attach(rec); toast('Xoay chỗ này bị vướng — thử Di chuyển ra chỗ rộng hơn.'); return; }
      block(rec); attach(rec); if (rec.g) rebuildInst(); shadows(); saveMove(rec);
    }
  }
  let saveT = null;
  function saveMove(rec) {
    clearTimeout(saveT);
    saveT = setTimeout(async () => {
      const o = rec.obj; try { await rpc('game_place_move', {p_id: rec.id, p_x: o.position.x, p_y: o.position.y, p_z: o.position.z, p_rot: o.rotation.y}); rec.row = {...rec.row, x: o.position.x, y: o.position.y, z: o.position.z, rot: o.rotation.y}; poke(); }
      catch (e) { toast(errText(e)); reload(); }
    }, 400);
  }
  // rải: chọn ngẫu nhiên n điểm trong chổi, mỗi điểm 1 biến thể + tỉ lệ + góc xoay
  async function confirmScatter() {
    const P = placing, def = P.def, g = P.ghost, S = def.scatter || {}, n = Math.min(12, S.n || 1, P.left), r = S.r || 1.2, pts = [];
    if (P.multi) {
      for (let t = 0; t < n * 14 && pts.length < n; t++) {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r, x = g.position.x + Math.cos(a) * d, z = g.position.z + Math.sin(a) * d, sc = scaleOf(def);
        if (validPoint(def, x, z, sc, null, pts)) pts.push({x, z, y: g.position.y, rot: Math.random() * Math.PI * 2, v: Math.floor(Math.random() * (def.variants || 1)), s: +sc.toFixed(3)});
      }
      if (!pts.length) { toast('Chỗ này kín rồi — rê sang chỗ trống hơn.'); return; }
    } else {
      if (!validSpot(g)) { toast('Chỗ này bị vướng — chọn chỗ trống trên đất.'); return; }
      pts.push({x: g.position.x, z: g.position.z, y: g.position.y, rot: g.rotation.y, v: g.userData.v | 0, s: +g.scale.x.toFixed(3)});
    }
    busy(true);
    try {
      const res = await rpc('game_place_many', {p_item: P.item, p_map: mapId, p_pts: pts, p_idem: idem()});
      await reload(); poke(); prog.refresh();
      window.SFX && window.SFX.play && window.SFX.play('click');
      if (placing === P) {
        P.left = res && res.left != null ? res.left : P.left - pts.length;
        if (P.left <= 0) { endPlacing(); toast('Đã dùng hết ' + def.name + ' — mua thêm ở Cửa hàng nhé'); }
        else if (!P.multi) { const pos = g.position.clone(); root.remove(g); P.ghost = await newGhostG(def); P.ghost.position.copy(pos); root.add(P.ghost); tint(P.ghost, validSpot(P.ghost)); }
      }
    } catch (e) { toast(errText(e)); }
    busy(false); paintBar();
  }
  async function reroll() { const P = placing; if (!P || P.multi || !isG(P.def)) return; const pos = P.ghost.position.clone(), rot = P.ghost.rotation.y; root.remove(P.ghost); P.ghost = await newGhostG(P.def); P.ghost.position.copy(pos); P.ghost.rotation.y = rot; root.add(P.ghost); tint(P.ghost, validSpot(P.ghost)); }
  function startErase() { endSel(); endPlacing(); const g = ringGhost({scatter: {r: 1.5}}); const L = api.local && api.local.P; g.position.set(L ? L.pos.x : 5, A.L0, L ? L.pos.z + 2 : 5); root.add(g); placing = {erase: true, ghost: g, def: {name: 'Chổi'}}; paintBar(); }
  async function confirmErase() {
    const g = placing.ghost, ids = [];
    placed.forEach(rec => { if (rec.g && Math.hypot(rec.obj.position.x - g.position.x, rec.obj.position.z - g.position.z) <= 1.5) ids.push(rec.id); });
    if (!ids.length) { toast('Trong vòng tròn không có cây cỏ nào'); return; }
    busy(true);
    try { const r = await rpc('game_place_pickup_many', {p_ids: ids.slice(0, 40)}); await reload(); poke(); prog.refresh(); toast('Đã cất ' + (r.n || 0) + ' món về túi' + (r.kept ? ' · ' + r.kept + ' món chưa cất được (túi và kho đầy)' : '')); }
    catch (e) { toast(errText(e)); }
    busy(false); paintBar();
  }
  async function confirmPlace() {
    if (!placing) return; const g = placing.ghost;
    if (placing.erase) return confirmErase();
    if (isG(placing.def)) return confirmScatter();
    if (!validSpot(g)) { toast('Chỗ này bị vướng — chọn chỗ trống trên sàn.'); return; }
    const it = placing.item, p = g.position.clone(), rot = g.rotation.y, def = placing.def;
    busy(true);
    try {
      const r = await rpc('game_place', {p_item: it, p_map: mapId, p_x: p.x, p_y: p.y, p_z: p.z, p_rot: rot, p_idem: idem()});
      endPlacing(); await reload(); poke(); prog.refresh();
      toast('Đã đặt ' + def.name + (r && r.from === 'house' ? ' (lấy từ kho nhà)' : ''));
      window.SFX && window.SFX.play && window.SFX.play('success');
    } catch (e) { toast(errText(e)); }
    busy(false); paintBar();
  }
  async function confirmMove() {
    if (!sel || !sel.ghost) return; const g = sel.ghost, rec = sel.rec;
    if (!validSpot(g, rec.id)) { toast('Chỗ này bị vướng — chọn chỗ trống trên sàn.'); return; }
    if (seated(rec)) { toast('Đang có người ngồi — đứng dậy rồi hãy dời.'); return; }
    unblock(rec); detach(rec); rec.obj.position.copy(g.position); rec.obj.rotation.y = g.rotation.y; rec.lv = lvOf(g.position.y); block(rec); attach(rec); shadows();
    root.remove(g); rec.obj.visible = true; sel.ghost = null; sel.moving = false; if (rec.g) { rec.hidden = false; rebuildInst(); } saveMove(rec); paintBar();
  }
  async function pickup() {
    if (!sel) return; const rec = sel.rec; if (seated(rec)) { toast('Đang có người ngồi — đứng dậy rồi hãy cất.'); return; } busy(true);
    try {
      const r = await rpc('game_place_pickup', {p_id: rec.id});
      endSel(); unblock(rec); detach(rec); if (rec.obj) root.remove(rec.obj); placed.delete(rec.id); if (rec.g) rebuildInst(); shadows(); poke(); prog.refresh();
      toast('Đã cất ' + rec.obj.userData.def.name + (r && r.to === 'house' ? ' vào kho nhà (túi đầy)' : ' vào túi'));
    } catch (e) { toast(errText(e)); }
    busy(false); paintBar();
  }
  function setArrange(on) { arrange = on; if (!on) { endPlacing(); endSel(); } document.documentElement.classList.toggle('vy-arrange', on); paintBar(); }

  // ---------- con trỏ ----------
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', e => { lastPtr = e.pointerType || 'mouse'; }, true);
  cv.addEventListener('pointermove', e => {
    const g = placing ? placing.ghost : sel && sel.ghost; if (!g || e.pointerType === 'touch') return;
    const p = floorAt(e.clientX, e.clientY); if (!p) return; g.position.set(p.x, p.y, p.z); if (!g.userData.ring) tint(g, validSpot(g, sel && sel.id));
  });
  function hitFurniture(e) {
    const r = cv.getBoundingClientRect(); mv.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(mv, camera);
    const objs = [...instMeshes, ...(EXT && mapId === 'exterior' ? EXT.userMeshes() : [])]; placed.forEach(rec => { if (rec.obj && rec.obj.visible && !rec.g) objs.push(body(rec.obj)); });
    const h = ray.intersectObjects(objs, true)[0]; if (!h) return null;
    if (h.object.isInstancedMesh && h.instanceId != null) return h.object.userData.ids[h.instanceId] || null;
    let o = h.object; while (o && !o.userData.pid) o = o.parent; return o ? o.userData.pid : null;
  }
  api.pickHook = e => {
    const g = placing ? placing.ghost : sel && sel.ghost;
    if (g) {     // đang cầm 1 món: chuột = đặt luôn; chạm (điện thoại) = dời bóng tới chỗ chạm, bấm nút Đặt để xác nhận
      const p = floorAt(e.clientX, e.clientY);
      if (p) { g.position.set(p.x, p.y, p.z); tint(g, validSpot(g, sel && sel.id)); }
      if (lastPtr !== 'touch' && p) { if (placing) confirmPlace(); else confirmMove(); }
      return true;
    }
    if (!arrange) { const id = hitFurniture(e); const rec = id && placed.get(id); if (rec && rec.obj.userData.def.use) { use(rec); return true; } return false; }
    const id = hitFurniture(e);
    if (id) { if (can) select(id); else toast(ERR.not_your_room); return true; }
    if (sel) { endSel(); paintBar(); return true; }
    return false;
  };
  addEventListener('keydown', e => {
    if (!arrange) return;
    const t = e.target; if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
    const hold = placing || (sel && sel.ghost);
    if (e.code === 'KeyR') { e.preventDefault(); e.stopImmediatePropagation(); rotate(e.shiftKey ? -1 : 1); }
    else if (e.code === 'KeyV' && placing && isG(placing.def)) { e.preventDefault(); e.stopImmediatePropagation(); reroll(); }
    else if (e.code === 'Escape') { e.stopImmediatePropagation(); if (hold) { if (placing) endPlacing(); else { endSel(); } paintBar(); } else setArrange(false); }
    else if (e.code === 'Enter' && hold) { e.preventDefault(); if (placing) confirmPlace(); else confirmMove(); }
    else if ((e.code === 'Delete' || e.code === 'Backspace') && sel && !sel.ghost) { e.preventDefault(); pickup(); }
  }, true);

  // ---------- dùng đồ: ngồi / bật đèn / bật nhạc ----------
  async function use(rec) {
    const d = rec.obj.userData.def, L = api.local;
    if (d.use === 'sit' && L) {
      if (L.P.mode === 'watch' && seatIds(rec).includes(L.P.seat)) { L.cmdUnwatch(); return; }
      const free = seatIds(rec).filter(id => !api.seatFree || api.seatFree(id));
      if (!free.length) { toast('Chỗ này có người ngồi rồi'); return; }
      const p = L.P.pos, pick = free.map(id => { const k = +id.split(':')[1], n = d.seat.n || 1, r = rec.obj.rotation.y, lx = n > 1 ? (k ? 1 : -1) * (d.seat.x || 0.16) * rec.obj.userData.W : 0; return {id, x: rec.obj.position.x + lx * Math.cos(r), z: rec.obj.position.z - lx * Math.sin(r)}; })
        .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      L.cmdWatch(pick.id); return;
    }
    if (d.use === 'light') {
      const on = !(rec.row.state && rec.row.state.on); rec.row = {...rec.row, state: {...(rec.row.state || {}), on}}; paintLight(rec); paintPins(true);
      try { await rpc('game_place_use', {p_id: rec.id, p_on: on}); poke(); } catch (e) { toast(errText(e)); reload(); }
      window.SFX && window.SFX.play && window.SFX.play('click');
      return;
    }
    if (d.use === 'music') { const b = $('mPlay'); if (b) b.click(); setTimeout(() => paintPins(true), 300); }
  }
  const pinBox = document.createElement('div'); pinBox.id = 'fPins'; document.body.appendChild(pinBox);
  const pinEls = new Map(), v3 = new THREE.Vector3();
  const musicOn = () => { const c = $('mCv'); return !!(c && c.classList.contains('spin')); };   // HUD nhạc: đĩa quay = đang phát
  function pinLabel(rec) {
    const d = rec.obj.userData.def, L = api.local;
    if (d.use === 'sit') return L && L.P.mode === 'watch' && seatIds(rec).includes(L.P.seat) ? ['Đứng dậy', 'sit', 1] : ['Ngồi', 'sit', 0];
    if (d.use === 'light') return rec.row.state && rec.row.state.on ? ['Tắt đèn', 'bolt', 1] : ['Bật đèn', 'bolt', 0];
    if (d.use === 'music') return ['Nhạc', 'vol', musicOn() ? 1 : 0];
    return null;
  }
  function paintPins(force) {
    const L = api.local && api.local.P, hide = arrange || api.theater || document.hidden || !L;
    const r = renderer.domElement.getBoundingClientRect();
    placed.forEach(rec => {
      const d = rec.obj && rec.obj.userData.def; if (!d || !d.use) return;
      let el = pinEls.get(rec.id);
      if (!el) { el = document.createElement('button'); el.className = 'fpin'; el.onclick = ev => { ev.stopPropagation(); use(rec); }; pinBox.appendChild(el); pinEls.set(rec.id, el); }
      const near = L && rec.lv === L.level && Math.hypot(rec.obj.position.x - L.pos.x, rec.obj.position.z - L.pos.z) < 3.2;
      if (hide || !near || !rec.obj.visible) { el.hidden = true; return; }
      v3.set(rec.obj.position.x, rec.obj.position.y + rec.obj.userData.H + 0.25, rec.obj.position.z).project(camera);
      if (v3.z > 1 || Math.abs(v3.x) > 1.05 || Math.abs(v3.y) > 1.05) { el.hidden = true; return; }
      el.hidden = false; el.style.transform = `translate(${(r.left + (v3.x + 1) / 2 * r.width).toFixed(1)}px,${(r.top + (1 - v3.y) / 2 * r.height).toFixed(1)}px)`;
      const [lab, icn, on] = pinLabel(rec), key = lab + on;
      if (force || el.dataset.k !== key) { el.dataset.k = key; el.classList.toggle('on', !!on); el.innerHTML = `<i class="ic">${ic(icn) || '•'}</i><span>${esc(lab)}</span>`; el.title = d.name + ' — ' + lab; }
    });
    pinEls.forEach((el, id) => { if (!placed.has(id)) { el.remove(); pinEls.delete(id); } });
  }

  // ---------- thanh điều khiển nổi ----------
  const bar = document.createElement('div'); bar.id = 'fnBar'; bar.className = 'hud panel'; bar.hidden = true; document.body.appendChild(bar);
  let isBusy = false; const busy = v => { isBusy = v; bar.classList.toggle('busy', v); };
  function paintBar() {
    if (!arrange) { bar.hidden = true; return; }
    bar.hidden = false;
    const B = (id, label, icon, cls = 'pl') => `<button class="${cls}" id="${id}"${isBusy ? ' disabled' : ''}>${icon ? `<i class="ic">${ic(icon)}</i>` : ''}${label}</button>`;
    const rotBtns = `<button class="rb" id="fnL" title="Xoay trái (Shift+R)" aria-label="Xoay trái">⟲</button><button class="rb" id="fnR" title="Xoay phải (R)" aria-label="Xoay phải">⟳</button>`;
    if (placing && placing.erase) {
      bar.innerHTML = `<div class="fn-t"><b>Chổi cất cây cỏ</b><small>${lastPtr === 'touch' ? 'Chạm chỗ muốn dọn rồi bấm Cất' : 'Bấm lên chỗ muốn dọn — cây, cỏ, hoa trong vòng tròn về lại túi · Esc xong'}</small></div>${B('fnOk', 'Cất', '', 'pb')}${B('fnNo', 'Xong')}`;
    } else if (placing && isG(placing.def)) {
      const P = placing, n = (P.def.scatter && P.def.scatter.n) || 1;
      bar.innerHTML = `<div class="fn-t"><b>${P.multi ? 'Rải' : 'Trồng'} ${esc(P.def.name)} · còn ${P.left}</b><small>${P.multi ? (lastPtr === 'touch' ? `Chạm chỗ muốn rải rồi bấm Rải (${n} khóm / lần)` : `Bấm lên đất để rải ${n} khóm, bấm tiếp để rải thêm · Esc xong`) : (lastPtr === 'touch' ? 'Chạm chỗ trồng rồi bấm Trồng · Đổi dáng để chọn cây khác' : 'Bấm lên đất để trồng · R xoay · V đổi dáng · Esc xong')}</small></div>${P.multi ? '' : rotBtns + B('fnVar', 'Đổi dáng')}${B('fnOk', P.multi ? 'Rải' : 'Trồng', '', 'pb')}${B('fnNo', 'Xong')}`;
    } else if (placing) {
      bar.innerHTML = `<div class="fn-t"><b>Đặt ${esc(placing.def.name)}</b><small>${lastPtr === 'touch' ? 'Chạm lên sàn để dời, rồi bấm Đặt' : 'Rê chuột lên sàn, bấm để đặt · R xoay · Esc huỷ'}</small></div>${rotBtns}${B('fnOk', 'Đặt', '', 'pb')}${B('fnNo', 'Huỷ')}`;
    } else if (sel) {
      const d = sel.rec.obj.userData.def;
      bar.innerHTML = sel.ghost
        ? `<div class="fn-t"><b>Dời ${esc(d.name)}</b><small>${lastPtr === 'touch' ? 'Chạm chỗ mới rồi bấm Xong' : 'Bấm chỗ mới trên sàn · R xoay · Esc huỷ'}</small></div>${rotBtns}${B('fnMvOk', 'Xong', '', 'pb')}${B('fnMvNo', 'Huỷ')}`
        : `<div class="fn-t"><b>${esc(d.name)}</b><small>${sel.rec.row.by ? 'Do ' + (sel.rec.row.by === 'bin' ? 'Bin' : 'Vy') + ' đặt' : ''}</small></div>${rotBtns}${B('fnMv', 'Di chuyển')}${B('fnUp', 'Cất vào túi')}${B('fnDone', 'Xong', '', 'pb')}`;
    } else {
      bar.innerHTML = `<div class="fn-t"><b>Sắp xếp ${esc(ROOM_NAME[mapId] || 'phòng')}</b><small>${can ? `Bấm vào món đồ đã đặt để dời / xoay / cất · ${placed.size}/${max} món` : 'Phòng riêng của người kia — bạn chỉ xem được'}</small></div>${can ? B('fnBag', OUTD ? 'Lấy cây từ túi' : 'Lấy đồ từ túi', 'bag') : ''}${can && OUTD ? B('fnErase', 'Chổi cất') : ''}${B('fnDone', 'Xong', '', 'pb')}`;
    }
    const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };
    on('fnL', () => rotate(-1)); on('fnR', () => rotate(1)); on('fnVar', reroll);
    on('fnOk', confirmPlace); on('fnNo', () => { endPlacing(); paintBar(); });
    on('fnMv', startMove); on('fnUp', pickup); on('fnDone', () => setArrange(false));
    on('fnMvOk', confirmMove); on('fnMvNo', () => { endSel(); paintBar(); });
    on('fnBag', () => { window.__vyQuests && window.__vyQuests.openBag('mine', OUTD ? 'garden' : 'furniture'); });
    on('fnErase', startErase);
  }

  // khung viền món đang chọn
  const box = new THREE.Box3Helper(new THREE.Box3(), 0xffd581); box.visible = false; scene.add(box);
  (function loop() {
    requestAnimationFrame(loop);
    const o = sel && !sel.ghost && sel.rec.obj; box.visible = !!o; if (o) box.box.copy(boxOf(o));
    paintPins(false);
  })();

  await reload(); loadOutdoorView();
  return {
    reload, canHere: () => can, mapName: ROOM_NAME[mapId] || mapId,
    placeable: id => !!defs[id], isGarden: id => !!(defs[id] && defs[id].out), isOutdoor: () => mapId === 'exterior',
    place: id => startPlace(id),
    arrange: () => setArrange(true),
  };
}
