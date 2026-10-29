-- VY/BIN studio — schema v1
-- Chạy toàn bộ file này trong Supabase Dashboard → SQL Editor (hoặc `supabase db push`).
-- Idempotent: chạy lại nhiều lần an toàn.

-- ============ TABLES ============
create table if not exists public.rooms (
  code        text primary key check (code ~ '^[a-z0-9_-]{1,32}$'),
  map_id      text not null default 'house' check (map_id ~ '^[a-z0-9_]{1,32}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.room_slots (
  room_code   text not null references public.rooms(code) on delete cascade,
  slot        text not null check (slot in ('bin','vy')),
  user_id     uuid not null,
  claimed_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  primary key (room_code, slot),
  unique (room_code, user_id)
);

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  room_code   text not null references public.rooms(code) on delete cascade,
  user_id     uuid not null,
  slot        text not null check (slot in ('bin','vy')),
  body        text not null check (char_length(body) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index if not exists messages_room_time_idx on public.messages (room_code, created_at desc);

-- ============ HELPERS ============
create or replace function public.is_room_member(p_room text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.room_slots s
                 where s.room_code = p_room and s.user_id = auth.uid()
                   and s.last_seen > now() - interval '5 minutes');
$$;
revoke all on function public.is_room_member(text) from public;
grant execute on function public.is_room_member(text) to authenticated;

-- gán slot server-side (client không giả mạo được người gửi)
create or replace function public.messages_fill() returns trigger
language plpgsql security definer set search_path = public as $$
declare s text;
begin
  select slot into s from public.room_slots where room_code = new.room_code and user_id = auth.uid();
  if s is null then raise exception 'not_in_room'; end if;
  new.user_id := auth.uid();
  new.slot := s;
  new.body := btrim(new.body);
  if char_length(new.body) = 0 then raise exception 'empty'; end if;
  return new;
end $$;
drop trigger if exists messages_fill_trg on public.messages;
create trigger messages_fill_trg before insert on public.messages
  for each row execute function public.messages_fill();

-- ============ RPC ============
-- Giữ chỗ nguyên tử: người vào trước = BIN, người sau = VY. Gọi lại = khôi phục slot cũ.
create or replace function public.claim_slot(p_room text, p_default_map text default 'house')
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s text; m text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_room is null or p_room !~ '^[a-z0-9_-]{1,32}$' then raise exception 'bad_room'; end if;
  perform pg_advisory_xact_lock(hashtext('room:' || p_room));
  insert into public.rooms(code, map_id)
    values (p_room, case when p_default_map ~ '^[a-z0-9_]{1,32}$' then p_default_map else 'house' end)
    on conflict (code) do nothing;
  -- dọn slot cũ (mất kết nối > 90s)
  delete from public.room_slots
   where room_code = p_room and user_id <> uid and last_seen < now() - interval '90 seconds';
  select slot into s from public.room_slots where room_code = p_room and user_id = uid;
  if s is null then
    if not exists (select 1 from public.room_slots where room_code = p_room and slot = 'bin') then s := 'bin';
    elsif not exists (select 1 from public.room_slots where room_code = p_room and slot = 'vy') then s := 'vy';
    else raise exception 'room_full'; end if;
    insert into public.room_slots(room_code, slot, user_id) values (p_room, s, uid);
  else
    update public.room_slots set last_seen = now() where room_code = p_room and user_id = uid;
  end if;
  select map_id into m from public.rooms where code = p_room;
  return json_build_object('slot', s, 'map', m, 'user_id', uid);
end $$;

create or replace function public.touch_slot(p_room text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.room_slots set last_seen = now() where room_code = p_room and user_id = auth.uid();
  return found;
end $$;

create or replace function public.leave_slot(p_room text) returns void
language sql security definer set search_path = public as $$
  delete from public.room_slots where room_code = p_room and user_id = auth.uid();
$$;

create or replace function public.set_room_map(p_room text, p_map text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_room_member(p_room) then raise exception 'not_in_room'; end if;
  if p_map !~ '^[a-z0-9_]{1,32}$' then raise exception 'bad_map'; end if;
  update public.rooms set map_id = p_map, updated_at = now() where code = p_room;
  return p_map;
end $$;

-- chỉ user đã đăng nhập (anonymous cũng là authenticated) được gọi RPC
revoke all on function public.claim_slot(text,text), public.touch_slot(text), public.leave_slot(text), public.set_room_map(text,text) from public, anon;
grant execute on function public.claim_slot(text,text), public.touch_slot(text), public.leave_slot(text), public.set_room_map(text,text) to authenticated;

-- ============ RLS ============
alter table public.rooms      enable row level security;
alter table public.room_slots enable row level security;
alter table public.messages   enable row level security;

drop policy if exists rooms_read on public.rooms;
create policy rooms_read on public.rooms for select to authenticated using (public.is_room_member(code));

drop policy if exists slots_read on public.room_slots;
create policy slots_read on public.room_slots for select to authenticated using (public.is_room_member(room_code));

drop policy if exists msg_read on public.messages;
create policy msg_read on public.messages for select to authenticated using (public.is_room_member(room_code));

drop policy if exists msg_insert on public.messages;
create policy msg_insert on public.messages for insert to authenticated
  with check (public.is_room_member(room_code));
-- không có policy update/delete/insert cho rooms & room_slots => chỉ RPC (security definer) thay đổi được

-- ============ REALTIME ============
-- Chat: postgres_changes (RLS áp dụng)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- Broadcast/Presence ở kênh private 'room:<code>': chỉ thành viên phòng được nghe/gửi
drop policy if exists "room members receive" on realtime.messages;
create policy "room members receive" on realtime.messages for select to authenticated
  using (
    realtime.topic() like 'room:%'
    and public.is_room_member(split_part(realtime.topic(), ':', 2))
  );
drop policy if exists "room members send" on realtime.messages;
create policy "room members send" on realtime.messages for insert to authenticated
  with check (
    realtime.topic() like 'room:%'
    and public.is_room_member(split_part(realtime.topic(), ':', 2))
  );
