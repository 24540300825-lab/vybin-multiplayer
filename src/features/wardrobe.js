// TỦ ĐỒ (👗): mặc trang phục mùa lễ cho nhân vật; người kia thấy đúng bộ mình đang mặc (gửi qua mạng, nhớ trên máy).
// Trang phục = assets/costume-<vy|bin>-<id>.glb, dựng trong Blender trên CÙNG bộ xương với nhân vật (xem docs/SEASONS.md):
//   - mesh có skin (áo, váy, áo dài…): gắn lại vào xương của nhân vật theo TÊN xương → chạy theo mọi animation
//   - mesh thường làm con của 1 xương (mũ, gạc, kính, khăn…): gắn vào đúng xương đó của nhân vật, giữ nguyên vị trí tương đối
//   - custom property hide = "Ten_Mesh_A, Ten_Mesh_B" (trên bất kỳ node nào) → ẩn các mesh đó của nhân vật khi mặc (vd áo gốc bị áo dài che)
import * as Assets from '../assets.js';
import {FILES} from '../manifest.js';
import {COSTUMES} from '../season/costumes.js';

const css = `
#vyWard{position:fixed;right:14px;top:64px;z-index:8000;width:min(300px,86vw);padding:12px;border-radius:16px;background:rgba(24,22,30,.86);
  backdrop-filter:blur(8px);color:#fff;font:13px Nunito Sans,system-ui,sans-serif;display:none}
#vyWard h4{margin:0 0 8px;font-size:14px}
#vyWard .g{display:grid;grid-template-columns:1fr 1fr;gap:6px}
#vyWard button{border:0;border-radius:10px;padding:8px;background:rgba(255,255,255,.1);color:#fff;font:inherit;cursor:pointer;text-align:left}
#vyWard button.on{background:#fff;color:#1d1b24;font-weight:700}
#vyWard .note{opacity:.7;margin-top:8px;line-height:1.4}
`;

export default {
  id: 'wardrobe',
  init(ctx) {
    const api = ctx.api; if (!api || !api.local) return;
    const THREE = window.VY && window.VY.THREE; if (!THREE) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const season = () => window.__seasonOn || window.__season || null;
    const ids = slot => Object.keys(FILES).filter(k => k.startsWith('costume-' + slot + '-') && FILES[k].file.endsWith('.glb')).map(k => k.slice(('costume-' + slot + '-').length));
    const meta = id => COSTUMES[id] || {label: id, season: null};
    const avail = () => ids(ctx.slot).filter(id => { const s = meta(id).season; return !s || s === season(); });
    const worn = new WeakMap();      // char object -> {id, added:[], hidden:[]}

    function unequip(ch) {
      const w = worn.get(ch); if (!w) return;
      w.added.forEach(o => o.removeFromParent());
      w.hidden.forEach(([o, v]) => { o.visible = v; });
      worn.delete(ch);
    }
    function equip(ch, glb, id) {
      unequip(ch);
      const bones = {}; let skinParent = null;
      ch.traverse(o => { if (o.isBone) bones[o.name] = o; if (!skinParent && o.isSkinnedMesh) skinParent = o.parent; });
      const added = [], hidden = [], hideNames = new Set();
      glb.scene.updateMatrixWorld(true);
      glb.scene.traverse(o => {
        const h = o.userData && (o.userData.hide || o.userData.Hide);
        if (h) String(h).split(',').map(x => x.trim()).filter(Boolean).forEach(x => hideNames.add(x));
      });
      glb.scene.traverse(o => {
        if (o.isSkinnedMesh) {
          const bs = o.skeleton.bones.map(b => bones[b.name]);
          if (bs.some(b => !b)) { console.warn('[wardrobe] ' + id + ': xương không khớp nhân vật — bỏ mesh ' + o.name); return; }
          const m = new THREE.SkinnedMesh(o.geometry, Array.isArray(o.material) ? o.material.map(x => x.clone()) : o.material.clone());
          m.name = 'COSTUME_' + o.name;
          (skinParent || ch).add(m);
          m.bind(new THREE.Skeleton(bs, o.skeleton.boneInverses.map(x => x.clone())), o.bindMatrix.clone());
          m.frustumCulled = false; m.castShadow = true;
          added.push(m);
        } else if (o.isMesh) {
          let b = o.parent; while (b && !b.isBone && !bones[b.name]) b = b.parent;    // xương gần nhất mà mesh là con
          const tb = b && bones[b.name];
          if (!tb) return;
          const local = new THREE.Matrix4().copy(b.matrixWorld).invert().multiply(o.matrixWorld);
          const m = o.clone(false); m.name = 'COSTUME_' + o.name;
          m.material = Array.isArray(o.material) ? o.material.map(x => x.clone()) : o.material.clone();
          local.decompose(m.position, m.quaternion, m.scale);
          tb.add(m); m.frustumCulled = false; m.castShadow = true;
          added.push(m);
        }
      });
      if (hideNames.size) ch.traverse(o => { if ((o.isMesh || o.isSkinnedMesh) && hideNames.has(o.name) && !o.name.startsWith('COSTUME_')) { hidden.push([o, o.visible]); o.visible = false; } });
      added.forEach(m => { try { api.toonify && api.toonify(m); } catch (e) {} });
      worn.set(ch, {id, added, hidden});
    }
    async function wear(charObj, slot, id) {
      if (!charObj || !charObj.char) return;
      if (!id) { unequip(charObj.char); return; }
      const key = 'costume-' + slot + '-' + id;
      if (!Assets.hasAsset(key)) { unequip(charObj.char); return; }
      try { const g = await Assets.load(key); equip(charObj.char, g, id); } catch (e) { console.warn('[wardrobe]', e); }
    }

    let mine = ctx.store.get('wear', null);
    if (mine && !avail().includes(mine)) mine = null;     // hết mùa → về đồ thường
    let theirs = null;
    const applyRemote = () => { if (api.remote) wear(api.remote, ctx.other, theirs); };
    wear(api.local, ctx.slot, mine);
    ctx.on('wear', d => { theirs = d && d.c ? d.c : null; if (api.remote) applyRemote(); else { const t = setInterval(() => { if (api.remote) { clearInterval(t); applyRemote(); } }, 1000); setTimeout(() => clearInterval(t), 30000); } });
    ctx.on('hi', () => ctx.send('wear', {c: mine}));
    ctx.onPeer(p => { if (p && p.present) { ctx.send('wear', {c: mine}); ctx.send('hi', {}); } });
    setTimeout(() => { ctx.send('wear', {c: mine}); ctx.send('hi', {}); }, 2500);

    // bảng chọn
    const box = document.createElement('div'); box.id = 'vyWard'; document.body.appendChild(box);
    function render() {
      const list = avail(), s = season();
      box.innerHTML = `<h4>👗 Tủ đồ${s ? '' : ''}</h4><div class="g"><button data-c="" class="${mine ? '' : 'on'}">Đồ thường</button>${
        list.map(id => `<button data-c="${id}" class="${mine === id ? 'on' : ''}">${meta(id).label}</button>`).join('')}</div>${
        list.length ? '' : '<div class="note">Chưa có trang phục cho mùa này. Bỏ file costume-' + ctx.slot + '-&lt;tên&gt;.glb vào assets/ là tủ đồ tự hiện (xem docs/SEASONS.md).</div>'}`;
      box.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
        mine = b.dataset.c || null; ctx.store.set('wear', mine); wear(api.local, ctx.slot, mine); ctx.send('wear', {c: mine}); render();
      });
    }
    ctx.ui.addButton({icon: '👗', label: 'Tủ đồ', title: 'Trang phục mùa lễ', onClick: () => { const on = box.style.display !== 'block'; if (on) render(); box.style.display = on ? 'block' : 'none'; }});
  },
};
