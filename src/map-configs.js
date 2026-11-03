// Cấu hình "hình học/gameplay" riêng cho từng map — DỮ LIỆU THUẦN, không có logic.
// Thêm map mới: thêm 1 khối vào đây (cùng id với MAP_LIST trong maps.js). Ý nghĩa các trường: xem docs/EXTENDING.md.
export const MAP_CONFIGS = {
  // ===== 3 phòng trong nhà (đi vào từ vườn). Toạ độ phòng luôn x 0..10, z -8..0 (mặt cắt mở về phía camera +z) =====
  // ext: dùng lại map ngoài vườn quanh nhà — dx/dz dời ngoại cảnh cho khớp (phòng Vy/Bin nằm lệch ±10m so với phòng khách),
  //      hide = các mảng vỏ nhà của CHÍNH cánh đang đứng (bị cắt để nhìn vào), roofX = tâm mái cánh đó (mái dựng bằng instancing).
  // triCol: va chạm theo tam giác thật (đồ đạc gộp khối). tv: {node, mat?, inset} mặt màn TV (inset = khoảng viền đen chừa quanh mặt sáng); sofa: {node, seatY} sofa liền khối → tự chia 2 chỗ ngồi.
  // doors: ghim chuyển map {node, to, label}; spawnFrom[mapVừaRời] = [x, z, yaw, tầng(0/1)] — xuất hiện ngay chỗ cửa đã đi qua.
  living:{name:'Phòng khách',chairFlip:true,glass:{front:{x0:0.15,x1:9.85,z:0.04,y0:0,y1:5.9},top:{x0:0.15,x1:9.85,z0:-7.85,z1:0.04,y:5.9}},treadNames:['Stair_Treads','StairR_Treads'],mezz:['Mezz_Floor','Mezz_Ext_Floor'],seat:'Chair_Seat',chair:/^Desk_Chair\d*$/,walk0:[0.3,9.7,-7.6,-0.2],l1:[0.22,9.78,-7.6,-4.25],cl1:[0.4,9.6,-7.6,-4.3],garden:false,tint:{CH_floor:0xdcb88e},gtex:'Plane',out:/^__none__$/,lift:0,
    ext:{dx:0,dz:0,hide:/^(Door_Main|Entrance_Hood|Facade_Living_Front|Glass_Living_Front|Interior_Living|Roof_Living)/,roofX:5},
    doors:[{node:'Doormat',to:'exterior',label:'Ra vườn'},{node:'GD_Door_Entrance_Leaf',to:'bin',label:'Phòng Bin'},{node:'GD_Door_Entrance_Leaf001',to:'vy',label:'Phòng Vy'}],
    spawnFrom:{exterior:[4.2,-0.9,Math.PI,0],bin:[0.85,-6.95,Math.PI/2,1],vy:[9.15,-6.95,-Math.PI/2,1]}},
  vy:{name:'Phòng Vy',triCol:true,tv:{node:'TV_Unit001',inset:0},sofa:{node:'Sofa',seatY:0.45},treadNames:['Stair'],mezz:['Mezzanine'],seat:'Desk_Chair',chair:/^Desk_Chair$/,chairToward:'Desk',walk0:[0.3,9.7,-7.6,0.02],l1:[0.22,9.78,-7.6,-4.0],cl1:[0.4,9.6,-7.6,-4.05],garden:false,gtex:'Plane',out:/^__none__$/,lift:0,
    ext:{dx:-10,dz:2,hide:/^(Facade_Vy_Front|Facade_Vy_Nook|Facade_Vy_Sides_Back|Glass_Vy_Front|Glass_Vy_Nook|Glass_Vy_Sides_Back|Interior_Vy)/,roofX:15},
    doors:[{node:'Door_Entrance_Leaf',to:'living',label:'Phòng khách'}],
    spawnFrom:{default:[0.85,-4.95,Math.PI/2,1]}},
  bin:{name:'Phòng Bin',camMirror:true,triCol:true,tv:{node:'TV_Unit',mat:'CH_screen',inset:0},sofa:{node:'Sofa',seatY:0.45},treadNames:['Stair'],mezz:['Mezzanine'],seat:'Desk_Chair',chair:/^Desk_Chair$/,chairToward:'Desk',walk0:[0.3,9.7,-7.6,0.02],l1:[0.22,9.78,-7.6,-4.0],cl1:[0.4,9.6,-7.6,-4.05],garden:false,gtex:'Plane',out:/^__none__$/,lift:0,
    ext:{dx:10,dz:2,hide:/^(Facade_Bin_Front|Facade_Bin_Nook|Facade_Bin_Sides_Back|Glass_Bin_Front|Glass_Bin_Nook|Glass_Bin_Sides_Back|Interior_Bin)/,roofX:-5},
    doors:[{node:'Door_Entrance_Leaf',to:'living',label:'Phòng khách'}],
    spawnFrom:{default:[9.15,-4.95,-Math.PI/2,1]}},
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
