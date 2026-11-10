-- PHÒNG VY — WORKROOM · nền dữ liệu (Milestone 1)
-- Chỉ THÊM bảng mới (tiền tố wr_), không đụng bảng game_* / cc_* / rooms. Chạy lại nhiều lần an toàn.
-- Quyền: chỉ MỘT tài khoản chủ (dòng trong wr_owner) đọc/ghi được. Bin và mọi tài khoản khác bị RLS chặn ở máy chủ,
-- không phụ thuộc việc giao diện có ẩn nút hay không.

-- ============ CHỦ PHÒNG ============
create table if not exists public.wr_owner (
  user_id    uuid primary key,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.wr_owner enable row level security;   -- không có policy nào => client không đọc/ghi trực tiếp được

-- Chủ phòng = tài khoản đang gắn với nhân vật VY (không ghi cứng id / email vào mã).
insert into public.wr_owner(user_id, note)
  select user_id, 'tài khoản của nhân vật VY' from public.game_players where slot = 'vy'
  on conflict (user_id) do nothing;

create or replace function public.wr_is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.wr_owner o where o.user_id = auth.uid());
$$;
revoke all on function public.wr_is_owner() from public, anon;
grant execute on function public.wr_is_owner() to authenticated;

-- ============ SỰ KIỆN / DỰ ÁN (bản ghi trung tâm mà mọi module dùng chung) ============
create sequence if not exists public.wr_event_seq;
create table if not exists public.wr_events (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique default ('EVENT-' || lpad(nextval('public.wr_event_seq')::text, 3, '0')),
  name       text not null check (char_length(btrim(name)) between 1 and 200),
  stage      text not null default 'intake' check (stage in
             ('intake','brief','planning','assignment','production','editorial','approval','scheduling','publishing','archive')),
  event_date date,
  venue      text,
  organizer  text,
  note       text,
  facts      jsonb not null default '{}'::jsonb,     -- dữ kiện chính thức đã được chủ phòng xác nhận (milestone 3+)
  is_demo    boolean not null default false,          -- dữ liệu mẫu phải gắn nhãn DEMO
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ CÔNG VIỆC ============
create table if not exists public.wr_tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 1 and 300),
  description text,
  event_id    uuid references public.wr_events(id) on delete set null,
  owner_name  text,                                    -- người phụ trách (tên hiển thị; nối danh bạ nhân sự ở milestone 7)
  deadline    timestamptz,
  priority    text not null default 'normal' check (priority in ('low','normal','high')),
  status      text not null default 'todo' check (status in ('todo','doing','done')),
  source      text not null default 'manual' check (source in ('manual','chat','timeline','editorial','assignment')),
  ref         jsonb not null default '{}'::jsonb,      -- liên kết: tài liệu / mục timeline / phân công
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists wr_tasks_event_idx on public.wr_tasks (event_id);
create index if not exists wr_tasks_open_idx  on public.wr_tasks (status, deadline);

-- ============ NHẬT KÝ HOẠT ĐỘNG ============
create table if not exists public.wr_activity (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  kind       text not null,
  summary    text not null,
  event_id   uuid references public.wr_events(id) on delete set null,
  ref        jsonb not null default '{}'::jsonb
);
create index if not exists wr_activity_at_idx on public.wr_activity (at desc);

-- ============ CÀI ĐẶT WORKSPACE (1 dòng) ============
create table if not exists public.wr_settings (
  id         boolean primary key default true check (id),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ============ updated_at tự động ============
create or replace function public.wr_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists wr_events_touch on public.wr_events;
create trigger wr_events_touch before update on public.wr_events for each row execute function public.wr_touch();
drop trigger if exists wr_tasks_touch on public.wr_tasks;
create trigger wr_tasks_touch before update on public.wr_tasks for each row execute function public.wr_touch();
drop trigger if exists wr_settings_touch on public.wr_settings;
create trigger wr_settings_touch before update on public.wr_settings for each row execute function public.wr_touch();

-- ============ RLS: chỉ chủ phòng ============
do $$
declare t text;
begin
  foreach t in array array['wr_events','wr_tasks','wr_activity','wr_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.wr_is_owner()) with check (public.wr_is_owner())', t || '_owner', t);
  end loop;
end $$;
revoke all on table public.wr_owner from anon, authenticated;
revoke all on sequence public.wr_event_seq from anon;
grant usage on sequence public.wr_event_seq to authenticated;
