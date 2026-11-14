// node tools/hana_bake/bake.cjs <thư mục có hana_scene.glb + textures/ + hana-three.js> <thư mục three r160>  → assets/decal/h_*.png + h_meta.json
const {chromium} = require('playwright'); const fs = require('fs'); const path = require('path');
const [,, SRC, TJ] = process.argv, OUT = path.join(__dirname, '../../assets/decal');
(async () => {
  const b = await chromium.launch({args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']});
  const meta = {};
  const jobs = [['tree1', 512, 640], ['tree2', 512, 640], ['bush2', 512, 320], ['bush3', 512, 320], ['bush4', 512, 320], ['berry', 512, 320], ['grass', 1024, 256]];
  for (const [what, w, h] of jobs) {
    const p = await b.newPage({viewport: {width: w, height: h}});
    await p.route('**/*', r => { const u = r.request().url(); const m = u.match(/three@0\.160\.0\/(.*)$/); if (m) return r.fulfill({path: path.join(TJ, m[1]), contentType: 'application/javascript'});
      const m2 = u.match(/^http:\/\/bake\/([^?]*)/); if (m2) { const f = m2[1] === 'bake.html' ? path.join(__dirname, 'bake.html') : path.join(SRC, decodeURIComponent(m2[1])); return r.fulfill({path: f, contentType: f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'application/javascript' : 'application/octet-stream'}); }
      return r.abort(); });
    p.on('pageerror', e => console.log('ERR', e.message));
    await p.goto(`http://bake/bake.html?what=${what}&w=${w}&h=${h}`);
    await p.waitForFunction(() => window.__out, null, {timeout: 120000});
    const o = await p.evaluate(() => window.__out);
    fs.writeFileSync(path.join(OUT, 'h_' + what + '.png'), Buffer.from(o.png.split(',')[1], 'base64'));
    meta[what] = {w: +o.w.toFixed(3), h: +o.h.toFixed(3), bh: +o.bh.toFixed(3), base: +o.base.toFixed(4)}; console.log(what, JSON.stringify(meta[what])); await p.close();
  }
  fs.writeFileSync(path.join(OUT, 'h_meta.json'), JSON.stringify(meta)); await b.close();
})();
