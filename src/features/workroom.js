// PHÒNG VY — WORKROOM · phần trong game: ghim "START WORKING" ở bàn làm việc phòng Vy.
// Chỉ bật khi: đang là nhân vật VY, đang ở phòng Vy, và máy chủ xác nhận tài khoản này là chủ Workroom.
// Bin và mọi tài khoản khác: file này thoát ngay — ghế vẫn là ghế "Ngồi" bình thường, không có gì khác đi.
// Giao diện Work Mode nằm ở trang vỏ (src/workroom/), ở đây chỉ lo: ngồi xuống → gõ phím → mở; thoát → trả lại game.
export default {
  id: 'workroom',
  async init(ctx) {
    if (ctx.slot !== 'vy' || ctx.mapId !== 'vy') return;
    let WR = null; try { WR = window.parent !== window && window.parent.VYSHELL && window.parent.VYSHELL.workroom; } catch (e) {}
    if (!WR || !(await WR.access())) return;
    const api = ctx.api, L = api.local;
    let want = 0, opening = false;
    const seated = () => L.P.mode === 'sit' || L.P.mode === 'type';
    const onClose = () => {                       // BACK TO ROOM: vẽ 3D lại bình thường, Vy thôi gõ phím nhưng vẫn ngồi ở bàn
      api.lowDraw = false;
      if (L.P.mode === 'type') L.cmdSit('sit');
    };
    async function open() {
      if (opening) return; opening = true; want = 0;
      if (L.P.mode === 'sit') L.cmdSit('type');   // người kia thấy Vy đang gõ phím làm việc
      try { await WR.open({onClose}); api.lowDraw = true; }
      catch (e) { console.error('[workroom]', e); ctx.toast('Không mở được Workroom: ' + (e.message === 'not_owner' ? 'tài khoản này không phải chủ phòng' : e.message)); if (L.P.mode === 'type') L.cmdSit('sit'); }
      opening = false;
    }
    const start = () => { if (seated()) return open(); want = performance.now(); L.cmdSit('type'); };
    api.chairPin = {label: 'START WORKING', act: start};
    api.onChairSeated = () => { if (want && performance.now() - want < 30000) open(); else want = 0; };
    api.onChairLeft = () => { want = 0; };
    ctx.ui.addButton({icon: '💼', label: '', title: 'Workroom — ngồi vào bàn làm việc', onClick: start});
  },
};
