-- VY/BIN studio — CÂY & VƯỜN: cây cối / cỏ / hoa / đá từ Poly Nature Pack, mua 1 loại → rải ra vườn thành nhiều biến thể
-- Chỉ THÊM. Mỗi món vườn: glb = file chứa nhiều biến thể (node v0..vN), variants = số biến thể,
--   out = chỉ trồng ngoài Vườn, scatter = {n: số cây mỗi lần bấm, r: bán kính chổi (m), gap: khoảng cách tối thiểu, s:[tỉ lệ min,max]},
--   solidR = bán kính thân chặn đường đi (cỏ/hoa không có = đi xuyên qua được).
-- Mỗi cây rải ra = 1 dòng game_placed, state = {v: biến thể, s: tỉ lệ}. Tốn 1 món / cây.

update public.game_config set value = value || '[{"id":"garden","name":"Cây & vườn"}]'::jsonb
 where key = 'item_groups' and not value @> '[{"id":"garden"}]'::jsonb;

update public.game_config set value = jsonb_build_array(value->0) || '[{"id":"garden","name":"Cây & vườn","live":true}]'::jsonb || (value - 0)
 where key = 'shop_cats' and not value @> '[{"id":"garden"}]'::jsonb;

update public.game_config c set value = c.value || coalesce((
  select jsonb_agg(x.value) from jsonb_array_elements('[
    {"id":"g_grass","name":"Cỏ dại","group":"garden","rarity":"common","icon":"🌱","stack":99,"sell":1,"glb":"nature/glb/g_grass","variants":13,"out":true,"scatter":{"n":6,"r":1.4,"gap":0.45,"s":[0.8,1.25]},"desc":"Bụi cỏ, khóm cỏ ba lá… mỗi lần rải ra 6 khóm, mỗi khóm một dáng."},
    {"id":"g_flower","name":"Hoa dại","group":"garden","rarity":"common","icon":"🌼","stack":99,"sell":2,"glb":"nature/glb/g_flower","variants":15,"out":true,"scatter":{"n":5,"r":1.2,"gap":0.35,"s":[0.85,1.2]},"desc":"Cúc, anh túc, bồ công anh, thanh cúc… rải ra là một thảm hoa nhiều màu."},
    {"id":"g_rock","name":"Đá cuội","group":"garden","rarity":"common","icon":"🪨","stack":99,"sell":2,"glb":"nature/glb/g_rock","variants":6,"out":true,"scatter":{"n":3,"r":1.2,"gap":0.6,"s":[0.7,1.3]},"desc":"Đá cuội to nhỏ khác nhau, kê lối đi hay viền bồn hoa."},
    {"id":"g_fern","name":"Dương xỉ & lô hội","group":"garden","rarity":"common","icon":"🌿","stack":99,"sell":5,"glb":"nature/glb/g_fern","variants":4,"out":true,"scatter":{"n":2,"r":1.0,"gap":0.8,"s":[0.85,1.2]},"desc":"Khóm dương xỉ và lô hội thấp, hợp chân tường, gốc cây."},
    {"id":"g_mushroom","name":"Nấm rừng","group":"garden","rarity":"uncommon","icon":"🍄","stack":99,"sell":3,"glb":"nature/glb/g_mushroom","variants":10,"out":true,"scatter":{"n":3,"r":0.8,"gap":0.3,"s":[0.8,1.2]},"desc":"Nấm đỏ đốm trắng, nấm mỡ, nấm kèn… mọc lấm tấm dưới gốc cây."},
    {"id":"g_reed","name":"Lau sậy","group":"garden","rarity":"common","icon":"🎋","stack":99,"sell":4,"glb":"nature/glb/g_reed","variants":5,"out":true,"scatter":{"n":4,"r":1.0,"gap":0.3,"s":[0.85,1.15]},"desc":"Bồn bồn, lau sậy cao, hợp ven ao hoặc góc vườn."},
    {"id":"g_bush","name":"Bụi cây","group":"garden","rarity":"common","icon":"🌳","stack":99,"sell":12,"glb":"nature/glb/g_bush","variants":9,"out":true,"solidR":0.45,"scatter":{"n":1,"gap":1.2,"s":[0.85,1.15]},"desc":"Bụi thuỷ tùng, mộc lan, ngưu bàng… mỗi bụi một dáng."},
    {"id":"g_sapling","name":"Cây non","group":"garden","rarity":"common","icon":"🌱","stack":99,"sell":16,"glb":"nature/glb/g_sapling","variants":13,"out":true,"solidR":0.2,"scatter":{"n":1,"gap":1.2,"s":[0.85,1.15]},"desc":"Cây con cao ~2 m của 13 loài: sồi, bạch dương, thông, liễu…"},
    {"id":"g_stump","name":"Gốc cây","group":"garden","rarity":"uncommon","icon":"🪵","stack":99,"sell":14,"glb":"nature/glb/g_stump","variants":6,"out":true,"solidR":0.45,"scatter":{"n":1,"gap":1.0,"s":[0.85,1.15]},"desc":"Gốc cây đã cưa — ngồi tạm hoặc làm điểm nhấn."},
    {"id":"g_log","name":"Khúc gỗ","group":"garden","rarity":"uncommon","icon":"🪵","stack":99,"sell":18,"glb":"nature/glb/g_log","variants":5,"out":true,"solidBox":true,"scatter":{"n":1,"gap":1.0,"s":[0.9,1.1]},"desc":"Khúc gỗ đổ và đống củi xếp."},
    {"id":"g_cactus","name":"Xương rồng vườn","group":"garden","rarity":"uncommon","icon":"🌵","stack":99,"sell":24,"glb":"nature/glb/g_cactus","variants":8,"out":true,"solidR":0.35,"scatter":{"n":1,"gap":1.0,"s":[0.85,1.15]},"desc":"Xương rồng tròn ra hoa, xương rồng cột, xương rồng tai thỏ."},
    {"id":"g_tree","name":"Cây xanh","group":"garden","rarity":"uncommon","icon":"🌳","stack":99,"sell":44,"glb":"nature/glb/g_tree","variants":7,"out":true,"solidR":0.35,"scatter":{"n":1,"gap":2.5,"s":[0.85,1.15]},"desc":"Cây trẻ 4–7 m: sồi, dẻ gai, bạch dương, gạo, dương, liễu, keo."},
    {"id":"g_conifer","name":"Cây lá kim","group":"garden","rarity":"uncommon","icon":"🌲","stack":99,"sell":52,"glb":"nature/glb/g_conifer","variants":4,"out":true,"solidR":0.35,"scatter":{"n":1,"gap":2.0,"s":[0.85,1.15]},"desc":"Thông, vân sam, bách, bách xù."},
    {"id":"g_autumn","name":"Cây lá thu","group":"garden","rarity":"rare","icon":"🍁","stack":99,"sell":60,"glb":"nature/glb/g_autumn","variants":7,"out":true,"solidR":0.35,"scatter":{"n":1,"gap":2.5,"s":[0.85,1.15]},"desc":"Cây trẻ lá cam vàng mùa thu."},
    {"id":"g_palm","name":"Cây dừa","group":"garden","rarity":"rare","icon":"🌴","stack":99,"sell":70,"glb":"nature/glb/g_palm","variants":3,"out":true,"solidR":0.3,"scatter":{"n":1,"gap":2.5,"s":[0.85,1.15]},"desc":"Dừa non, dừa nghiêng, dừa thấp."},
    {"id":"g_bigtree","name":"Cây cổ thụ","group":"garden","rarity":"epic","icon":"🌳","stack":99,"sell":180,"glb":"nature/glb/g_bigtree","variants":5,"out":true,"solidR":0.7,"scatter":{"n":1,"gap":5,"s":[0.9,1.1]},"desc":"Cây lớn 9–12 m: sồi Anh, dẻ gai, bạch dương, liễu rủ — che bóng cả góc vườn."}
  ]'::jsonb) x
  where not exists (select 1 from jsonb_array_elements(c.value) y where y.value->>'id' = x.value->>'id')), '[]'::jsonb)
where c.key = 'items';

update public.game_config c set value = c.value || coalesce((
  select jsonb_agg(x.value) from jsonb_array_elements('[
    {"item":"g_grass","cat":"garden","price":6},{"item":"g_flower","cat":"garden","price":10},{"item":"g_rock","cat":"garden","price":12},
    {"item":"g_fern","cat":"garden","price":25},{"item":"g_bush","cat":"garden","price":60},{"item":"g_sapling","cat":"garden","price":80},
    {"item":"g_mushroom","cat":"garden","price":15,"lv":2},{"item":"g_reed","cat":"garden","price":20,"lv":2},{"item":"g_stump","cat":"garden","price":70,"lv":2},
    {"item":"g_log","cat":"garden","price":90,"lv":2},{"item":"g_tree","cat":"garden","price":220,"lv":2},
    {"item":"g_cactus","cat":"garden","price":120,"lv":3},{"item":"g_conifer","cat":"garden","price":260,"lv":3},
    {"item":"g_autumn","cat":"garden","price":300,"lv":4},{"item":"g_palm","cat":"garden","price":350,"lv":4},
    {"item":"g_bigtree","cat":"garden","price":900,"lv":6}
  ]'::jsonb) x
  where not exists (select 1 from jsonb_array_elements(c.value) y where y.value->>'item' = x.value->>'item')), '[]'::jsonb)
where c.key = 'shop';

-- vườn: cho rải nhiều (mỗi map có trần riêng); phòng trong nhà giữ 40
update public.game_config set value = jsonb_set(value, '{maps,exterior,max}', '400'::jsonb) where key = 'place';

update public.game_config c set value = c.value || coalesce((
  select jsonb_agg(x.value) from jsonb_array_elements('[
    {"id":"garden1","group":"Khám phá","name":"Bàn tay xanh","desc":"Trồng / rải món cây cối đầu tiên ra vườn","event":"planted","count":1,"reward":[{"c":"xu","n":20},{"c":"kt","n":5}]},
    {"id":"garden100","group":"Khám phá","name":"Khu vườn của chúng mình","desc":"Rải tổng cộng 100 cây, cỏ, hoa ra vườn","event":"planted","count":100,"title":"Người làm vườn","reward":[{"c":"xu","n":100},{"c":"kt","n":30}]}
  ]'::jsonb) x
  where not exists (select 1 from jsonb_array_elements(c.value) y where y.value->>'id' = x.value->>'id')), '[]'::jsonb)
where c.key = 'achievements';

-- món "có hình 3D để đặt" = có model (nội thất) hoặc glb (cây vườn)
create or replace function public._placeable(d jsonb) returns boolean language sql immutable as $$ select d is not null and (d ? 'model' or d ? 'glb') $$;
revoke all on function public._placeable(jsonb) from public, anon, authenticated;
create or replace function public._map_max(p_map text) returns int language sql stable security definer set search_path = public as $$
  select coalesce((public._cfg('place')->'maps'->p_map->>'max')::int, (public._cfg('place')->>'max_per_map')::int, 40) $$;
revoke all on function public._map_max(text) from public, anon, authenticated;

create or replace function public.game_placed(p_map text) returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  return json_build_object('map', p_map, 'can', public._can_arrange(me.slot, p_map), 'max', public._map_max(p_map),
    'items', coalesce((select json_agg(json_build_object('id', p.id, 'item', p.item, 'x', p.x, 'y', p.y, 'z', p.z, 'rot', p.rot, 'state', p.state,
                         'by', (select slot from public.game_players g where g.id = p.placed_by)) order by p.created_at)
                       from public.game_placed p where p.map = p_map), '[]'::json),
    'defs', coalesce((select jsonb_agg(x.value) from jsonb_array_elements(coalesce(public._cfg('items'),'[]'::jsonb)) x where public._placeable(x.value)), '[]'::jsonb));
end $$;

-- đặt 1 món (nội thất hoặc 1 cây): p_state = {v, s} cho cây vườn
create or replace function public.game_place2(p_item text, p_map text, p_x real, p_y real, p_z real, p_rot real, p_state jsonb, p_idem text) returns json
language plpgsql security definer set search_path = public as $$
begin
  return public.game_place_many(p_item, p_map, jsonb_build_array(jsonb_build_object('x', p_x, 'y', p_y, 'z', p_z, 'rot', p_rot) || coalesce(p_state, '{}'::jsonb)), p_idem);
end $$;

-- rải nhiều món một lần (chổi rải cây/cỏ/hoa): p_pts = [{x,y,z,rot,v,s}…]; đặt tối đa số đang có (túi trước, rồi kho nhà)
create or replace function public.game_place_many(p_item text, p_map text, p_pts jsonb, p_idem text) returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players; d jsonb; key text; have_b bigint; have_h bigint; n int; nb int; nh int; pt jsonb; ids jsonb := '[]'::jsonb; nid uuid; k int := 0; nv int;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  if not public._can_arrange(me.slot, p_map) then raise exception 'not_your_room'; end if;
  d := public._item_def(p_item); if not public._placeable(d) then raise exception 'not_placeable'; end if;
  if coalesce((d->>'out')::boolean, false) and p_map <> 'exterior' then raise exception 'outdoor_only'; end if;
  if jsonb_typeof(p_pts) <> 'array' or jsonb_array_length(p_pts) < 1 or jsonb_array_length(p_pts) > 12 then raise exception 'bad_request'; end if;
  if length(coalesce(p_idem, '')) < 6 then raise exception 'bad_request'; end if;
  perform pg_advisory_xact_lock(hashtext('place:' || p_map));
  key := 'place:' || me.id || ':' || left(p_idem, 60);
  if exists (select 1 from public.game_ledger where idem like key || '%') then return json_build_object('dup', true); end if;
  have_b := public._bal('player:' || me.id, 'item:' || p_item); have_h := public._bal('house', 'item:' || p_item);
  n := least(jsonb_array_length(p_pts), have_b + have_h, public._map_max(p_map) - (select count(*) from public.game_placed where map = p_map));
  if have_b + have_h < 1 then raise exception 'insufficient'; end if;
  if n < 1 then raise exception 'room_full'; end if;
  nb := least(n, have_b); nh := n - nb;
  nv := greatest(1, coalesce((d->>'variants')::int, 1));
  for pt in select x.value from jsonb_array_elements(p_pts) x limit n loop
    perform public._place_check(p_map, (pt->>'x')::real, (pt->>'y')::real, (pt->>'z')::real);
    insert into public.game_placed(map, item, x, y, z, rot, placed_by, state)
      values (p_map, p_item, (pt->>'x')::real, (pt->>'y')::real, (pt->>'z')::real, coalesce((pt->>'rot')::real, 0), me.id,
              case when d ? 'glb' then jsonb_build_object('v', least(nv - 1, greatest(0, coalesce((pt->>'v')::int, 0))), 's', least(1.5, greatest(0.5, coalesce((pt->>'s')::real, 1)))) else '{}'::jsonb end)
      returning id into nid;
    ids := ids || to_jsonb(nid); k := k + 1;
  end loop;
  if nb > 0 then perform public._grant('player:' || me.id, 'item:' || p_item, -nb, 'Đặt vào nhà: ' || (d->>'name'), 'place', p_map, me.id, key || ':b'); end if;
  if nh > 0 then perform public._grant('house', 'item:' || p_item, -nh, 'Đặt vào nhà: ' || (d->>'name'), 'place', p_map, me.id, key || ':h'); end if;
  for k in 1..n loop
    perform public._event(me.id, case when d ? 'glb' then 'planted' else 'placed' end, jsonb_build_object('item', p_item, 'map', p_map), key || ':e' || k, false);
  end loop;
  return json_build_object('ok', true, 'ids', ids, 'n', n, 'from', case when nh > 0 then 'house' else 'bag' end, 'left', have_b + have_h - n);
end $$;

-- game_place cũ (nội thất) đi qua cùng đường
create or replace function public.game_place(p_item text, p_map text, p_x real, p_y real, p_z real, p_rot real, p_idem text) returns json
language plpgsql security definer set search_path = public as $$
declare r json;
begin
  r := public.game_place_many(p_item, p_map, jsonb_build_array(jsonb_build_object('x', p_x, 'y', p_y, 'z', p_z, 'rot', p_rot)), p_idem);
  if (r::jsonb ? 'dup') then return r; end if;
  return json_build_object('ok', true, 'id', r::jsonb->'ids'->0, 'from', r::jsonb->'from');
end $$;

-- cất cả vùng (chổi xoá): trả về túi / kho
create or replace function public.game_place_pickup_many(p_ids jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players; r public.game_placed; dst text; n int := 0; kept int := 0; idv text;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  if jsonb_typeof(p_ids) <> 'array' or jsonb_array_length(p_ids) > 40 then raise exception 'bad_request'; end if;
  for idv in select x.value #>> '{}' from jsonb_array_elements(p_ids) x loop
    select * into r from public.game_placed where id = idv::uuid for update;
    if r.id is null then continue; end if;
    if not public._can_arrange(me.slot, r.map) then raise exception 'not_your_room'; end if;
    dst := case when public._room_for('player:' || me.id, 'item:' || r.item, 1) then 'player:' || me.id
                when public._room_for('house', 'item:' || r.item, 1) then 'house' else null end;
    if dst is null then kept := kept + 1; continue; end if;
    delete from public.game_placed where id = r.id;
    perform public._grant(dst, 'item:' || r.item, 1, 'Cất từ nhà: ' || coalesce(public._item_def(r.item)->>'name', r.item), 'place', r.map, me.id, 'pickup:' || r.id);
    n := n + 1;
  end loop;
  return json_build_object('ok', true, 'n', n, 'kept', kept);
end $$;

revoke all on function public.game_place2(text,text,real,real,real,real,jsonb,text), public.game_place_many(text,text,jsonb,text), public.game_place_pickup_many(jsonb) from public, anon;
grant execute on function public.game_place2(text,text,real,real,real,real,jsonb,text), public.game_place_many(text,text,jsonb,text), public.game_place_pickup_many(jsonb) to authenticated;
