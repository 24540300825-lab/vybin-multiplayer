// MẪU TÍNH NĂNG — copy file này thành src/features/ten-cua-ban.js, đổi id, rồi thêm vào registry.js.
// Ví dụ: nút 👋 vẫy tay — bấm thì người kia thấy thông báo.
export default {
  id: 'wave',                       // duy nhất, chữ thường/số/gạch
  init(ctx) {
    // ctx.slot ('bin'|'vy'), ctx.other, ctx.mapId, ctx.api (engine), ctx.toast(text), ctx.solo (đang chơi một mình)
    ctx.on('wave', () => ctx.toast('👋 ' + (ctx.other === 'bin' ? 'Bin' : 'Vy') + ' vẫy tay với bạn'));
    ctx.ui.addButton({icon: '👋', label: 'Vẫy', onClick: () => { ctx.send('wave', {}); ctx.toast('Đã vẫy tay'); }});
    // ctx.store.get/set('khoa', giaTri)  — lưu trên máy mình, tách riêng theo id tính năng
    // ctx.onPeer(({present}) => …)       — khi người kia vào/ra
  },
};
