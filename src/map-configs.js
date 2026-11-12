// Cấu hình "hình học/gameplay" riêng cho từng map — DỮ LIỆU THUẦN, không có logic.
// Thêm map mới: thêm 1 khối vào đây (cùng id với MAP_LIST trong maps.js). Ý nghĩa các trường: xem docs/EXTENDING.md.
import {houseLevel} from './house.js';
export const MAP_CONFIGS = {
  // ===== 3 phòng trong nhà (đi vào từ vườn). Toạ độ phòng luôn x 0..10, z -8..0 (mặt cắt mở về phía camera +z) =====
  // ext: dùng lại map ngoài vườn quanh nhà — dx/dz dời ngoại cảnh cho khớp (phòng Vy/Bin nằm lệch ±10m so với phòng khách),
  //      hide = các mảng vỏ nhà của CHÍNH cánh đang đứng (bị cắt để nhìn vào), roofX = tâm mái cánh đó (mái dựng bằng instancing).
  // triCol: va chạm theo tam giác thật (đồ đạc gộp khối). tv: {node, mat?, inset} mặt màn TV (inset = khoảng viền đen chừa quanh mặt sáng); sofa: {node, seatY} sofa liền khối → tự chia 2 chỗ ngồi.
  // doors: ghim chuyển map {node, to, label}; spawnFrom[mapVừaRời] = [x, z, yaw, tầng(0/1)] — xuất hiện ngay chỗ cửa đã đi qua.
  living:{name:'Phòng khách',wallMats:['CH_wall','CH_plaster'],hide:/^Plane002$/,chairFlip:true,glass:{front:{x0:0.15,x1:9.85,z:0.25,y0:0,y1:5.9},top:{x0:0.15,x1:9.85,z0:-7.85,z1:0.25,y:5.9}},treadNames:['Stair_Treads','StairR_Treads'],mezz:['Mezz_Floor','Mezz_Ext_Floor'],seat:'Chair_Seat',chair:/^Desk_Chair\d*$/,walk0:[0.3,9.7,-7.6,-0.2],l1:[0.22,9.78,-7.6,-4.25],cl1:[0.4,9.6,-7.6,-4.3],garden:false,tint:{CH_floor:0xdcb88e},gtex:'Plane',out:/^__none__$/,lift:0,
    ext:{dx:0,dz:0,hide:/^(Door_Main|Entrance_Hood|Facade_Living_Front|Glass_Living_Front|Interior_Living|Roof_Living)/,roofX:5,hideL2:/^(L2_Living$|L2_Upgrade_Living_Front|L2_Upgrade_Entrance)/},
    // cầu thang xoắn trên gác lên Phòng Game (vẽ trong ngoại cảnh L2: L2_Link_Living_Game) · lỗ cầu thang xuống Rạp phim (L3_Link_Living_Cinema)
    doorsL2:[{at:[3.35,4.6,-6.45],to:'game',label:'Lên Phòng Game'}],
    doorsL3:[{at:[9.45,1.0,-5.0],to:'cinema',label:'Xuống Rạp phim (tầng hầm, dưới gầm cầu thang)'}],
    spots:[{node:'Cooktop',label:'Nấu ăn cùng nhau'}],
    doors:[{node:'Doormat',to:'exterior',label:'Ra vườn'},{node:'GD_Door_Entrance_Leaf',to:'bin',label:'Phòng Bin'},{node:'GD_Door_Entrance_Leaf001',to:'vy',label:'Phòng Vy'}],
    spawnFrom:{exterior:[4.2,-0.9,Math.PI,0],bin:[0.85,-6.95,Math.PI/2,1],vy:[9.15,-6.95,-Math.PI/2,1],game:[4.45,-6.45,0,1],cinema:[9.3,-5.8,0,0]}},
  vy:{name:'Phòng Vy',triCol:true,wallMats:['FWS_wall'],glass:{front:{x0:0.15,x1:9.85,z:1.12,y0:0,y1:5.9},top:{x0:0.15,x1:9.85,z0:-7.85,z1:1.12,y:5.9}},seam:[{x0:0,x1:0.15,z0:-0.02,z1:1.12,y0:0,y1:6.28,inner:'FWS_wall',side:'px'},{x0:9.85,x1:10.05,z0:-0.02,z1:1.12,y0:0,y1:6.28,inner:'FWS_wall',side:'nx'}],tv:{node:'TV_Unit001',inset:0},sofa:{node:'Sofa',seatY:0.45},treadNames:['Stair'],mezz:['Mezzanine'],seat:'Desk_Chair',chair:/^Desk_Chair$/,chairToward:'Desk',walk0:[0.3,9.7,-7.6,0.85],l1:[0.22,9.78,-7.6,-4.0],cl1:[0.4,9.6,-7.6,-4.05],garden:false,gtex:'Plane',out:/^__none__$/,lift:0,
    ext:{dx:-10,dz:2,hide:/^(Facade_Vy_Front|Facade_Vy_Nook|Facade_Vy_Sides_Back|Glass_Vy_Front|Glass_Vy_Nook|Glass_Vy_Sides_Back|Interior_Vy)/,roofX:15,hideL2:/^(L2_Vy$|L2_Upgrade_Vy_Front)/,hideL3:/^L3_Library/},
    doorsL2:[{at:[2.85,4.6,-5.9],to:'memory',label:'Lên Phòng kỷ niệm'}],
    spots:[{node:'Cooktop',label:'Nấu ăn cùng nhau'}],
    doors:[{node:'Door_Entrance_Leaf',to:'living',label:'Phòng khách'}],
    spawnFrom:{memory:[3.9,-5.9,0,1],default:[0.85,-4.95,Math.PI/2,1]}},
  bin:{name:'Phòng Bin',camMirror:true,triCol:true,wallMats:['CH_wall'],glass:{front:{x0:0.15,x1:9.85,z:0.45,y0:0,y1:5.9},top:{x0:0.15,x1:9.85,z0:-7.85,z1:0.45,y:5.9}},seam:[{x0:9.85,x1:10.05,z0:-0.02,z1:0.88,y0:0,y1:6.28,inner:'CH_wall',side:'nx'},{x0:-0.05,x1:0.15,z0:-0.02,z1:0.45,y0:0,y1:6.28,inner:'CH_wall',side:'px'}],hide:/^Roof$/,cutTop:{node:/^Front_Frame$/,y:5.5},tv:{node:'TV_Unit',mat:'CH_screen',inset:0},sofa:{node:'Sofa',seatY:0.45},treadNames:['Stair'],mezz:['Mezzanine'],seat:'Desk_Chair',chair:/^Desk_Chair$/,chairToward:'Desk',walk0:[0.3,9.7,-7.6,0.18],l1:[0.22,9.78,-7.6,-4.0],cl1:[0.4,9.6,-7.6,-4.05],garden:false,gtex:'Plane',out:/^__none__$/,lift:0,
    ext:{dx:10,dz:2,hide:/^(Facade_Bin_Front|Facade_Bin_Nook|Facade_Bin_Sides_Back|Glass_Bin_Front|Glass_Bin_Nook|Glass_Bin_Sides_Back|Interior_Bin)/,roofX:-5,hideL2:/^(L2_Bin$|L2_Upgrade_Bin_Front)/},
    doorsL2:[{at:[4.7,4.6,-6.2],to:'workshop',label:'Lên Xưởng thủ công'}],
    spots:[{node:'Cooktop',label:'Nấu ăn cùng nhau'}],
    doors:[{node:'Door_Entrance_Leaf',to:'living',label:'Phòng khách'}],
    spawnFrom:{workshop:[5.75,-6.2,0,1],default:[9.15,-4.95,-Math.PI/2,1]}},
  // ===== NHÀ L2 — tầng trên (chỉ mở khi nhà ≥ L2, xem src/house.js). Phòng 1 tầng (không gác/cầu thang), sàn y=0, mặt trước z=0 mở về camera.
  // Cùng 1 ngoại cảnh map-exterior-l2 cho mọi map; ext.dx/dy/dz đặt phòng đúng vị trí trong nhà L2 (dy = cao độ tầng). hide: tường trước/vỏ của chính phòng + phần nhà phía trên; roofX: mái ngói (instancing) của chính phòng.
  // spots: điểm hoạt động (ghim ⭐) — trò chơi/tiện ích làm sau, hiện tại báo "Sắp có".
  // Phòng Game: phủ hết mái phòng khách, cao 2 tầng (gác lửng phía sau ở +2.8 m, cầu thang thẳng bên phải). Các máy: ghim ⭐ "Sắp có" (trò chơi làm sau).
  game:{name:'Phòng Game',triCol:true,flat:true,wallMats:['L2_Wall_Plaster','L2_Wall_Teal'],glass:{front:{x0:0.2,x1:10.3,z:0.02,y0:0,y1:5.6},top:{x0:0.2,x1:10.3,z0:-8.93,z1:0.02,y:5.6}},
    tv:{node:'TV_Unit',mat:'CH_screen',inset:0},sofa:{node:'Sofa',seatY:0.45},treadNames:['Stair'],mezz:['Mezzanine'],
    walk0:[0.35,10.15,-8.85,-0.3],l1:[0.25,10.25,-8.85,-5.05],cl1:[0.4,10.1,-8.8,-5.1],garden:false,gtex:'Plane',out:/^__none__$/,lift:0,
    ext:{dx:0.25,dy:-7.12,dz:-0.88,hide:/^(L2_Game_|L2_Greenhouse|L2_Roof_|L2_Link_Living_Game)/},
    // lỗ cầu thang xoắn xuống phòng khách (khớp cầu thang trên gác phòng khách) · cầu thang xoắn trên gác lên sân thượng / Vườn kính
    doors:[{at:[3.6,1.3,-7.33],to:'living',label:'Xuống phòng khách'},{node:'Spiral_Stair',to:'greenhouse',label:'Lên Vườn kính'}],
    spots:[{node:'Air_Hockey',label:'Khúc côn cầu',id:'hockey'},{node:'Caro_Table',label:'Cờ caro',id:'caro'},
      {node:'Basketball_1',label:'Bóng rổ',id:'bball'},{node:'Basketball_2',label:'Bóng rổ',id:'bball'},{node:'Quiz_Booth',label:'Ai hiểu ai hơn',id:'quiz'},
      {node:'Score_Board',label:'Bảng điểm VY–BIN',id:'board'},
      {node:'Arcade_Pong',label:'Pong'},{node:'Arcade_Tetris',label:'Xếp gạch đối kháng'},{node:'Arcade_Snake',label:'Rắn săn mồi đôi'},
      {node:'Dance_Machine',label:'Máy nhảy'},{node:'Connect4',label:'Thả cờ 4 hàng'},{node:'Dartboard',label:'Phi tiêu'},
      {node:'Foosball',label:'Bi lắc'},{node:'Card_Table',label:'Cờ vua'}],
    spawnFrom:{greenhouse:[1.7,-7.4,Math.PI/2,1],default:[3.6,-6.3,0,0]}},
  workshop:{name:'Xưởng thủ công',triCol:true,flat:true,wallMats:['L2_Wall_Plaster'],glass:{front:{x0:0.2,x1:8.3,z:0.02,y0:0,y1:3.25},top:{x0:0.2,x1:8.3,z0:-5.05,z1:0.02,y:3.25}},
    treadNames:[],mezz:[],walk0:[0.35,8.15,-4.85,3.8],l1:[0,0,0,0],cl1:[0,0,0,0],garden:false,gtex:'Plane',out:/^__none__$/,lift:0,
    ext:{dx:9.35,dy:-6.52,dz:5.0,hide:/^(L2_Workshop_|L2_Bin_Pergola|L2_Link_Bin_Workshop)/},camMirror:true,
    doors:[{at:[4.05,1.3,-3.2],to:'bin',label:'Xuống phòng Bin'}],
    spots:[{node:'Craft_Table',label:'Chế tạo',open:'craft'},{node:'Easel',label:'Vẽ tranh cùng nhau'},{at:[4.2,1.25,1.95],label:'Bữa tối đôi'}],
    spawnFrom:{default:[5.25,-3.2,0,0]}},
  memory:{name:'Phòng kỷ niệm',triCol:true,flat:true,wallMats:['L2_Wall_Plaster','L2_Wall_Blush'],glass:{front:{x0:0.2,x1:8.3,z:0.02,y0:0,y1:3.25},top:{x0:0.2,x1:8.3,z0:-5.05,z1:0.02,y:3.25}},
    sofa:{node:'Sofa',seatY:0.45},treadNames:[],mezz:[],seat:'Desk_Chair',chair:/^Desk_Chair$/,chairToward:'Desk',
    walk0:[0.35,8.15,-4.85,3.8],l1:[0,0,0,0],cl1:[0,0,0,0],garden:false,gtex:'Plane',out:/^__none__$/,lift:0,
    ext:{dx:-10.85,dy:-6.52,dz:5.0,hide:/^(L2_Memory_|L2_Link_Vy_Memory)/,hideL3:/^L3_Library/},
    doorsL3:[{at:[5.15,1.6,-1.1],to:'library',label:'Lên Thư viện'}],
    doors:[{at:[2.0,1.3,-2.9],to:'vy',label:'Xuống phòng Vy'}],
    spots:[{node:'Memory_Wall',label:'Tường kỷ niệm'},{node:'Mailbox',label:'Hộp thư'},{node:'Savings_Jar',label:'Quỹ chung'}],
    spawnFrom:{library:[5.15,-2.1,0,0],default:[2.0,-1.8,0,0]}},
  greenhouse:{name:'Vườn kính',triCol:true,flat:true,wallMats:[],glass:{front:{x0:0.1,x1:6.1,z:0.02,y0:0,y1:2.9},top:{x0:0.1,x1:6.1,z0:-3.75,z1:0.02,y:2.9}},
    treadNames:[],mezz:[],walk0:[0.3,5.9,-3.1,2.0],l1:[0,0,0,0],cl1:[0,0,0,0],garden:false,gtex:'Plane',out:/^__none__$/,lift:0,
    ext:{dx:-1.9,dy:-12.94,dz:4.3,hide:/^L2_Greenhouse/},
    doors:[{at:[-1.25,1.0,-3.02],to:'game',label:'Xuống cầu thang (Phòng Game)'}],   // nắp cầu thang xoắn trên sân thượng, cạnh nhà kính
    spots:[{node:'Planter_Beds',label:'Tưới cây'},{node:'Record_Player',label:'Nghe nhạc cùng nhau'}],
    spawnFrom:{default:[3.1,-0.9,Math.PI,0]}},
  // ===== NHÀ L3 (src/house.js): 2 nhà vườn cạnh 2 cánh nhà (mặt trước nhìn ra vườn), tháp thư viện trên Phòng kỷ niệm, rạp phim tầng hầm.
  // Màn hình karaoke / rạp dùng vật liệu CH_screen → tính năng xem TV / rạp có sẵn phát video lên đó. Ghim ⭐ = hoạt động "Sắp có".
  karaoke:{name:'Karaoke & phòng nhạc',triCol:true,flat:true,wallMats:['L2_Wall_Plaster','L2_Wall_Teal'],glass:{front:{x0:0.2,x1:7.8,z:0.02,y0:0,y1:3.4},top:{x0:0.2,x1:7.8,z0:-4.8,z1:0.02,y:3.4}},
    tv:{node:'TV_Unit',mat:'CH_screen',inset:0},sofa:{node:'Sofa',seatY:0.45},treadNames:[],mezz:[],
    walk0:[0.35,7.65,-4.6,-0.3],l1:[0,0,0,0],cl1:[0,0,0,0],garden:false,gtex:'Plane',out:/^__none__$/,lift:0,
    ext:{dx:21.4,dy:-0.1,dz:1.6,hide:/^(Facade_L3_Karaoke|L3_Karaoke_)/},
    doors:[{node:'Door_Entrance_Leaf',to:'exterior',label:'Ra hiên (vườn)'},{at:[4.0,1.2,0.4],to:'exterior',label:'Ra vườn'}],
    spots:[{node:'Karaoke_Stage',label:'Hát karaoke cùng nhau',id:'karaoke'},{node:'Piano',label:'Đàn & hát',id:'piano'}],
    spawnFrom:{exterior:[2.4,-0.6,Math.PI,0],default:[7.3,-2.0,-Math.PI/2,0]}},
  spa:{name:'Spa / onsen',triCol:true,flat:true,wallMats:['L2_Wall_Plaster','L2_Floor_Terracotta'],glass:{front:{x0:0.2,x1:7.8,z:0.02,y0:0,y1:3.4},top:{x0:0.2,x1:7.8,z0:-4.8,z1:0.02,y:3.4}},
    treadNames:[],mezz:[],walk0:[0.35,7.65,-4.6,-0.3],l1:[0,0,0,0],cl1:[0,0,0,0],garden:false,gtex:'Plane',out:/^__none__$/,lift:0,
    ext:{dx:-23.4,dy:-0.1,dz:1.6,hide:/^(Facade_L3_Spa|L3_Spa_)/},
    doors:[{node:'Door_Entrance_Leaf',to:'exterior',label:'Ra hiên (vườn)'},{at:[4.0,1.2,0.4],to:'exterior',label:'Ra vườn'}],
    spots:[{node:'Onsen_Tub',label:'Ngâm onsen cùng nhau',id:'onsen'},{node:'Massage_Beds',label:'Massage thư giãn',id:'massage'}],
    spawnFrom:{exterior:[4.0,-0.6,Math.PI,0],default:[0.7,-2.0,Math.PI/2,0]}},
  library:{name:'Thư viện',triCol:true,flat:true,wallMats:['L2_Wall_Plaster','L2_Wall_Blush'],glass:{front:{x0:0.2,x1:8.3,z:0.02,y0:0,y1:3.5},top:{x0:0.2,x1:8.3,z0:-5.05,z1:0.02,y:3.5}},
    treadNames:[],mezz:[],walk0:[0.35,8.15,-4.85,-0.3],l1:[0,0,0,0],cl1:[0,0,0,0],garden:false,gtex:'Plane',out:/^__none__$/,lift:0,
    ext:{dx:-10.85,dy:-9.99,dz:5.0,hide:/^L3_Library_/},
    doors:[{at:[5.15,1.3,-1.1],to:'memory',label:'Xuống Phòng kỷ niệm'}],
    spots:[{node:'Reading_Corner',label:'Đọc sách cùng nhau',id:'reading'},{node:'Roof_Stair',label:'Lên sân ngắm sao',id:'stargazing'}],
    spawnFrom:{default:[5.15,-2.05,0,0]}},
  cinema:{name:'Rạp phim',triCol:true,flat:true,noGround:true,wallMats:['L3_Velvet_Dark','L2_Carpet_Navy'],glass:{front:{x0:0.2,x1:10.2,z:0.02,y0:0,y1:3.2},top:{x0:0.2,x1:10.2,z0:-8.0,z1:0.02,y:3.2}},
    tv:{node:'TV_Unit',mat:'CH_screen',inset:0},sofa:{node:'Sofa',seatY:0.45},treadNames:[],mezz:[],
    walk0:[0.35,10.05,-7.4,-0.3],l1:[0,0,0,0],cl1:[0,0,0,0],garden:false,gtex:'Plane',out:/^__none__$/,lift:0,
    doors:[{node:'Cinema_Stair',to:'living',label:'Lên phòng khách'}],
    spots:[{node:'Popcorn_Bar',label:'Bắp nước',id:'popcorn'}],
    spawnFrom:{default:[9.55,-1.75,Math.PI,0]}},
  // Sân vườn ngoài nhà: 1 mặt phẳng, không cầu thang/gác/ghế/giường. Số liệu đo từ EXTERIOR.glb (mét, hệ toạ độ thế giới).
  exterior:{name:'Vườn ngoài nhà',outdoor:true,floorY:-0.2,
    walk0:[-23.8,33.8,-24.2,13.55],l1:[0,0,0,0],cl1:[0,0,0,0],camBox:[-31,41,-32,21],
    grid:{x0:-26,z0:-26.5,c:0.125,W:496,H:340},
    spawn:{vy:[4.3,2.4,0],bin:[5.7,2.4,0]},      // vừa bước ra khỏi cửa chính (hiên trước nhà), quay mặt ra vườn/cổng
    porch:[-10.5,20.5,0.9,4.2],porchMax:0.6,   // hiên + bục thềm trước nhà: nhân vật bước lên theo mặt thật
    dropTrees:[[9.0,11.9]],
    noPlant:[[-10.3,-0.05,-10.4,-1.05],[-0.25,10.25,-8.35,0.95],[10.05,20.3,-10.4,-1.05]],   // lòng 3 cánh nhà (bin / phòng khách / vy): bỏ cây cỏ mọc lọt vào trong
    fence:[-24.41,34.41,-24.76,14.31,5],                      // mặt ngoài hàng rào x0,x1,z0,z1 + x tâm cổng (để rải cây ra ngoài, chừa lối trước cổng)
    block:/^(Facade_|Foundation_)/,blockSmall:/^(rock-|tree-)/,
    garden:false,hideFlat:false,out:/^__none__$/,gtex:'Plane',lift:0,farR:150,
    doorTo:'living',doorLabel:'Vào nhà'}
};

// ===== Vườn nhà L3: đất nới 80 × 49.5 m (hàng rào mới, cổng giữ nguyên), vườn rải lại; hoạt động ngoài vườn = ghim ⭐ "Sắp có".
// Toạ độ glTF (x, y cao, z = -y thế giới). noPlant: khối nhà / nhà vườn / hồ bơi / sân… (cỏ, cây không mọc vào).
const EXTERIOR_L3 = {
  walk0:[-34.4,44.4,-35.0,13.55],camBox:[-41,51,-42,21],grid:{x0:-36,z0:-36.5,c:0.15,W:560,H:357},
  fence:[-35.41,45.41,-36.01,14.31,5],dropTrees:[],
  noPlant:[[-10.3,-0.05,-10.4,-1.05],[-0.25,10.25,-8.35,0.95],[10.05,20.3,-10.4,-1.05],
    [-21.5,-13.3,-6.7,-1.5],[23.3,31.5,-6.7,-1.5],[-13.4,-10.4,-4.45,-2.75],[20.4,23.4,-4.45,-2.75],
    [-2.4,12.4,-22.8,-12.6],[0,10,-27.6,-23.6],[-34.2,-31.6,10.5,12.9],[-31,-16,0.6,9.6],[27.5,40.9,4.9,11.0],
    [25,31,-29.5,-25],[29,32.6,-22.2,-18.6],[32.4,39.6,-31.2,-24],[-31.4,-16.6,-25.5,-20.5],[-28.8,-19.2,-27.5,-18.5]],
  spawnFrom:{karaoke:[-17.4,0.2,0,0],spa:[27.4,0.2,0,0],default:[5.0,2.4,0,0]},
  doorsL3:[{at:[-17.4,2.6,-1.0],to:'karaoke',label:'Karaoke & phòng nhạc'},{at:[27.4,2.6,-1.0],to:'spa',label:'Spa / onsen'}],
  spotsL3:[{node:'Facade_L3_Pool',label:'Bơi cùng nhau',id:'pool'},{node:'Facade_L3_BBQ_Grill',label:'Nướng BBQ',id:'bbq'},
    {node:'Facade_L3_Bed_05',label:'Trồng & thu hoạch rau',id:'farm'},{node:'Path_L3_Dock',label:'Câu cá',id:'fishing'},
    {node:'Path_L3_Picnic',label:'Picnic',id:'picnic'},{node:'L3_Treehouse',label:'Nhà trên cây',id:'treehouse'},
    {node:'Facade_L3_Swing',label:'Xích đu đôi',id:'swing'},{node:'L3_Hammock',label:'Nằm võng',id:'hammock'},
    {node:'Path_L3_Court',label:'Đánh cầu lông',id:'badminton'},{node:'Facade_L3_Trampoline',label:'Bạt nhún',id:'trampoline'},
    {node:'Path_L3_MiniGolf',label:'Golf mini',id:'minigolf'},{node:'Facade_L3_Campfire',label:'Đốt lửa trại',id:'campfire'},
    {node:'Facade_L3_Screen',label:'Chiếu phim ngoài trời',id:'outdoor_movie'},{node:'L3_Flower_Arch',label:'Chụp ảnh cổng hoa',id:'photo_arch'}],
};
if (houseLevel() >= 3) Object.assign(MAP_CONFIGS.exterior, EXTERIOR_L3);

// ===== Nhà L4 "Một ngày ở VIBE LAB": đất 130 × 80 m quanh vườn L3 (giữ nguyên ở giữa; hàng rào L3 thành hàng cây thấp có 5 cổng hoa).
// Trang trại (trái), khu vui chơi (phải), hồ lớn + bãi cát (sau), đồi hoa + khinh khí cầu (sau trái), rừng nhỏ (sau phải), đường tàu chữ U + 3 ga.
// walkAreas: vùng bắn tia lấy độ cao mặt đi (đồi hoa thật cao 3 m, sân ga, cầu tàu). Mọi hoạt động mới = ghim ⭐ "Sắp có".
const EXTERIOR_L4 = {
  walk0:[-59.4,69.4,-65.5,13.55],camBox:[-67,77,-73,21],grid:{x0:-61,z0:-67,c:0.15,W:880,H:547},
  fence:[-60.41,70.41,-66.51,14.31,5],dropTrees:[],
  noPlant:[...EXTERIOR_L3.noPlant,
    [-54.2,-38.6,1.9,8.2],[-52.6,-51.0,7.8,9.0],[-54.2,-45.6,-7.8,-1.4],[-54.0,-38.5,-23.5,-12.5],[-54.6,-46.4,-32.0,-25.0],
    [-46.6,-44.0,-32.6,-31.2],[-46.0,-37.8,-35.0,-23.2],[-38.0,-36.8,-9.4,-7.2],[50.4,59.6,-1.2,8.0],[48.8,63.2,-28.4,-16.0],
    [46.0,48.8,-8.4,-5.6],[50.2,52.4,-1.4,0.2],[59.6,62.4,-8.0,-5.6],[47.4,64.0,-2.8,-1.6],[-0.3,9.3,-45.6,-36.7],
    [8.2,25.8,-45.6,-40.2],[14.0,16.2,-50.4,-43.4],[-56.5,-53.8,-13.4,-6.6],[0.6,9.4,-62.7,-60.0],[63.8,66.5,-7.2,-0.4],
    [-58.3,-56.5,-11.0,-3.8],[-15.9,25.9,-59.6,-43.4],[-58.4,-56.4,-63.0,8.4],[-56.4,68.4,-64.6,-62.6],[66.4,68.4,-63.0,8.4]],
  walkAreas:[[-54.2,-28.8,-59.7,-39.3,3.3,0.4],[-56.5,-53.7,-13.2,-6.8,0.6,0.2],[0.8,9.2,-62.7,-59.9,0.6,0.2],[63.7,66.5,-7.0,-0.6,0.6,0.2],[14.3,15.9,-50.1,-43.9,0.5,0.2]],
  spotsL3:[...EXTERIOR_L3.spotsL3,
    {node:'Facade_L4_Bed_00',label:'Trang trại tự tưới (xem)',id:'farm_auto'},{node:'Facade_L4_Coop',label:'Chuồng gà',id:'hens'},
    {node:'L4_Farm_Cows',label:'Bãi bò',id:'cows'},{node:'L4_Farm_Orchard',label:'Vườn trái cây',id:'orchard'},
    {node:'Facade_L4_Carousel',label:'Đu quay ngựa',id:'carousel'},{node:'Facade_L4_Ferris_Platform',label:'Vòng quay',id:'ferris'},
    {node:'Facade_L4_IceCream_Cart',label:'Xe kem',id:'icecream'},{node:'Path_L4_Dock',label:'Câu cá hồ lớn',id:'fishing_lake'},
    {node:'L4_Lake_Boats',label:'Chèo thuyền đôi',id:'boats'},{node:'L4_Beach_Things',label:'Nằm bãi cát',id:'beach'},
    {node:'Facade_L4_Balloon_Basket',label:'Khinh khí cầu',id:'balloon'},{node:'Facade_L4_Hill_Bench',label:'Chụp ảnh đồi hoa',id:'photo_hill'},
    {node:'L4_Wood_Swing',label:'Xích đu trong rừng',id:'wood_swing'},{node:'Facade_L4_Train',label:'Đi tàu lửa',id:'train'},
    {node:'Path_L4_Station_Lake',label:'Ga Bờ hồ',id:'st_lake'},{node:'Path_L4_Station_Park',label:'Ga Khu vui chơi',id:'st_park'}],
};
if (houseLevel() >= 4) Object.assign(MAP_CONFIGS.exterior, EXTERIOR_L4);
