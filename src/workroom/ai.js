// PHÒNG VY — WORKROOM · AI = Google Gemini (khoá API miễn phí của Vy, tạo ở aistudio.google.com/apikey).
// • Không chạy trên máy → máy Vy không nặng. Tự chọn model Gemini mới nhất mà khoá được dùng (đọc danh sách từ Google).
// • Khoá chỉ lưu trên trình duyệt của máy này (localStorage), gửi thẳng tới Google; không qua máy chủ của game.
// • Gói miễn phí: Google có thể dùng nội dung gửi lên để cải thiện dịch vụ — Cài đặt có ghi rõ điều này.
// • Không tự chuyển sang dịch vụ trả phí nào. Hết lượt miễn phí → báo rõ.
import {h, dialog, btn} from './ui.js';

const LS = 'vyWorkroomAI';
const API = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULTS = {provider: 'gemini', key: '', model: '', timeout: 120};
class AIError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
export {AIError};

// chọn model: Gemini bản ổn định số hiệu cao nhất; ưu tiên Flash (gói miễn phí dùng được), bỏ bản thử nghiệm/âm thanh/ảnh
export function rankModels(list) {
  return list.filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => { const n = m.name.replace(/^models\//, ''), x = n.match(/^gemini-(\d+(?:\.\d+)?)-(flash|pro)(-lite)?$/); return x ? {name: n, label: m.displayName || n, v: +x[1], tier: x[2] === 'flash' ? (x[3] ? 1 : 3) : 2} : null; })
    .filter(Boolean).sort((a, b) => b.v - a.v || b.tier - a.tier);
}

export function createAI(store) {
  let cfg = {...DEFAULTS}; try { Object.assign(cfg, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) {}
  const hs = [], running = new Set();
  const A = {
    get cfg() { return cfg; },
    state: {status: cfg.key ? 'unknown' : 'nokey', error: '', models: [], busy: 0, task: ''},
    on(fn) { hs.push(fn); return () => hs.splice(hs.indexOf(fn), 1); },
    setCfg(p) { cfg = {...cfg, ...p}; try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) {} emit(); },
    get ready() { return !!cfg.key && A.state.status === 'ok'; },
    get model() { return cfg.model || (A.state.models[0] && A.state.models[0].name) || 'gemini-flash-latest'; },
  };
  const emit = () => hs.slice().forEach(f => { try { f(A.state); } catch (e) { console.error(e); } });
  async function call(path, body, signal) {
    let r;
    try { r = await fetch(API + path, {method: body ? 'POST' : 'GET', signal, headers: {'x-goog-api-key': cfg.key, ...(body ? {'Content-Type': 'application/json'} : {})}, body: body ? JSON.stringify(body) : undefined}); }
    catch (e) { if (e.name === 'AbortError') throw e; throw new AIError('offline', 'Không kết nối được tới Google AI (mạng?).'); }
    if (!r.ok) {
      let m = '', st = ''; try { const j = await r.json(); m = j.error.message || ''; st = j.error.status || ''; } catch (e) {}
      if (r.status === 400 && /API key|API_KEY/i.test(m)) throw new AIError('badkey', 'Khoá API Gemini không đúng. Vào Cài đặt → AI để dán lại khoá.');
      if (r.status === 403) throw new AIError('denied', 'Khoá API này chưa được phép dùng Gemini (' + (m || st) + ').');
      if (r.status === 429) throw new AIError('quota', 'Đã hết lượt AI miễn phí ' + (/day|daily|PerDay/i.test(m) ? 'hôm nay (lượt mới có lại khoảng 15h chiều giờ Việt Nam)' : 'trong phút này — đợi khoảng 1 phút rồi thử lại') + '.');
      if (r.status === 404) throw new AIError('model', 'Model "' + A.model + '" không còn. Vào Cài đặt → AI, bấm Kiểm tra để chọn lại.');
      if (r.status >= 500) throw new AIError('busy', 'Google AI đang quá tải, thử lại sau ít phút.');
      throw new AIError('http', 'Google AI báo lỗi ' + r.status + (m ? ': ' + m : ''));
    }
    return r.json();
  }
  // kiểm tra khoá + lấy danh sách model
  A.probe = async () => {
    if (!cfg.key) { A.state = {...A.state, status: 'nokey', error: '', models: []}; emit(); return A.state; }
    try {
      const j = await call('/models?pageSize=200'), models = rankModels(j.models || []);
      A.state = {...A.state, status: 'ok', error: '', models};
      if (models.length && !models.some(m => m.name === cfg.model)) A.setCfg({model: models[0].name});
    } catch (e) { A.state = {...A.state, status: e.code === 'badkey' || e.code === 'denied' ? 'bad' : 'error', error: e.message}; }
    emit(); return A.state;
  };
  const log = (task, t0, ok, err, usage) => store.add('ailog', {provider: 'gemini', model: A.model, task, ms: Math.round(performance.now() - t0), ok, error: err ? String(err).slice(0, 300) : null,
    tokens_in: usage && usage.promptTokenCount || null, tokens_out: usage && usage.candidatesTokenCount || null}, {silent: true}).catch(() => {});

  // gọi 1 lượt. opt: {task, system, contents:[{role,parts}] | prompt, tools:[functionDeclarations], schema, temperature, maxTokens}
  // → {text, calls:[{name,args}], content (để nối hội thoại), usage}
  A.generate = async opt => {
    if (!cfg.key) throw new AIError('nokey', 'Chưa có khoá AI. Vào Cài đặt → AI để dán khoá Gemini (miễn phí, làm 1 lần).');
    if (A.state.status === 'unknown') await A.probe();
    const ac = new AbortController(), t0 = performance.now(); running.add(ac);
    const timer = setTimeout(() => ac.abort('timeout'), cfg.timeout * 1000);
    A.state = {...A.state, busy: running.size, task: opt.task || ''}; emit();
    const body = {
      contents: opt.contents || [{role: 'user', parts: [{text: opt.prompt}, ...(opt.parts || [])]}],
      ...(opt.system ? {systemInstruction: {parts: [{text: opt.system}]}} : {}),
      ...(opt.tools ? {tools: [{functionDeclarations: opt.tools}], toolConfig: {functionCallingConfig: {mode: 'AUTO'}}} : {}),
      generationConfig: {temperature: opt.temperature ?? 0.6, ...(opt.maxTokens ? {maxOutputTokens: opt.maxTokens} : {}), ...(opt.schema ? {responseMimeType: 'application/json', responseSchema: opt.schema} : {})},
    };
    try {
      const j = await call(`/models/${A.model}:generateContent`, body, ac.signal);
      const cand = (j.candidates || [])[0];
      if (!cand || !cand.content) {
        const why = (j.promptFeedback && j.promptFeedback.blockReason) || (cand && cand.finishReason) || '';
        throw new AIError('empty', why === 'SAFETY' || /BLOCK/.test(why) ? 'Google AI từ chối nội dung này (bộ lọc an toàn). Thử diễn đạt khác.' : 'AI không trả lời (' + (why || 'trống') + '). Thử lại.');
      }
      const parts = cand.content.parts || [];
      const res = {text: parts.filter(p => p.text && !p.thought).map(p => p.text).join(''), calls: parts.filter(p => p.functionCall).map(p => ({name: p.functionCall.name, args: p.functionCall.args || {}})),
        content: {role: 'model', parts}, usage: j.usageMetadata, truncated: cand.finishReason === 'MAX_TOKENS'};
      log(opt.task, t0, true, null, j.usageMetadata);
      if (A.state.status !== 'ok') { A.state = {...A.state, status: 'ok', error: ''}; }
      return res;
    } catch (e) {
      const err = e.name === 'AbortError' || ac.signal.aborted ? new AIError(ac.signal.reason === 'timeout' ? 'timeout' : 'aborted', ac.signal.reason === 'timeout' ? `AI chưa trả lời sau ${cfg.timeout} giây. Thử lại.` : 'Đã dừng.') : e;
      if (err.code !== 'aborted') log(opt.task, t0, false, err.message);
      throw err;
    } finally { clearTimeout(timer); running.delete(ac); A.state = {...A.state, busy: running.size, task: running.size ? A.state.task : ''}; emit(); }
  };
  // lấy JSON đúng schema; mã kiểm lại bằng validate(obj); sai thì thử lại 1 lần rồi báo lỗi
  A.json = async (opt, validate) => {
    let last = '';
    for (let n = 0; n < 2; n++) {
      const res = await A.generate({...opt, temperature: opt.temperature ?? 0.5, prompt: n ? opt.prompt + '\n\n(Lần trước trả về không hợp lệ: ' + last + '. Trả lại đúng JSON.)' : opt.prompt});
      try { const obj = JSON.parse(res.text); return validate ? validate(obj) : obj; } catch (e) { last = String(e.message || e).slice(0, 120); }
    }
    throw new AIError('bad_json', 'AI trả về dữ liệu không đúng dạng (' + last + '). Bấm thử lại.');
  };
  A.stop = () => running.forEach(ac => ac.abort('stop'));
  return A;
}

// hướng dẫn lấy khoá (hiện trong Cài đặt và khi chưa có khoá)
export function keyGuide() {
  return h('ol', {class: 'wr-steps'},
    h('li', {}, 'Mở ', h('a', {href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener'}, 'aistudio.google.com/apikey'), ' bằng Gmail của bạn.'),
    h('li', {}, 'Bấm “Create API key” → sao chép khoá.'),
    h('li', {}, 'Dán vào ô bên dưới → Lưu. Xong — chỉ làm 1 lần trên máy này.'));
}
export async function askKey(ai) {
  const inp = h('input', {class: 'wr-in', type: 'password', placeholder: 'Dán khoá API Gemini (bắt đầu bằng AIza…)', 'aria-label': 'Khoá API Gemini', autocomplete: 'off'});
  const v = await dialog({title: 'Bật AI (Gemini, miễn phí)', body: h('div', {class: 'wr-stack'}, keyGuide(), inp, h('p', {class: 'wr-mute'}, 'Gói miễn phí: Google có thể dùng nội dung gửi lên để cải thiện dịch vụ. Đừng đưa thông tin mật vào AI.')),
    buttons: [['Để sau', null], ['Lưu', () => inp.value.trim() || null, 'primary']]});
  if (!v) return false;
  ai.setCfg({key: v, model: ''}); const st = await ai.probe();
  return st.status === 'ok';
}
export {btn};
