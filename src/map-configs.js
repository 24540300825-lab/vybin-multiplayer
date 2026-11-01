// Cấu hình "hình học/gameplay" riêng cho từng map — DỮ LIỆU THUẦN, không có logic.
// Thêm map mới: thêm 1 khối vào đây (cùng id với MAP_LIST trong maps.js). Ý nghĩa các trường: xem docs/EXTENDING.md.
export const MAP_CONFIGS = {
  studio:{name:'Studio (cũ)',glass:{front:{x0:0,x1:10,z:0.63,y0:0,y1:5.9},top:{x0:0,x1:10,z0:-7.9,z1:0.63,y:5.95}},tread:/^Stair_Tread_\d+$/,mezz:['Mezz_Floor'],seat:'Desk_Chair_Seat',chair:/^Desk_Chair\d*$/,walk0:[0.3,9.7,-7.6,0.62],l1:[0.22,9.6,-7.6,null],cl1:[0.4,9.6,-7.6,-4.3],garden:true,out:/^(Plane|tree|bush|SF_|Sketchfab)/,lift:4.35},
  house:{name:'Nhà 2 tầng (mới)',chairFlip:true,glass:{front:{x0:0.15,x1:9.85,z:0.04,y0:0,y1:5.9},top:{x0:0.15,x1:9.85,z0:-7.85,z1:0.04,y:5.9}},treadNames:['Stair_Treads','StairR_Treads'],mezz:['Mezz_Floor','Mezz_Ext_Floor'],seat:'Chair_Seat',chair:/^Desk_Chair\d*$/,walk0:[0.3,9.7,-7.6,-0.2],l1:[0.22,9.78,-7.6,-4.25],cl1:[0.4,9.6,-7.6,-4.3],garden:false,doorTo:'exterior',doorLabel:'Ra ngoài',tint:{CH_floor:0xdcb88e},hideFlat:true,hide:/^(Plane|Plane003|SF_BiomeSurface.*|Stylized Grass\.003)$/,gtex:'Plane003',out:/^(OUT_|tree-|bush-|grass-|rock-|flower-|\.SF_|Sketchfab)/,lift:0},
  // Sân vườn ngoài nhà: 1 mặt phẳng, không cầu thang/gác/ghế/giường. Số liệu đo từ EXTERIOR.glb (mét, hệ toạ độ thế giới).
  exterior:{name:'Vườn ngoài nhà',outdoor:true,floorY:-0.2,
    walk0:[-23.8,33.8,-24.2,13.55],l1:[0,0,0,0],cl1:[0,0,0,0],camBox:[-23.5,33.5,-24,13.5],
    grid:{x0:-26,z0:-26.5,c:0.125,W:496,H:340},
    spawn:{vy:[4.3,2.4,0],bin:[5.7,2.4,0]},      // vừa bước ra khỏi cửa chính (hiên trước nhà), quay mặt ra vườn/cổng
    houseBox:[-10.5,20.5,-10.5,0.95],                  // vùng thân nhà: cây/bụi/cỏ scatter lọt vào trong sẽ bị bỏ
    fence:[-24.41,34.41,-24.76,14.31,5],                      // mặt ngoài hàng rào x0,x1,z0,z1 + x tâm cổng (để rải cây ra ngoài, chừa lối trước cổng)
    block:/^(Facade_|Foundation_)/,blockSmall:/^(rock-|tree-)/,
    garden:false,hideFlat:false,out:/^__none__$/,gtex:'Plane',lift:0,farR:150,
    doorTo:'house',doorLabel:'Vào nhà'}
};
