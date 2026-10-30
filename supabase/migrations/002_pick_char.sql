-- Màn CHỌN NHÂN VẬT: client tự chọn BIN/VY (lưu trong trình duyệt) thay vì "vào trước = BIN, vào sau = VY".
-- THÊM MỚI, không đụng claim_slot cũ => bản client cũ vẫn chạy bình thường.

-- Xem slot nào đang có NGƯỜI KHÁC giữ (còn sống trong 90s) để màn chọn khoá nhân vật đó. Chỉ trả tên slot.
create or replace function public.peek_slots(p_room text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_room is null or p_room !~ '^[a-z0-9_-]{1,32}$' then raise exception 'bad_room'; end if;
  return coalesce((select json_agg(slot order by slot) from public.room_slots
                    where room_code = p_room and user_id <> uid and last_seen >= now() - interval '90 seconds'), '[]'::json);
end $$;

-- Giữ chỗ theo nhân vật đã chọn. Đã có chỗ cùng slot => chỉ làm mới; đổi nhân vật được nếu slot kia đang trống.
-- Slot mong muốn đang có người khác giữ => lỗi 'slot_taken'.
create or replace function public.claim_slot_as(p_room text, p_pref text, p_default_map text default 'house')
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s text; m text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_room is null or p_room !~ '^[a-z0-9_-]{1,32}$' then raise exception 'bad_room'; end if;
  if p_pref is null or p_pref not in ('bin','vy') then raise exception 'bad_pref'; end if;
  perform pg_advisory_xact_lock(hashtext('room:' || p_room));
  insert into public.rooms(code, map_id)
    values (p_room, case when p_default_map ~ '^[a-z0-9_]{1,32}$' then p_default_map else 'house' end)
    on conflict (code) do nothing;
  delete from public.room_slots
   where room_code = p_room and user_id <> uid and last_seen < now() - interval '90 seconds';
  select slot into s from public.room_slots where room_code = p_room and user_id = uid;
  if s is not null and s = p_pref then
    update public.room_slots set last_seen = now() where room_code = p_room and user_id = uid;
  else
    if exists (select 1 from public.room_slots where room_code = p_room and slot = p_pref and user_id <> uid) then
      raise exception 'slot_taken';
    end if;
    delete from public.room_slots where room_code = p_room and user_id = uid;
    insert into public.room_slots(room_code, slot, user_id) values (p_room, p_pref, uid);
  end if;
  select map_id into m from public.rooms where code = p_room;
  return json_build_object('slot', p_pref, 'map', m, 'user_id', uid);
end $$;

revoke all on function public.peek_slots(text), public.claim_slot_as(text,text,text) from public, anon;
grant execute on function public.peek_slots(text), public.claim_slot_as(text,text,text) to authenticated;
