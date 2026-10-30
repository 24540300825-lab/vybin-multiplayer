// Cấu hình "hình học/gameplay" riêng cho từng map — DỮ LIỆU THUẦN, không có logic.
// Thêm map mới: thêm 1 khối vào đây (cùng id với MAP_LIST trong maps.js). Ý nghĩa các trường: xem docs/EXTENDING.md.
export const MAP_CONFIGS = {
  studio:{name:'Studio (cũ)',tread:/^Stair_Tread_\d+$/,mezz:['Mezz_Floor'],seat:'Desk_Chair_Seat',chair:/^Desk_Chair\d*$/,walk0:[0.3,9.7,-7.6,0.62],l1:[0.22,9.6,-7.6,null],cl1:[0.4,9.6,-7.6,-4.3],garden:true,out:/^(Plane|tree|bush|SF_|Sketchfab)/,lift:4.35},
  house:{name:'Nhà 2 tầng (mới)',treadNames:['Stair_Treads','StairR_Treads'],mezz:['Mezz_Floor','Mezz_Ext_Floor'],seat:'Chair_Seat',chair:/^Desk_Chair\d*$/,walk0:[0.3,9.7,-7.6,-0.2],l1:[0.22,9.78,-7.6,-4.25],cl1:[0.4,9.6,-7.6,-4.3],garden:false,tint:{CH_floor:0xdcb88e},hideFlat:true,hide:/^(Plane|Plane003|SF_BiomeSurface.*|Stylized Grass\.003)$/,gtex:'Plane003',out:/^(OUT_|tree-|bush-|grass-|rock-|flower-|\.SF_|Sketchfab)/,lift:0}
};
