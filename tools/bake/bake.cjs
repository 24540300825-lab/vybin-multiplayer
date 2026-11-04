// node tools/bake/bake.cjs  (cần server tĩnh phục vụ repo ở :8124, three.js map qua /__three/) → tools/bake/out/*.png + info.json
const {chromium} = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const b = await chromium.launch({args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
  const out = path.join(__dirname, 'out'); fs.mkdirSync(out, {recursive: true}); const info = {};
  const jobs = [['grass', 2048, 512], ['pine', 1024, 1024], ['round1', 1024, 1024], ['round2', 1024, 1024], ['round3', 1024, 1024], ['round4', 1024, 1024], ['round5', 1024, 1024]];
  for (const [what, w, h] of jobs) for (const pass of ['alb', 'nrm']) {
    const p = await b.newPage({viewport: {width: w, height: what === 'grass' ? 1400 : h}}); p.on('pageerror', e => console.log('ERR', e.message));
    await p.goto(`http://localhost:8124/tools/bake/index.html?w=${w}&h=${h}&what=${what}&pass=${pass}`);
    await p.waitForFunction(() => window.__done, null, {timeout: 300000});
    const url = await p.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
    fs.writeFileSync(path.join(out, `${what}_${pass}.png`), Buffer.from(url.split(',')[1], 'base64'));
    info[what] = await p.evaluate(() => window.__info); console.log(what, pass, JSON.stringify(info[what])); await p.close();
  }
  fs.writeFileSync(path.join(out, 'info.json'), JSON.stringify(info, null, 1)); await b.close();
})();
