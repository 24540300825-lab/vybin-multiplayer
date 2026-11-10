// PHÒNG VY — WORKROOM · LỚP AI DÙNG CHUNG. Mọi module chỉ gọi ai.chat()/ai.json() — không module nào gọi thẳng Ollama.
// Nhà cung cấp mặc định: Ollama chạy trên chính máy đang mở Workroom (http://127.0.0.1:11434) → không tốn phí, không gửi dữ liệu ra ngoài.
// Thêm nhà cung cấp khác (API trả phí) sau này: thêm 1 mục vào PROVIDERS với cùng 3 hàm probe/chat/pull. Mặc định KHÔNG có cái nào gọi API trả phí.
// "AI ngoài" (ChatGPT / Gemini): chỉ đóng gói prompt + mở tab mới; người dùng tự gửi và tự dán kết quả về (xem handoff()).
import {h, dialog, btn} from './ui.js';

const LS = 'vyWrAi';
const DEFAULTS = {provider: 'ollama', base: 'http://127.0.0.1:11434', model: '', ctx: 8192, timeout: 120};
// gợi ý model theo sức máy (dung lượng tải gần đúng; xem ollama.com/library trước khi tải)
export const MODEL_GUIDE = [
  {tag: 'gemma3:4b', size: '≈3,3 GB', need: 'Máy phổ thông: RAM 8 GB, card rời 4–6 GB hoặc không có card rời', note: 'Nhẹ, nhanh; tiếng Việt dùng được, bài dài dễ hụt ý.'},
  {tag: 'qwen3:8b', size: '≈5,2 GB', need: 'RAM 16 GB, card rời 8 GB', note: 'Cân bằng; làm theo hướng dẫn và xuất dữ liệu có cấu trúc tốt.'},
  {tag: 'gemma3:12b', size: '≈8,1 GB', need: 'RAM 16–32 GB, card rời 12 GB (8 GB vẫn chạy nhưng chậm)', note: 'Khuyên dùng cho viết và biên tập tiếng Việt.'},
  {tag: 'gemma3:27b', size: '≈17 GB', need: 'RAM 32 GB+, card rời 16–24 GB', note: 'Chất lượng cao nhất trong nhóm, cần máy mạnh.'},
];
export function detectMachine() {
  let gpu = ''; try { const c = document.createElement('canvas').getContext('webgl'), e = c && c.getExtension('WEBGL_debug_renderer_info'); gpu = e ? String(c.getParameter(e.UNMASKED_RENDERER_WEBGL)) : ''; } catch (e) {}
  const short = (gpu.match(/(RTX|GTX|RX|Arc|Iris|UHD|Apple M\d)[^,)]*/i) || [gpu])[0].replace(/\s+Direct3D.*$/, '').trim();
  const ram = navigator.deviceMemory || 0, vr = +(short.match(/(?:RTX|GTX)\s*\d0(\d)0/i) || [])[1] || 0;
  // ước lượng thô từ tên card: chỉ để GỢI Ý, người dùng vẫn tự chọn
  let pick = 'gemma3:4b'; if (/RTX\s*(30|40|50)[6-9]0|RX\s*[67]\d{3}/i.test(short)) pick = 'qwen3:8b'; if (/RTX\s*(30|40|50)[89]0|Apple M\d (Pro|Max)/i.test(gpu)) pick = 'gemma3:12b';
  return {gpu: short || 'không đọc được', ram: ram ? (ram >= 8 ? '8 GB trở lên' : ram + ' GB') : 'không đọc được', os: /Win/.test(navigator.platform) ? 'windows' : /Mac/.test(navigator.platform) ? 'mac' : 'other', pick, vr};
}
// Chrome coi 127.0.0.1 là "mạng nội bộ": trang HTTPS gọi tới sẽ hỏi quyền 1 lần. Đánh dấu rõ đích là máy này; trình duyệt cũ không hiểu thì gọi kiểu thường.
async function localFetch(url, init = {}) {
  for (const space of ['loopback', 'local', null]) {
    try { return await fetch(url, space ? {...init, targetAddressSpace: space} : init); }
    catch (e) { if (!(e instanceof TypeError) || !space || !/targetAddressSpace|address space|enum/i.test(e.message)) throw e; }
  }
}
const OFFLINE = 'Không kết nối được AI trên máy. Kiểm tra: (1) Ollama đang chạy; (2) đã cho phép trang này trong OLLAMA_ORIGINS; (3) trình duyệt đã cho phép truy cập "mạng nội bộ / thiết bị trên máy". Xem Cài đặt & Kết nối.';
class AIError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

const ollama = {
  id: 'ollama', name: 'Ollama (trên máy này)', local: true,
  async probe(cfg, signal) {
    const v = await localFetch(cfg.base + '/api/version', {signal}); if (!v.ok) throw new AIError(v.status === 403 ? 'origin' : 'http', 'Ollama từ chối (' + v.status + ')');
    const t = await localFetch(cfg.base + '/api/tags', {signal});
    return {version: (await v.json()).version, models: ((await t.json()).models || []).map(m => ({name: m.name, size: m.size, params: m.details && m.details.parameter_size}))};
  },
  // stream NDJSON; trả {text, tokens_in, tokens_out}
  async chat(cfg, {messages, format, temperature = 0.4, onToken, signal, maxTokens}) {
    let r;
    try {
      r = await localFetch(cfg.base + '/api/chat', {method: 'POST', signal, headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({model: cfg.model, messages, stream: true, think: false, keep_alive: '20m', ...(format ? {format} : {}), options: {temperature, num_ctx: cfg.ctx, ...(maxTokens ? {num_predict: maxTokens} : {})}})});
    } catch (e) { if (e.name === 'AbortError') throw e; throw new AIError('offline', OFFLINE); }
    if (!r.ok) {
      let msg = ''; try { msg = (await r.json()).error || ''; } catch (e) {}
      if (r.status === 404 || /not found|pull/i.test(msg)) throw new AIError('model_missing', `Máy chưa có model "${cfg.model}". Vào Cài đặt & Kết nối để tải hoặc chọn model khác.`);
      if (r.status === 403) throw new AIError('origin', 'Ollama chưa cho phép trang này gọi tới (thiếu OLLAMA_ORIGINS). Xem hướng dẫn ở Cài đặt & Kết nối.');
      throw new AIError('model_error', 'Model báo lỗi: ' + (msg || 'HTTP ' + r.status));
    }
    const rd = r.body.getReader(), td = new TextDecoder(); let buf = '', text = '', fin = null;
    for (;;) {
      const {done, value} = await rd.read(); if (done) break;
      buf += td.decode(value, {stream: true}); let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
        let j; try { j = JSON.parse(line); } catch (e) { continue; }
        if (j.error) throw new AIError('model_error', 'Model báo lỗi: ' + j.error);
        const c = j.message && j.message.content; if (c) { text += c; onToken && onToken(c, text); }
        if (j.done) fin = j;
      }
    }
    return {text, tokens_in: fin && fin.prompt_eval_count, tokens_out: fin && fin.eval_count};
  },
  async pull(cfg, model, onProgress, signal) {
    let r; try { r = await localFetch(cfg.base + '/api/pull', {method: 'POST', signal, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({model, stream: true})}); } catch (e) { if (e.name === 'AbortError') throw e; throw new AIError('offline', OFFLINE); }
    if (!r.ok) throw new AIError('http', 'Không tải được model (HTTP ' + r.status + ')');
    const rd = r.body.getReader(), td = new TextDecoder(); let buf = '';
    for (;;) { const {done, value} = await rd.read(); if (done) break; buf += td.decode(value, {stream: true}); let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue; let j; try { j = JSON.parse(line); } catch (e) { continue; }
        if (j.error) throw new AIError('model_error', j.error); onProgress && onProgress({status: j.status, pct: j.total ? Math.round((j.completed || 0) / j.total * 100) : null}); } }
  },
};
export const PROVIDERS = {ollama};

export function createAI(store) {
  let cfg = {...DEFAULTS}; try { Object.assign(cfg, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) {}
  const hs = [], running = new Set();
  const A = {
    get cfg() { return cfg; }, state: {status: 'unknown', version: '', models: [], error: '', busy: 0, task: ''},
    on(fn) { hs.push(fn); return () => hs.splice(hs.indexOf(fn), 1); },
    setCfg(p) { cfg = {...cfg, ...p}; try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) {} emit(); },
    get provider() { return PROVIDERS[cfg.provider] || ollama; },
    get ready() { return A.state.status === 'online' && !!cfg.model && A.state.models.some(m => m.name === cfg.model); },
  };
  const emit = () => hs.slice().forEach(f => { try { f(A.state); } catch (e) { console.error(e); } });
  // kiểm tra kết nối (không ném lỗi): online / offline / origin
  A.probe = async () => {
    const ac = new AbortController(), to = setTimeout(() => ac.abort(), 4000);
    try {
      const r = await A.provider.probe(cfg, ac.signal);
      A.state = {...A.state, status: 'online', version: r.version, models: r.models, error: ''};
      if (!cfg.model && r.models.length) A.setCfg({model: (r.models.find(m => /gemma3|qwen/.test(m.name)) || r.models[0]).name});
    } catch (e) { A.state = {...A.state, status: e.code === 'origin' ? 'origin' : 'offline', models: [], error: e.code === 'origin' ? e.message : OFFLINE}; }
    clearTimeout(to); emit(); return A.state;
  };
  const logRun = (task, t0, ok, error, res) => store.add('ailog', {provider: cfg.provider, model: cfg.model, task, ms: Math.round(performance.now() - t0), ok, error: error ? String(error).slice(0, 300) : null,
    tokens_in: res && res.tokens_in || null, tokens_out: res && res.tokens_out || null}, {silent: true}).catch(() => {});
  // gọi AI. opt: {task, system, messages|prompt, format, onToken, temperature, maxTokens}. Trả {text, abort-able qua A.stop()}
  A.chat = async opt => {
    if (A.state.status !== 'online') { await A.probe(); if (A.state.status !== 'online') throw new AIError(A.state.status, A.state.error); }
    if (!cfg.model) throw new AIError('model_missing', 'Chưa chọn model. Vào Cài đặt & Kết nối để chọn.');
    const ac = new AbortController(), t0 = performance.now(); running.add(ac);
    let timer, timedOut = false; const arm = () => { clearTimeout(timer); timer = setTimeout(() => { timedOut = true; ac.abort(); }, cfg.timeout * 1000); }; arm();   // hết giờ = quá lâu không nhận thêm chữ nào
    A.state = {...A.state, busy: running.size, task: opt.task || ''}; emit();
    const messages = [...(opt.system ? [{role: 'system', content: opt.system}] : []), ...(opt.messages || [{role: 'user', content: opt.prompt}])];
    try {
      const res = await A.provider.chat(cfg, {...opt, messages, signal: ac.signal, onToken: (c, all) => { arm(); opt.onToken && opt.onToken(c, all); }});
      logRun(opt.task, t0, true, null, res); return res;
    } catch (e) {
      const err = e.name === 'AbortError' ? new AIError(timedOut ? 'timeout' : 'aborted', timedOut ? `AI không phản hồi sau ${cfg.timeout} giây. Thử lại, hoặc chọn model nhẹ hơn.` : 'Đã dừng.') : e;
      if (err.code !== 'aborted') logRun(opt.task, t0, false, err.message);
      if (err.code === 'offline') { A.state = {...A.state, status: 'offline', error: OFFLINE}; }
      throw err;
    } finally { clearTimeout(timer); running.delete(ac); A.state = {...A.state, busy: running.size, task: running.size ? A.state.task : ''}; emit(); }
  };
  // gọi AI lấy JSON theo schema, rồi KIỂM TRA lại bằng validate(obj) → trả obj đã kiểm; sai thì thử lại 1 lần, vẫn sai thì báo lỗi (không dùng JSON chưa kiểm).
  A.json = async (opt, schema, validate) => {
    let last = '';
    for (let n = 0; n < 2; n++) {
      const res = await A.chat({...opt, format: schema, temperature: opt.temperature ?? 0.2, messages: n && opt.messages ? [...opt.messages, {role: 'user', content: 'Kết quả trước không hợp lệ (' + last + '). Trả lại ĐÚNG JSON theo schema, không thêm chữ nào khác.'}] : opt.messages,
        prompt: n && !opt.messages ? opt.prompt + '\n\n(Kết quả trước không hợp lệ: ' + last + '. Trả lại ĐÚNG JSON theo schema.)' : opt.prompt});
      try { const m = res.text.match(/\{[\s\S]*\}/); const obj = JSON.parse(m ? m[0] : res.text); return validate ? validate(obj) : obj; }
      catch (e) { last = String(e.message || e).slice(0, 120); }
    }
    throw new AIError('bad_json', 'AI trả về dữ liệu không đúng định dạng sau 2 lần thử (' + last + '). Thử lại hoặc dùng model mạnh hơn.');
  };
  A.stop = () => running.forEach(ac => ac.abort());
  A.pull = async (model, onProgress) => { const ac = new AbortController(); running.add(ac); try { await A.provider.pull(cfg, model, onProgress, ac.signal); } catch (e) { if (e.name === 'AbortError') throw new AIError('aborted', 'Đã dừng tải.'); throw e; } finally { running.delete(ac); } await A.probe(); };
  A.stats = () => { const L = store.ailog || [], ok = L.filter(x => x.ok); return {n: L.length, errors: L.length - ok.length, avg: ok.length ? Math.round(ok.reduce((s, x) => s + (x.ms || 0), 0) / ok.length / 100) / 10 : 0}; };
  // AI NGOÀI: sao chép prompt → mở ChatGPT/Gemini ở tab mới → người dùng tự gửi, tự dán kết quả về. Không điều khiển, không đọc phiên đăng nhập của họ.
  A.handoff = prompt => new Promise(async resolve => {
    const ta = h('textarea', {class: 'wr-in', rows: 9, placeholder: 'Dán kết quả từ ChatGPT / Gemini vào đây…', 'aria-label': 'Kết quả từ AI ngoài'}), st = h('p', {class: 'wr-empty'});
    // mở tab NGAY trong cú bấm (trình duyệt chặn cửa sổ mở sau một lệnh chờ), rồi mới sao chép
    const open = url => () => { window.open(url, '_blank', 'noopener');
      Promise.race([navigator.clipboard.writeText(prompt), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 1500))])
        .then(() => { st.textContent = 'Đã sao chép yêu cầu. Dán (Ctrl+V) vào ô chat ở tab vừa mở rồi gửi.'; })
        .catch(() => { st.textContent = 'Không tự sao chép được — mở "Xem yêu cầu" rồi chép tay.'; }); };
    const v = await dialog({title: 'Dùng AI ngoài (tự gửi – tự dán về)', wide: true, body: h('div', {class: 'wr-stack'},
      h('p', {}, 'Workroom đã soạn sẵn yêu cầu kèm ngữ cảnh. Nội dung này sẽ được gửi tới dịch vụ bên ngoài khi bạn tự dán và gửi ở tab mới.'),
      h('div', {class: 'wr-form'}, btn('Sao chép + mở ChatGPT', open('https://chatgpt.com/'), {icon: 'ext'}), btn('Sao chép + mở Gemini', open('https://gemini.google.com/app'), {icon: 'ext', ghost: true})),
      h('details', {}, h('summary', {}, 'Xem yêu cầu'), h('pre', {class: 'wr-pre'}, prompt)), st, ta),
      buttons: [['Huỷ', null], ['Dùng kết quả này', () => ta.value.trim() || null, 'primary']]});
    resolve(v);
  });
  return A;
}
