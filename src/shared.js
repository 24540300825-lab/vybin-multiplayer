export const CFG=window.CFG={
  walk:1.5, run:3.6, walkAnim:1.5, runAnim:1.4, camPan:0.3, camTilt:0.2,
  sitOffX:0.324,   // c_pos offset của clip sit (local X)
  sitHipDrop:0.23, // root y = seatTop - này
  sitFwd:0.02,
  bedSide:0.2, sitYAdj:0, eyeBoxX:0.25, eyeBoxY:0.15, eyeMaxDeg:30, eyeSpeed:22, accel:12, decel:14, fadeScale:1, maxFade:0.1,    // đứng cách mép giường bên trái
  bedHeadZ:0.9,    // root z = bed.minZ + này (đầu = root-0.35)
  bedHipH:0.58,    // root y = mattressTop - này
  climbBedOffX:0.675,
  eyeCloseAt:0.55,
};
export const K={REST:'ACT_RESTPOSE',IDLE:'ACT_STANDING_IDLE',WALK:'ACT_WALK',RUN:'ACT_RUN',SIT:'ACT_SITTING_IDLE',TYPE:'ACT_SITTING_TYPING_IDLE',
 CLIMBCHAIR_L:'ACT_CLIMB ON CHAIR_L',CLIMBCHAIR_R:'ACT_CLIMB ON CHAIR_R',OFFCHAIR_L:'ACT_OFFCHAIR_L',OFFCHAIR_R:'ACT_OFFCHAIR_R',
 CLIMBBED_L:'ACT_SLEEP_CLIMB ON BED_L',CLIMBBED_R:'ACT_SLEEP_CLIMB ON BED_R',SLEEP_L:'ACT_SLEEP-LOOP BREATHE_L',SLEEP_R:'ACT_SLEEP-LOOP BREATHE_R',
 OFFBED_L:'ACT_SLEEP_OFF BED_L',OFFBED_R:'ACT_SLEEP_OFF BED_R'};
export const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export const sstep=(a,b,x)=>{x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x)};
export const angDiff=(a,b)=>{let d=a-b;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return d};
export const $=id=>document.getElementById(id);