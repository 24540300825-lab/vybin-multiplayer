-- nhật ký AI: thêm số token (code đã gửi từ trước → insert bị lỗi im lặng)
alter table public.wr_ai_log add column if not exists tokens_in integer, add column if not exists tokens_out integer;
