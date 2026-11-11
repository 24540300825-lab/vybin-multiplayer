-- Phân công: team cho từng người (Đội ngũ → Chia team / Chia người theo team)
alter table public.wr_staff add column if not exists team text not null default '';
