// Khung "tính năng" (minigame, emote, công cụ…) cắm vào game mà KHÔNG sửa code lõi.
// Mỗi tính năng là 1 module: export default {id, init(ctx)}. Lỗi trong 1 tính năng không làm sập game hay các tính năng khác.
// Mạng: ctx.send(kind, data) / ctx.on(kind, fn) — tự gắn nhãn theo id nên các tính năng không đụng nhau; bản cũ chưa có tính năng đó sẽ bỏ qua.
const MAX_PER_SEC = 12;   // chặn 1 tính năng lỡ gửi quá nhiều làm cạn hạn mức Realtime
export function createFeatureHost({sess = null, api = null, slot = null, other = null, mapId = null, toast = () => {}} = {}) {
  const feats = new Map();
  if (sess) sess.on('msg', m => {
    if (!m || m.k !== 'f') return;
    const f = feats.get(m.f); if (!f) return;
    (f.hs[m.t] || []).slice().forEach(fn => { try { fn(m.d); } catch (e) { console.error('[feature ' + m.f + ']', e); } });
  });
  function makeCtx(id) {
    const hs = {}; let tokens = MAX_PER_SEC, last = performance.now();
    const key = k => 'vyf:' + id + ':' + k;
    const ctx = {
      id, slot, other, mapId, api, sess, toast, solo: !sess,
      send(kind, data) {
        if (!sess) return false;
        const now = performance.now(); tokens = Math.min(MAX_PER_SEC, tokens + (now - last) / 1000 * MAX_PER_SEC); last = now;
        if (tokens < 1) return false; tokens--;
        return sess.send({k: 'f', f: id, t: String(kind), d: data});
      },
      on(kind, fn) { (hs[kind] ||= []).push(fn); return () => { hs[kind] = (hs[kind] || []).filter(x => x !== fn); }; },
      onPeer: fn => sess ? sess.on('peer', fn) : () => {},
      store: {
        get(k, d) { try { const v = localStorage.getItem(key(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem(key(k), JSON.stringify(v)); } catch (e) {} },
      },
      ui: {
        // thêm nút vào thanh trên cùng
        addButton({icon = '✨', label = '', title = '', onClick}) {
          const bar = document.getElementById('hTop'); if (!bar) return null;
          const b = document.createElement('button'); b.className = 'ib'; b.title = title || label; b.innerHTML = `<span>${icon}</span>${label}`; b.onclick = onClick; bar.appendChild(b); return b;
        },
      },
    };
    return {ctx, hs};
  }
  return {
    async register(def) {
      if (!def || !def.id || typeof def.init !== 'function') { console.warn('[features] định nghĩa không hợp lệ', def); return false; }
      if (feats.has(def.id)) return false;
      const {ctx, hs} = makeCtx(def.id); feats.set(def.id, {def, hs, ctx});
      try { await def.init(ctx); return true; } catch (e) { console.error('[feature ' + def.id + '] init lỗi — đã tắt', e); feats.delete(def.id); return false; }
    },
    list: () => [...feats.keys()],
  };
}
