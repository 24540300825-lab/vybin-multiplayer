// LazyRig helper for three.js (use on the scene returned by GLTFLoader).
// Export the GLB with "Include > Custom Properties" ON (the addon's Export GLB button does it) and
// make sure the exporter writes Shape Keys (Mesh > Shape Keys) for the eye/brow/lash meshes.
//
//   const gltf = await new GLTFLoader().loadAsync('character.glb');
//   const mouth = new LazyMouth(gltf.scene);   // decal mouth: expressions + loops
//   mouth.setExpression('Asset 1');            // by name or index (no interpolation)
//   mouth.playLoop('Loop 1');                  // library loops made in Blender; mouth.stop() to stop
//   const eyes = new LazyEyes(gltf.scene);     // shape-key presets: brows + lashes + eyes
//   eyes.setPreset('Happy');                   // blends from the current look (default duration from Blender)
//   eyes.setPreset(2, { duration: 0.3 });      // by index, custom duration (seconds, 0 = snap)
//   eyes.mix('Happy', 'Angry', 0.5);           // instant blend between two presets
//   // in your render loop:  mouth.update(dt);  eyes.update(dt);

export class LazyMouth {
  constructor(root, options = {}) {
    this.decal = null;
    this.meta = null;
    root.traverse((o) => {
      if (!this.meta && o.isMesh && o.userData && o.userData.lazyrig_json) {
        this.decal = o;
        this.meta = JSON.parse(o.userData.lazyrig_json);
      }
    });
    if (!this.meta) throw new Error('LazyRig mouth data not found (export with Custom Properties enabled)');
    this.controller = root.getObjectByName(this.meta.nodes.controller) || null;
    this.material = Array.isArray(this.decal.material) ? this.decal.material[0] : this.decal.material;
    this.map = this.material.map;
    this.map.matrixAutoUpdate = true;
    this.material.transparent = true;
    this.material.alphaTest = 0;
    this.material.depthWrite = options.depthWrite ?? false;
    this.material.needsUpdate = true;
    this.expressions = this.meta.expressions;
    this.cells = this.meta.cells || this.meta.expressions;
    this.loops = this.meta.loops;
    this.current = -1;
    this._loop = null;
    this._t = 0;
    this.speed = 1;
    this.repeat = true;
    this.setExpression(this.meta.rest ?? 0);
  }

  indexOf(x) {
    if (typeof x === 'number') return x;
    const i = this.expressions.findIndex((e) => e.name === x);
    if (i < 0) throw new Error('Unknown expression: ' + x);
    return i;
  }

  _apply(i) {
    if (i === this.current) return;
    const e = this.cells[i];
    this.map.repeat.set(e.uv.repeat[0], e.uv.repeat[1]);
    this.map.offset.set(e.uv.offset[0], e.uv.offset[1]);
    this.current = i;
  }

  setExpression(x) {
    this._loop = null;
    this._apply(this.indexOf(x));
  }

  playLoop(x, { repeat = true, speed = 1 } = {}) {
    const l = typeof x === 'number' ? this.loops[x] : this.loops.find((q) => q.name === x);
    if (!l) throw new Error('Unknown loop: ' + x);
    this._loop = l;
    this._t = 0;
    this.repeat = repeat;
    this.speed = speed;
    this._apply(l.steps.length ? l.steps[0].e : this.meta.rest);
  }

  stop(toRest = false) {
    this._loop = null;
    if (toRest) this._apply(this.meta.rest);
  }

  get playing() {
    return this._loop ? this._loop.name : null;
  }

  update(dt) {
    const l = this._loop;
    if (!l) return;
    this._t += dt * this.speed;
    const dur = l.length / l.fps;
    if (this._t >= dur) {
      if (!this.repeat) {
        this._loop = null;
        this._apply(l.end ?? this.meta.rest);
        return;
      }
      this._t %= dur;
    }
    const f = this._t * l.fps;
    let e = l.steps.length ? l.steps[0].e : this.meta.rest;
    for (const s of l.steps) {
      if (s.f <= f) e = s.e;
      else break;
    }
    this._apply(e);
  }
}

const EASE = {
  linear: (k) => k,
  inOut: (k) => 0.5 - 0.5 * Math.cos(Math.PI * k),
};

export class LazyEyes {
  constructor(root) {
    this.meta = null;
    root.traverse((o) => {
      if (!this.meta && o.userData && o.userData.lazyrig_sk_json) this.meta = JSON.parse(o.userData.lazyrig_sk_json);
    });
    if (!this.meta) throw new Error('LazyRig eye-shape data not found (export with Custom Properties enabled)');
    this.groups = this.meta.groups;
    this.variants = this.meta.variants;
    this.presets = this.meta.presets;
    this.defaults = { duration: this.meta.blend.duration, ease: this.meta.blend.ease };
    this.speed = 1;
    this.current = null;
    this.missing = [];
    this.targets = new Map();
    const byName = new Map();
    root.traverse((o) => {
      if (o.name) byName.set(o.name, o);
    });
    const clean = (n) => n.replace(/\s/g, '_').replace(/[\[\].:\/]/g, '');
    for (const g of this.groups) {
      for (const tid of g.targets) {
        if (this.targets.has(tid)) continue;
        const [on, kn] = tid.split('::');
        const obj = byName.get(clean(on)) || byName.get(on);
        const slots = [];
        if (obj) {
          obj.traverse((c) => {
            if (c.isMesh && c.morphTargetDictionary && c.morphTargetDictionary[kn] !== undefined) {
              slots.push([c, c.morphTargetDictionary[kn]]);
            }
          });
        }
        if (slots.length) this.targets.set(tid, { slots, value: slots[0][0].morphTargetInfluences[slots[0][1]] || 0 });
        else this.missing.push(tid);
      }
    }
    if (this.missing.length) console.warn('LazyEyes: shape keys not found in the GLB', this.missing);
    this._tr = null;
  }

  _set(map) {
    for (const tid in map) {
      const t = this.targets.get(tid);
      if (!t) continue;
      t.value = map[tid];
      for (const [m, i] of t.slots) m.morphTargetInfluences[i] = map[tid];
    }
  }

  _start(values, duration, ease) {
    const from = {};
    const to = {};
    for (const tid in values) {
      const t = this.targets.get(tid);
      if (!t) continue;
      from[tid] = t.value;
      to[tid] = values[tid];
    }
    if (!(duration > 0)) {
      this._tr = null;
      this._set(to);
      return;
    }
    this._tr = { from, to, t: 0, d: duration, ease: EASE[ease] || EASE.inOut };
  }

  _preset(x) {
    const p = typeof x === 'number' ? this.presets[x] : this.presets.find((q) => q.name === x);
    if (!p) throw new Error('Unknown preset: ' + x);
    return p;
  }

  setPreset(x, { duration, ease } = {}) {
    const p = this._preset(x);
    this._start(p.values, duration ?? this.defaults.duration, ease ?? this.defaults.ease);
    this.current = p.name;
  }

  setVariant(group, variant, { duration, ease } = {}) {
    const v = this.variants[group] && this.variants[group][variant];
    if (!v) throw new Error('Unknown variant: ' + group + '/' + variant);
    this._start(v, duration ?? this.defaults.duration, ease ?? this.defaults.ease);
  }

  mix(a, b, t) {
    const A = this._preset(a).values;
    const B = this._preset(b).values;
    const out = {};
    for (const tid of new Set([...Object.keys(A), ...Object.keys(B)])) {
      const cur = this.targets.has(tid) ? this.targets.get(tid).value : 0;
      const va = A[tid] ?? cur;
      const vb = B[tid] ?? cur;
      out[tid] = va + (vb - va) * t;
    }
    this._tr = null;
    this._set(out);
  }

  set(tid, value) {
    this._tr = null;
    this._set({ [tid]: value });
  }

  update(dt) {
    const tr = this._tr;
    if (!tr) return;
    tr.t += dt * this.speed;
    const k = Math.min(tr.t / tr.d, 1);
    const e = tr.ease(k);
    const out = {};
    for (const tid in tr.to) out[tid] = tr.from[tid] + (tr.to[tid] - tr.from[tid]) * e;
    this._set(out);
    if (k >= 1) this._tr = null;
  }
}
