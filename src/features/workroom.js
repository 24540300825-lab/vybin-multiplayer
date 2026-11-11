// PHÒNG VY — WORKROOM · phần trong game: ghim "START WORKING" ở bàn làm việc phòng Vy.
// Chỉ bật khi: đang ở phòng Vy và máy chủ xác nhận tài khoản này được vào Workroom (bảng wr_owner — giai đoạn thử: Vy + Bin).
// Tài khoản khác: file này thoát ngay — ghế vẫn là ghế "Ngồi" bình thường.
// Ngồi xuống → camera lướt ra sau lưng nhìn vào màn hình (như cảnh xem TV) → mở Workroom. Về phòng → camera lướt về.
// Giao diện Work Mode nằm ở trang vỏ (src/workroom/), ở đây chỉ lo: ngồi xuống → gõ phím → mở; thoát → trả lại game.
export default {
  id: 'workroom',
  async init(ctx) {
    if (ctx.mapId !== 'vy') return;
    let WR = null; try { WR = window.parent !== window && window.parent.VYSHELL && window.parent.VYSHELL.workroom; } catch (e) {}
    if (!WR) return;
    if (!(await WR.access())) { console.info('[workroom] tài khoản này chưa được cấp quyền vào Workroom'); return; }
    const api = ctx.api, L = api.local;
    let want = 0, opening = false;
    const seated = () => L.P.mode === 'sit' || L.P.mode === 'type';
    const cam = (mode, done) => { if (api.deskCam) api.deskCam(mode, done); else if (done) done(); };
    const onClose = () => {                       // VỀ PHÒNG: vẽ 3D lại bình thường, camera lướt về, thôi gõ phím nhưng vẫn ngồi ở bàn
      api.lowDraw = false;
      cam('out');
      if (L.P.mode === 'type') L.cmdSit('sit');
    };
    async function open() {
      if (opening) return; opening = true; want = 0;
      if (L.P.mode === 'sit') L.cmdSit('type');   // người kia thấy Vy đang gõ phím làm việc
      await new Promise(res => cam('in', res));   // cảnh quay: ra sau lưng, nhìn vào màn hình
      try { await WR.open({onClose}); api.lowDraw = true; }
      catch (e) { console.error('[workroom]', e); cam('out'); ctx.toast('Không mở được Workroom: ' + (e.message === 'not_owner' ? 'tài khoản này chưa được cấp quyền' : e.message)); if (L.P.mode === 'type') L.cmdSit('sit'); }
      opening = false;
    }
    const start = () => { if (seated()) return open(); want = performance.now(); L.cmdSit('type'); };
    api.chairPin = {label: 'START WORKING', act: start};
    // ngồi vào ghế bàn làm việc bằng BẤT KỲ cách nào (ghim START WORKING, phím E, bấm ghế) → mở Workroom
    api.onChairSeated = () => { want = 0; open(); };
    api.onChairLeft = () => { want = 0; };
    ctx.ui.addButton({icon: '💼', label: '', title: 'Workroom — ngồi vào bàn làm việc', onClick: start});
    // vừa quay lại từ trang cấp quyền Google (trang phải tải lại) → tự ngồi vào bàn và mở lại Workroom
    try { if (sessionStorage.getItem('vyWrReopen')) { sessionStorage.removeItem('vyWrReopen'); setTimeout(start, 1200); } } catch (e) {}
  },
};
