// ===== LOFI (WebAudio, procedural) =====
export const Lofi=(()=>{
  let ctx,out,bus,send,tm=null,on=false,nextT=0,stp=0,bar=0,vol=0.5,nb;
  const f=m=>440*Math.pow(2,(m-69)/12);
  const TR=[
   {name:'Chill Beats',sub:'Lofi Study',bpm:74,prog:[[60,64,67,71],[57,60,64,67],[62,65,69,72],[55,59,62,65]],pent:[0,2,4,7,9],lp:3200,sw:.16,kick:[0,7,10],lead:.28},
   {name:'Rainy Window',sub:'Mưa bên cửa sổ',bpm:66,prog:[[57,60,64,67],[53,57,60,64],[50,53,57,60],[52,56,59,62]],pent:[0,3,5,7,10],lp:2300,sw:.2,kick:[0,10],lead:.2},
   {name:'Late Night Study',sub:'Đêm khuya học bài',bpm:80,prog:[[62,65,69,72],[58,62,65,69],[55,58,62,65],[57,61,64,67]],pent:[0,3,5,7,10],lp:2700,sw:.14,kick:[0,6,10],lead:.34},
   {name:'Golden Hour',sub:'Hoàng hôn',bpm:70,prog:[[65,69,72,76],[62,65,69,72],[67,71,74,77],[60,64,67,71]],pent:[0,2,4,7,9],lp:3600,sw:.18,kick:[0,7,10],lead:.32},
   {name:'Quiet Café',sub:'Quán cà phê yên tĩnh',bpm:86,prog:[[60,64,67,70],[65,69,72,76],[62,65,69,72],[67,71,74,77]],pent:[0,2,4,7,9],lp:3000,sw:.22,kick:[0,7,11],lead:.3},
   {name:'Sleepy Dawn',sub:'Bình minh lười biếng',bpm:62,prog:[[64,67,71,74],[60,64,67,71],[57,60,64,67],[59,62,66,69]],pent:[0,2,4,7,9],lp:2000,sw:.12,kick:[0],lead:.18}];
  let ti=0,S=60/TR[0].bpm/4,prog=TR[0].prog,pent=TR[0].pent,lpN=null,dlN=null;
  function init(){
    ctx=new (window.AudioContext||window.webkitAudioContext)();
    const comp=ctx.createDynamicsCompressor(),lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=3200;
    out=ctx.createGain();out.gain.value=vol;lp.connect(comp);comp.connect(out);out.connect(ctx.destination);bus=lp;lpN=lp;lp.frequency.value=TR[ti].lp;
    const dl=ctx.createDelay(2),fb=ctx.createGain(),dlp=ctx.createBiquadFilter(),wet=ctx.createGain();
    dlN=dl;dl.delayTime.value=S*6;fb.gain.value=0.35;dlp.type='lowpass';dlp.frequency.value=1800;wet.gain.value=0.3;
    send=ctx.createGain();send.connect(dl);dl.connect(dlp);dlp.connect(fb);fb.connect(dl);dlp.connect(wet);wet.connect(lp);
    nb=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    // vinyl crackle
    const cb=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate),c=cb.getChannelData(0);
    for(let i=0;i<c.length;i++)c[i]=(Math.random()*2-1)*0.012+(Math.random()<0.0007?(Math.random()*2-1)*0.7:0);
    const cs=ctx.createBufferSource();cs.buffer=cb;cs.loop=true;const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=900;
    const cg=ctx.createGain();cg.gain.value=0.35;cs.connect(hp);hp.connect(cg);cg.connect(out);cs.start();
  }
  function tone(m,t,dur,type,g,cut,snd){
    const o=ctx.createOscillator(),e=ctx.createGain(),fl=ctx.createBiquadFilter();
    o.type=type;o.frequency.value=f(m);o.detune.value=(Math.random()-0.5)*14;fl.type='lowpass';fl.frequency.value=cut;
    e.gain.setValueAtTime(0.0001,t);e.gain.exponentialRampToValueAtTime(g,t+0.02);e.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(fl);fl.connect(e);e.connect(bus);if(snd){const sg=ctx.createGain();sg.gain.value=snd;e.connect(sg);sg.connect(send);}
    o.start(t);o.stop(t+dur+0.05);}
  function nz(t,dur,type,freq,g){
    const s=ctx.createBufferSource(),fl=ctx.createBiquadFilter(),e=ctx.createGain();s.buffer=nb;fl.type=type;fl.frequency.value=freq;
    e.gain.setValueAtTime(g,t);e.gain.exponentialRampToValueAtTime(0.0001,t+dur);s.connect(fl);fl.connect(e);e.connect(bus);s.start(t,Math.random());s.stop(t+dur+0.02);}
  function kick(t){const o=ctx.createOscillator(),e=ctx.createGain();o.frequency.setValueAtTime(130,t);o.frequency.exponentialRampToValueAtTime(42,t+0.13);
    e.gain.setValueAtTime(0.9,t);e.gain.exponentialRampToValueAtTime(0.0001,t+0.35);o.connect(e);e.connect(bus);o.start(t);o.stop(t+0.4);}
  function step(s,t){
    const ch=prog[bar%4];
    if(s===0){ch.forEach(m=>tone(m,t,3.2,'triangle',0.11,1100,0.25));tone(ch[0]-24,t,1.6,'sine',0.35,400,0);}
    if(s===10){ch.forEach(m=>tone(m+12,t,0.5,'sine',0.05,1800,0.35));}
    if(s===7||s===11)tone(ch[0]-24,t,0.5,'sine',0.28,400,0);
    if(TR[ti].kick.includes(s))kick(t);
    if(s===4||s===12)nz(t,0.18,'bandpass',1900,0.22);
    if(s%2===0)nz(t,0.04,'highpass',7500,0.04+Math.random()*0.04);
    else if(Math.random()<0.3)nz(t,0.03,'highpass',8000,0.025);
    if(s%2===0&&Math.random()<TR[ti].lead){const m=ch[0]+12+pent[(Math.random()*5)|0]+(Math.random()<0.4?12:0);tone(m,t,0.9,'triangle',0.09,2200,0.5);}
  }
  function sched(){while(nextT<ctx.currentTime+0.25){step(stp,nextT+(stp%2?S*TR[ti].sw:0));nextT+=S;stp=(stp+1)%16;if(stp===0)bar++;}}
  return{
    get on(){return on},
    async toggle(){if(!ctx)init();if(ctx.state==='suspended')await ctx.resume();
      on=!on;if(on){nextT=ctx.currentTime+0.1;stp=0;bar=0;tm=setInterval(sched,80);out.gain.setTargetAtTime(vol,ctx.currentTime,0.3);}
      else{clearInterval(tm);out.gain.setTargetAtTime(0,ctx.currentTime,0.2);}return on},
    tracks:TR,get idx(){return ti},
    setTrack(i){ti=(i+TR.length)%TR.length;const t=TR[ti];S=60/t.bpm/4;prog=t.prog;pent=t.pent;stp=0;bar=0;if(ctx){nextT=ctx.currentTime+0.15;if(lpN)lpN.frequency.setTargetAtTime(t.lp,ctx.currentTime,0.1);if(dlN)dlN.delayTime.value=S*6}return ti},
    vol(v){vol=v;if(out&&on)out.gain.setTargetAtTime(v,ctx.currentTime,0.05)}};
})();
document.getElementById('bLofi').onclick=async e=>{const on=await Lofi.toggle();e.target.textContent='♪ Lofi: '+(on?'ON':'OFF')};
document.getElementById('sVol').oninput=e=>Lofi.vol(+e.target.value);
