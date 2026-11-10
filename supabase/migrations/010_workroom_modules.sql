-- PHÒNG VY — WORKROOM · bảng cho các module (Milestone 2–8). Chỉ THÊM. Cùng quy tắc: chỉ chủ phòng đọc/ghi (wr_is_owner).

-- sự kiện: thêm thông tin dùng chung cho mọi module
alter table public.wr_events add column if not exists event_time text;                              -- "8h00"
alter table public.wr_events add column if not exists attendees  text;                              -- Thành phần
alter table public.wr_events add column if not exists brief      text;                              -- brief gốc (văn bản)
alter table public.wr_events add column if not exists assign     jsonb not null default '{}'::jsonb; -- {content, media, editor, dl_article, dl_edit, dl_video, approved}
alter table public.wr_events add column if not exists links      jsonb not null default '{}'::jsonb; -- {timeline_sheet:{id,url,synced_at,modified}, folder:{id,url}}
alter table public.wr_events add column if not exists needs_check jsonb not null default '[]'::jsonb; -- [{field, old, new, at}] thay đổi dữ kiện chưa rà lại

-- KNOWLEDGE HUB
create table if not exists public.wr_knowledge (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  category   text not null default 'reference' check (category in
             ('official','approved_article','article_sample','guideline','template','event_record','people','staff','timeline_template','media','ai_draft','archive','reference')),
  status     text not null default 'reference' check (status in ('official','reference','draft')),  -- official = được chủ phòng xác nhận làm chuẩn
  kind       text,                                   -- loại nội dung của bài mẫu: news / caption / timeline / schedule …
  source     text not null default 'upload',         -- drive / upload / workroom
  file_id    text, url text, version text,
  content    text not null default '',
  meta       jsonb not null default '{}'::jsonb,
  event_id   uuid references public.wr_events(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists wr_knowledge_cat_idx on public.wr_knowledge (category, status);

-- BÀI VIẾT + phiên bản + biên tập
create table if not exists public.wr_articles (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid references public.wr_events(id) on delete set null,
  kind       text not null default 'news',
  title      text not null default '',
  body       text not null default '',               -- HTML
  status     text not null default 'draft' check (status in ('draft','review','approved','published')),
  origin     text not null default 'manual' check (origin in ('manual','ai','import')),
  sources    jsonb not null default '[]'::jsonb,     -- nguồn AI đã dùng: [{id,name,status,version}]
  doc        jsonb not null default '{}'::jsonb,     -- {id,url,exported_at,modified}
  stale      jsonb not null default '[]'::jsonb,     -- dữ kiện sự kiện đã đổi sau khi viết
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists wr_articles_event_idx on public.wr_articles (event_id);
create table if not exists public.wr_versions (
  id         uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.wr_articles(id) on delete cascade,
  label      text not null default '', title text not null default '', body text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists wr_versions_article_idx on public.wr_versions (article_id, created_at desc);
create table if not exists public.wr_reviews (
  id         uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.wr_articles(id) on delete cascade,
  reader     jsonb not null default '{}'::jsonb,     -- đánh giá dưới góc nhìn độc giả
  items      jsonb not null default '[]'::jsonb,     -- [{id,type,quote,suggestion,reason,state}]
  model      text,
  created_at timestamptz not null default now()
);

-- TIMELINE (theo mẫu "Timeline truyền thông")
create table if not exists public.wr_timeline (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.wr_events(id) on delete cascade,
  pos        int  not null default 0,
  phase      text not null default 'truoc' check (phase in ('truoc','trong','sau')),
  content    text not null default '', format text not null default '',
  deadline   text not null default '', publish_at text not null default '', channel text not null default '',
  a_content  text not null default '', a_media text not null default '', a_editor text not null default '',
  note       text not null default '', done boolean not null default false,
  origin     text not null default 'manual',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists wr_timeline_event_idx on public.wr_timeline (event_id, pos);

-- NHÂN SỰ
create table if not exists public.wr_staff (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  roles      jsonb not null default '[]'::jsonb,     -- ["content","media","editor"]
  skills     text not null default '',
  busy       jsonb not null default '[]'::jsonb,     -- [{date:"2026-10-12", from:"08:00", to:"11:00", note}]
  confirmed  boolean not null default false,         -- false = trích từ tài liệu mẫu, chưa được chủ phòng xác nhận
  active     boolean not null default true,
  source     text not null default 'manual',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- AI: hội thoại + nhật ký xử lý
create table if not exists public.wr_chats (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default 'Cuộc trò chuyện mới',
  event_id   uuid references public.wr_events(id) on delete set null,
  messages   jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.wr_ai_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  provider   text not null, model text, task text,
  ms         int, ok boolean not null default true, error text,
  tokens_in  int, tokens_out int
);
create index if not exists wr_ai_log_at_idx on public.wr_ai_log (at desc);

do $$
declare t text;
begin
  foreach t in array array['wr_knowledge','wr_articles','wr_versions','wr_reviews','wr_timeline','wr_staff','wr_chats','wr_ai_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.wr_is_owner()) with check (public.wr_is_owner())', t || '_owner', t);
  end loop;
  foreach t in array array['wr_knowledge','wr_articles','wr_timeline','wr_staff','wr_chats'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.wr_touch()', t || '_touch', t);
  end loop;
end $$;
