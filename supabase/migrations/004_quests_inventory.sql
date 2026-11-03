-- VY/BIN studio — hạng mục 04 (Nhiệm vụ & mục tiêu) + 05 (Túi đồ, quyền sở hữu & kho).
-- CHỈ THÊM MỚI / thay hàm của 003 bằng bản mở rộng cùng chữ ký. Idempotent.
--
--  * Vật phẩm = "loại tiền" có tiền tố item:<mã> trong game_balances/game_ledger (đã có chống cộng trùng, không âm, lịch sử).
--    Túi riêng: owner 'player:<id>'.  Kho nhà chung: owner 'house'.  Danh mục vật phẩm: game_config.items.
--  * Túi có SỨC CHỨA (số ô khác loại). Thưởng không vừa túi → vào Hộp quà (không bao giờ mất).
--  * Nhiệm vụ: mẫu trong game_config.quests; mỗi ngày/tuần tự chọn từ ngân hàng nhiệm vụ (cùng bộ cho cả hai người).
--    Tiến độ nghe chung dòng sự kiện game_events (_event). Hoàn thành → nút Nhận (một lần). Bỏ lỡ không bị phạt.
--  * Nhiệm vụ hợp tác: tiến độ chung, ghi đóng góp từng người; xong thì quỹ Kiến Tạo nhận 1 lần, mỗi người tự Nhận phần Xu của mình.
--  * Hướng dẫn người mới = chuỗi nhiệm vụ "tutorial" (làm lần lượt), có Bỏ qua / Xem lại ở giao diện.

-- ============ TABLES ============
create table if not exists public.game_quests (
  player_id   uuid not null references public.game_players(id) on delete cascade,
  quest_id    text not null,
  period      text not null,                 -- 'd:2026-11-03' | 'w:2026-11-02' (thứ Hai đầu tuần) | 'once'
  progress    int not null default 0,
  done_at     timestamptz,
  claimed_at  timestamptz,
  primary key (player_id, quest_id, period)
);
create table if not exists public.game_coop (
  quest_id    text not null,
  period      text not null,
  progress    int not null default 0,
  by_bin      int not null default 0,
  by_vy       int not null default 0,
  done_at     timestamptz,
  primary key (quest_id, period)
);
alter table public.game_quests enable row level security;
alter table public.game_coop   enable row level security;

-- ============ CẤU HÌNH (giá trị thử, chỉnh được) ============
insert into public.game_config(key, value, note) values
 ('bag', '{"slots":24,"house_slots":60}', 'Sức chứa: số ô (loại vật phẩm khác nhau) của túi riêng và kho nhà chung'),
 ('item_groups', '[
   {"id":"material","name":"Nguyên liệu"},{"id":"furniture","name":"Nội thất"},{"id":"outfit","name":"Trang phục"},
   {"id":"accessory","name":"Phụ kiện"},{"id":"tool","name":"Công cụ"},{"id":"seed","name":"Hạt giống"},
   {"id":"crop","name":"Nông sản"},{"id":"fish","name":"Cá"},{"id":"collect","name":"Sưu tập"},{"id":"quest","name":"Nhiệm vụ"}
 ]', 'Nhóm vật phẩm (bộ lọc túi đồ)'),
 ('items', '[
   {"id":"wood",   "name":"Gỗ",                "group":"material","rarity":"common","icon":"🪵","stack":99,"sell":2,"desc":"Gỗ thông nhẹ, dùng chế tạo đồ nội thất và sửa nhà."},
   {"id":"stone",  "name":"Đá",                "group":"material","rarity":"common","icon":"🪨","stack":99,"sell":2,"desc":"Đá cuội trong vườn, dùng lát lối đi và xây bệ."},
   {"id":"fiber",  "name":"Sợi thực vật",      "group":"material","rarity":"common","icon":"🌿","stack":99,"sell":1,"desc":"Sợi lá khô, dùng đan giỏ, buộc chậu cây."},
   {"id":"cloth",  "name":"Vải",               "group":"material","rarity":"uncommon","icon":"🧵","stack":99,"sell":4,"desc":"Vải mềm, dùng may gối, rèm và trang phục."},
   {"id":"metal",  "name":"Linh kiện kim loại","group":"material","rarity":"uncommon","icon":"⚙️","stack":99,"sell":5,"desc":"Ốc vít, bản lề, lò xo — cần cho đồ có cơ cấu."}
 ]', 'Danh mục vật phẩm. stack = tối đa mỗi ô; sell = giá bán thử (cửa hàng ở hạng mục 06). Thêm món = thêm 1 dòng'),
 ('quests', '{
   "daily_count": 3, "weekly_count": 3, "coop_count": 1,
   "daily": [
     {"id":"d_garden","name":"Dạo vườn","desc":"Ra khu vườn ngoài nhà","event":"visit_garden","count":1,"where":"Bản đồ → Vườn ngoài nhà","reward":[{"c":"xu","n":15},{"c":"xp","n":10},{"c":"item:fiber","n":2}]},
     {"id":"d_focus","name":"Một phiên tập trung","desc":"Hoàn thành 1 phiên tập trung","event":"focus_done","count":1,"where":"Nút bàn phím trên thanh trên cùng","reward":[{"c":"xu","n":20},{"c":"xp","n":15}]},
     {"id":"d_sleep","name":"Ngủ một giấc","desc":"Nằm ngủ trên giường","event":"sleep","count":1,"where":"Giường trong nhà (phím Z)","reward":[{"c":"xu","n":10},{"c":"xp","n":10}]},
     {"id":"d_chat","name":"Hỏi thăm nhau","desc":"Gửi 3 tin nhắn","event":"chat_sent","count":3,"where":"Chat (phím T)","reward":[{"c":"xu","n":10},{"c":"xp","n":10}]},
     {"id":"d_sit","name":"Ngồi vào bàn","desc":"Ngồi vào ghế làm việc","event":"sit","count":1,"where":"Ghế bàn làm việc (phím C)","reward":[{"c":"xu","n":10},{"c":"xp","n":5},{"c":"item:wood","n":2}]},
     {"id":"d_together","name":"Ở cạnh nhau","desc":"Cùng online, cùng khu 10 phút","event":"together_10min","count":1,"where":"Ở cùng bản đồ với người kia","reward":[{"c":"xu","n":15},{"c":"xp","n":10},{"c":"item:stone","n":2}]}
   ],
   "weekly": [
     {"id":"w_focus","name":"Tuần chăm chỉ","desc":"Hoàn thành 5 phiên tập trung","event":"focus_done","count":5,"reward":[{"c":"xu","n":80},{"c":"xp","n":60},{"c":"item:cloth","n":2}]},
     {"id":"w_garden","name":"Người làm vườn","desc":"Dạo vườn 3 lần","event":"visit_garden","count":3,"reward":[{"c":"xu","n":50},{"c":"xp","n":40},{"c":"item:wood","n":5}]},
     {"id":"w_call","name":"Giữ liên lạc","desc":"Gọi cho nhau 2 lần","event":"call_together","count":2,"reward":[{"c":"xu","n":50},{"c":"xp","n":40}]},
     {"id":"w_chat","name":"Tám chuyện","desc":"Gửi 20 tin nhắn","event":"chat_sent","count":20,"reward":[{"c":"xu","n":60},{"c":"xp","n":40},{"c":"item:metal","n":1}]},
     {"id":"w_sleep","name":"Ngủ đủ giấc","desc":"Ngủ 4 lần","event":"sleep","count":4,"reward":[{"c":"xu","n":50},{"c":"xp","n":30},{"c":"item:fiber","n":5}]}
   ],
   "coop": [
     {"id":"c_focus","name":"Cùng nhau tập trung","desc":"Bin và Vy cùng hoàn thành tổng 6 phiên tập trung","event":"focus_done","count":6,"kt":25,"reward":[{"c":"xu","n":40},{"c":"xp","n":30}]},
     {"id":"c_together","name":"Gắn bó","desc":"Tổng cộng 12 lần ở cạnh nhau 10 phút","event":"together_10min","count":12,"kt":30,"reward":[{"c":"xu","n":40},{"c":"xp","n":30}]},
     {"id":"c_garden","name":"Chăm vườn chung","desc":"Cả hai cùng ra vườn tổng 6 lần","event":"visit_garden","count":6,"kt":20,"reward":[{"c":"xu","n":30},{"c":"xp","n":20},{"c":"item:stone","n":3}]}
   ],
   "tutorial": [
     {"id":"t_move","name":"Đi lại trong nhà","desc":"Dùng W A S D (hoặc bấm chuột vào sàn) để đi","event":"moved","count":1,"hint":"Bấm giữ W A S D, hoặc bấm vào sàn nhà để đi tới đó","reward":[{"c":"xu","n":10}]},
     {"id":"t_sit","name":"Ngồi xuống","desc":"Bấm vào ghim trên ghế (hoặc phím C)","event":"sit","count":1,"hint":"Tìm ghim tròn trên ghế rồi bấm vào, hoặc nhấn phím C","reward":[{"c":"xu","n":10}]},
     {"id":"t_bag","name":"Mở túi đồ","desc":"Bấm nút túi trên thanh trên cùng (phím B)","event":"open_bag","count":1,"hint":"Bấm biểu tượng chiếc túi ở góc trên bên phải, hoặc nhấn B","reward":[{"c":"item:wood","n":3}]},
     {"id":"t_quests","name":"Xem nhiệm vụ","desc":"Mở bảng Nhiệm vụ (phím J)","event":"open_quests","count":1,"hint":"Bấm biểu tượng lá cờ ở góc trên bên phải, hoặc nhấn J","reward":[{"c":"xu","n":10}]},
     {"id":"t_garden","name":"Ra vườn","desc":"Đi ra cửa và chọn Vườn ngoài nhà","event":"visit_garden","count":1,"hint":"Bấm ghim ở cửa ra vào (hoặc nút ghim Bản đồ) → Vườn ngoài nhà","reward":[{"c":"xu","n":20},{"c":"xp","n":20}]}
   ]
 }', 'Ngân hàng nhiệm vụ. Mỗi ngày chọn daily_count mục, mỗi tuần weekly_count + coop_count (cùng bộ cho cả hai). kt = Điểm Kiến Tạo vào quỹ nhà khi nhiệm vụ hợp tác xong')
on conflict (key) do nothing;

-- ============ HELPERS ============
create or replace function public._week_start() returns timestamptz
language sql stable security definer set search_path = public as $$
  select (date_trunc('week', now() at time zone coalesce(public._cfg('tz') #>> '{}', 'Asia/Ho_Chi_Minh'))
          at time zone coalesce(public._cfg('tz') #>> '{}', 'Asia/Ho_Chi_Minh'));
$$;
create or replace function public._period(p_kind text) returns text
language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'daily'  then 'd:' || to_char(public._day_start()  at time zone coalesce(public._cfg('tz') #>> '{}', 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD')
    when 'weekly' then 'w:' || to_char(public._week_start() at time zone coalesce(public._cfg('tz') #>> '{}', 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD')
    when 'coop'   then 'w:' || to_char(public._week_start() at time zone coalesce(public._cfg('tz') #>> '{}', 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD')
    else 'once' end;
$$;

-- Nhiệm vụ đang mở hiện tại: [{kind, period, def}] — chọn tất định theo kỳ (cùng bộ cho cả hai người, đổi mỗi ngày/tuần)
create or replace function public._active_quests() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q jsonb := public._cfg('quests'); out jsonb := '[]'::jsonb; k text; n int; pd text;
begin
  if q is null then return out; end if;
  foreach k in array array['daily','weekly','coop'] loop
    n := coalesce((q->>(k || '_count'))::int, 3); pd := public._period(k);
    out := out || coalesce((select jsonb_agg(jsonb_build_object('kind', k, 'period', pd, 'def', d.value) order by md5(pd || (d.value->>'id')))
                   from (select x.value from jsonb_array_elements(coalesce(q->k,'[]'::jsonb)) x order by md5(pd || (x.value->>'id')) limit n) d), '[]'::jsonb);
  end loop;
  out := out || coalesce((select jsonb_agg(jsonb_build_object('kind', 'tutorial', 'period', 'once', 'def', x.value, 'step', x.ord) order by x.ord)
                 from jsonb_array_elements(coalesce(q->'tutorial','[]'::jsonb)) with ordinality x(value, ord)), '[]'::jsonb);
  return out;
end $$;

create or replace function public._item_def(p_id text) returns jsonb
language sql stable security definer set search_path = public as $$
  select x.value from jsonb_array_elements(coalesce(public._cfg('items'),'[]'::jsonb)) x where x.value->>'id' = p_id limit 1;
$$;

-- còn chỗ cho thêm n món p_cur (item:...) vào owner không? (ô mới chỉ tính khi chưa có món đó)
create or replace function public._room_for(p_owner text, p_cur text, p_n bigint) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare cap int; used int; have bigint; st int;
begin
  if p_cur not like 'item:%' then return true; end if;
  cap := coalesce((public._cfg('bag')->>(case when p_owner = 'house' then 'house_slots' else 'slots' end))::int, 24);
  st := coalesce((public._item_def(substr(p_cur, 6))->>'stack')::int, 99);
  have := public._bal(p_owner, p_cur);
  if have + p_n > st then return false; end if;
  if have > 0 then return true; end if;
  select count(*) into used from public.game_balances where owner = p_owner and currency like 'item:%' and amount > 0;
  return used < cap;
end $$;

-- phát gói vật phẩm (thay bản 003): kt → quỹ nhà; item:* → túi riêng, KHÔNG VỪA túi → vào Hộp quà; soon:* bỏ qua.
-- p_strict = true (dùng khi nhận từ Hộp quà): không vừa túi thì báo lỗi 'bag_full' (quà ở lại Hộp quà).
create or replace function public._grant_items2(p_pid uuid, p_items jsonb, p_reason text, p_source text, p_ref text, p_idem text, p_strict boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; c text; n bigint; owner text; out jsonb := '[]'::jsonb; over jsonb := '[]'::jsonb;
begin
  for it in select x.value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x loop
    c := it->>'c'; n := coalesce((it->>'n')::bigint, 0);
    if c is null or n = 0 or c like 'soon:%' then continue; end if;
    owner := case when c = 'kt' then 'house' else 'player:' || p_pid end;
    if c like 'item:%' and n > 0 and not public._room_for(owner, c, n) then
      if p_strict then raise exception 'bag_full'; end if;
      over := over || jsonb_build_array(jsonb_build_object('c', c, 'n', n));
      continue;
    end if;
    if public._grant(owner, c, n, p_reason, p_source, p_ref, p_pid, p_idem || ':' || c) then
      out := out || jsonb_build_array(jsonb_build_object('c', c, 'n', n));
    end if;
  end loop;
  if jsonb_array_length(over) > 0 then
    insert into public.game_inbox(player_id, title, body, items, source, idem)
      values (p_pid, 'Túi đầy — đồ đang chờ', 'Từ: ' || p_reason || '. Dọn bớt túi hoặc cất vào kho nhà rồi nhận lại.', over, 'overflow', 'over:' || p_idem)
      on conflict (idem) do nothing;
  end if;
  return out;
end $$;
create or replace function public._grant_items(p_pid uuid, p_items jsonb, p_reason text, p_source text, p_ref text, p_idem text)
returns jsonb language sql security definer set search_path = public as $$
  select public._grant_items2(p_pid, p_items, p_reason, p_source, p_ref, p_idem, false);
$$;

-- cập nhật tiến độ nhiệm vụ theo sự kiện (gọi từ _event)
create or replace function public._quest_progress(p_pid uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a jsonb; d jsonb; cnt int; prog int; slot text; done jsonb := '[]'::jsonb; prev_ok boolean; c record;
begin
  select g.slot into slot from public.game_players g where g.id = p_pid;
  for a in select x.value from jsonb_array_elements(public._active_quests()) x where x.value->'def'->>'event' = p_kind loop
    d := a->'def'; cnt := coalesce((d->>'count')::int, 1);
    if a->>'kind' = 'coop' then
      insert into public.game_coop(quest_id, period) values (d->>'id', a->>'period') on conflict do nothing;
      update public.game_coop set progress = least(cnt, progress + 1),
             by_bin = by_bin + (case when slot = 'bin' then 1 else 0 end), by_vy = by_vy + (case when slot = 'vy' then 1 else 0 end)
       where quest_id = d->>'id' and period = a->>'period' and done_at is null returning * into c;
      if c.quest_id is not null and c.progress >= cnt then
        update public.game_coop set done_at = now() where quest_id = d->>'id' and period = a->>'period';
        perform public._grant('house', 'kt', coalesce((d->>'kt')::int, 0), 'Nhiệm vụ chung: ' || (d->>'name'), 'coop', d->>'id', p_pid, 'coop:' || (d->>'id') || ':' || (a->>'period'));
        done := done || jsonb_build_array(jsonb_build_object('id', d->>'id', 'name', d->>'name', 'kind', 'coop'));
      end if;
      c := null;
      continue;
    end if;
    if a->>'kind' = 'tutorial' then          -- hướng dẫn: chỉ tính bước kế tiếp (các bước trước đã xong)
      select bool_and(q.done_at is not null) into prev_ok
        from jsonb_array_elements(public._cfg('quests')->'tutorial') with ordinality t(value, ord)
        left join public.game_quests q on q.player_id = p_pid and q.quest_id = t.value->>'id' and q.period = 'once'
       where t.ord < (a->>'step')::int;
      if not coalesce(prev_ok, true) then continue; end if;
      if coalesce((select flags->>'tut_skip' from public.game_players where id = p_pid), '') = '1' then continue; end if;
    end if;
    insert into public.game_quests(player_id, quest_id, period) values (p_pid, d->>'id', a->>'period') on conflict do nothing;
    update public.game_quests set progress = least(cnt, progress + 1)
     where player_id = p_pid and quest_id = d->>'id' and period = a->>'period' and done_at is null
     returning progress into prog;
    if prog is not null and prog >= cnt then
      update public.game_quests set done_at = now() where player_id = p_pid and quest_id = d->>'id' and period = a->>'period';
      done := done || jsonb_build_array(jsonb_build_object('id', d->>'id', 'name', d->>'name', 'kind', a->>'kind'));
    end if;
    prog := null;
    if a->>'kind' = 'tutorial' then exit; end if;   -- một sự kiện chỉ đẩy 1 bước hướng dẫn
  end loop;
  return done;
end $$;

-- _event (thay bản 003): thêm tiến độ nhiệm vụ. Trả thêm "quests":[...] nhiệm vụ vừa hoàn thành.
create or replace function public._event(p_pid uuid, p_kind text, p_data jsonb, p_idem text, p_reward boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; ok boolean := false; cnt int; got jsonb := '[]'::jsonb; done jsonb := '[]'::jsonb; a jsonb;
        prog int; eid bigint; items jsonb := '[]'::jsonb; qd jsonb;
begin
  if p_idem is not null and exists (select 1 from public.game_events where idem = p_idem) then
    return jsonb_build_object('granted', '[]'::jsonb, 'achievements', '[]'::jsonb, 'quests', '[]'::jsonb, 'dup', true);
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
  qd := public._quest_progress(p_pid, p_kind);
  return jsonb_build_object('granted', got, 'achievements', done, 'quests', qd);
end $$;

revoke all on function public._week_start(), public._period(text), public._active_quests(), public._item_def(text),
  public._room_for(text,text,bigint), public._grant_items2(uuid,jsonb,text,text,text,text,boolean),
  public._grant_items(uuid,jsonb,text,text,text,text), public._quest_progress(uuid,text), public._event(uuid,text,jsonb,text,boolean)
  from public, anon, authenticated;

-- ============ RPC ============
-- báo hoạt động (thay bản 003: thêm loại sự kiện cho hướng dẫn)
create or replace function public.game_report(p_kind text, p_data jsonb default '{}'::jsonb, p_idem text default null) returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players;
        allowed text[] := array['enter_house','enter_studio','visit_garden','sleep','sit','chat_sent','call_together','together_10min','moved','open_bag','open_quests'];
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  if not (p_kind = any(allowed)) then raise exception 'bad_kind'; end if;
  return public._event(me.id, p_kind, p_data, case when p_idem is null then null else 'c:' || me.id || ':' || left(p_idem, 80) end, true)::json;
end $$;

-- Nhận quà Hộp quà (thay bản 003): quà không vừa túi thì ở lại Hộp quà (không mất), báo số quà bị giữ lại.
create or replace function public.game_claim_inbox(p_id uuid default null) returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players; g record; got jsonb := '[]'::jsonb; n int := 0; kept int := 0; r jsonb;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  for g in select * from public.game_inbox where player_id = me.id and claimed_at is null and (p_id is null or id = p_id)
           order by created_at for update loop
    begin
      r := public._grant_items2(me.id, g.items, g.title, 'inbox', g.id::text, 'inbox:' || g.id, true);
      got := got || r;
      update public.game_inbox set claimed_at = now() where id = g.id;
      n := n + 1;
    exception when others then
      if sqlerrm = 'bag_full' then kept := kept + 1; else raise; end if;
    end;
  end loop;
  return json_build_object('claimed', n, 'items', got, 'kept', kept);
end $$;

-- Danh sách nhiệm vụ hiện tại + tiến độ (của mình; nhiệm vụ chung có đóng góp của cả hai)
create or replace function public.game_quests() returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players; out jsonb := '[]'::jsonb; a jsonb; d jsonb; q record; c record; tut_next int := null;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  for a in select x.value from jsonb_array_elements(public._active_quests()) x loop
    d := a->'def';
    select * into q from public.game_quests where player_id = me.id and quest_id = d->>'id' and period = a->>'period';
    if a->>'kind' = 'coop' then
      select * into c from public.game_coop where quest_id = d->>'id' and period = a->>'period';
      out := out || jsonb_build_array(d || jsonb_build_object('kind', 'coop', 'period', a->>'period',
        'progress', coalesce(c.progress, 0), 'by_bin', coalesce(c.by_bin, 0), 'by_vy', coalesce(c.by_vy, 0),
        'done', c.done_at is not null, 'claimed', q.claimed_at is not null));
      c := null;
    else
      if a->>'kind' = 'tutorial' and q.done_at is null and tut_next is null then tut_next := (a->>'step')::int; end if;
      out := out || jsonb_build_array(d || jsonb_build_object('kind', a->>'kind', 'period', a->>'period', 'step', a->'step',
        'progress', coalesce(q.progress, 0), 'done', q.done_at is not null, 'claimed', q.claimed_at is not null));
    end if;
    q := null;
  end loop;
  return json_build_object('quests', out, 'tutorial_next', tut_next, 'tutorial_skip', coalesce(me.flags->>'tut_skip','') = '1',
    'day_ends', public._day_start() + interval '1 day', 'week_ends', public._week_start() + interval '7 days', 'tz', public._cfg('tz') #>> '{}', 'now', now());
end $$;

-- Nhận thưởng nhiệm vụ (một lần). Nhiệm vụ chung: mỗi người nhận phần của mình sau khi cả nhóm xong.
create or replace function public.game_quest_claim(p_quest text, p_period text) returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players; a jsonb; d jsonb; q public.game_quests; c public.game_coop; got jsonb;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  select x.value into a from jsonb_array_elements(public._active_quests()) x
   where x.value->'def'->>'id' = p_quest and x.value->>'period' = p_period limit 1;
  if a is null then raise exception 'quest_expired'; end if;
  d := a->'def';
  insert into public.game_quests(player_id, quest_id, period) values (me.id, p_quest, p_period) on conflict do nothing;
  select * into q from public.game_quests where player_id = me.id and quest_id = p_quest and period = p_period for update;
  if q.claimed_at is not null then return json_build_object('dup', true, 'items', '[]'::json); end if;
  if a->>'kind' = 'coop' then
    select * into c from public.game_coop where quest_id = p_quest and period = p_period;
    if c.done_at is null then raise exception 'not_done'; end if;
    update public.game_quests set done_at = coalesce(done_at, c.done_at) where player_id = me.id and quest_id = p_quest and period = p_period;
  elsif q.done_at is null then raise exception 'not_done';
  end if;
  update public.game_quests set claimed_at = now() where player_id = me.id and quest_id = p_quest and period = p_period;
  got := public._grant_items(me.id, d->'reward', 'Nhiệm vụ: ' || (d->>'name'), 'quest', p_quest || '@' || p_period,
                             'quest:' || me.id || ':' || p_quest || ':' || p_period);
  return json_build_object('items', got, 'label', 'Hoàn thành: ' || (d->>'name'));
end $$;

-- bỏ qua / xem lại hướng dẫn người mới
create or replace function public.game_tutorial(p_skip boolean) returns void
language sql security definer set search_path = public as $$
  update public.game_players set flags = flags || jsonb_build_object('tut_skip', case when p_skip then '1' else '' end)
   where user_id = auth.uid();
$$;

-- Túi đồ + kho nhà
create or replace function public.game_bag() returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players; b jsonb := coalesce(public._cfg('bag'),'{}'::jsonb);
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  return json_build_object(
    'mine', coalesce((select json_agg(json_build_object('id', substr(currency, 6), 'n', amount) order by currency)
                        from public.game_balances where owner = 'player:' || me.id and currency like 'item:%' and amount > 0), '[]'::json),
    'house', coalesce((select json_agg(json_build_object('id', substr(currency, 6), 'n', amount) order by currency)
                        from public.game_balances where owner = 'house' and currency like 'item:%' and amount > 0), '[]'::json),
    'slots', coalesce((b->>'slots')::int, 24), 'house_slots', coalesce((b->>'house_slots')::int, 60),
    'items', coalesce(public._cfg('items'), '[]'::jsonb), 'groups', coalesce(public._cfg('item_groups'), '[]'::jsonb));
end $$;

-- Chuyển đồ giữa túi riêng ↔ kho nhà (chỉ chính chủ bấm; ghi người chuyển; không vượt số đang có, không nhân bản)
create or replace function public.game_transfer(p_item text, p_n int, p_to_house boolean, p_idem text) returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players; cur text := 'item:' || p_item; src text; dst text; nm text;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  if p_n is null or p_n < 1 or p_n > 999 then raise exception 'bad_amount'; end if;
  if public._item_def(p_item) is null then raise exception 'bad_item'; end if;
  src := case when p_to_house then 'player:' || me.id else 'house' end;
  dst := case when p_to_house then 'house' else 'player:' || me.id end;
  perform pg_advisory_xact_lock(hashtext('bal:house'));
  if public._bal(src, cur) < p_n then raise exception 'insufficient'; end if;
  if not public._room_for(dst, cur, p_n) then raise exception '%', case when p_to_house then 'house_full' else 'bag_full' end; end if;
  nm := public._item_def(p_item)->>'name';
  if not public._grant(src, cur, -p_n, case when p_to_house then 'Cất vào kho nhà: ' else 'Lấy từ kho nhà: ' end || nm, 'transfer', null, me.id, 'tr:' || me.id || ':' || left(p_idem, 60) || ':out') then
    return json_build_object('dup', true);
  end if;
  perform public._grant(dst, cur, p_n, case when p_to_house then 'Cất vào kho nhà: ' else 'Lấy từ kho nhà: ' end || nm, 'transfer', null, me.id, 'tr:' || me.id || ':' || left(p_idem, 60) || ':in');
  return json_build_object('ok', true);
end $$;

-- game_me (thay bản 003): thêm số nhiệm vụ chờ nhận để hiện chấm đỏ
create or replace function public.game_me() returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players; own text; xp bigint; lv int; other public.game_players; oxp bigint; sk jsonb := '[]'::jsonb; s jsonb;
        step int := coalesce((public._cfg('skill_step') #>> '{}')::int, 100); v bigint; fo record; qready int := 0; a jsonb;
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
  for a in select x.value from jsonb_array_elements(public._active_quests()) x loop
    if a->>'kind' = 'coop' then
      if exists (select 1 from public.game_coop c where c.quest_id = a->'def'->>'id' and c.period = a->>'period' and c.done_at is not null)
         and not exists (select 1 from public.game_quests q where q.player_id = me.id and q.quest_id = a->'def'->>'id' and q.period = a->>'period' and q.claimed_at is not null)
      then qready := qready + 1; end if;
    elsif exists (select 1 from public.game_quests q where q.player_id = me.id and q.quest_id = a->'def'->>'id' and q.period = a->>'period' and q.done_at is not null and q.claimed_at is null)
      then qready := qready + 1;
    end if;
  end loop;
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
    'achievements', coalesce((select json_agg(a2.value || jsonb_build_object(
                         'progress', least(coalesce(g.progress,0), coalesce((a2.value->>'count')::int,1)),
                         'done', g.done_at is not null, 'done_at', g.done_at))
                        from jsonb_array_elements(coalesce(public._cfg('achievements'),'[]'::jsonb)) a2
                        left join public.game_achievements g on g.player_id = me.id and g.ach = a2.value->>'id'), '[]'::json),
    'focus', case when fo.id is null then null else json_build_object('id', fo.id, 'minutes', fo.minutes, 'started_at', fo.started_at, 'ends_at', fo.ends_at, 'now', now()) end,
    'focus_cfg', public._cfg('focus'),
    'quests_ready', qready,
    'items', coalesce(public._cfg('items'), '[]'::jsonb),
    'other', case when other.id is null then null else json_build_object('slot', other.slot, 'name', other.name, 'title', other.title, 'level', public._level_of(oxp)) end,
    'now', now());
end $$;

revoke all on function public.game_quests(), public.game_quest_claim(text,text), public.game_tutorial(boolean),
  public.game_bag(), public.game_transfer(text,int,boolean,text) from public, anon;
grant execute on function public.game_quests(), public.game_quest_claim(text,text), public.game_tutorial(boolean),
  public.game_bag(), public.game_transfer(text,int,boolean,text) to authenticated;
