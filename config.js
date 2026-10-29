// ĐIỀN SAU KHI TẠO SUPABASE PROJECT (Settings → API). Đây là thông tin CÔNG KHAI (anon key), KHÔNG dán service_role vào đây.
window.VYBIN_CONFIG = {
  supabaseUrl: 'https://fywwphdhsytiecrtmemp.supabase.co',  // vd: https://abcdxyz.supabase.co
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5d3dwaGRoc3l0aWVjcnRtZW1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNjMyMTQsImV4cCI6MjEwODgzOTIxNH0.GU0e7uewu4Jq7CrSr9W75o1i5ZozTbjEuT0VVHjUjaE',  // anon / publishable key
  room: 'main',             // phòng mặc định; có thể mở ?room=ten-khac
  // TURN (cần khi 2 máy ở mạng chặt/4G/NAT đối xứng). Để trống nếu chưa có:
  // turn: {urls: ['turn:YOUR_TURN_HOST:443?transport=tcp','turns:YOUR_TURN_HOST:443?transport=tcp'], username: '...', credential: '...'},
};
