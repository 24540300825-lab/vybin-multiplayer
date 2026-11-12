// Cấu hình "hình học/gameplay" riêng cho từng map — DỮ LIỆU THUẦN, không có logic.
// Thêm map mới: thêm 1 khối vào đây (cùng id với MAP_LIST trong maps.js). Ý nghĩa các trường: xem docs/EXTENDING.md.
export const MAP_CONFIGS = {
  // ===== 3 phòng trong nhà (đi vào từ vườn). Toạ độ phòng luôn x 0..10, z -8..0 (mặt cắt mở về phía camera +z) =====
  // ext: dùng lại map ngoài vườn quanh nhà — dx/dz dời ngoại cảnh cho khớp (phòng Vy/Bin nằm lệch ±10m so với phòng khách),
  //      hide = các mảng vỏ nhà của CHÍNH cánh đang đứng (bị cắt để nhìn vào), roofX = tâm mái cánh đó (mái dựng bằng instancing).
  // triCol: va chạm theo tam giác thật (đồ đạc gộp khối). tv: {node, mat?, inset} mặt màn TV (inset = khoảng viền đen chừa quanh mặt sáng); sofa: {node, seatY} sofa liền khối → tự chia 2 chỗ ngồi.
  // doors: ghim chuyển map {node, to, label}; spawnFrom[mapVừaRời] = [x, z, yaw, tầng(0/1)] — xuất hiện ngay chỗ cửa đã đi qua.
  living:{name:'Phòng khách',wallMats:['CH_wall','CH_plaster'],hide:/^Plane002$/,chairFlip:true,glass:{front:{x0:0.15,x1:9.85,z:0.25,y0:0,y1:5.9},top:{x0:0.15,x1:9.85,z0:-7.85,z1:0.25,y:5.9}},treadNames:['Stair_Treads','StairR_Treads'],mezz:['Mezz_Floor','Mezz_Ext_Floor'],seat:'Chair_Seat',chair:/^Desk_Chair\d*$/,walk0:[0.3,9.7,-7.6,-0.2],l1:[0.22,9.78,-7.6,-4.25],cl1:[0.4,9.6,-7.6,-4.3],garden:false,tint:{CH_floor:0xdcb88e},gtex:'Plane',out:/^__none__$/,lift:0,
    ext:{dx:0,dz:0,hide:/^(Door_Main|Entrance_Hood|Facade_Living_Front|Glass_Living_Front|Interior_Living|Roof_Living)/,roofX:5,hideL2:/^(L2_Living$|L2_Upgrade_Living_Front|L2_Upgrade_Entrance)/},
    doorsL2:[{at:[5.0,4.9,-7.35],to:'game',label:'Lên Phòng Game'}],
    spots:[{node:'Cooktop',label:'Nấu ăn cùng nhau'}],
    doors:[{node:'Doormat',to:'exterior',label:'Ra vườn'},{node:'GD_Door_Entrance_Leaf',to:'bin',label:'Phòng Bin'},{node:'GD_Door_Entrance_Leaf001',to:'vy',label:'Phòng Vy'}],
    spawnFrom:{exterior:[4.2,-0.9,Math.PI,0],bin:[0.85,-6.95,Math.PI/2,1],vy:[9.15,-6.95,-Math.PI/2,1],game:[0.85,-6.95,Math.PI/2,1]}},
  vy:{name:'Phòng Vy',triCol:true,wallMats:['FWS_wall'],glass:{front:{x0:0.15,x1:9.85,z:1.12,y0:0,y1:5.9},top:{x0:0.15,x1:9.85,z0:-7.85,z1:1.12,y:5.9}},seam:[{x0:0,x1:0.15,z0:-0.02,z1:1.12,y0:0,y1:6.28,inner:'FWS_wall',side:'px'},{x0:9.85,x1:10.05,z0:-0.02,z1:1.12,y0:0,y1:6.28,inner:'FWS_wall',side:'nx'}],tv:{node:'TV_Unit001',inset:0},sofa:{node:'Sofa',seatY:0.45},treadNames:['Stair'],mezz:['Mezzanine'],seat:'Desk_Chair',chair:/^Desk_Chair$/,chairToward:'Desk',walk0:[0.3,9.7,-7.6,0.85],l1:[0.22,9.78,-7.6,-4.0],cl1:[0.4,9.6,-7.6,-4.05],garden:false,gtex:'Plane',out:/^__none__$/,lift:0,
    ext:{dx:-10,dz:2,hide:/^(Facade_Vy_Front|Facade_Vy_Nook|Facade_Vy_Sides_Back|Glass_Vy_Front|Glass_Vy_Nook|Glass_Vy_Sides_Back|Interior_Vy)/,roofX:15,hideL2:/^(L2_Vy$|L2_Upgrade_Vy_Front)/},
    doorsL2:[{at:[5.0,4.9,-7.35],to:'memory',label:'Lên Phòng kỷ niệm'}],
    spots:[{node:'Cooktop',label:'Nấu ăn cùng nhau'}],
    doors:[{node:'Door_Entrance_Leaf',to:'living',label:'Phòng khách'}],
    spawnFrom:{default:[0.85,-4.95,Math.PI/2,1]}},
  bin:{name:'Phòng Bin',camMirror:true,triCol:true,wallMats:['CH_wall'],glass:{front:{x0:0.15,x1:9.85,z:0.45,y0:0,y1:5.9},top:{x0:0.15,x1:9.85,z0:-7.85,z1:0.45,y:5.9}},seam:[{x0:9.85,x1:10.05,z0:-0.02,z1:0.88,y0:0,y1:6.28,inner:'CH_wall',side:'nx'},{x0:-0.05,x1:0.15,z0:-0.02,z1:0.45,y0:0,y1:6.28,inner:'CH_wall',side:'px'}],hide:/^Roof$/,cutTop:{node:/^Front_Frame$/,y:5.5},tv:{node:'TV_Unit',mat:'CH_screen',inset:0},sofa:{node:'Sofa',seatY:0.45},treadNames:['Stair'],mezz:['Mezzanine'],seat:'Desk_Chair',chair:/^Desk_Chair$/,chairToward:'Desk',walk0:[0.3,9.7,-7.6,0.18],l1:[0.22,9.78,-7.6,-4.0],cl1:[0.4,9.6,-7.6,-4.05],garden:false,gtex:'Plane',out:/^__none__$/,lift:0,
    ext:{dx:10,dz:2,hide:/^(Facade_Bin_Front|Facade_Bin_Nook|Facade_Bin_Sides_Back|Glass_Bin_Front|Glass_Bin_Nook|Glass_Bin_Sides_Back|Interior_Bin)/,roofX:-5,hideL2:/^(L2_Bin$|L2_Upgrade_Bin_Front)/},
    doorsL2:[{at:[5.0,4.9,-7.35],to:'workshop',label:'Lên Xưởng thủ công'}],
    spots:[{node:'Cooktop',label:'Nấu ăn cùng nhau'}],
    doors:[{node:'Door_Entrance_Leaf',to:'living',label:'Phòng khách'}],
    spawnFrom:{default:[9.15,-4.95,-Math.PI/2,1]}},
  // ===== NHÀ L2 — tầng trên (chỉ mở khi nhà ≥ L2, xem src/house.js). Phòng 1 tầng (không gác/cầu thang), sàn y=0, mặt trước z=0 mở về camera.
  // Cùng 1 ngoại cảnh map-exterior-l2 cho mọi map; ext.dx/dy/dz đặt phòng đúng vị trí trong nhà L2 (dy = cao độ tầng). hide: tường trước/vỏ của chính phòng + phần nhà phía trên; roofX: mái ngói (instancing) của chính phòng.
  // spots: điểm hoạt động (ghim ⭐) — trò chơi/tiện ích làm sau, hiện tại báo "Sắp có".
  // Phòng Game: phủ hết mái phòng khách, cao 2 tầng (gác lửng phía sau ở +2.8 m, cầu thang thẳng bên phải). Các máy có id → mở trò chơi thật (src/arena/).
  game:{name:'Phòng Game',triCol:true,flat:true,wallMats:['L2_Wall_Plaster','L2_Wall_Teal'],glass:{front:{x0:0.2,x1:10.3,z:0.02,y0:0,y1:5.6},top:{x0:0.2,x1:10.3,z0:-8.93,z1:0.02,y:5.6}},
    tv:{node:'TV_Unit',mat:'CH_screen',inset:0},sofa:{node:'Sofa',seatY:0.45},treadNames:['Stair'],mezz:['Mezzanine'],
    walk0:[0.35,10.15,-8.85,-0.3],l1:[0.25,10.25,-8.85,-5.05],cl1:[0.4,10.1,-8.8,-5.1],garden:false,gtex:'Plane',out:/^__none__$/,lift:0,
    ext:{dx:0.25,dy:-7.12,dz:-0.88,hide:/^(L2_Game_|L2_Greenhouse|L2_Roof_)/},
    doors:[{node:'Door_Entrance_Leaf',to:'living',label:'Phòng khách'},{node:'Spiral_Stair',to:'greenhouse',label:'Lên Vườn kính'}],
    spots:[{node:'Air_Hockey',label:'Khúc côn cầu',id:'hockey'},{node:'Caro_Table',label:'Cờ caro',id:'caro'},
      {node:'Basketball_1',label:'Bóng rổ',id:'bball'},{node:'Basketball_2',label:'Bóng rổ',id:'bball'},{node:'Quiz_Booth',label:'Ai hiểu ai hơn',id:'quiz'},
      {node:'Score_Board',label:'Bảng điểm VY–BIN',id:'board'},
      {node:'Arcade_Pong',label:'Pong'},{node:'Arcade_Tetris',label:'Xếp gạch đối kháng'},{node:'Arcade_Snake',label:'Rắn săn mồi đôi'},
      {node:'Dance_Machine',label:'Máy nhảy'},{node:'Connect4',label:'Thả cờ 4 hàng'},{node:'Dartboard',label:'Phi tiêu'},
      {node:'Foosball',label:'Bi lắc'},{node:'Card_Table',label:'Cờ vua'}],
    spawnFrom:{greenhouse:[1.7,-7.4,Math.PI/2,1],default:[0.95,-0.9,Math.PI/2,0]}},
  workshop:{name:'Xưởng thủ công',triCol:true,flat:true,wallMats:['L2_Wall_Plaster'],glass:{front:{x0:0.2,x1:8.3,z:0.02,y0:0,y1:3.25},top:{x0:0.2,x1:8.3,z0:-5.05,z1:0.02,y:3.25}},
    treadNames:[],mezz:[],walk0:[0.35,8.15,-4.85,3.8],l1:[0,0,0,0],cl1:[0,0,0,0],garden:false,gtex:'Plane',out:/^__none__$/,lift:0,
    ext:{dx:9.35,dy:-6.52,dz:5.0,hide:/^(L2_Workshop_|L2_Bin_Pergola)/},camMirror:true,
    doors:[{node:'Door_Entrance_Leaf',to:'bin',label:'Phòng Bin'}],
    spots:[{node:'Craft_Table',label:'Chế tạo',open:'craft'},{node:'Easel',label:'Vẽ tranh cùng nhau'},{at:[4.2,1.25,1.95],label:'Bữa tối đôi'}],
    spawnFrom:{default:[0.95,-4.3,Math.PI/2,0]}},
  memory:{name:'Phòng kỷ niệm',triCol:true,flat:true,wallMats:['L2_Wall_Plaster','L2_Wall_Blush'],glass:{front:{x0:0.2,x1:8.3,z:0.02,y0:0,y1:3.25},top:{x0:0.2,x1:8.3,z0:-5.05,z1:0.02,y:3.25}},
    sofa:{node:'Sofa',seatY:0.45},treadNames:[],mezz:[],seat:'Desk_Chair',chair:/^Desk_Chair$/,chairToward:'Desk',
    walk0:[0.35,8.15,-4.85,3.8],l1:[0,0,0,0],cl1:[0,0,0,0],garden:false,gtex:'Plane',out:/^__none__$/,lift:0,
    ext:{dx:-10.85,dy:-6.52,dz:5.0,hide:/^L2_Memory_/,},
    doors:[{node:'Door_Entrance_Leaf',to:'vy',label:'Phòng Vy'}],
    spots:[{node:'Memory_Wall',label:'Tường kỷ niệm'},{node:'Mailbox',label:'Hộp thư'},{node:'Savings_Jar',label:'Quỹ chung'}],
    spawnFrom:{default:[7.55,-0.85,-Math.PI/2,0]}},
  greenhouse:{name:'Vườn kính',triCol:true,flat:true,wallMats:[],glass:{front:{x0:0.1,x1:6.1,z:0.02,y0:0,y1:2.9},top:{x0:0.1,x1:6.1,z0:-3.75,z1:0.02,y:2.9}},
    treadNames:[],mezz:[],walk0:[0.3,5.9,-3.1,2.0],l1:[0,0,0,0],cl1:[0,0,0,0],garden:false,gtex:'Plane',out:/^__none__$/,lift:0,
    ext:{dx:-1.9,dy:-12.94,dz:4.3,hide:/^L2_Greenhouse/},
    doors:[{node:'Doormat',to:'game',label:'Xuống Phòng Game'}],
    spots:[{node:'Planter_Beds',label:'Tưới cây'},{node:'Record_Player',label:'Nghe nhạc cùng nhau'}],
    spawnFrom:{default:[3.1,-0.9,Math.PI,0]}},
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
