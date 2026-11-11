-- PHÒNG VY — WORKROOM · bàn giao & nguồn.
-- status: Nháp → Gửi duyệt → Cần sửa → Đã duyệt → Đã đăng.
-- gdoc: bản Google Docs/Sheets {id,url,at}; handoff: {to:[email], deadline, note, feedback:[{at,who,text,done}], sent:[{at,to,how}]}
-- sources: nguồn Vy nạp vào (chữ đã trích, ảnh thu nhỏ) để AI dựng khung và viết lại.
alter table public.wr_docs drop constraint if exists wr_docs_status_check;
update public.wr_docs set status = 'approved' where status = 'done';
alter table public.wr_docs add constraint wr_docs_status_check check (status in ('draft','review','revise','approved','published'));
alter table public.wr_docs add column if not exists gdoc jsonb not null default '{}'::jsonb;
alter table public.wr_docs add column if not exists handoff jsonb not null default '{}'::jsonb;
alter table public.wr_docs add column if not exists sources jsonb not null default '[]'::jsonb;
