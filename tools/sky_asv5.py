# HDRI ASV5 (equirect .hdr) -> ảnh trời cho game: equirect 2048x576 từ đỉnh (90°) xuống -12°, sRGB JPG + meta.json
# (h/m/z = màu trung bình tuyến tính 3 dải theo ánh xạ độ cao của shader với GAM = uVG; su = vị trí ngang vầng sáng).
# Dùng: GAM=0.75 python3 tools/sky_asv5.py <thư mục .hdr> <thư mục ra>   (cần numpy, scipy, opencv-python)
# Xem docs/SKY.md.
import cv2,numpy as np,sys,json,os
from scipy.ndimage import gaussian_filter,binary_dilation
src,dst=sys.argv[1],sys.argv[2]
LW=np.array([.2126,.7152,.0722],np.float32)
def srgb(x):x=np.clip(x,0,1);return np.where(x<=0.0031308,12.92*x,1.055*np.power(x,1/2.4)-0.055)
meta={}
for f in sorted(os.listdir(src)):
    if not f.endswith('.hdr'):continue
    key=f[5:-7]
    im=cv2.imread(os.path.join(src,f),cv2.IMREAD_UNCHANGED)[:,:,::-1].astype(np.float32)
    H0=im.shape[0];lo=int(round(H0*(90+12)/180))  # từ đỉnh (90°) xuống tới -12° dưới chân trời
    up=im[:lo].copy()
    up=cv2.resize(up,(2048,576),interpolation=cv2.INTER_AREA)
    L=up@LW
    # vầng sáng (để xoay ảnh theo hướng mặt trời thật): argmax của độ sáng làm mờ rộng, chỉ trong 60% dưới
    Lb=gaussian_filter(np.minimum(L,1.5),(10,30),mode=('nearest','wrap'))
    y,x=np.unravel_index(np.argmax(Lb[:500]),Lb[:500].shape)
    glow=float(Lb.max()/np.median(Lb))
    # xoá đĩa mặt trời/mặt trăng vẽ sẵn (game tự vẽ) : vùng sáng gắt hơn hẳn nền xung quanh → lấp bằng nền làm mờ
    med=gaussian_filter(L,8,mode=('nearest','wrap'))
    mask=binary_dilation((L>np.maximum(0.5,med*1.45))|(L>2.0),iterations=6)          # bắt cả trăng/sao lớn trên nền tối
    if mask.sum()>3000:mask=binary_dilation((L>np.maximum(1.0,med*1.6))|(L>2.0),iterations=6)   # trời sáng: chỉ lấy đĩa mặt trời, không ăn vào mép mây
    if mask.any():
        w=(~mask).astype(np.float32)
        for c in range(3):
            num=gaussian_filter(up[:,:,c]*w,14,mode=('nearest','wrap'));den=gaussian_filter(w,14,mode=('nearest','wrap'))
            fill=num/np.maximum(den,1e-4)
            up[:,:,c]=np.where(mask,fill,up[:,:,c])
    # nén vùng còn >1 mềm (giữ màu)
    L=up@LW;k=np.where(L>0.9,(0.9+(L-0.9)/(1+(L-0.9)*4))/np.maximum(L,1e-6),1.0);up*=k[...,None]
    out=(srgb(up)*255+0.5).astype(np.uint8)
    cv2.imwrite(os.path.join(dst,'sky_'+key+'.jpg'),out[:,:,::-1],[cv2.IMWRITE_JPEG_QUALITY,86,cv2.IMWRITE_JPEG_OPTIMIZE,1])
    H=up.shape[0];G=float(os.environ.get('GAM','0.75'));S0=-3.0
    ys=np.linspace(0,1,400);   # x = độ cao game/90°
    m={}
    for nm,(lo2,hi2) in {'h':(0,0.1),'m':(0.15,0.3),'z':(0.6,1.0)}.items():
        e=np.arcsin(np.linspace(lo2,hi2,24))*180/np.pi/90  # x
        sdeg=S0+(90-S0)*np.power(e,G);v=(sdeg+12)/102;rows=np.clip(((1-v)*H).astype(int),0,H-1)
        m[nm]=[round(float(t),4) for t in up[rows].reshape(-1,3).mean(0)]
    m['su']=round(float(x)/2048,4) if glow>1.12 else None
    meta[key]=m;print(key,m,flush=True)
json.dump(meta,open(os.path.join(dst,'meta.json'),'w'),indent=1)
