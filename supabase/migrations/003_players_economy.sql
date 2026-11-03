-- VY/BIN studio — Đợt 1: tài khoản người chơi, ví/XP/Điểm Kiến Tạo, sổ giao dịch, bảng cân bằng, hộp quà,
-- cấp độ, kỹ năng, thành tựu, phiên tập trung.
-- CHỈ THÊM MỚI. Không sửa bảng/hàm của 001/002 => bản game cũ vẫn chạy bình thường.
-- Idempotent: chạy lại nhiều lần an toàn (cấu hình mặc định chỉ chèn khi chưa có, không ghi đè số bạn đã chỉnh).
--
-- Nguyên tắc:
--  * Mỗi tài khoản (Google) = 1 người chơi = 1 nhân vật cố định (bin/vy). Nhiều máy cùng tài khoản = cùng người chơi.
--  * Trình duyệt KHÔNG BAO GIỜ gửi số dư. Mọi thay đổi đi qua hàm phía máy chủ, ghi vào sổ game_ledger, có mã chống cộng trùng.
--  * Mọi con số thưởng/giá/ngưỡng nằm trong bảng game_config (chỉnh được, không viết cứng).
--  * Bảng không mở cho client đọc/ghi trực tiếp (RLS bật, không policy) — chỉ qua RPC security definer.

-- ============ TABLES ============
create table if not exists public.game_players (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique,                      -- auth.users.id (tài khoản Google)
  email       text,
  slot        text not null unique check (slot in ('bin','vy')),
  name        text not null,
  title       text,                                      -- danh hiệu đang trưng bày (mã thành tựu)
  settings    jsonb not null default '{}'::jsonb,        -- tuỳ chọn đồng bộ giữa các máy (múi giờ...)
  tasks       jsonb not null default '[]'::jsonb,        -- "Việc hôm nay"
  flags       jsonb not null default '{}'::jsonb,        -- cờ nội bộ (đã xem hướng dẫn...)
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

-- Cấu hình cân bằng / danh mục nội dung (key → JSON). Sửa trong Command Center hoặc SQL Editor.
create table if not exists public.game_config (
  key         text primary key check (key ~ '^[a-z0-9_]{1,48}$'),
  value       jsonb not null,
  note        text,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create table if not exists public.game_config_history (
  id          bigserial primary key,
  key         text not null,
  old_value   jsonb,
  new_value   jsonb,
  changed_by  text,
  changed_at  timestamptz not null default now()
);

-- Số dư hiện tại (bộ nhớ đệm của sổ). owner = 'player:<uuid>' hoặc 'house' (quỹ chung của nhà).
create table if not exists public.game_balances (
  owner       text not null check (owner ~ '^(player:[0-9a-f-]{36}|house)$'),
  currency    text not null check (currency ~ '^[a-z0-9_:]{1,48}$'),
  amount      bigint not null default 0 check (amount >= 0),
  primary key (owner, currency)
);

-- Sổ giao dịch: chỉ thêm, không sửa/xoá. Mỗi dòng = một biến động có lý do.
create table if not exists public.game_ledger (
  id            bigserial primary key,
  owner         text not null,
  currency      text not null,
  amount        bigint not null check (amount <> 0),
  balance_after bigint not null check (balance_after >= 0),
  reason        text not null,                 -- mô tả dễ đọc: "Phiên tập trung 25 phút"
  source        text not null,                 -- mã nguồn: focus, inbox, event:visit_garden, level_up...
  ref           text,                          -- mã liên quan (id phiên, id quà...)
  actor         uuid references public.game_players(id) on delete set null,
  idem          text unique,                   -- mã chống cộng trùng
  created_at    timestamptz not null default now()
);
create index if not exists game_ledger_owner_time_idx on public.game_ledger (owner, created_at desc);

-- Hộp quà chờ nhận (quà lên cấp, thành tựu, quà chào mừng, đồ dư khi túi đầy...).
create table if not exists public.game_inbox (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.game_players(id) on delete cascade,
  title       text not null,
  body        text,
  items       jsonb not null default '[]'::jsonb,   -- [{"c":"xu","n":200}] ; c bắt đầu "soon:" = món sắp có (chỉ hiển thị)
  source      text not null,
  idem        text unique,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz
);
create index if not exists game_inbox_player_idx on public.game_inbox (player_id, claimed_at, created_at desc);

-- Dòng sự kiện hoạt động: mọi hệ thống thưởng (XP, kỹ năng, thành tựu, nhiệm vụ sau này) nghe chung.
create table if not exists public.game_events (
  id          bigserial primary key,
  player_id   uuid not null references public.game_players(id) on delete cascade,
  kind        text not null check (kind ~ '^[a-z0-9_]{1,48}$'),
  data        jsonb not null default '{}'::jsonb,
  granted     boolean not null default false,       -- sự kiện này có được phát thưởng theo luật không
  idem        text unique,
  created_at  timestamptz not null default now()
);
create index if not exists game_events_player_kind_idx on public.game_events (player_id, kind, created_at desc);

create table if not exists public.game_achievements (
  player_id   uuid not null references public.game_players(id) on delete cascade,
  ach         text not null,
  progress    int not null default 0,
  done_at     timestamptz,
  primary key (player_id, ach)
);

create table if not exists public.game_focus (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.game_players(id) on delete cascade,
  minutes     int not null check (minutes between 1 and 240),
  started_at  timestamptz not null default now(),
  ends_at     timestamptz not null,
  status      text not null default 'running' check (status in ('running','done','cancelled')),
  done_at     timestamptz
);
create index if not exists game_focus_player_idx on public.game_focus (player_id, started_at desc);

alter table public.game_players        enable row level security;
alter table public.game_config         enable row level security;
alter table public.game_config_history enable row level security;
alter table public.game_balances       enable row level security;
alter table public.game_ledger         enable row level security;
alter table public.game_inbox          enable row level security;
alter table public.game_events         enable row level security;
alter table public.game_achievements   enable row level security;
alter table public.game_focus          enable row level security;
-- không có policy nào => client chỉ làm việc qua các hàm RPC bên dưới

-- ============ CẤU HÌNH MẶC ĐỊNH (giá trị thử, chỉnh được) ============
insert into public.game_config(key, value, note) values
 ('tz', '"Asia/Ho_Chi_Minh"', 'Múi giờ tính "ngày" cho giới hạn hằng ngày (reset 00:00)'),
 ('welcome', '[{"c":"xu","n":200}]', 'Quà chào mừng khi tạo nhân vật'),
 ('levels', '{"thresholds":[0,100,250,450,700,1000],"step":350,"grow":50}',
   'XP TÍCH LŨY cần cho cấp 1..6; từ cấp 7: mỗi cấp cần thêm step + grow*(k-1)'),
 ('level_rewards', '{"default":[{"c":"xu","n":30}],"every5":[{"c":"xu","n":100},{"c":"soon:decor","n":1,"label":"Món trang trí (sắp có)"}]}',
   'Quà mỗi lần lên cấp; every5 = cấp 5, 10, 15... (thay cho default)'),
 ('focus', '{"lengths":[25,50],"per25":{"xu":15,"xp":20,"skill:creative":10},"daily_cap_min":200,"grace_s":20}',
   'Phiên tập trung: thưởng theo mỗi 25 phút; trần phút được thưởng mỗi ngày'),
 ('rewards', '{
   "enter_house":    {"once":true, "xp":20, "label":"Về nhà lần đầu"},
   "visit_garden":   {"daily":1, "xp":10, "kt":5, "label":"Dạo vườn hôm nay"},
   "sleep":          {"daily":1, "xp":5, "label":"Một giấc ngủ ngon"},
   "chat_sent":      {"daily":3, "xp":2, "label":"Trò chuyện"},
   "call_together":  {"daily":1, "xp":10, "kt":3, "label":"Gọi cho nhau"},
   "together_10min": {"daily":6, "xp":5, "kt":2, "label":"Ở cạnh nhau 10 phút"}
 }', 'Luật thưởng theo sự kiện: once = chỉ 1 lần; daily = số lần được thưởng mỗi ngày; kt = Điểm Kiến Tạo vào quỹ nhà'),
 ('skills', '[
   {"id":"creative","name":"Sáng tạo","live":true},
   {"id":"garden","name":"Làm vườn","live":false},
   {"id":"fishing","name":"Câu cá","live":false},
   {"id":"explore","name":"Khám phá","live":false},
   {"id":"craft","name":"Chế tạo","live":false}
 ]', 'Nhánh kỹ năng. live=false hiển thị "Sắp có". Cấp kỹ năng = mỗi 100 điểm 1 cấp (skill_step)'),
 ('skill_step', '100', 'Điểm kỹ năng cho mỗi cấp kỹ năng'),
 ('house_levels', '{"start":1,"costs":{"2":120,"3":200,"4":300}}', 'Điểm Kiến Tạo để lên cấp nhà L2/L3/L4 (dùng ở hạng mục 13)'),
 ('achievements', '[
   {"id":"home",       "group":"Lần đầu",   "name":"Về nhà",            "desc":"Bước vào nhà lần đầu",             "event":"enter_house",   "count":1,  "reward":[{"c":"xu","n":20}]},
   {"id":"garden",     "group":"Khám phá",  "name":"Bàn chân xanh",     "desc":"Ra vườn lần đầu",                  "event":"visit_garden",  "count":1,  "reward":[{"c":"xu","n":20}]},
   {"id":"sleep",      "group":"Nhà cửa",   "name":"Ngủ ngon",          "desc":"Ngủ trên giường lần đầu",          "event":"sleep",         "count":1,  "reward":[{"c":"xu","n":10}]},
   {"id":"focus1",     "group":"Sáng tạo",  "name":"Bắt tay vào việc",  "desc":"Hoàn thành 1 phiên tập trung",     "event":"focus_done",    "count":1,  "reward":[{"c":"xu","n":30}], "title":"Người tập trung"},
   {"id":"focus10",    "group":"Sáng tạo",  "name":"Thợ cày studio",    "desc":"Hoàn thành 10 phiên tập trung",    "event":"focus_done",    "count":10, "reward":[{"c":"xu","n":100}], "title":"Thợ cày studio"},
   {"id":"chat1",      "group":"Xã hội",    "name":"Lời chào",          "desc":"Gửi tin nhắn đầu tiên",            "event":"chat_sent",     "count":1,  "reward":[{"c":"xu","n":10}]},
   {"id":"call1",      "group":"Cùng nhau", "name":"Nghe giọng nhau",   "desc":"Gọi cho nhau lần đầu",             "event":"call_together", "count":1,  "reward":[{"c":"xu","n":20},{"c":"kt","n":15}], "together":true},
   {"id":"together1h", "group":"Cùng nhau", "name":"Đôi bạn thân",      "desc":"Ở cạnh nhau tổng cộng 1 giờ",      "event":"together_10min","count":6,  "reward":[{"c":"kt","n":25}], "together":true, "title":"Đôi bạn thân"},
   {"id":"lv5",        "group":"Tiến trình","name":"Lên cấp 5",         "desc":"Đạt cấp 5",                        "event":"level_up",      "count":4,  "reward":[{"c":"xu","n":50}], "title":"Cư dân chăm chỉ"}
 ]', 'Danh mục thành tựu: đếm số lần sự kiện "event"; đủ "count" thì vào Hộp quà. together = nhóm Cùng nhau (thưởng kt vào quỹ nhà)')
on conflict (key) do nothing;

-- ============ HELPERS (nội bộ, client không gọi được) ============
create or replace function public._cfg(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select value from public.game_config where key = p_key;
$$;

create or replace function public._me() returns public.game_players
language sql stable security definer set search_path = public as $$
  select p.* from public.game_players p where p.user_id = auth.uid();
$$;

-- đầu ngày hôm nay theo múi giờ cấu hình
create or replace function public._day_start() returns timestamptz
language sql stable security definer set search_path = public as $$
  select (date_trunc('day', now() at time zone coalesce(public._cfg('tz') #>> '{}', 'Asia/Ho_Chi_Minh'))
          at time zone coalesce(public._cfg('tz') #>> '{}', 'Asia/Ho_Chi_Minh'));
$$;

-- XP tích luỹ cần để ĐẠT cấp n (n>=1)
create or replace function public._xp_for_level(n int) returns bigint
language plpgsql stable security definer set search_path = public as $$
declare c jsonb := public._cfg('levels'); th jsonb := c->'thresholds'; L int := jsonb_array_length(c->'thresholds');
        x bigint; k int;
begin
  if n <= 1 then return 0; end if;
  if n <= L then return (th->>(n-1))::bigint; end if;
  x := (th->>(L-1))::bigint;
  for k in 1..(n - L) loop x := x + coalesce((c->>'step')::int,350) + coalesce((c->>'grow')::int,50) * (k-1); end loop;
  return x;
end $$;

create or replace function public._level_of(p_xp bigint) returns int
language plpgsql stable security definer set search_path = public as $$
declare n int := 1;
begin
  while n < 999 and public._xp_for_level(n+1) <= p_xp loop n := n + 1; end loop;
  return n;
end $$;

create or replace function public._bal(p_owner text, p_cur text) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce((select amount from public.game_balances where owner = p_owner and currency = p_cur), 0);
$$;

-- LÕI: cộng/trừ một loại tiền/điểm. Idempotent theo p_idem (trả false nếu đã xử lý trước đó).
-- Trừ quá số dư => lỗi 'insufficient' (không bao giờ âm). XP chỉ được cộng (không tiêu được).
create or replace function public._grant(p_owner text, p_cur text, p_amt bigint, p_reason text, p_source text,
                                          p_ref text, p_actor uuid, p_idem text) returns boolean
language plpgsql security definer set search_path = public as $$
declare cur_amt bigint; new_amt bigint; pid uuid; lv0 int; lv1 int; n int; rw jsonb;
begin
  if p_amt is null or p_amt = 0 then return false; end if;
  if p_cur = 'xp' and p_amt < 0 then raise exception 'xp_not_spendable'; end if;
  if p_idem is not null and exists (select 1 from public.game_ledger where idem = p_idem) then return false; end if;
  insert into public.game_balances(owner, currency, amount) values (p_owner, p_cur, 0) on conflict do nothing;
  select amount into cur_amt from public.game_balances where owner = p_owner and currency = p_cur for update;
  new_amt := cur_amt + p_amt;
  if new_amt < 0 then raise exception 'insufficient'; end if;
  update public.game_balances set amount = new_amt where owner = p_owner and currency = p_cur;
  insert into public.game_ledger(owner, currency, amount, balance_after, reason, source, ref, actor, idem)
    values (p_owner, p_cur, p_amt, new_amt, p_reason, p_source, p_ref, p_actor, p_idem);
  -- lên cấp => quà vào Hộp quà + sự kiện level_up (đếm cho thành tựu)
  if p_cur = 'xp' and p_owner like 'player:%' then
    pid := substr(p_owner, 8)::uuid;
    lv0 := public._level_of(cur_amt); lv1 := public._level_of(new_amt);
    if lv1 > lv0 then
      for n in (lv0+1)..lv1 loop
        rw := case when n % 5 = 0 then public._cfg('level_rewards')->'every5' else public._cfg('level_rewards')->'default' end;
        insert into public.game_inbox(player_id, title, body, items, source, idem)
          values (pid, 'Lên cấp ' || n || '!', 'Quà thăng cấp', coalesce(rw,'[]'::jsonb), 'level_up', 'lvl:' || pid || ':' || n)
          on conflict (idem) do nothing;
        perform public._event(pid, 'level_up', jsonb_build_object('level', n), 'lvlev:' || pid || ':' || n, false);
      end loop;
    end if;
  end if;
  return true;
end $$;

-- phát một gói vật phẩm [{"c":"xu","n":..}]: kt => quỹ nhà; soon:* => bỏ qua (chỉ hiển thị)
create or replace function public._grant_items(p_pid uuid, p_items jsonb, p_reason text, p_source text, p_ref text, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; c text; n bigint; owner text; out jsonb := '[]'::jsonb;
begin
  for it in select x.value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x loop
    c := it->>'c'; n := coalesce((it->>'n')::bigint, 0);
    if c is null or n = 0 or c like 'soon:%' then continue; end if;
    owner := case when c = 'kt' then 'house' else 'player:' || p_pid end;
    if public._grant(owner, c, n, p_reason, p_source, p_ref, p_pid, p_idem || ':' || c) then
      out := out || jsonb_build_array(jsonb_build_object('c', c, 'n', n));
    end if;
  end loop;
  return out;
end $$;

-- ghi sự kiện + chạy luật thưởng + cập nhật thành tựu. Trả {"granted":[...], "achievements":[...]}.
create or replace function public._event(p_pid uuid, p_kind text, p_data jsonb, p_idem text, p_reward boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; ok boolean := false; cnt int; got jsonb := '[]'::jsonb; done jsonb := '[]'::jsonb; a jsonb;
        prog int; eid bigint; items jsonb := '[]'::jsonb;
begin
  if p_idem is not null and exists (select 1 from public.game_events where idem = p_idem) then
    return jsonb_build_object('granted', '[]'::jsonb, 'achievements', '[]'::jsonb, 'dup', true);
  end if;
  r := public._cfg('rewards')->p_kind;
  if p_reward and r is not null then
    ok := true;
    if coalesce((r->>'once')::boolean, false) then
      ok := not exists (select 1 from public.game_events where player_id = p_pid and kind = p_kind and granted);
    elsif r ? 'daily' then
      select count(*) into cnt from public.game_events
        where player_id = p_pid and kind = p_kind and granted and created_at >= public._day_start();
      ok := cnt < (r->>'daily')::int;
    end if;
  end if;
  insert into public.game_events(player_id, kind, data, granted, idem)
    values (p_pid, p_kind, coalesce(p_data,'{}'::jsonb), ok, p_idem) returning id into eid;
  if ok then
    if r ? 'xu' then items := items || jsonb_build_array(jsonb_build_object('c','xu','n',(r->>'xu')::int)); end if;
    if r ? 'xp' then items := items || jsonb_build_array(jsonb_build_object('c','xp','n',(r->>'xp')::int)); end if;
    if r ? 'kt' then items := items || jsonb_build_array(jsonb_build_object('c','kt','n',(r->>'kt')::int)); end if;
    got := public._grant_items(p_pid, items, coalesce(r->>'label', p_kind), 'event:' || p_kind, eid::text, 'ev:' || eid);
  end if;
  -- thành tựu theo sự kiện này
  for a in select x.value from jsonb_array_elements(coalesce(public._cfg('achievements'),'[]'::jsonb)) x where x.value->>'event' = p_kind loop
    insert into public.game_achievements(player_id, ach) values (p_pid, a->>'id') on conflict do nothing;
    update public.game_achievements set progress = progress + 1
      where player_id = p_pid and ach = a->>'id' and done_at is null
      returning progress into prog;
    if prog is not null and prog >= coalesce((a->>'count')::int, 1) then
      update public.game_achievements set done_at = now() where player_id = p_pid and ach = a->>'id';
      insert into public.game_inbox(player_id, title, body, items, source, idem)
        values (p_pid, 'Thành tựu: ' || (a->>'name'), a->>'desc', coalesce(a->'reward','[]'::jsonb), 'achievement',
                'ach:' || p_pid || ':' || (a->>'id'))
        on conflict (idem) do nothing;
      done := done || jsonb_build_array(jsonb_build_object('id', a->>'id', 'name', a->>'name'));
    end if;
    prog := null;
  end loop;
  return jsonb_build_object('granted', got, 'achievements', done);
end $$;

revoke all on function public._cfg(text), public._me(), public._day_start(), public._xp_for_level(int), public._level_of(bigint),
  public._bal(text,text), public._grant(text,text,bigint,text,text,text,uuid,text),
  public._grant_items(uuid,jsonb,text,text,text,text), public._event(uuid,text,jsonb,text,boolean)
  from public, anon, authenticated;

-- ============ RPC CHO CLIENT ============
-- Trạng thái nhân vật: ai đã có chủ. Gọi được cả khi chưa có nhân vật (màn chọn).
create or replace function public.game_roster() returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  me := public._me();
  return json_build_object(
    'me', case when me.id is null then null else me.slot end,
    'owned', coalesce((select json_agg(slot order by slot) from public.game_players), '[]'::json));
end $$;

-- Tạo nhân vật cho tài khoản đang đăng nhập (một lần duy nhất). Không phải tài khoản ẩn danh.
create or replace function public.game_create_player(p_slot text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me public.game_players; pid uuid; em text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then raise exception 'need_account'; end if;
  if p_slot not in ('bin','vy') then raise exception 'bad_slot'; end if;
  perform pg_advisory_xact_lock(hashtext('game_players'));
  me := public._me();
  if me.id is not null then return json_build_object('slot', me.slot, 'created', false); end if;
  if exists (select 1 from public.game_players where slot = p_slot) then raise exception 'slot_owned'; end if;
  em := auth.jwt()->>'email';
  insert into public.game_players(user_id, email, slot, name)
    values (uid, em, p_slot, case when p_slot = 'bin' then 'Bin' else 'Vy' end) returning id into pid;
  insert into public.game_inbox(player_id, title, body, items, source, idem)
    values (pid, 'Quà chào mừng', 'Chào mừng về nhà! Đây là chút vốn để bắt đầu.', coalesce(public._cfg('welcome'),'[]'::jsonb),
            'welcome', 'welcome:' || pid);
  return json_build_object('slot', p_slot, 'created', true);
end $$;

-- Giữ chỗ trong phòng theo đúng nhân vật của tài khoản (thay claim_slot_as cho bản mới).
-- Chỗ đang bị một phiên ẩn danh cũ (bản game cũ) giữ => chủ nhân vật được lấy lại.
create or replace function public.game_claim_slot(p_room text, p_default_map text default 'house')
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me public.game_players; m text; holder uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  me := public._me();
  if me.id is null then raise exception 'no_player'; end if;
  if p_room is null or p_room !~ '^[a-z0-9_-]{1,32}$' then raise exception 'bad_room'; end if;
  perform pg_advisory_xact_lock(hashtext('room:' || p_room));
  insert into public.rooms(code, map_id)
    values (p_room, case when p_default_map ~ '^[a-z0-9_]{1,32}$' then p_default_map else 'house' end)
    on conflict (code) do nothing;
  delete from public.room_slots where room_code = p_room and user_id <> uid and last_seen < now() - interval '90 seconds';
  select user_id into holder from public.room_slots where room_code = p_room and slot = me.slot;
  if holder is not null and holder <> uid then
    if exists (select 1 from public.game_players where user_id = holder) then raise exception 'slot_taken'; end if;
    delete from public.room_slots where room_code = p_room and slot = me.slot;   -- phiên ẩn danh cũ nhường chỗ cho chủ
  end if;
  delete from public.room_slots where room_code = p_room and user_id = uid and slot <> me.slot;
  insert into public.room_slots(room_code, slot, user_id) values (p_room, me.slot, uid)
    on conflict (room_code, slot) do update set last_seen = now();
  update public.game_players set last_seen = now() where id = me.id;
  select map_id into m from public.rooms where code = p_room;
  return json_build_object('slot', me.slot, 'map', m, 'user_id', uid);
end $$;

-- Ảnh chụp toàn bộ tiến trình của mình (+ thông tin ngắn của người kia) để vẽ giao diện.
create or replace function public.game_me() returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players; own text; xp bigint; lv int; other public.game_players; oxp bigint; sk jsonb := '[]'::jsonb; s jsonb;
        step int := coalesce((public._cfg('skill_step') #>> '{}')::int, 100); v bigint; fo record;
begin
  me := public._me();
  if me.id is null then return null; end if;
  own := 'player:' || me.id;
  xp := public._bal(own, 'xp'); lv := public._level_of(xp);
  select * into other from public.game_players where id <> me.id limit 1;
  if other.id is not null then oxp := public._bal('player:' || other.id, 'xp'); end if;
  for s in select x.value from jsonb_array_elements(coalesce(public._cfg('skills'),'[]'::jsonb)) x loop
    v := public._bal(own, 'skill:' || (s->>'id'));
    sk := sk || jsonb_build_array(s || jsonb_build_object('points', v, 'level', 1 + v / step, 'into', v % step, 'step', step));
  end loop;
  select id, minutes, started_at, ends_at into fo from public.game_focus where player_id = me.id and status = 'running' order by started_at desc limit 1;
  update public.game_players set last_seen = now() where id = me.id;
  return json_build_object(
    'player', json_build_object('id', me.id, 'slot', me.slot, 'name', me.name, 'email', me.email, 'title', me.title,
                                'settings', me.settings, 'tasks', me.tasks, 'flags', me.flags, 'since', me.created_at),
    'level', json_build_object('level', lv, 'xp', xp, 'floor', public._xp_for_level(lv), 'next', public._xp_for_level(lv+1)),
    'xu', public._bal(own, 'xu'),
    'kt', public._bal('house', 'kt'),
    'skills', sk,
    'inbox', coalesce((select json_agg(json_build_object('id', id, 'title', title, 'body', body, 'items', items, 'at', created_at) order by created_at)
                        from public.game_inbox where player_id = me.id and claimed_at is null), '[]'::json),
    'achievements', coalesce((select json_agg(a.value || jsonb_build_object(
                         'progress', least(coalesce(g.progress,0), coalesce((a.value->>'count')::int,1)),
                         'done', g.done_at is not null, 'done_at', g.done_at))
                        from jsonb_array_elements(coalesce(public._cfg('achievements'),'[]'::jsonb)) a
                        left join public.game_achievements g on g.player_id = me.id and g.ach = a.value->>'id'), '[]'::json),
    'focus', case when fo.id is null then null else json_build_object('id', fo.id, 'minutes', fo.minutes, 'started_at', fo.started_at, 'ends_at', fo.ends_at, 'now', now()) end,
    'focus_cfg', public._cfg('focus'),
    'other', case when other.id is null then null else json_build_object('slot', other.slot, 'name', other.name, 'title', other.title, 'level', public._level_of(oxp)) end,
    'now', now());
end $$;

-- Lịch sử: ví của mình (xu, xp, kỹ năng) hoặc quỹ nhà (p_house = true).
create or replace function public.game_history(p_house boolean default false, p_limit int default 50) returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  return coalesce((select json_agg(x) from (
    select l.id, l.currency, l.amount, l.balance_after, l.reason, l.source, l.created_at,
           (select slot from public.game_players p where p.id = l.actor) as by_slot
      from public.game_ledger l
     where l.owner = case when p_house then 'house' else 'player:' || me.id end
     order by l.id desc limit least(greatest(p_limit,1),200)) x), '[]'::json);
end $$;

-- Báo một hoạt động đã xảy ra. Máy chủ quyết định có thưởng không (theo luật trong game_config.rewards).
create or replace function public.game_report(p_kind text, p_data jsonb default '{}'::jsonb, p_idem text default null) returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players; allowed text[] := array['enter_house','enter_studio','visit_garden','sleep','sit','chat_sent','call_together','together_10min'];
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  if not (p_kind = any(allowed)) then raise exception 'bad_kind'; end if;
  return public._event(me.id, p_kind, p_data, case when p_idem is null then null else 'c:' || me.id || ':' || left(p_idem, 80) end, true)::json;
end $$;

-- Nhận quà trong Hộp quà (p_id null = nhận tất cả).
create or replace function public.game_claim_inbox(p_id uuid default null) returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players; g record; got jsonb := '[]'::jsonb; n int := 0;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  for g in select * from public.game_inbox where player_id = me.id and claimed_at is null and (p_id is null or id = p_id)
           order by created_at for update loop
    got := got || public._grant_items(me.id, g.items, g.title, 'inbox', g.id::text, 'inbox:' || g.id);
    update public.game_inbox set claimed_at = now() where id = g.id;
    n := n + 1;
  end loop;
  return json_build_object('claimed', n, 'items', got);
end $$;

-- Phiên tập trung
create or replace function public.game_focus_start(p_minutes int) returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players; c jsonb := public._cfg('focus'); fid uuid; e timestamptz;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  if not exists (select 1 from jsonb_array_elements_text(coalesce(c->'lengths','[25,50]'::jsonb)) x where x::int = p_minutes) then raise exception 'bad_length'; end if;
  update public.game_focus set status = 'cancelled', done_at = now() where player_id = me.id and status = 'running';
  insert into public.game_focus(player_id, minutes, ends_at) values (me.id, p_minutes, now() + make_interval(mins => p_minutes))
    returning id, ends_at into fid, e;
  return json_build_object('id', fid, 'minutes', p_minutes, 'ends_at', e, 'now', now());
end $$;

create or replace function public.game_focus_cancel() returns void
language sql security definer set search_path = public as $$
  update public.game_focus set status = 'cancelled', done_at = now()
   where status = 'running' and player_id = (select id from public.game_players where user_id = auth.uid());
$$;

-- Kết thúc phiên: chỉ được khi đã đủ giờ (máy chủ đo). Thưởng theo mỗi 25 phút, có trần phút mỗi ngày.
create or replace function public.game_focus_finish(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players; c jsonb := public._cfg('focus'); f public.game_focus; used int; pay int; k text; v int;
        items jsonb := '[]'::jsonb; got jsonb; ev jsonb;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  select * into f from public.game_focus where id = p_id and player_id = me.id for update;
  if f.id is null then raise exception 'not_found'; end if;
  if f.status = 'done' then return json_build_object('status', 'done', 'dup', true); end if;
  if f.status <> 'running' then raise exception 'not_running'; end if;
  if now() < f.ends_at - make_interval(secs => coalesce((c->>'grace_s')::int, 20)) then raise exception 'too_early'; end if;
  select coalesce(sum(minutes),0) into used from public.game_focus
   where player_id = me.id and status = 'done' and done_at >= public._day_start();
  pay := greatest(0, least(f.minutes, coalesce((c->>'daily_cap_min')::int, 200) - used));
  update public.game_focus set status = 'done', done_at = now() where id = f.id;
  if pay > 0 then
    for k, v in select key, value::int from jsonb_each_text(coalesce(c->'per25','{}'::jsonb)) loop
      items := items || jsonb_build_array(jsonb_build_object('c', k, 'n', round(v * pay / 25.0)::int));
    end loop;
  end if;
  got := public._grant_items(me.id, items, 'Phiên tập trung ' || f.minutes || ' phút', 'focus', f.id::text, 'focus:' || f.id);
  ev := public._event(me.id, 'focus_done', jsonb_build_object('minutes', f.minutes), 'focusev:' || f.id, false);
  return json_build_object('status', 'done', 'paid_minutes', pay, 'granted', got, 'achievements', ev->'achievements');
end $$;

-- Lưu tuỳ chọn đồng bộ / việc hôm nay / danh hiệu
create or replace function public.game_save(p_settings jsonb default null, p_tasks jsonb default null, p_title text default null, p_flags jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare me public.game_players;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  if p_tasks is not null and (jsonb_typeof(p_tasks) <> 'array' or pg_column_size(p_tasks) > 20000) then raise exception 'bad_tasks'; end if;
  if p_settings is not null and (jsonb_typeof(p_settings) <> 'object' or pg_column_size(p_settings) > 8000) then raise exception 'bad_settings'; end if;
  if p_title is not null and p_title <> '' and not exists (select 1 from public.game_achievements where player_id = me.id and ach = p_title and done_at is not null) then
    raise exception 'title_locked';
  end if;
  update public.game_players set
    settings = coalesce(settings || p_settings, settings),
    tasks = coalesce(p_tasks, tasks),
    title = case when p_title is null then title when p_title = '' then null else p_title end,
    flags = coalesce(flags || p_flags, flags)
  where id = me.id;
end $$;

revoke all on function public.game_roster(), public.game_create_player(text), public.game_claim_slot(text,text), public.game_me(),
  public.game_history(boolean,int), public.game_report(text,jsonb,text), public.game_claim_inbox(uuid),
  public.game_focus_start(int), public.game_focus_cancel(), public.game_focus_finish(uuid),
  public.game_save(jsonb,jsonb,text,jsonb) from public, anon;
grant execute on function public.game_roster(), public.game_create_player(text), public.game_claim_slot(text,text), public.game_me(),
  public.game_history(boolean,int), public.game_report(text,jsonb,text), public.game_claim_inbox(uuid),
  public.game_focus_start(int), public.game_focus_cancel(), public.game_focus_finish(uuid),
  public.game_save(jsonb,jsonb,text,jsonb) to authenticated;

-- lưu lịch sử mỗi lần sửa cấu hình cân bằng
create or replace function public._config_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.value is distinct from old.value then
    insert into public.game_config_history(key, old_value, new_value, changed_by) values (new.key, old.value, new.value, coalesce(new.updated_by, current_user));
    new.updated_at := now();
  elsif tg_op = 'INSERT' then
    insert into public.game_config_history(key, old_value, new_value, changed_by) values (new.key, null, new.value, coalesce(new.updated_by, current_user));
  end if;
  return new;
end $$;
drop trigger if exists game_config_audit_trg on public.game_config;
create trigger game_config_audit_trg before insert or update on public.game_config
  for each row execute function public._config_audit();
revoke all on function public._config_audit() from public, anon, authenticated;
