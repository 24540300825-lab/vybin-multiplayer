// TRANG PHỤC theo mùa lễ. File: assets/costume-<vy|bin>-<id>.glb (mỗi nhân vật một file vì dáng người khác nhau).
// Thêm bộ mới: bỏ file vào assets/, chạy tools/build_manifest.py, rồi khai báo nhãn + mùa ở đây (không khai báo vẫn hiện, nhãn = id, mọi mùa).
// season: 'christmas' | 'newyear' | 'tet' | null (= mặc được quanh năm). Cách làm file trong Blender: xem docs/SEASONS.md.
export const COSTUMES = {
  noel:     {label: 'Bộ Noel', season: 'christmas'},
  santahat: {label: 'Mũ Noel', season: 'christmas'},
  antler:   {label: 'Gạc tuần lộc', season: 'christmas'},
  sweater:  {label: 'Áo len đôi', season: 'christmas'},
  aodai:    {label: 'Áo dài', season: 'tet'},
  phuc:     {label: 'Áo len Phúc', season: 'tet'},
  glasses:  {label: 'Kính năm mới', season: 'newyear'},
};
