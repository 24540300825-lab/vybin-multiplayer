-- VY/BIN studio — ĐẶT NỘI THẤT VÀO NHÀ (bản đầu của hạng mục 12 "Chế độ xây nhà & đặt nội thất")
-- Model: Kenney Furniture Kit (CC0, kenney.nl) — file trong assets/furniture/. Mỗi vật phẩm nội thất có "model" + "scale" + "solid".
-- Chỉ THÊM. Đồ đặt ra được TRỪ khỏi túi (hoặc kho nhà) và nằm trong game_placed; cất đi thì trả về túi người cất (túi đầy → kho nhà).
-- Quyền: phòng khách + vườn = cả hai; Phòng Vy chỉ Vy sắp xếp, Phòng Bin chỉ Bin (tôn trọng không gian riêng).

create table if not exists public.game_placed (
  id         uuid primary key default gen_random_uuid(),
  map        text not null,
  item       text not null,
  x real not null, y real not null, z real not null, rot real not null default 0,
  placed_by  uuid references public.game_players(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  state      jsonb not null default '{}'::jsonb      -- trạng thái dùng: {"on":true} cho đèn…
);
create index if not exists game_placed_map on public.game_placed(map);
alter table public.game_placed enable row level security;

insert into public.game_config(key, value, note) values
 ('place', '{"max_per_map":40,
   "maps":{"living":{"who":"both","box":[-1,11,-9,1]},"vy":{"who":"vy","box":[-1,11,-9,1]},"bin":{"who":"bin","box":[-1,11,-9,1]},"exterior":{"who":"both","box":[-25,35,-25,15]}}}',
  'Đặt nội thất: tối đa mỗi map; who = ai được sắp xếp (both / vy / bin); box = vùng toạ độ hợp lệ [x0,x1,z0,z1]')
on conflict (key) do nothing;

-- 6 món cũ: gắn model thật (đổi tên/mô tả cho khớp hình) + 16 món mới
update public.game_config c set value = (
  select jsonb_agg(case x.value->>'id'
    when 'pot_wood' then x.value || '{"name":"Chậu cây lá","model":"pottedPlant","scale":2.7,"solid":true,"desc":"Chậu gốm trồng cây lá dài, góc nào trong nhà cũng xanh hơn."}'::jsonb
    when 'basket'   then x.value || '{"name":"Thảm tròn đan","icon":"⭕","model":"rugRound","scale":1.75,"solid":false,"desc":"Thảm tròn đan từ sợi lá khô, êm chân, đi lên được."}'::jsonb
    when 'frame'    then x.value || '{"name":"Đài radio cổ","icon":"📻","model":"radio","scale":1.3,"use":"music","solid":true,"desc":"Chiếc radio gỗ kiểu cũ — để cạnh sofa hay trên sàn gác đều xinh."}'::jsonb
    when 'stool'    then x.value || '{"name":"Ghế quầy đệm hồng","model":"stoolBar","scale":1.75,"solid":true,"desc":"Ghế cao chân gỗ, đệm hồng — hợp cạnh bàn hoặc quầy."}'::jsonb
    when 'lamp'     then x.value || '{"model":"lampRoundTable","scale":1.6,"use":"light","light":{"y":0.75,"r":3.5,"i":3},"solid":true}'::jsonb
    when 'shelf'    then x.value || '{"name":"Kệ sách thấp","model":"bookcaseOpenLow","scale":2.2,"solid":true,"desc":"Kệ gỗ hai tầng, để sách, hộp đồ hoặc chậu cây."}'::jsonb
    else x.value end)
  from jsonb_array_elements(c.value) x)
where c.key = 'items';

update public.game_config c set value = c.value || coalesce((
  select jsonb_agg(x.value) from jsonb_array_elements('[
    {"id":"plant_mini","name":"Chậu thông mini","group":"furniture","rarity":"common","icon":"🌲","stack":20,"sell":9,"model":"plantSmall1","scale":2.5,"solid":true,"desc":"Cây thông lùn trong chậu gỗ nhỏ."},
    {"id":"cactus","name":"Chậu xương rồng","group":"furniture","rarity":"common","icon":"🌵","stack":20,"sell":8,"model":"plantSmall3","scale":2.5,"solid":true,"desc":"Xương rồng tròn, chẳng cần tưới mấy."},
    {"id":"books","name":"Chồng sách","group":"furniture","rarity":"common","icon":"📕","stack":20,"sell":5,"model":"books","scale":2.1,"solid":false,"desc":"Vài cuốn sách xếp đứng — để trên sàn, cạnh kệ."},
    {"id":"pillow_pink","name":"Gối ôm hồng","group":"furniture","rarity":"common","icon":"🩷","stack":20,"sell":7,"model":"pillow","scale":2.0,"solid":false,"desc":"Gối vuông mềm, thả đâu cũng thấy ấm."},
    {"id":"rug_rect","name":"Thảm chữ nhật","group":"furniture","rarity":"common","icon":"🟥","stack":20,"sell":20,"model":"rugRectangle","scale":1.55,"solid":false,"desc":"Thảm viền hồng cho phòng khách hoặc trước giường."},
    {"id":"coat_rack","name":"Giá treo áo","group":"furniture","rarity":"common","icon":"🧥","stack":20,"sell":16,"model":"coatRackStanding","scale":2.27,"solid":true,"desc":"Giá gỗ đứng cạnh cửa, treo áo khoác và túi."},
    {"id":"chair_cushion","name":"Ghế gỗ đệm","group":"furniture","rarity":"common","icon":"🪑","stack":20,"sell":18,"model":"chairCushion","scale":1.9,"use":"sit","seat":{"n":1,"y":0.522,"z":0.125},"solid":true,"desc":"Ghế tựa gỗ có đệm hồng — ngồi được."},
    {"id":"speaker","name":"Loa gỗ nhỏ","group":"furniture","rarity":"uncommon","icon":"🔊","stack":20,"sell":22,"model":"speakerSmall","scale":2.0,"solid":true,"desc":"Loa vỏ gỗ — trang trí góc nghe nhạc."},
    {"id":"side_table","name":"Bàn kê có ngăn","group":"furniture","rarity":"uncommon","icon":"🗄️","stack":20,"sell":24,"model":"sideTableDrawers","scale":1.95,"solid":true,"desc":"Bàn gỗ dài có hai ngăn kéo."},
    {"id":"coffee_table","name":"Bàn trà gỗ","group":"furniture","rarity":"uncommon","icon":"🟫","stack":20,"sell":28,"model":"tableCoffee","scale":1.85,"solid":true,"desc":"Bàn thấp đặt giữa sofa, để trà và bánh."},
    {"id":"table_round","name":"Bàn tròn nhỏ","group":"furniture","rarity":"uncommon","icon":"🍵","stack":20,"sell":26,"model":"tableRound","scale":1.7,"solid":true,"desc":"Bàn tròn một chân, vừa cho hai người."},
    {"id":"lamp_floor","name":"Đèn cây đứng","group":"furniture","rarity":"uncommon","icon":"🏮","stack":20,"sell":26,"model":"lampRoundFloor","scale":1.86,"use":"light","light":{"y":0.9,"r":5,"i":5},"solid":true,"desc":"Đèn chân cao chao vải — bật lên hắt ánh vàng ấm."},
    {"id":"bookcase","name":"Kệ sách cao","group":"furniture","rarity":"rare","icon":"📚","stack":10,"sell":38,"model":"bookcaseOpen","scale":2.05,"solid":true,"desc":"Kệ bốn tầng đứng sát tường."},
    {"id":"armchair","name":"Ghế thư giãn","group":"furniture","rarity":"rare","icon":"💺","stack":10,"sell":48,"model":"loungeChairRelax","scale":1.65,"use":"sit","seat":{"n":1,"y":0.365,"z":-0.06},"solid":true,"desc":"Ghế bành có chỗ gác chân — ngồi được, góc đọc sách hoàn hảo."},
    {"id":"tv_retro","name":"TV cổ điển","group":"furniture","rarity":"rare","icon":"📺","stack":10,"sell":50,"model":"televisionVintage","scale":1.5,"solid":true,"desc":"TV hộp gỗ kiểu xưa (để trang trí)."},
    {"id":"sofa_blue","name":"Sofa xanh","group":"furniture","rarity":"epic","icon":"🛋️","stack":10,"sell":70,"model":"loungeDesignSofa","scale":1.8,"use":"sit","seat":{"n":2,"y":0.575,"z":0.19,"x":0.16},"solid":true,"desc":"Sofa dài màu xanh dịu — hai người ngồi cạnh nhau được."}
  ]'::jsonb) x
  where not exists (select 1 from jsonb_array_elements(c.value) y where y.value->>'id' = x.value->>'id')), '[]'::jsonb)
where c.key = 'items';

-- cửa hàng: thêm món mới (giữ nguyên dòng cũ)
update public.game_config c set value = c.value || coalesce((
  select jsonb_agg(x.value) from jsonb_array_elements('[
    {"item":"plant_mini","cat":"furniture","price":35},{"item":"cactus","cat":"furniture","price":30},{"item":"books","cat":"furniture","price":20},
    {"item":"pillow_pink","cat":"furniture","price":25},{"item":"rug_rect","cat":"furniture","price":70},{"item":"coat_rack","cat":"furniture","price":55},
    {"item":"chair_cushion","cat":"furniture","price":60},{"item":"speaker","cat":"furniture","price":75},{"item":"side_table","cat":"furniture","price":80},
    {"item":"coffee_table","cat":"furniture","price":95},{"item":"table_round","cat":"furniture","price":90},{"item":"lamp_floor","cat":"furniture","price":85},
    {"item":"bookcase","cat":"furniture","price":120,"lv":2},{"item":"armchair","cat":"furniture","price":150,"lv":2},
    {"item":"tv_retro","cat":"furniture","price":160,"lv":3},{"item":"sofa_blue","cat":"furniture","price":220,"lv":3}
  ]'::jsonb) x
  where not exists (select 1 from jsonb_array_elements(c.value) y where y.value->>'item' = x.value->>'item')), '[]'::jsonb)
where c.key = 'shop';
-- radio (id 'frame'): công thức cũ wood3+cloth1 → wood2+metal1 cho khớp món
update public.game_config c set value = (select jsonb_agg(case when x.value->>'id' = 'r_frame' then jsonb_set(x.value, '{in}', '[{"item":"wood","n":2},{"item":"metal","n":1}]'::jsonb) else x.value end) from jsonb_array_elements(c.value) x)
 where c.key = 'recipes';
update public.game_config c set value = c.value || coalesce((
  select jsonb_agg(x.value) from jsonb_array_elements('[
    {"id":"r_plant_mini","out":{"item":"plant_mini","n":1},"in":[{"item":"wood","n":2},{"item":"fiber","n":3}]},
    {"id":"r_rug_rect","out":{"item":"rug_rect","n":1},"in":[{"item":"fiber","n":8},{"item":"cloth","n":2}]},
    {"id":"r_pillow","out":{"item":"pillow_pink","n":1},"in":[{"item":"cloth","n":2},{"item":"fiber","n":2}]},
    {"id":"r_chair","out":{"item":"chair_cushion","n":1},"in":[{"item":"wood","n":5},{"item":"cloth","n":1}]},
    {"id":"r_side_table","out":{"item":"side_table","n":1},"in":[{"item":"wood","n":6},{"item":"metal","n":1}]},
    {"id":"r_coffee_table","out":{"item":"coffee_table","n":1},"in":[{"item":"wood","n":8},{"item":"stone","n":1}],"lv":2}
  ]'::jsonb) x
  where not exists (select 1 from jsonb_array_elements(c.value) y where y.value->>'id' = x.value->>'id')), '[]'::jsonb)
where c.key = 'recipes';
-- thành tựu
update public.game_config c set value = c.value || coalesce((
  select jsonb_agg(x.value) from jsonb_array_elements('[
    {"id":"place1","group":"Nhà cửa","name":"Tổ ấm của mình","desc":"Đặt món nội thất đầu tiên vào nhà","event":"placed","count":1,"reward":[{"c":"xu","n":20},{"c":"kt","n":5}]},
    {"id":"place10","group":"Nhà cửa","name":"Nhà trang trí","desc":"Đặt 10 món nội thất","event":"placed","count":10,"title":"Người bày trí","reward":[{"c":"xu","n":60},{"c":"kt","n":15}]}
  ]'::jsonb) x
  where not exists (select 1 from jsonb_array_elements(c.value) y where y.value->>'id' = x.value->>'id')), '[]'::jsonb)
where c.key = 'achievements';

-- ---------- quyền sắp xếp 1 map ----------
create or replace function public._can_arrange(p_slot text, p_map text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((public._cfg('place')->'maps'->p_map->>'who') in ('both', p_slot), false);
$$;
revoke all on function public._can_arrange(text,text) from public, anon, authenticated;

create or replace function public.game_placed(p_map text) returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  return json_build_object('map', p_map, 'can', public._can_arrange(me.slot, p_map),
    'max', coalesce((public._cfg('place')->>'max_per_map')::int, 40),
    'items', coalesce((select json_agg(json_build_object('id', p.id, 'item', p.item, 'x', p.x, 'y', p.y, 'z', p.z, 'rot', p.rot, 'state', p.state,
                         'by', (select slot from public.game_players g where g.id = p.placed_by)) order by p.created_at)
                       from public.game_placed p where p.map = p_map), '[]'::json),
    'defs', coalesce((select jsonb_agg(x.value) from jsonb_array_elements(coalesce(public._cfg('items'),'[]'::jsonb)) x where x.value ? 'model'), '[]'::jsonb));
end $$;

create or replace function public._place_check(p_map text, p_x real, p_y real, p_z real) returns void
language plpgsql stable security definer set search_path = public as $$
declare b jsonb := public._cfg('place')->'maps'->p_map->'box';
begin
  if b is null then raise exception 'bad_map'; end if;
  if p_x is null or p_z is null or p_y is null or p_x < (b->>0)::real or p_x > (b->>1)::real or p_z < (b->>2)::real or p_z > (b->>3)::real or p_y < -2 or p_y > 10 then raise exception 'bad_spot'; end if;
end $$;
revoke all on function public._place_check(text,real,real,real) from public, anon, authenticated;

create or replace function public.game_place(p_item text, p_map text, p_x real, p_y real, p_z real, p_rot real, p_idem text) returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players; d jsonb; src text; nid uuid; key text;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  if not public._can_arrange(me.slot, p_map) then raise exception 'not_your_room'; end if;
  perform public._place_check(p_map, p_x, p_y, p_z);
  d := public._item_def(p_item); if d is null or not (d ? 'model') then raise exception 'not_placeable'; end if;
  perform pg_advisory_xact_lock(hashtext('place:' || p_map));
  key := 'place:' || me.id || ':' || left(coalesce(p_idem, ''), 60);
  if length(coalesce(p_idem, '')) < 6 then raise exception 'bad_request'; end if;
  if exists (select 1 from public.game_ledger where idem = key) then return json_build_object('dup', true); end if;
  if (select count(*) from public.game_placed where map = p_map) >= coalesce((public._cfg('place')->>'max_per_map')::int, 40) then raise exception 'room_full'; end if;
  src := case when public._bal('player:' || me.id, 'item:' || p_item) > 0 then 'player:' || me.id
              when public._bal('house', 'item:' || p_item) > 0 then 'house' else null end;
  if src is null then raise exception 'insufficient'; end if;
  perform public._grant(src, 'item:' || p_item, -1, 'Đặt vào nhà: ' || (d->>'name'), 'place', p_map, me.id, key);
  insert into public.game_placed(map, item, x, y, z, rot, placed_by) values (p_map, p_item, p_x, p_y, p_z, coalesce(p_rot, 0), me.id) returning id into nid;
  perform public._event(me.id, 'placed', jsonb_build_object('item', p_item, 'map', p_map), key, false);
  return json_build_object('ok', true, 'id', nid, 'from', case when src = 'house' then 'house' else 'bag' end);
end $$;

create or replace function public.game_place_move(p_id uuid, p_x real, p_y real, p_z real, p_rot real) returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players; r public.game_placed;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  select * into r from public.game_placed where id = p_id for update;
  if r.id is null then raise exception 'gone'; end if;
  if not public._can_arrange(me.slot, r.map) then raise exception 'not_your_room'; end if;
  perform public._place_check(r.map, p_x, p_y, p_z);
  update public.game_placed set x = p_x, y = p_y, z = p_z, rot = coalesce(p_rot, rot), updated_at = now() where id = p_id;
  return json_build_object('ok', true);
end $$;

create or replace function public.game_place_pickup(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players; r public.game_placed; dst text; nm text;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  select * into r from public.game_placed where id = p_id for update;
  if r.id is null then return json_build_object('ok', true, 'gone', true); end if;
  if not public._can_arrange(me.slot, r.map) then raise exception 'not_your_room'; end if;
  dst := case when public._room_for('player:' || me.id, 'item:' || r.item, 1) then 'player:' || me.id
              when public._room_for('house', 'item:' || r.item, 1) then 'house' else null end;
  if dst is null then raise exception 'bag_full'; end if;
  nm := public._item_def(r.item)->>'name';
  delete from public.game_placed where id = p_id;
  perform public._grant(dst, 'item:' || r.item, 1, 'Cất từ nhà: ' || coalesce(nm, r.item), 'place', r.map, me.id, 'pickup:' || p_id);
  return json_build_object('ok', true, 'to', case when dst = 'house' then 'house' else 'bag' end, 'name', nm);
end $$;

-- bật / tắt (đèn…): ai trong nhà cũng dùng được, kể cả trong phòng người kia
create or replace function public.game_place_use(p_id uuid, p_on boolean) returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  update public.game_placed set state = state || jsonb_build_object('on', p_on) where id = p_id;
  if not found then raise exception 'gone'; end if;
  return json_build_object('ok', true, 'on', p_on);
end $$;

revoke all on function public.game_place_use(uuid,boolean) from public, anon;
grant execute on function public.game_place_use(uuid,boolean) to authenticated;
revoke all on function public.game_placed(text), public.game_place(text,text,real,real,real,real,text),
  public.game_place_move(uuid,real,real,real,real), public.game_place_pickup(uuid) from public, anon;
grant execute on function public.game_placed(text), public.game_place(text,text,real,real,real,real,text),
  public.game_place_move(uuid,real,real,real,real), public.game_place_pickup(uuid) to authenticated;
