-- VY/BIN studio — hạng mục 06: CỬA HÀNG, BÁN VẬT PHẨM & CHẾ TẠO
-- Chỉ THÊM (không xoá/đổi bảng cũ). Mọi giá / công thức / điều kiện nằm trong game_config (chỉnh được, có lịch sử).
--   shop_cats  : danh mục cửa hàng. live=false → hiện "Sắp có" (không bày hàng giả cho hệ thống chưa có).
--   shop       : các món đang bán {item, price, cat, lv?, week_limit?}
--   recipes    : công thức chế tạo {id, out:{item,n}, in:[{item,n}], lv?, skill?, xp?}
-- Mua/bán/chế tạo đều chạy NGUYÊN KHỐI trên máy chủ: đủ điều kiện → trừ → cộng → ghi sổ; lỗi giữa chừng = không mất gì.
-- Sự kiện sinh ra (để thành tựu/nhiệm vụ dùng): bought, sold, crafted.

-- ---------- vật phẩm mới: nội thất rời (đặt vào nhà khi có chế độ Xây nhà — hạng mục 12) ----------
update public.game_config c set value = c.value || coalesce((
  select jsonb_agg(x.value) from jsonb_array_elements('[
    {"id":"pot_wood","name":"Chậu cây gỗ","group":"furniture","rarity":"common","icon":"🪴","stack":20,"sell":12,"desc":"Chậu gỗ nhỏ trồng sẵn cây lá xanh. Đặt cạnh cửa sổ hay bàn làm việc đều hợp."},
    {"id":"basket","name":"Giỏ đan","group":"furniture","rarity":"common","icon":"🧺","stack":20,"sell":10,"desc":"Giỏ đan bằng sợi lá khô, đựng chăn, sách hoặc đồ lặt vặt."},
    {"id":"frame","name":"Khung ảnh gỗ","group":"furniture","rarity":"common","icon":"🖼️","stack":20,"sell":14,"desc":"Khung ảnh để treo kỷ niệm của hai người."},
    {"id":"stool","name":"Ghế đẩu gỗ","group":"furniture","rarity":"uncommon","icon":"🪑","stack":20,"sell":18,"desc":"Ghế đẩu chắc chắn, ngồi tạm hoặc làm chỗ kê chậu cây."},
    {"id":"lamp","name":"Đèn bàn ánh ấm","group":"furniture","rarity":"uncommon","icon":"💡","stack":20,"sell":28,"desc":"Đèn bàn ánh vàng dịu cho những buổi làm việc đêm."},
    {"id":"shelf","name":"Kệ sách nhỏ","group":"furniture","rarity":"rare","icon":"📚","stack":10,"sell":45,"desc":"Kệ gỗ ba ngăn, vừa sách, vừa đồ sưu tập."}
  ]'::jsonb) x
  where not exists (select 1 from jsonb_array_elements(c.value) y where y.value->>'id' = x.value->>'id')), '[]'::jsonb)
where c.key = 'items';

insert into public.game_config(key, value, note) values
 ('shop_cats', '[
   {"id":"furniture","name":"Nội thất","live":true},
   {"id":"material","name":"Nguyên liệu","live":true},
   {"id":"outfit","name":"Trang phục","live":false,"soon":"Mở cùng Tủ đồ & thay trang phục"},
   {"id":"accessory","name":"Phụ kiện","live":false,"soon":"Mở cùng Tủ đồ & thay trang phục"},
   {"id":"seed","name":"Hạt giống","live":false,"soon":"Mở cùng Làm vườn & trồng trọt"},
   {"id":"tool","name":"Công cụ","live":false,"soon":"Mở cùng Làm vườn và Câu cá"},
   {"id":"consumable","name":"Tiêu hao","live":false,"soon":"Mở khi có món dùng được (đồ ăn, phân bón, mồi câu)"}]',
  'Danh mục cửa hàng. live=false = chưa có hệ thống dùng món đó → hiện Sắp có, không bán'),
 ('shop', '[
   {"item":"pot_wood","cat":"furniture","price":45},
   {"item":"basket","cat":"furniture","price":40},
   {"item":"frame","cat":"furniture","price":55},
   {"item":"stool","cat":"furniture","price":60},
   {"item":"lamp","cat":"furniture","price":90,"lv":2},
   {"item":"shelf","cat":"furniture","price":140,"lv":3},
   {"item":"wood","cat":"material","price":6},
   {"item":"stone","cat":"material","price":6},
   {"item":"fiber","cat":"material","price":4},
   {"item":"cloth","cat":"material","price":12,"week_limit":20},
   {"item":"metal","cat":"material","price":15,"week_limit":10}]',
  'Hàng đang bán: price = Xu/món; lv = cấp tối thiểu; week_limit = mỗi người mua tối đa bao nhiêu/tuần'),
 ('recipes', '[
   {"id":"r_pot","out":{"item":"pot_wood","n":1},"in":[{"item":"wood","n":5},{"item":"fiber","n":2}]},
   {"id":"r_basket","out":{"item":"basket","n":1},"in":[{"item":"fiber","n":6}]},
   {"id":"r_frame","out":{"item":"frame","n":1},"in":[{"item":"wood","n":3},{"item":"cloth","n":1}]},
   {"id":"r_stool","out":{"item":"stool","n":1},"in":[{"item":"wood","n":6},{"item":"metal","n":1}]},
   {"id":"r_lamp","out":{"item":"lamp","n":1},"in":[{"item":"metal","n":2},{"item":"wood","n":2},{"item":"cloth","n":1}],"lv":2},
   {"id":"r_shelf","out":{"item":"shelf","n":1},"in":[{"item":"wood","n":8},{"item":"metal","n":2},{"item":"stone","n":2}],"lv":3}]',
  'Công thức chế tạo: nguyên liệu lấy từ TÚI RIÊNG; lv = cấp tối thiểu. Mỗi lần chế tạo: +craft_reward'),
 ('craft_reward', '[{"c":"skill:craft","n":10},{"c":"xp","n":5}]', 'Thưởng cho mỗi món chế tạo xong')
on conflict (key) do nothing;

-- kỹ năng Chế tạo bắt đầu tính điểm
update public.game_config set value = (select jsonb_agg(case when x.value->>'id' = 'craft' then x.value || '{"live":true}'::jsonb else x.value end) from jsonb_array_elements(value) x)
 where key = 'skills';
-- quà mỗi 5 cấp: thay "Món trang trí (sắp có)" bằng món thật
update public.game_config set value = jsonb_set(value, '{every5}', '[{"c":"xu","n":100},{"c":"item:lamp","n":1}]'::jsonb)
 where key = 'level_rewards' and value->'every5' @> '[{"c":"soon:decor"}]'::jsonb;
-- thành tựu mới (thêm vào cuối, không đổi mục cũ)
update public.game_config c set value = c.value || coalesce((
  select jsonb_agg(x.value) from jsonb_array_elements('[
    {"id":"craft1","group":"Sáng tạo","name":"Đôi tay khéo léo","desc":"Chế tạo món đồ đầu tiên","event":"crafted","count":1,"reward":[{"c":"xu","n":20}]},
    {"id":"craft10","group":"Sáng tạo","name":"Thợ mộc nhỏ","desc":"Chế tạo 10 món đồ","event":"crafted","count":10,"title":"Thợ khéo tay","reward":[{"c":"xu","n":80},{"c":"item:metal","n":3}]},
    {"id":"buy1","group":"Nhà cửa","name":"Tậu đồ mới","desc":"Mua món đầu tiên ở cửa hàng","event":"bought","count":1,"reward":[{"c":"xu","n":10}]},
    {"id":"sell1","group":"Nhà cửa","name":"Buôn bán nhỏ","desc":"Bán món đầu tiên","event":"sold","count":1,"reward":[{"c":"xu","n":10}]}
  ]'::jsonb) x
  where not exists (select 1 from jsonb_array_elements(c.value) y where y.value->>'id' = x.value->>'id')), '[]'::jsonb)
where c.key = 'achievements';

-- ---------- hàm nội bộ ----------
create or replace function public._shop_row(p_item text) returns jsonb
language sql stable security definer set search_path = public as $$
  select x.value from jsonb_array_elements(coalesce(public._cfg('shop'),'[]'::jsonb)) x where x.value->>'item' = p_item limit 1;
$$;
create or replace function public._bought_week(p_pid uuid, p_item text) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from public.game_ledger
   where actor = p_pid and currency = 'item:' || p_item and source = 'shop' and amount > 0 and created_at >= public._week_start();
$$;
revoke all on function public._shop_row(text), public._bought_week(uuid,text) from public, anon, authenticated;

-- ---------- RPC: xem cửa hàng ----------
create or replace function public.game_shop() returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players; lv int; xu bigint; out jsonb := '[]'::jsonb; s jsonb; cats jsonb; live text[]; bw bigint;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  lv := public._level_of(public._bal('player:' || me.id, 'xp')); xu := public._bal('player:' || me.id, 'xu');
  cats := coalesce(public._cfg('shop_cats'), '[]'::jsonb);
  select array_agg(x.value->>'id') into live from jsonb_array_elements(cats) x where coalesce((x.value->>'live')::boolean, false);
  for s in select x.value from jsonb_array_elements(coalesce(public._cfg('shop'),'[]'::jsonb)) x loop
    if public._item_def(s->>'item') is null or not ((s->>'cat') = any(coalesce(live, '{}'))) then continue; end if;   -- không bày món không tồn tại / danh mục chưa mở
    bw := case when s ? 'week_limit' then public._bought_week(me.id, s->>'item') else null end;
    out := out || jsonb_build_array(s || jsonb_build_object('bought_week', bw,
      'locked', coalesce((s->>'lv')::int, 1) > lv,
      'mine', public._bal('player:' || me.id, 'item:' || (s->>'item')), 'house', public._bal('house', 'item:' || (s->>'item'))));
  end loop;
  return json_build_object('listings', out, 'cats', cats, 'level', lv, 'xu', xu, 'items', coalesce(public._cfg('items'),'[]'::jsonb),
    'week_ends', public._week_start() + interval '7 days');
end $$;

-- ---------- RPC: mua ----------
create or replace function public.game_buy(p_item text, p_n int, p_to_house boolean, p_idem text) returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players; s jsonb; lv int; cost bigint; dst text; nm text; key text; ok boolean;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  if p_idem is null or length(p_idem) < 6 then raise exception 'bad_request'; end if;
  if p_n is null or p_n < 1 or p_n > 99 then raise exception 'bad_amount'; end if;
  perform pg_advisory_xact_lock(hashtext('pl:' || me.id));
  key := 'buy:' || me.id || ':' || left(p_idem, 60);
  if exists (select 1 from public.game_ledger where idem = key || ':xu') then return json_build_object('dup', true); end if;
  s := public._shop_row(p_item);
  if s is null or public._item_def(p_item) is null then raise exception 'not_for_sale'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(public._cfg('shop_cats'),'[]'::jsonb)) c
                  where c.value->>'id' = s->>'cat' and coalesce((c.value->>'live')::boolean, false)) then raise exception 'not_for_sale'; end if;
  lv := public._level_of(public._bal('player:' || me.id, 'xp'));
  if coalesce((s->>'lv')::int, 1) > lv then raise exception 'level_locked'; end if;
  if s ? 'week_limit' and public._bought_week(me.id, p_item) + p_n > (s->>'week_limit')::int then raise exception 'week_limit'; end if;
  cost := (s->>'price')::bigint * p_n;
  if public._bal('player:' || me.id, 'xu') < cost then raise exception 'insufficient'; end if;
  dst := case when p_to_house then 'house' else 'player:' || me.id end;
  if not public._room_for(dst, 'item:' || p_item, p_n) then raise exception '%', case when p_to_house then 'house_full' else 'bag_full' end; end if;
  nm := public._item_def(p_item)->>'name';
  ok := public._grant('player:' || me.id, 'xu', -cost, 'Mua ' || p_n || ' ' || nm, 'shop', p_item, me.id, key || ':xu');
  perform public._grant(dst, 'item:' || p_item, p_n, 'Mua ở cửa hàng' || case when p_to_house then ' (cất vào kho nhà)' else '' end, 'shop', p_item, me.id, key || ':item');
  perform public._event(me.id, 'bought', jsonb_build_object('item', p_item, 'n', p_n, 'xu', cost), key, false);
  return json_build_object('ok', true, 'spent', cost, 'xu', public._bal('player:' || me.id, 'xu'), 'item', p_item, 'n', p_n, 'name', nm);
end $$;

-- ---------- RPC: bán (chỉ từ túi riêng; món có giá bán và không bị đánh dấu nosell) ----------
create or replace function public.game_sell(p_item text, p_n int, p_idem text) returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players; d jsonb; gain bigint; key text; nm text;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  if p_idem is null or length(p_idem) < 6 then raise exception 'bad_request'; end if;
  if p_n is null or p_n < 1 or p_n > 999 then raise exception 'bad_amount'; end if;
  perform pg_advisory_xact_lock(hashtext('pl:' || me.id));
  key := 'sell:' || me.id || ':' || left(p_idem, 60);
  if exists (select 1 from public.game_ledger where idem = key || ':item') then return json_build_object('dup', true); end if;
  d := public._item_def(p_item);
  if d is null or coalesce((d->>'sell')::int, 0) <= 0 or coalesce((d->>'nosell')::boolean, false) or d->>'group' = 'quest' then raise exception 'not_sellable'; end if;
  if public._bal('player:' || me.id, 'item:' || p_item) < p_n then raise exception 'insufficient'; end if;
  gain := (d->>'sell')::bigint * p_n; nm := d->>'name';
  perform public._grant('player:' || me.id, 'item:' || p_item, -p_n, 'Bán ' || p_n || ' ' || nm, 'sell', p_item, me.id, key || ':item');
  perform public._grant('player:' || me.id, 'xu', gain, 'Bán ' || p_n || ' ' || nm, 'sell', p_item, me.id, key || ':xu');
  perform public._event(me.id, 'sold', jsonb_build_object('item', p_item, 'n', p_n, 'xu', gain), key, false);
  return json_build_object('ok', true, 'gain', gain, 'xu', public._bal('player:' || me.id, 'xu'), 'name', nm, 'n', p_n);
end $$;

-- ---------- RPC: chế tạo ----------
create or replace function public.game_craft(p_recipe text, p_n int, p_to_house boolean, p_idem text) returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players; r jsonb; i jsonb; lv int; key text; dst text; outi text; outn int; nm text; got jsonb; k int;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  if p_idem is null or length(p_idem) < 6 then raise exception 'bad_request'; end if;
  if p_n is null or p_n < 1 or p_n > 20 then raise exception 'bad_amount'; end if;
  perform pg_advisory_xact_lock(hashtext('pl:' || me.id));
  key := 'craft:' || me.id || ':' || left(p_idem, 60);
  if exists (select 1 from public.game_ledger where idem = key || ':out') then return json_build_object('dup', true); end if;
  select x.value into r from jsonb_array_elements(coalesce(public._cfg('recipes'),'[]'::jsonb)) x where x.value->>'id' = p_recipe;
  if r is null then raise exception 'bad_recipe'; end if;
  lv := public._level_of(public._bal('player:' || me.id, 'xp'));
  if coalesce((r->>'lv')::int, 1) > lv then raise exception 'level_locked'; end if;
  outi := r->'out'->>'item'; outn := coalesce((r->'out'->>'n')::int, 1) * p_n; nm := public._item_def(outi)->>'name';
  if nm is null then raise exception 'bad_recipe'; end if;
  -- kiểm tra đủ TẤT CẢ nguyên liệu trước khi trừ bất cứ thứ gì
  for i in select x.value from jsonb_array_elements(r->'in') x loop
    if public._bal('player:' || me.id, 'item:' || (i->>'item')) < (i->>'n')::bigint * p_n then raise exception 'missing:%', i->>'item'; end if;
  end loop;
  for i in select x.value from jsonb_array_elements(r->'in') x loop
    perform public._grant('player:' || me.id, 'item:' || (i->>'item'), -((i->>'n')::bigint * p_n), 'Chế tạo ' || nm, 'craft', p_recipe, me.id, key || ':in:' || (i->>'item'));
  end loop;
  dst := case when p_to_house then 'house' else 'player:' || me.id end;
  -- kiểm tra chỗ SAU khi trừ nguyên liệu (nguyên liệu dùng hết có thể giải phóng ô); thiếu chỗ → cả giao dịch huỷ, không mất gì
  if not public._room_for(dst, 'item:' || outi, outn) then raise exception '%', case when p_to_house then 'house_full' else 'bag_full' end; end if;
  perform public._grant(dst, 'item:' || outi, outn, 'Chế tạo' || case when p_to_house then ' (cất vào kho nhà)' else '' end, 'craft', p_recipe, me.id, key || ':out');
  got := public._grant_items(me.id, (select jsonb_agg(jsonb_build_object('c', x.value->>'c', 'n', (x.value->>'n')::int * p_n)) from jsonb_array_elements(coalesce(public._cfg('craft_reward'),'[]'::jsonb)) x),
                             'Chế tạo ' || nm, 'craft', p_recipe, key || ':rw');
  for k in 1..p_n loop
    perform public._event(me.id, 'crafted', jsonb_build_object('recipe', p_recipe, 'item', outi), key || ':ev' || k, false);
  end loop;
  return json_build_object('ok', true, 'item', outi, 'n', outn, 'name', nm, 'granted', got);
end $$;

create or replace function public.game_recipes() returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  return json_build_object('recipes', coalesce(public._cfg('recipes'),'[]'::jsonb), 'level', public._level_of(public._bal('player:' || me.id, 'xp')),
    'reward', public._cfg('craft_reward'),
    'mine', coalesce((select json_object_agg(substr(currency, 6), amount) from public.game_balances where owner = 'player:' || me.id and currency like 'item:%' and amount > 0), '{}'::json),
    'house', coalesce((select json_object_agg(substr(currency, 6), amount) from public.game_balances where owner = 'house' and currency like 'item:%' and amount > 0), '{}'::json),
    'items', coalesce(public._cfg('items'),'[]'::jsonb));
end $$;

revoke all on function public.game_shop(), public.game_buy(text,int,boolean,text), public.game_sell(text,int,text),
  public.game_craft(text,int,boolean,text), public.game_recipes() from public, anon;
grant execute on function public.game_shop(), public.game_buy(text,int,boolean,text), public.game_sell(text,int,text),
  public.game_craft(text,int,boolean,text), public.game_recipes() to authenticated;
