// PHÁO HOA (🎆) cho Năm mới + giao thừa Tết. Chỉ bắn khi CẢ HAI cùng online: đếm ngược 10 giây → bắn ~2,5 phút trên bầu trời sau nhà.
// Giờ bắn: FIREWORKS trong src/season/calendar.js (giờ Việt Nam). Tới giờ mà chưa đủ 2 người: lúc cả hai cùng có mặt (trong windowMin phút) thì đếm ngược rồi bắn.
// Bản test: nút "🎆 Thử pháo hoa" — đếm ngược 10 giây rồi bắn 1 phút, cho cả hai cùng xem.
import {FIREWORKS} from '../season/calendar.js';
import {HOUSE_RULES} from '../house.js';
import {MAP_CONFIGS} from '../map-configs.js';

const PAL = [[1, 0.25, 0.25], [1, 0.82, 0.3], [1, 1, 1], [0.35, 1, 0.5], [0.4, 0.65, 1], [1, 0.45, 0.85], [1, 0.55, 0.15]];
const MAXP = 7000;

export default {
  id: 'fireworks',
  init(ctx) {
    const V = window.VY; if (!V || !V.THREE || !V.scene) return;
    const THREE = V.THREE, scene = V.scene;
    const MC = MAP_CONFIGS[ctx.mapId] || {};
    if (MC.noGround) return;                       // tầng hầm (rạp phim, bowling): không thấy trời
    const X = MC.outdoor ? {dx: 0, dy: 0, dz: 0} : (MC.ext || null);
    if (!X) return;
    // tâm bắn: bầu trời phía sau nhà (toạ độ glTF của vườn) → đổi sang toạ độ map đang đứng
    const C = new THREE.Vector3(5 + (X.dx || 0), (X.dy || 0), -14 + (X.dz || 0));

    // ---- hạt: 1 Points dùng chung, cộng sáng ----
    const pos = new Float32Array(MAXP * 3), col = new Float32Array(MAXP * 4), siz = new Float32Array(MAXP);
    const vel = new Float32Array(MAXP * 3), life = new Float32Array(MAXP), age = new Float32Array(MAXP), drag = new Float32Array(MAXP), base = new Float32Array(MAXP * 3);
    let n = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(siz, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute vec4 color;attribute float size;varying vec4 vC;void main(){vC=color;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=size*(320.0/-mv.z);gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'varying vec4 vC;void main(){vec2 d=gl_PointCoord-0.5;float r=length(d);if(r>0.5)discard;float a=smoothstep(0.5,0.0,r);gl_FragColor=vec4(vC.rgb*(0.6+1.6*a),vC.a*a);}',
    });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 999; pts.visible = false; scene.add(pts);
    const shells = [];
    function emit(p, v, c, s, l, dr) {
      if (n >= MAXP) return;
      const i = n++;
      pos.set([p.x, p.y, p.z], i * 3); base.set([p.x, p.y, p.z], i * 3); vel.set([v.x, v.y, v.z], i * 3);
      col.set([c[0], c[1], c[2], 1], i * 4); siz[i] = s; life[i] = l; age[i] = 0; drag[i] = dr;
    }
    // âm thanh: tiếng "bùm" tổng hợp (không cần file)
    let AC = null;
    function boom(dist, big) {
      try {
        AC = AC || new (window.AudioContext || window.webkitAudioContext)();
        const len = 0.9, b = AC.createBuffer(1, AC.sampleRate * len, AC.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, big ? 2.2 : 3.5);
        const s = AC.createBufferSource(); s.buffer = b;
        const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = big ? 520 : 900;
        const g = AC.createGain(); g.gain.value = Math.min(0.5, 14 / Math.max(10, dist)) * 0.55;
        s.connect(f); f.connect(g); g.connect(AC.destination); s.start(AC.currentTime + Math.min(0.6, dist / 340));
      } catch (e) {}
    }
    function launch() {
      const p = new THREE.Vector3(C.x + (Math.random() - 0.5) * 50, C.y, C.z - Math.random() * 22);
      const h = 26 + Math.random() * 22, t = 1.3 + Math.random() * 0.5;
      shells.push({p, v: new THREE.Vector3((Math.random() - 0.5) * 3, h / t + 4.9 * t, (Math.random() - 0.5) * 3), t, type: Math.random(), c: PAL[(Math.random() * PAL.length) | 0], c2: PAL[(Math.random() * PAL.length) | 0]});
    }
    function burst(s) {
      const cam = V.camera, dist = cam ? cam.position.distanceTo(s.p) : 40;
      const big = s.type > 0.7, k = big ? 220 : 130, sp = big ? 15 : 11;
      for (let i = 0; i < k; i++) {
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        const willow = s.type < 0.18, ring = s.type > 0.55 && s.type < 0.7;
        const m = ring ? sp : sp * (0.75 + Math.random() * 0.35);
        const v = ring ? new THREE.Vector3(Math.cos(a) * m, Math.sin(a) * m * 0.9, 0) : new THREE.Vector3(r * Math.cos(a) * m, u * m, r * Math.sin(a) * m);
        const c = willow ? [1, 0.75, 0.32] : (i % 3 === 0 ? s.c2 : s.c);
        emit(s.p, v, c, willow ? 0.9 : 1.25, willow ? 3.2 + Math.random() : 1.7 + Math.random() * 0.9, willow ? 1.6 : 1.1);
      }
      boom(dist, big);
    }
    let showT = 0, nextLaunch = 0;
    function tick(dt) {
      if (showT > 0) {
        showT -= dt; nextLaunch -= dt;
        if (nextLaunch <= 0) { const fin = showT < 12; launch(); if (fin || Math.random() < 0.35) launch(); nextLaunch = fin ? 0.25 + Math.random() * 0.3 : 0.6 + Math.random() * 0.9; }
      }
      for (let i = shells.length - 1; i >= 0; i--) {
        const s = shells[i]; s.t -= dt; s.v.y -= 9.8 * dt; s.p.addScaledVector(s.v, dt);
        if (Math.random() < 0.7) emit(s.p, new THREE.Vector3((Math.random() - 0.5), -1, (Math.random() - 0.5)), [1, 0.8, 0.5], 0.5, 0.5, 2);
        if (s.t <= 0) { burst(s); shells.splice(i, 1); }
      }
      for (let i = 0; i < n; i++) {
        age[i] += dt;
        if (age[i] >= life[i]) {        // xoá: đổi chỗ với hạt cuối
          const j = --n; if (i !== j) {
            pos.copyWithin(i * 3, j * 3, j * 3 + 3); vel.copyWithin(i * 3, j * 3, j * 3 + 3); col.copyWithin(i * 4, j * 4, j * 4 + 4);
            siz[i] = siz[j]; life[i] = life[j]; age[i] = age[j]; drag[i] = drag[j];
          }
          i--; continue;
        }
        const f = Math.exp(-drag[i] * dt);
        vel[i * 3] *= f; vel[i * 3 + 1] = vel[i * 3 + 1] * f - 4.2 * dt; vel[i * 3 + 2] *= f;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const k = age[i] / life[i]; col[i * 4 + 3] = (1 - k) * (k > 0.6 && Math.random() < 0.25 ? 0.3 : 1);
      }
      geo.setDrawRange(0, n);
      geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = geo.attributes.size.needsUpdate = true;
      pts.visible = n > 0 || shells.length > 0;
    }
    let last = performance.now();
    (function loop() { const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; if (showT > 0 || n || shells.length) tick(dt); requestAnimationFrame(loop); })();

    // ---- đếm ngược trên màn hình ----
    const cd = document.createElement('div');
    Object.assign(cd.style, {position: 'fixed', left: '50%', top: '14%', transform: 'translateX(-50%)', zIndex: 8500, pointerEvents: 'none', textAlign: 'center',
      color: '#fff', font: '900 min(16vw,120px) Nunito,system-ui,sans-serif', textShadow: '0 4px 24px rgba(0,0,0,.5)', display: 'none'});
    document.body.appendChild(cd);
    const say = (txt, small) => { cd.style.display = txt ? 'block' : 'none'; cd.style.fontSize = small ? 'min(8vw,56px)' : 'min(16vw,120px)'; cd.textContent = txt || ''; };
    function start(label, secs) { showT = secs; nextLaunch = 0; say('🎆 ' + label, true); setTimeout(() => { if (cd.textContent.startsWith('🎆')) say(''); }, 6000); }
    async function countdownThen(label, secs) {
      for (let t = 10; t > 0; t--) { say(String(t)); await new Promise(r => setTimeout(r, 1000)); }
      start(label, secs);
    }

    // ---- lịch: tới giờ + đủ 2 người ----
    let peerHere = false;
    ctx.onPeer(p => { peerHere = !!(p && p.present); });
    const done = ctx.store.get('done', {});
    let running = null;
    setInterval(() => {
      if (running || ctx.solo) return;
      const now = Date.now();
      for (const f of FIREWORKS) {
        const T = Date.parse(f.at); if (!T || done[f.id]) continue;
        if (now < T - 10500 || now > T + f.windowMin * 60e3) continue;
        if (!peerHere && !(ctx.api && ctx.api.remote)) continue;
        running = f.id; done[f.id] = 1; ctx.store.set('done', done);
        if (now < T) {             // còn đúng ≤10 giây: đếm theo giờ thật để 2 máy cùng nổ một lúc
          (async () => { while (Date.now() < T) { say(String(Math.ceil((T - Date.now()) / 1000))); await new Promise(r => setTimeout(r, 200)); } start(f.label, 150); running = null; })();
        } else { countdownThen(f.label, 150).then(() => { running = null; }); }
        break;
      }
    }, 500);

    if (HOUSE_RULES.mode === 'test') {
      ctx.on('test', () => countdownThen('Thử pháo hoa', 60));
      ctx.ui.addButton({icon: '🎆', label: 'Thử pháo hoa', title: 'Bản thử: đếm ngược 10 giây rồi bắn pháo hoa (người kia cũng thấy)', onClick: () => { ctx.send('test', {}); countdownThen('Thử pháo hoa', 60); }});
    }
    window.__fireworks = {start: (s = 30) => start('Pháo hoa', s), countdown: () => countdownThen('Pháo hoa', 60)};
  },
};
