-- VY/BIN studio — CÂN BẰNG LẠI GIÁ + MỐC CẤP MỞ KHOÁ (chỉ sửa cấu hình, không đổi bảng/hàm)
-- Thu nhập tham chiếu: nhiệm vụ ngày ~45 Xu, tuần ~200 Xu, tập trung tối đa ~120 Xu/ngày, lên cấp 30 Xu → ~100–200 Xu/ngày.
-- Đồ nhỏ mua trong 1 ngày; đồ vừa vài ngày; đồ lớn (sofa, TV, ghế thư giãn) là mục tiêu dài, cần cấp cao.
-- Giá bán lại ≈ 20–25% giá mua (không lời khi mua rồi bán). Chế tạo là đường rẻ hơn nhưng cũng khoá theo cấp.

-- cửa hàng: giá + cấp (thay toàn bộ bảng shop bằng bảng mới; thứ tự = thứ tự hiển thị)
update public.game_config set value = '[
  {"item":"books","cat":"furniture","price":60},
  {"item":"cactus","cat":"furniture","price":80},
  {"item":"pillow_pink","cat":"furniture","price":90},
  {"item":"plant_mini","cat":"furniture","price":100},
  {"item":"basket","cat":"furniture","price":130},
  {"item":"pot_wood","cat":"furniture","price":150},
  {"item":"coat_rack","cat":"furniture","price":180,"lv":2},
  {"item":"stool","cat":"furniture","price":200,"lv":2},
  {"item":"chair_cushion","cat":"furniture","price":220,"lv":2},
  {"item":"frame","cat":"furniture","price":240,"lv":2},
  {"item":"rug_rect","cat":"furniture","price":260,"lv":3},
  {"item":"lamp","cat":"furniture","price":280,"lv":3},
  {"item":"speaker","cat":"furniture","price":300,"lv":3},
  {"item":"side_table","cat":"furniture","price":320,"lv":3},
  {"item":"coffee_table","cat":"furniture","price":360,"lv":4},
  {"item":"table_round","cat":"furniture","price":380,"lv":4},
  {"item":"lamp_floor","cat":"furniture","price":400,"lv":4},
  {"item":"shelf","cat":"furniture","price":420,"lv":4},
  {"item":"bookcase","cat":"furniture","price":600,"lv":5},
  {"item":"armchair","cat":"furniture","price":750,"lv":6},
  {"item":"tv_retro","cat":"furniture","price":900,"lv":7},
  {"item":"sofa_blue","cat":"furniture","price":1400,"lv":8},
  {"item":"fiber","cat":"material","price":8},
  {"item":"wood","cat":"material","price":12},
  {"item":"stone","cat":"material","price":12},
  {"item":"cloth","cat":"material","price":30,"lv":2,"week_limit":20},
  {"item":"metal","cat":"material","price":40,"lv":3,"week_limit":10}]'::jsonb
where key = 'shop';

-- giá bán lại
update public.game_config c set value = (
  select jsonb_agg(case when m.p is not null then x.value || jsonb_build_object('sell', m.p) else x.value end)
  from jsonb_array_elements(c.value) x
  left join (select key k, value::int p from jsonb_each_text('{
    "fiber":2,"wood":3,"stone":3,"cloth":7,"metal":9,
    "books":12,"cactus":16,"pillow_pink":18,"plant_mini":20,"basket":26,"pot_wood":30,
    "coat_rack":36,"stool":40,"chair_cushion":44,"frame":48,"rug_rect":52,"lamp":56,"speaker":60,"side_table":64,
    "coffee_table":72,"table_round":76,"lamp_floor":80,"shelf":84,"bookcase":120,"armchair":150,"tv_retro":180,"sofa_blue":280}'::jsonb)) m
    on m.k = x.value->>'id')
where c.key = 'items';

-- chế tạo: mốc cấp (công thức giữ nguyên nguyên liệu)
update public.game_config c set value = (
  select jsonb_agg(case when m.l is not null then (x.value - 'lv') || case when m.l > 1 then jsonb_build_object('lv', m.l) else '{}'::jsonb end else x.value end)
  from jsonb_array_elements(c.value) x
  left join (select key k, value::int l from jsonb_each_text('{
    "r_basket":1,"r_plant_mini":1,"r_pot":1,
    "r_pillow":2,"r_chair":2,"r_frame":2,"r_stool":2,
    "r_rug_rect":3,"r_lamp":3,"r_side_table":3,
    "r_coffee_table":4,"r_shelf":4}'::jsonb)) m
    on m.k = x.value->>'id')
where c.key = 'recipes';
