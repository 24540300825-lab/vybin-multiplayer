// "AI HIỂU AI HƠN" — 8 câu, đổi vai mỗi câu. Người được hỏi chọn THẬT LÒNG, người kia ĐOÁN xem họ chọn gì.
// Đoán trúng = +1 điểm cho người đoán. Ai nhiều điểm hơn = hiểu người kia hơn.
// Mạng: mỗi bên gửi {k:'a', r, c} khi chọn; đủ 2 lựa chọn của câu r thì cả 2 cùng lật đáp án. Mỗi câu 25 s.
import {COL, NAME, beep} from './kit.js';

const R = 8, T_Q = 25;
// {T} = tên người được hỏi
const BANK = [
  ['Cuối tuần rảnh cả ngày, {T} muốn…', ['Ngủ nướng tới trưa', 'Đi cà phê / dạo phố', 'Ở nhà xem phim', 'Đi chơi xa 1 chuyến']],
  ['Món {T} có thể ăn mỗi ngày không chán?', ['Phở / bún', 'Cơm tấm / cơm nhà', 'Lẩu / nướng', 'Đồ ngọt, trà sữa']],
  ['Đi du lịch, {T} chọn…', ['Biển', 'Núi / rừng', 'Thành phố lớn', 'Về quê, chỗ yên tĩnh']],
  ['Khi buồn, {T} thường…', ['Im lặng một mình', 'Tâm sự ngay', 'Ăn thật nhiều', 'Ngủ một giấc']],
  ['{T} sợ nhất là…', ['Gián / côn trùng', 'Ma / phim kinh dị', 'Độ cao', 'Bị bỏ rơi']],
  ['Siêu năng lực {T} muốn có?', ['Dịch chuyển tức thời', 'Đọc suy nghĩ', 'Ngừng thời gian', 'Bay']],
  ['Buổi hẹn lý tưởng của {T}?', ['Ăn tối ở nhà hàng xinh', 'Nấu ăn cùng nhau ở nhà', 'Đi dạo đêm, ăn vặt', 'Xem phim rạp']],
  ['{T} thích quà kiểu nào nhất?', ['Đồ handmade tự làm', 'Đồ dùng thực tế', 'Một chuyến đi', 'Thư tay / lời nhắn']],
  ['Nếu trúng số, việc đầu tiên {T} làm?', ['Mua nhà', 'Đi du lịch vòng quanh', 'Gửi tiết kiệm hết', 'Bao cả nhà ăn một bữa']],
  ['Mùa {T} thích nhất?', ['Xuân', 'Hạ', 'Thu', 'Đông']],
  ['{T} là người…', ['Dậy sớm', 'Cú đêm', 'Ngủ lúc nào cũng được', 'Không bao giờ đủ giấc']],
  ['Thể loại phim {T} mê nhất?', ['Hài', 'Tình cảm', 'Hành động / viễn tưởng', 'Kinh dị / trinh thám']],
  ['Đồ uống quen thuộc của {T}?', ['Cà phê', 'Trà sữa', 'Nước ép / sinh tố', 'Nước lọc thôi']],
  ['Con vật {T} muốn nuôi?', ['Chó', 'Mèo', 'Thỏ / hamster', 'Cá / cây cảnh là đủ']],
  ['Khi cãi nhau, {T} thường…', ['Làm lành trước', 'Cần thời gian bình tĩnh', 'Nói hết cho ra lẽ', 'Giả vờ không sao']],
  ['Điều nhỏ nhất làm {T} vui cả ngày?', ['Được khen', 'Được ăn ngon', 'Nhận tin nhắn bất ngờ', 'Trời đẹp']],
  ['{T} muốn sống ở đâu sau này?', ['Thành phố sôi động', 'Ngoại ô yên tĩnh', 'Gần biển', 'Ở nước ngoài']],
  ['Nhạc {T} hay nghe nhất?', ['Ballad / nhạc buồn', 'Pop sôi động', 'Lofi / chill', 'Nhạc xưa / bolero']],
  ['Trong 1 nhóm bạn, {T} là…', ['Người pha trò', 'Người lên kế hoạch', 'Người lắng nghe', 'Người tới trễ']],
  ['{T} tiêu tiền nhiều nhất vào…', ['Ăn uống', 'Quần áo / mỹ phẩm', 'Đồ công nghệ / game', 'Đi chơi']],
  ['Kỷ niệm {T} muốn làm lại nhất?', ['Lần đầu gặp nhau', 'Chuyến đi chơi xa', 'Một bữa ăn đặc biệt', 'Một ngày bình thường bên nhau']],
  ['Nếu chỉ được giữ 1 app, {T} giữ…', ['Mạng xã hội', 'Nhắn tin', 'Nhạc / phim', 'Game']],
  ['{T} thích được an ủi kiểu…', ['Ôm một cái', 'Nghe mình nói', 'Rủ đi ăn', 'Để yên một lúc']],
  ['Bữa sáng của {T} thường là…', ['Bánh mì', 'Xôi / cháo', 'Bỏ bữa', 'Ngủ tới bữa trưa luôn']],
];

export default {
  id: 'quiz', title: 'Ai hiểu ai hơn', icon: '💞',
  desc: '8 câu hỏi về nhau — người được hỏi chọn thật lòng, người kia đoán.',
  rules: 'Đến lượt mình được hỏi: chọn thật lòng. Đến lượt đoán: đoán xem người kia chọn gì. Đoán trúng +1.',
  start(api) {
    const {me, other, host, rng} = api, hostSlot = host ? me : other, guestSlot = host ? other : me;
    // câu hỏi theo seed chung → 2 máy ra cùng bộ câu
    const order = BANK.map((q, i) => [rng(), i]).sort((a, b) => a[0] - b[0]).slice(0, R).map(x => BANK[x[1]]);
    const st = {r: 0, pick: {}, pts: {[me]: 0, [other]: 0}, t: T_Q, reveal: 0, over: false};
    const el = document.createElement('div'); el.className = 'ar-quiz'; api.stage.appendChild(el);
    const target = r => (r % 2 === 0 ? hostSlot : guestSlot), guesser = r => (r % 2 === 0 ? guestSlot : hostSlot);
    const sc = () => api.score(st.pts);
    const render = () => {
      if (st.over) return;
      const r = st.r, [q, opts] = order[r], T = target(r), iAmT = T === me, mine = st.pick[r + ':' + me], his = st.pick[r + ':' + other];
      const showAns = st.reveal > 0;
      const tc = st.pick[r + ':' + T], gc = st.pick[r + ':' + guesser(r)];
      el.innerHTML = `<div class="qz-n">Câu ${r + 1}/${R} · <b style="color:${COL[T]}">${NAME[T]}</b> được hỏi · <b style="color:${COL[guesser(r)]}">${NAME[guesser(r)]}</b> đoán</div>
        <div class="qz-q">${q.replace('{T}', `<b style="color:${COL[T]}">${iAmT ? 'bạn' : NAME[T]}</b>`)}</div>
        <div class="qz-h">${showAns ? (tc === gc && tc != null ? '🎯 Đoán trúng! +1 cho ' + NAME[guesser(r)] : '❌ Lệch rồi…') : iAmT ? 'Chọn THẬT LÒNG nha 🤞' : 'Đoán xem ' + NAME[T] + ' chọn gì? 🤔'}</div>
        <div class="qz-o">${opts.map((o, i) => `<button data-c="${i}" class="${mine === i ? 'me' : ''} ${showAns && tc === i ? 'ans' : ''} ${showAns && gc === i && gc !== tc ? 'bad' : ''}" ${mine != null || showAns ? 'disabled' : ''}>${o}${showAns && tc === i ? ' <i>← ' + NAME[T] + '</i>' : ''}${showAns && gc === i ? ' <i>' + (gc === tc ? '✔' : '✘') + ' ' + NAME[guesser(r)] + ' đoán</i>' : ''}</button>`).join('')}</div>
        <div class="qz-w">${showAns ? '' : mine != null ? (his != null ? '' : 'Chờ ' + NAME[other] + '…') : ''}</div>`;
    };
    el.addEventListener('click', e => {
      const b = e.target.closest('button[data-c]'); if (!b || st.over || st.reveal > 0) return; const k = st.r + ':' + me; if (st.pick[k] != null) return;
      st.pick[k] = +b.dataset.c; beep(620, 0.05); api.send({k: 'a', r: st.r, c: +b.dataset.c});
      if (api.bot) setTimeout(() => { if (st.pick[st.r + ':' + other] == null) { st.pick[st.r + ':' + other] = (rng() * 4) | 0; check(); } }, 600 + rng() * 1200);
      check(); render();
    });
    api.onMsg(d => { if (d.k === 'a' && d.r === st.r) { st.pick[d.r + ':' + other] = d.c; check(); render(); } else if (d.k === 'a' && d.r > st.r) st.pick[d.r + ':' + other] = d.c; });
    const check = () => {
      const r = st.r; if (st.reveal > 0) return;
      const a = st.pick[r + ':' + me], b = st.pick[r + ':' + other]; if (a == null || b == null) return;
      const T = target(r), G = guesser(r);
      if (st.pick[r + ':' + T] === st.pick[r + ':' + G] && st.pick[r + ':' + T] >= 0) { st.pts[G]++; beep(G === me ? 990 : 520, 0.2, 'triangle'); } else beep(220, 0.15);
      st.reveal = 2.6; sc(); render();
    };
    sc(); render();
    let tick = 0;
    const iv = setInterval(() => {
      if (st.over) return;
      if (st.reveal > 0) {
        st.reveal -= 0.2;
        if (st.reveal <= 0) {
          st.reveal = 0; st.r++; st.t = T_Q;
          if (st.r >= R) { st.over = true; el.innerHTML = `<div class="qz-q">Xong ${R} câu!</div>`; if (host) { const w = st.pts[me] > st.pts[other] ? me : st.pts[other] > st.pts[me] ? other : null; api.end({winner: w, score: {...st.pts}}); } return; }
          render(); check();
        }
      } else {
        st.t -= 0.2;
        if (st.t <= 0 && st.pick[st.r + ':' + me] == null) { st.pick[st.r + ':' + me] = -1; api.send({k: 'a', r: st.r, c: -1}); check(); render(); }
        if (st.t <= -6 && st.pick[st.r + ':' + other] == null) { st.pick[st.r + ':' + other] = -1; check(); render(); }   // người kia mất kết nối
      }
      if ((tick++ % 5) === 0) api.status(st.reveal > 0 ? '' : '⏱ ' + Math.max(0, Math.ceil(st.t)) + ' s');
    }, 200);
    return {stop() { clearInterval(iv); el.remove(); }};
  },
};
