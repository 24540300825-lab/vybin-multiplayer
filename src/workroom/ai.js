// PHÒNG VY — WORKROOM · AI KHÔNG GIÁN ĐOẠN.
// Chính: Google Gemini (khoá miễn phí của Vy). Dự phòng (tuỳ chọn, đều có gói miễn phí): Groq · OpenRouter (model :free) · Cerebras.
// Mỗi lượt gọi đi theo CHUỖI: Gemini (model mới nhất → các model Gemini khác) → các dịch vụ dự phòng đã dán khoá.
//  • Lỗi thoáng qua (quá tải 5xx, mạng, chậm): thử lại tự động có giãn cách.  • Hết lượt / bị giới hạn: chuyển ngay sang model kế tiếp.
//  • Vy không phải làm gì; giao diện chỉ ghi nhỏ "đang dùng dự phòng …". Chỉ báo lỗi khi TẤT CẢ đều không trả lời.
// Khoá lưu trên trình duyệt máy này (localStorage), gửi thẳng tới từng dịch vụ. Không có dịch vụ trả phí nào được gọi.
import {h, dialog, btn} from './ui.js';

const LS = 'vyWorkroomAI';
const GAPI = 'https://generativelanguage.googleapis.com/v1beta';
export const PROVIDERS = {
  gemini: {name: 'Google Gemini', keyUrl: 'https://aistudio.google.com/apikey', note: 'Chính · đọc được ảnh, PDF · gói miễn phí: Google có thể dùng nội dung để cải thiện dịch vụ'},
  groq: {name: 'Groq', base: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys', note: 'Dự phòng · rất nhanh · miễn phí ~1.000 lượt/ngày · không dùng dữ liệu để huấn luyện'},
  openrouter: {name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/keys', note: 'Dự phòng · nhiều model mở miễn phí (:free) · ~50 lượt/ngày'},
  cerebras: {name: 'Cerebras', base: 'https://api.cerebras.ai/v1', keyUrl: 'https://cloud.cerebras.ai/', note: 'Dự phòng · rất nhanh · miễn phí ~1 triệu token/ngày'},
};
export const BACKUPS = ['groq', 'openrouter', 'cerebras'];
const DEFAULTS = {provider: 'gemini', key: '', model: '', keys: {}, models: {}, timeout: 150, chatModel: '', chatEffort: 'fast', docEffort: 'auto'};
export const EFFORTS = [['fast', 'Nhanh'], ['balanced', 'Cân bằng'], ['deep', 'Kỹ']];
class AIError extends Error { constructor(code, msg, o = {}) { super(msg); this.code = code; Object.assign(this, o); } }
export {AIError};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Gemini: bản ổn định số hiệu cao nhất; ưu tiên Flash (gói miễn phí), rồi Flash-Lite
export function rankModels(list) {
  return list.filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => { const n = m.name.replace(/^models\//, ''), x = n.match(/^gemini-(\d+(?:\.\d+)?)-(flash|pro)(-lite)?$/); return x ? {name: n, label: m.displayName || n, v: +x[1], tier: x[2] === 'flash' ? (x[3] ? 1 : 3) : 2} : null; })
    .filter(Boolean).sort((a, b) => b.v - a.v || b.tier - a.tier);
}
// dịch vụ dự phòng: ưu tiên các model mở mạnh nhất hiện có (tên đổi liên tục → đọc danh sách thật rồi xếp hạng)
const PREF = [/kimi-k2/i, /gpt-oss-120b/i, /deepseek.*(v3|r1|chat|v4)/i, /qwen-?3.*(235|480|max|next|coder)/i, /llama-4.*maverick/i, /glm-4\.[5-9]|glm-5/i, /llama-3\.3-70b/i, /qwen-?3/i, /gpt-oss/i, /llama-4/i, /llama/i, /mistral|mixtral/i];
const SKIP = /whisper|tts|guard|embed|audio|vision-preview|playai|distil|compound|orpheus|safeguard/i;
export function rankOpen(ids, prov) {
  return ids.filter(id => !SKIP.test(id) && (prov !== 'openrouter' || /:free$/.test(id)))
    .map(id => ({name: id, score: (() => { const i = PREF.findIndex(r => r.test(id)); return i < 0 ? 99 : i; })()})).sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
}
const VISION = /llama-4|vision|vl\b|gemma-3|qwen.*vl|pixtral|maverick|scout/i;

// ---------- schema Gemini (TYPE viết hoa) → JSON Schema thường ----------
const lowerSchema = s => !s || typeof s !== 'object' ? s : Array.isArray(s) ? s.map(lowerSchema) :
  Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k === 'type' && typeof v === 'string' ? v.toLowerCase() : lowerSchema(v)]));

export function createAI(store) {
  let cfg = {...DEFAULTS}; try { const s = JSON.parse(localStorage.getItem(LS) || '{}'); Object.assign(cfg, s, {keys: {...(s.keys || {})}, models: {...(s.models || {})}}); } catch (e) {}
  const hs = [], running = new Set();
  const A = {
    get cfg() { return cfg; },
    state: {status: cfg.key ? 'unknown' : 'nokey', error: '', models: [], extra: {}, busy: 0, task: '', note: ''},
    on(fn) { hs.push(fn); return () => hs.splice(hs.indexOf(fn), 1); },
    setCfg(p) { cfg = {...cfg, ...p}; try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) {} emit(); },
    setKey(prov, key) { if (prov === 'gemini') A.setCfg({key, model: ''}); else A.setCfg({keys: {...cfg.keys, [prov]: key}, models: {...cfg.models, [prov]: ''}}); },
    get ready() { return (!!cfg.key && A.state.status === 'ok') || BACKUPS.some(p => cfg.keys[p] && (A.state.extra[p] || {}).status === 'ok'); },
    get hasAny() { return !!cfg.key || BACKUPS.some(p => cfg.keys[p]); },
    get model() { return cfg.model || (A.state.models[0] && A.state.models[0].name) || 'gemini-flash-latest'; },
  };
  const emit = () => hs.slice().forEach(f => { try { f(A.state); } catch (e) { console.error(e); } });
  const note = t => { A.state = {...A.state, note: t || ''}; emit(); };

  // ---------- gọi HTTP, phân loại lỗi ----------
  async function http(url, init, signal, prov) { return (await req(url, init, signal, prov)).json(); }
  async function req(url, init, signal, prov) {
    let r;
    try { r = await fetch(url, {...init, signal}); }
    catch (e) { if (signal && signal.aborted) throw e; throw new AIError('net', 'Không kết nối được tới ' + PROVIDERS[prov].name + '.', {transient: true}); }
    if (r.ok) return r;
    let m = '', st = '', wait = 0; try { const j = await r.json(); m = (j.error && (j.error.message || j.error)) || j.message || ''; st = (j.error && j.error.status) || ''; if (typeof m !== 'string') m = JSON.stringify(m);
      const ri = ((j.error && j.error.details) || []).find(d => d.retryDelay); if (ri) wait = parseFloat(ri.retryDelay) || 0; } catch (e) {}
    if (!wait) wait = parseFloat(r.headers.get('retry-after') || '') || 0;
    const P = PROVIDERS[prov].name;
    if (r.status === 401 || (r.status === 400 && /API key|API_KEY|invalid.*key/i.test(m))) throw new AIError('badkey', `Khoá ${P} không đúng.`, {skip: true});
    if (r.status === 403) throw new AIError('denied', `Khoá ${P} chưa được phép dùng (${(m || st).slice(0, 120)}).`, {skip: true});
    if (r.status === 429) throw new AIError('quota', `${P} đã hết lượt ${/day|daily|PerDay/i.test(m) ? 'hôm nay' : 'trong phút này'}.`, {skip: true, perMinute: !/day|daily|PerDay/i.test(m), wait});
    if (r.status === 404) throw new AIError('model', `${P}: model không còn.`, {skip: true});
    if (r.status === 413) throw new AIError('big', `${P}: nội dung quá dài cho model này.`, {skip: true});
    if (r.status >= 500) throw new AIError('busy', `${P} đang quá tải.`, {transient: true});
    throw new AIError('http', `${P} báo lỗi ${r.status}${m ? ': ' + m.slice(0, 160) : ''}`, {skip: true, status: r.status, raw: m});
  }
  // mức suy nghĩ (effort) cho Gemini: Nhanh / Cân bằng / Kỹ. Model không nhận 1 kiểu → tự hạ sang kiểu kế (nhớ lại cho lần sau)
  const badThink = new Set();
  function thinkOpts(model, effort) {
    const x = model.match(/gemini-(\d+(?:\.\d+)?)-(flash|pro)(-lite)?/); if (!x || !effort || effort === 'auto') return [];
    const v = +x[1], flash = x[2] === 'flash', T = o => [{...o, includeThoughts: true}, o];
    if (v >= 3) return {fast: [...T({thinkingLevel: flash ? 'minimal' : 'low'}), ...T({thinkingLevel: 'low'})], balanced: [...T({thinkingLevel: flash ? 'medium' : 'low'}), ...T({thinkingLevel: 'low'})], deep: T({thinkingLevel: 'high'})}[effort] || [];
    if (v >= 2.5) return {fast: [{thinkingBudget: flash ? 0 : 128}], balanced: T({thinkingBudget: 2048}), deep: T({thinkingBudget: -1})}[effort] || [];
    return [];
  }
  const thinkCfg = (model, effort) => thinkOpts(model, effort).find(o => !badThink.has(model + JSON.stringify(o))) || null;

  // ---------- Gemini ----------
  async function callGemini(model, opt, signal) {
    const think = thinkCfg(model, opt.fast ? cfg.chatEffort : cfg.docEffort);
    const body = {
      contents: opt.contents || [{role: 'user', parts: [{text: opt.prompt}, ...(opt.parts || [])]}],
      ...(opt.system ? {systemInstruction: {parts: [{text: opt.system}]}} : {}),
      ...(opt.tools ? {tools: [{functionDeclarations: opt.tools}], toolConfig: {functionCallingConfig: {mode: 'AUTO'}}} : {}),
      generationConfig: {temperature: opt.temperature ?? 0.6, maxOutputTokens: opt.maxTokens || (opt.schema ? 32768 : 8192), ...(opt.schema ? {responseMimeType: 'application/json', responseSchema: opt.schema} : {}), ...(think ? {thinkingConfig: think} : {})},
    };
    const init = {method: 'POST', headers: {'x-goog-api-key': cfg.key, 'Content-Type': 'application/json'}, body: JSON.stringify(body)};
    let parts = [], finish = '', block = '', usage = {};
    const take = j => {
      if (j.promptFeedback && j.promptFeedback.blockReason) block = j.promptFeedback.blockReason;
      if (j.usageMetadata) usage = {in: j.usageMetadata.promptTokenCount, out: j.usageMetadata.candidatesTokenCount};
      const c = (j.candidates || [])[0]; if (!c) return; if (c.finishReason) finish = c.finishReason;
      for (const p of (c.content && c.content.parts) || []) {
        if (p.thought && !parts.some(q => q.text && !q.thought)) note('💭 ' + model.replace(/^gemini-/, 'Gemini ') + ' đang suy nghĩ…');
        const last = parts[parts.length - 1];
        if (p.text != null && !p.functionCall && last && last.text != null && !last.functionCall && !!last.thought === !!p.thought) { last.text += p.text; if (p.thoughtSignature) last.thoughtSignature = p.thoughtSignature; }
        else if (p.text === '' && p.thoughtSignature && !p.functionCall && last) last.thoughtSignature = p.thoughtSignature;
        else parts.push({...p});
      }
    };
    try {
      if (opt.onText) {   // trả lời dần từng chữ (SSE)
        const r = await req(`${GAPI}/models/${model}:streamGenerateContent?alt=sse`, init, signal, 'gemini');
        const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
        for (;;) {
          const {value, done} = await rd.read(); if (done) break;
          buf += dec.decode(value, {stream: true}); let i;
          while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line.startsWith('data:')) continue;
            try { take(JSON.parse(line.slice(5))); } catch (e) { continue; }
            if (opt._alive) opt._alive();
            const t = parts.filter(p => p.text && !p.thought).map(p => p.text).join(''); if (t) opt.onText(t); }
        }
      } else take(await http(`${GAPI}/models/${model}:generateContent`, init, signal, 'gemini'));
    } catch (e) {
      if (think && e.code === 'http' && e.status === 400 && /think/i.test(e.raw || e.message)) { badThink.add(model + JSON.stringify(think)); return callGemini(model, opt, signal); }   // model không nhận kiểu này → thử kiểu kế
      if (e.name === 'TypeError' && !signal.aborted) throw new AIError('net', 'Mất kết nối giữa chừng.', {transient: true});
      throw e;
    }
    if (!parts.length) {
      const why = block || finish;
      if (why === 'SAFETY' || /BLOCK|PROHIBITED/.test(why)) throw new AIError('safety', 'Google AI từ chối nội dung này (bộ lọc an toàn).', {skip: true});
      throw new AIError('empty', 'Gemini không trả lời.', {transient: true});
    }
    return {text: parts.filter(p => p.text && !p.thought).map(p => p.text).join(''), calls: parts.filter(p => p.functionCall).map((p, i) => ({name: p.functionCall.name, args: p.functionCall.args || {}, id: p.functionCall.id || 'call_' + i})),
      content: {role: 'model', parts}, usage, truncated: finish === 'MAX_TOKENS'};
  }
  // ---------- dịch vụ kiểu OpenAI (Groq, OpenRouter, Cerebras) ----------
  function toMessages(opt, vision) {
    const sys = [opt.system || '', opt.schema ? '\nCHỈ trả về MỘT đối tượng JSON hợp lệ, đúng schema sau (không markdown, không giải thích):\n' + JSON.stringify(lowerSchema(opt.schema)) : ''].join('').trim();
    const msgs = sys ? [{role: 'system', content: sys}] : [];
    const contents = opt.contents || [{role: 'user', parts: [{text: opt.prompt}, ...(opt.parts || [])]}];
    let dropped = 0;
    for (const c of contents) {
      const ps = c.parts || [];
      if (c.role === 'model') {
        const text = ps.filter(p => p.text && !p.thought).map(p => p.text).join(''), calls = ps.filter(p => p.functionCall);
        msgs.push({role: 'assistant', content: text || null, ...(calls.length ? {tool_calls: calls.map((p, i) => ({id: p.functionCall.id || 'call_' + i, type: 'function', function: {name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {})}}))} : {})});
      } else if (ps.some(p => p.functionResponse)) {
        ps.filter(p => p.functionResponse).forEach((p, i) => msgs.push({role: 'tool', tool_call_id: p.functionResponse.id || 'call_' + i, content: JSON.stringify(p.functionResponse.response).slice(0, 30000)}));
      } else {
        const arr = [];
        for (const p of ps) {
          if (p.text) arr.push({type: 'text', text: p.text});
          else if (p.inlineData && vision && /^image\//.test(p.inlineData.mimeType)) arr.push({type: 'image_url', image_url: {url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`}});
          else if (p.inlineData) dropped++;
        }
        if (dropped) arr.push({type: 'text', text: `(Có ${dropped} ảnh/tệp không gửi được tới model này — chỉ dùng phần chữ.)`});
        msgs.push({role: 'user', content: arr.every(x => x.type === 'text') ? arr.map(x => x.text).join('\n') : arr});
      }
    }
    return msgs;
  }
  async function callOpen(prov, model, opt, signal, jsonMode = true) {
    const P = PROVIDERS[prov], vision = VISION.test(model);
    const body = {model, messages: toMessages(opt, vision), temperature: opt.temperature ?? 0.6, max_tokens: opt.maxTokens || (opt.schema ? 16000 : 6000),
      ...(opt.tools ? {tools: opt.tools.map(t => ({type: 'function', function: {name: t.name, description: t.description, parameters: lowerSchema(t.parameters)}})), tool_choice: 'auto'} : {}),
      ...(opt.schema && jsonMode ? {response_format: {type: 'json_object'}} : {})};
    let j;
    try { j = await http(P.base + '/chat/completions', {method: 'POST', headers: {Authorization: 'Bearer ' + cfg.keys[prov], 'Content-Type': 'application/json', ...(prov === 'openrouter' ? {'HTTP-Referer': location.origin, 'X-Title': 'PHONG VY Workroom'} : {})}, body: JSON.stringify(body)}, signal, prov); }
    catch (e) { if (e.status === 400 && opt.schema && jsonMode) return callOpen(prov, model, opt, signal, false); throw e; }   // model không hỗ trợ chế độ JSON → hỏi lại bằng lời dặn
    const msg = j.choices && j.choices[0] && j.choices[0].message;
    if (!msg) throw new AIError('empty', P.name + ' không trả lời.', {transient: true});
    let text = msg.content || '';
    if (opt.schema) { const m = text.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) text = m[1]; const a = text.indexOf('{'), b = text.lastIndexOf('}'); if (a >= 0 && b > a) text = text.slice(a, b + 1); }
    const calls = (msg.tool_calls || []).map(tc => { let args = {}; try { args = JSON.parse(tc.function.arguments || '{}'); } catch (e) {} return {name: tc.function.name, args, id: tc.id}; });
    if (opt.onText && text) opt.onText(text);
    return {text, calls, content: {role: 'model', parts: [...(msg.content ? [{text: msg.content}] : []), ...calls.map(c => ({functionCall: {name: c.name, args: c.args, id: c.id}}))]},
      usage: {in: j.usage && j.usage.prompt_tokens, out: j.usage && j.usage.completion_tokens}, truncated: j.choices[0].finish_reason === 'length'};
  }

  // ---------- kiểm tra khoá + lấy danh sách model ----------
  A.probe = async (only) => {
    if (!only || only === 'gemini') {
      if (!cfg.key) A.state = {...A.state, status: 'nokey', error: '', models: []};
      else try { const j = await http(GAPI + '/models?pageSize=200', {headers: {'x-goog-api-key': cfg.key}}, null, 'gemini'), models = rankModels(j.models || []);
        A.state = {...A.state, status: 'ok', error: '', models}; if (models.length && !models.some(m => m.name === cfg.model)) A.setCfg({model: models[0].name}); }
      catch (e) { A.state = {...A.state, status: e.code === 'badkey' || e.code === 'denied' ? 'bad' : 'error', error: e.message}; }
    }
    for (const p of BACKUPS) {
      if (only && only !== p) continue;
      if (!cfg.keys[p]) { A.state.extra = {...A.state.extra, [p]: {status: 'nokey', models: []}}; continue; }
      try { const j = await http(PROVIDERS[p].base + '/models', {headers: {Authorization: 'Bearer ' + cfg.keys[p]}}, null, p), models = rankOpen((j.data || []).map(m => m.id), p);
        A.state.extra = {...A.state.extra, [p]: {status: 'ok', models, error: ''}}; if (models.length && !models.some(m => m.name === cfg.models[p])) A.setCfg({models: {...cfg.models, [p]: models[0].name}}); }
      catch (e) { A.state.extra = {...A.state.extra, [p]: {status: 'bad', models: [], error: e.message}}; }
    }
    emit(); return A.state;
  };
  // chuỗi model sẽ thử, theo thứ tự
  function chain(opt) {
    const L = [];
    if (cfg.key) {
      let g = [A.model, ...A.state.models.map(m => m.name)].filter((x, i, a) => x && a.indexOf(x) === i);
      if (opt.fast) { const fl = A.state.models.filter(m => /-flash/.test(m.name)).map(m => m.name);   // trò chuyện: model Vy chọn (mặc định Flash mới nhất), dự phòng Flash-Lite
        g = [cfg.chatModel || fl.find(n => !/lite/.test(n)), fl.find(n => /lite/.test(n)), ...fl].filter((x, i, a) => x && a.indexOf(x) === i).slice(0, 2); if (!g.length) g = [A.model || 'gemini-flash-latest']; }
      g.slice(0, 3).forEach(m => L.push({prov: 'gemini', model: m}));
    }
    for (const p of BACKUPS) if (cfg.keys[p]) { const m = cfg.models[p] || ((A.state.extra[p] || {}).models || [])[0]; if (m) L.push({prov: p, model: m.name || m}); }
    if (opt.prefer) { const i = L.findIndex(c => c.prov === opt.prefer.prov && c.model === opt.prefer.model); if (i > 0) L.unshift(...L.splice(i, 1)); }
    return L;
  }
  const log = (task, t0, ok, err, res, via) => store.add('ailog', {provider: via ? via.prov : 'none', model: via ? via.model : '', task, ms: Math.round(performance.now() - t0), ok, error: err ? String(err).slice(0, 300) : null,
    tokens_in: res && res.usage && res.usage.in || null, tokens_out: res && res.usage && res.usage.out || null}, {silent: true}).catch(() => {});

  // ---------- 1 lượt gọi: tự thử lại + tự chuyển model, không bỏ dở ----------
  // opt: {task, system, contents | prompt + parts, tools, schema, temperature, maxTokens, prefer:{prov,model}, needVision}
  A.generate = async opt => {
    if (!A.hasAny) throw new AIError('nokey', 'Chưa có khoá AI. Vào Cài đặt → AI để dán khoá Gemini (miễn phí, làm 1 lần).');
    if (A.state.status === 'unknown' || (BACKUPS.some(p => cfg.keys[p] && !A.state.extra[p]))) await A.probe();
    if (opt.signal && opt.signal.aborted) throw new AIError('aborted', 'Đã dừng.');
    const ac = new AbortController(), t0 = performance.now(); running.add(ac);
    if (opt.signal) opt.signal.addEventListener('abort', () => ac.abort('stop'), {once: true});   // dừng riêng lượt này (vd trợ lý bấm Mới / Dừng)
    A.state = {...A.state, busy: running.size, task: opt.task || ''}; emit();
    const tried = [];
    try {
      const L = chain(opt);
      if (!L.length) throw new AIError('nokey', 'Chưa có model AI nào dùng được. Vào Cài đặt → AI để kiểm tra khoá.');
      // Còn đường dự phòng → thử lại 1 lần rồi chuyển ngay (nhanh). Đến model cuối → kiên nhẫn hơn. Cả vòng bận → đợi rồi chạy lại cả vòng (tối đa 3 vòng).
      for (let round = 0; round < 3; round++) {
        let retryable = false;
        for (let ci = 0; ci < L.length; ci++) {
          const c = L[ci], last = ci === L.length - 1, maxTry = opt.fast ? (last ? 2 : 1) : last ? 3 : 2;
          if (ci > 0 || round > 0) note(`Đang dùng ${ci > 0 ? 'dự phòng: ' : ''}${PROVIDERS[c.prov].name} · ${c.model.replace(/:free$/, '')}`);
          for (let attempt = 0; attempt < maxTry; attempt++) {
            if (ac.signal.aborted) throw new AIError('aborted', 'Đã dừng.');
            const one = new AbortController(), kill = () => one.abort(); ac.signal.addEventListener('abort', kill);
            // chat: không có tín hiệu (chữ / đang suy nghĩ) trong 25–90 giây tuỳ mức → bỏ, chuyển AI khác; việc nặng: tối đa cfg.timeout
            const lim = (opt.fast ? ({fast: 25, balanced: 45, deep: 90}[cfg.chatEffort] || 25) : cfg.timeout) * 1000; let timer = setTimeout(() => one.abort('timeout'), lim);
            opt._alive = () => { clearTimeout(timer); timer = setTimeout(() => one.abort('timeout'), lim); };
            try {
              if (opt.onText && (ci || attempt || round)) opt.onText('');   // thử lại bằng model khác → xoá chữ dở
            const res = c.prov === 'gemini' ? await callGemini(c.model, opt, one.signal) : await callOpen(c.prov, c.model, opt, one.signal);
              if (res.truncated && opt.schema) throw new AIError('cut', 'Câu trả lời bị cắt giữa chừng.', {skip: true});
              res.via = c; if (ci > 0 && tried.length) res.fell = tried[tried.length - 1]; log(opt.task, t0, true, null, res, c); note(ci > 0 ? `Đã dùng dự phòng ${PROVIDERS[c.prov].name}` : '');
              if (c.prov === 'gemini' && A.state.status !== 'ok') A.state = {...A.state, status: 'ok', error: ''};
              return res;
            } catch (e0) {
              const e = one.signal.aborted && !ac.signal.aborted ? new AIError('timeout', 'Trả lời quá chậm.', {transient: true}) : e0;
              if (ac.signal.aborted) throw new AIError('aborted', 'Đã dừng.');
              if (e.code === 'safety') throw e;
              tried.push(`${PROVIDERS[c.prov].name} ${c.model.replace(/:free$/, '')}: ${e.message}`); log(opt.task, t0, false, e.message, null, c);   // ghi cả lần hỏng để biết vì sao phải chuyển model
              if (opt.fast && e.code === 'timeout') break;
              if (e.perMinute && ci === 0 && !c.waited && e.wait > 0 && e.wait <= 12) { c.waited = 1; note(`${c.model.replace(/^gemini-/, 'Gemini ')}: giới hạn mỗi phút — đợi ${Math.ceil(e.wait)} giây rồi dùng tiếp…`); await sleep(e.wait * 1000 + 300); attempt--; continue; }   // đợi chút để giữ đúng model Vy chọn   // chat: model treo → sang model khác ngay, không chờ lại
              if (e.transient || e.perMinute) retryable = true;
              if (e.transient && attempt < maxTry - 1) { note(`${PROVIDERS[c.prov].name} đang bận — thử lại…`); await sleep(opt.fast ? 800 : last ? 2000 * (attempt + 1) ** 2 : 1000); continue; }
              if (e.perMinute && last && attempt < maxTry - 1 && !opt.fast) { note('Đã chạm giới hạn mỗi phút — đợi rồi chạy tiếp…'); await sleep(20000); continue; }
              break;
            } finally { clearTimeout(timer); ac.signal.removeEventListener('abort', kill); }
          }
        }
        if (!retryable || round === (opt.fast ? 1 : 2)) break;
        note('Mọi AI đang bận — đợi giây lát rồi tự chạy lại…'); await sleep(opt.fast ? 3000 : 8000 * (round + 1));
      }
      throw new AIError('all', 'Tất cả model AI đang bận hoặc hết lượt. Workroom đã thử: ' + tried.slice(-4).join(' · ') + (BACKUPS.some(p => cfg.keys[p]) ? '' : '. Thêm AI dự phòng miễn phí ở Cài đặt → AI để không bị gián đoạn.'));
    } catch (e) { if (e.code !== 'aborted') log(opt.task, t0, false, e.message, null, null); throw e; }
    finally { running.delete(ac); A.state = {...A.state, busy: running.size, task: running.size ? A.state.task : '', note: running.size ? A.state.note : ''}; emit(); }
  };
  // JSON đúng schema; mã kiểm lại; sai → hỏi lại (có thể bằng model khác)
  A.json = async (opt, validate) => {
    let last = '', prefer = null;
    for (let n = 0; n < 3; n++) {
      const res = await A.generate({...opt, prefer, temperature: opt.temperature ?? 0.5, prompt: n ? opt.prompt + '\n\n(Lần trước trả về không hợp lệ: ' + last + '. Trả lại đúng JSON.)' : opt.prompt});
      try { const obj = JSON.parse(res.text); return validate ? validate(obj) : obj; } catch (e) { last = String(e.message || e).slice(0, 120); }
    }
    throw new AIError('bad_json', 'AI trả về dữ liệu không đúng dạng (' + last + '). Bấm thử lại.');
  };
  A.stop = () => running.forEach(ac => ac.abort('stop'));
  return A;
}

// hướng dẫn lấy khoá
export function keyGuide(prov = 'gemini') {
  const P = PROVIDERS[prov];
  return h('ol', {class: 'wr-steps'},
    h('li', {}, 'Mở ', h('a', {href: P.keyUrl, target: '_blank', rel: 'noopener'}, P.keyUrl.replace(/^https:\/\//, '').replace(/\/$/, '')), ' (đăng nhập bằng Gmail).'),
    h('li', {}, prov === 'gemini' ? 'Bấm “Create API key”, chọn “Default Gemini Project” (Free tier) → sao chép khoá.' : 'Tạo khoá API mới (Create API key) → sao chép. Không cần nhập thẻ.'),
    h('li', {}, 'Dán vào ô bên dưới → Lưu. Chỉ làm 1 lần trên máy này.'));
}
export async function askKey(ai, prov = 'gemini') {
  const P = PROVIDERS[prov], inp = h('input', {class: 'wr-in', type: 'password', placeholder: 'Dán khoá API ' + P.name, 'aria-label': 'Khoá API ' + P.name, autocomplete: 'off'});
  const v = await dialog({title: (prov === 'gemini' ? 'Bật AI — ' : 'Thêm AI dự phòng — ') + P.name, body: h('div', {class: 'wr-stack'}, keyGuide(prov), inp, h('p', {class: 'wr-mute'}, P.note)),
    buttons: [['Để sau', null], ['Lưu', () => inp.value.trim() || null, 'primary']]});
  if (!v) return false;
  ai.setKey(prov, v); const st = await ai.probe(prov);
  return prov === 'gemini' ? st.status === 'ok' : (st.extra[prov] || {}).status === 'ok';
}
export {btn};
