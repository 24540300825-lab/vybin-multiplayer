// Màn ĐĂNG NHẬP (trên nền ảnh loading): một nút "Đăng nhập bằng Google".
// Lần đầu: chọn tài khoản Gmail → chọn Bin/Vy (gắn cố định với tài khoản). Các lần sau / máy khác: đăng nhập là vào thẳng.
// loginScreen({onGoogle, note}) — onGoogle() chuyển trang sang Google; trả về hàm đóng màn.
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const G = '<svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

export function loginScreen({onGoogle, note = ''} = {}) {
  const load = document.getElementById('load') || document.body;
  const root = document.createElement('div');
  root.id = 'login'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Đăng nhập');
  root.innerHTML =
    '<div class="lg-box">' +
      '<div class="lg-av"><img src="assets/ui/avatars/vy.v1.png" alt="" width="96" height="96" draggable="false"><img src="assets/ui/avatars/bin.v1.png" alt="" width="96" height="96" draggable="false"></div>' +
      '<h2>VY · BIN studio</h2>' +
      '<p>Đăng nhập để game nhớ nhân vật, tiến trình và đồ của bạn trên mọi thiết bị.</p>' +
      '<button type="button" class="lg-g" id="lgG">' + G + '<span>Đăng nhập bằng Google</span></button>' +
      '<p class="lg-err" id="lgE" role="alert"' + (note ? '' : ' hidden') + '>' + esc(note) + '</p>' +
      '<p class="lg-sm">Lần đầu đăng nhập bạn sẽ chọn Bin hoặc Vy. Nhân vật gắn luôn với tài khoản đó.</p>' +
    '</div>';
  load.classList.add('pick');
  load.appendChild(root);
  const btn = root.querySelector('#lgG'), err = root.querySelector('#lgE');
  btn.onclick = async () => {
    btn.disabled = true; btn.querySelector('span').textContent = 'Đang mở Google…'; err.hidden = true;
    try { await onGoogle(); }
    catch (e) {
      btn.disabled = false; btn.querySelector('span').textContent = 'Đăng nhập bằng Google';
      const m = String(e && e.message || e);
      err.textContent = /provider is not enabled|Unsupported provider/i.test(m) ? 'Đăng nhập Google chưa được bật trên máy chủ. (Cần bật Google trong Supabase.)' : 'Không mở được đăng nhập: ' + m;
      err.hidden = false;
    }
  };
  return () => { load.classList.remove('pick'); root.classList.add('out'); setTimeout(() => root.remove(), 400); };
}
