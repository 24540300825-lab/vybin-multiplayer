-- VY/BIN studio — PHÒNG GAME (nhà L2): kết quả các trận đấu 2 người + cược xu (Thách đấu) + bảng điểm VY–BIN.
-- Chỉ THÊM (bảng + hàm mới). Không có policy: trình duyệt chỉ làm việc qua RPC bên dưới (giống 003).
create table if not exists public.game_arena (
  id          uuid primary key default gen_random_uuid(),
  match_key   text not null unique,                 -- khoá trận (2 máy cùng báo 1 trận → chỉ ghi 1 lần)
  game        text not null,                        -- hockey | caro | bball | quiz | …
  mode        text not null check (mode in ('fr','bet')),
  bet         int  not null default 0,
  xu          int  not null default 0,                 -- xu thật đã chuyển (≤ bet, ≤ số xu người thua có)
  winner      text check (winner in ('bin','vy')),  -- null = hoà
  score       jsonb not null default '{}'::jsonb,   -- {"bin":7,"vy":5,...}
  reported_by uuid references public.game_players(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists game_arena_created on public.game_arena(created_at desc);
alter table public.game_arena enable row level security;

-- Báo kết quả 1 trận. Thách đấu: người thua chuyển xu cho người thắng (tối đa số xu người thua đang có, trần 500).
create or replace function public.game_arena_report(p_key text, p_game text, p_mode text, p_bet int, p_winner text,
                                                    p_score jsonb default '{}'::jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players; w public.game_players; l public.game_players; bal bigint; amt bigint := 0; ins boolean;
        b int := case when p_mode = 'bet' then greatest(0, least(coalesce(p_bet, 0), 500)) else 0 end;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  if p_key is null or length(p_key) < 6 then raise exception 'bad_key'; end if;
  if p_game !~ '^[a-z0-9_]{2,24}$' then raise exception 'bad_game'; end if;
  if p_mode not in ('fr','bet') then raise exception 'bad_mode'; end if;
  if p_winner is not null and p_winner not in ('bin','vy') then raise exception 'bad_winner'; end if;
  insert into public.game_arena(match_key, game, mode, bet, winner, score, reported_by)
    values (left(p_key, 80), p_game, p_mode, b, p_winner, coalesce(p_score, '{}'::jsonb), me.id)
    on conflict (match_key) do nothing;
  ins := found;
  if ins and b > 0 and p_winner is not null then
    select * into w from public.game_players where slot = p_winner;
    select * into l from public.game_players where slot <> p_winner limit 1;
    if w.id is not null and l.id is not null then
      select amount into bal from public.game_balances where owner = 'player:' || l.id and currency = 'xu';
      amt := least(b, coalesce(bal, 0));
      if amt > 0 then
        perform public._grant('player:' || l.id, 'xu', -amt, 'arena_lose', 'arena', p_game, me.id, 'arena:' || left(p_key, 80) || ':l');
        perform public._grant('player:' || w.id, 'xu',  amt, 'arena_win',  'arena', p_game, me.id, 'arena:' || left(p_key, 80) || ':w');
        update public.game_arena set xu = amt where match_key = left(p_key, 80);
      end if;
    end if;
  end if;
  return json_build_object('ok', true, 'new', ins, 'xu', amt);
end $$;

-- Bảng điểm: tổng + theo trò + tuần này + 20 trận gần nhất.
create or replace function public.game_arena_board() returns json
language plpgsql security definer set search_path = public as $$
declare me public.game_players;
begin
  me := public._me(); if me.id is null then raise exception 'no_player'; end if;
  return json_build_object(
    'total', (select json_build_object('bin', count(*) filter (where winner = 'bin'), 'vy', count(*) filter (where winner = 'vy'),
                                       'draw', count(*) filter (where winner is null),
                                       'xu_bin', coalesce(sum(xu) filter (where winner = 'bin'), 0),
                                       'xu_vy', coalesce(sum(xu) filter (where winner = 'vy'), 0)) from public.game_arena),
    'week',  (select json_build_object('bin', count(*) filter (where winner = 'bin'), 'vy', count(*) filter (where winner = 'vy'))
                from public.game_arena where created_at >= date_trunc('week', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh'),
    'games', (select coalesce(json_agg(x order by x.n desc), '[]'::json) from (
                select game, count(*) n, count(*) filter (where winner = 'bin') bin, count(*) filter (where winner = 'vy') vy,
                       count(*) filter (where winner is null) draw, max(created_at) last from public.game_arena group by game) x),
    'recent', (select coalesce(json_agg(r), '[]'::json) from (
                select game, mode, bet, xu, winner, score, created_at from public.game_arena order by created_at desc limit 20) r));
end $$;

revoke all on function public.game_arena_report(text,text,text,int,text,jsonb), public.game_arena_board() from public, anon;
grant execute on function public.game_arena_report(text,text,text,int,text,jsonb), public.game_arena_board() to authenticated;
