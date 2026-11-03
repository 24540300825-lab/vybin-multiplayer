// Màn CHỌN NHÂN VẬT (Figma "Frame 5"): nền mờ tối + 2 capsule (VY trên, BIN dưới).
// Bản tài khoản: chỉ hiện MỘT LẦN cho mỗi tài khoản Google — chọn xong là nhân vật gắn cố định với tài khoản đó.
// pickChar({taken, note, takenText, hint}) → Promise<'bin'|'vy'>.  taken = nhân vật đã có chủ / đang có người dùng (bị khoá).
const INFO = {
  vy: {name: 'Vy', img: 'assets/ui/avatars/vy.v1.png'},
  bin: {name: 'Bin', img: 'assets/ui/avatars/bin.v1.png'},
};
const ORDER = ['vy', 'bin'];                       // đúng thứ tự Figma: VY trên, BIN dưới
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

export const savedChar = () => { try { const v = localStorage.getItem('vyChar'); return v === 'bin' || v === 'vy' ? v : null; } catch (e) { return null; } };
export const saveChar = k => { try { localStorage.setItem('vyChar', k); } catch (e) {} };
export const forgetChar = () => { try { localStorage.removeItem('vyChar'); } catch (e) {} };

export function pickChar({taken = [], note = '', takenText = 'Đang có người dùng', hint = ''} = {}) {
  return new Promise(resolve => {
    const load = document.getElementById('load') || document.body;
    const root = document.createElement('div');
    root.id = 'pick'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Chọn nhân vật');
    root.innerHTML = '<div class="pk-col">' + ORDER.map(k => {
      const i = INFO[k], off = taken.includes(k);
      return '<button type="button" class="pk" data-k="' + k + '"' + (off ? ' disabled aria-disabled="true"' : '') + ' aria-label="' + i.name + (off ? ' — ' + esc(takenText) : '') + '">' +
        '<span class="pa"><img src="' + i.img + '" alt="" width="128" height="128" draggable="false"></span>' +
        '<span class="pi"><span class="hd"><b class="nm">' + i.name + '</b>' + (off ? '<span class="tk">' + esc(takenText) + '</span>' : '') + '</span>' +
        '<span class="pk-sub">' + (off ? 'Nhân vật này đã gắn với một tài khoản khác' : 'Chọn để gắn ' + i.name + ' với tài khoản của bạn') + '</span></span>' +
        '</button>';
    }).join('') + '</div>' + (hint ? '<p class="pk-hint">' + esc(hint) + '</p>' : '') + (note ? '<p class="pk-note" role="alert">' + esc(note) + '</p>' : '');
    load.classList.add('pick');
    load.appendChild(root);
    let done = false;
    const choose = k => {
      if (done || taken.includes(k)) return; done = true;
      root.classList.add('go');
      root.querySelectorAll('.pk').forEach(b => { b.classList.toggle('sel', b.dataset.k === k); b.tabIndex = -1; });
      setTimeout(() => { load.classList.remove('pick'); root.classList.add('out'); setTimeout(() => root.remove(), 400); resolve(k); }, 480);
    };
    root.addEventListener('click', e => { const b = e.target.closest('.pk'); if (b) choose(b.dataset.k); });
  });
}
