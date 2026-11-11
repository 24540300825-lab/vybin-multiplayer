-- PHÒNG VY — WORKROOM · tài liệu theo mẫu (kịch bản, caption, tin bài, lịch công tác, timeline) + phiên bản để hoàn tác.
-- Chỉ THÊM bảng mới. Quyền: như mọi bảng wr_* — chỉ tài khoản trong wr_owner (RLS).
create table if not exists public.wr_docs (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('news_tv','news_en','video','caption','article','schedule','timeline')),
  title      text not null default '',
  event_id   uuid references public.wr_events(id) on delete set null,   -- có = thuộc "chương trình lớn"; trống = việc thường ngày
  data       jsonb not null default '{}'::jsonb,
  status     text not null default 'draft' check (status in ('draft','done')),
  stale      boolean not null default false,                            -- thông tin chương trình đã đổi sau khi viết
  drive      jsonb not null default '{}'::jsonb,                        -- {id, url, at}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wr_docs_kind_idx on public.wr_docs (kind, updated_at desc);
create index if not exists wr_docs_event_idx on public.wr_docs (event_id);
create table if not exists public.wr_doc_versions (
  id         uuid primary key default gen_random_uuid(),
  doc_id     uuid not null references public.wr_docs(id) on delete cascade,
  data       jsonb not null,
  label      text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists wr_doc_versions_doc_idx on public.wr_doc_versions (doc_id, created_at desc);
drop trigger if exists wr_docs_touch on public.wr_docs;
create trigger wr_docs_touch before update on public.wr_docs for each row execute function public.wr_touch();
do $$
declare t text;
begin
  foreach t in array array['wr_docs','wr_doc_versions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.wr_is_owner()) with check (public.wr_is_owner())', t || '_owner', t);
  end loop;
end $$;
-- Giai đoạn thử nghiệm: cho cả tài khoản của nhân vật BIN vào Workroom (Bin test giúp). Muốn khoá lại chỉ cho Vy:
--   delete from public.wr_owner where user_id in (select user_id from public.game_players where slot = 'bin');
insert into public.wr_owner(user_id, note)
  select user_id, 'tài khoản của nhân vật BIN (giai đoạn thử nghiệm)' from public.game_players where slot = 'bin'
  on conflict (user_id) do nothing;
