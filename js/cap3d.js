let THREE;
// Proportions from DBK's dimension diagram (side view, total height ≈ cap diameter):
// crown dome ≈ 45%, band ≈ 20%, ear/neck flap drop ≈ 35%. Flap wraps the back and ends just in front of the ear (~76° each side).
const HALF = Math.PI / 2, FLAP = { maxA: 76 * Math.PI / 180, len: 0.72, flare: 0, curve: -0.045, r0: 1.01 }, CROWN_Y = 0.9, BAND_H = 0.42;
// Flap length across its width: full drop over the neck, rounding up into the band in front of the ear.
const flapProfile = u => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 3)), 0.6);
// Front = peak side opposite the hanging flap (flap covers the neck at the back).
const VIEWS = { front: [Math.PI, 0.2], right: [Math.PI / 2, 0.15], back: [0, 0.2], left: [-Math.PI / 2, 0.15], top: [Math.PI, 1.15] };

function weaveTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 2) {
    x.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.05})`; x.fillRect(i, 0, 1, 128);
    x.fillStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.04})`; x.fillRect(0, i, 128, 1);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Print texture for the 3D cap. Takes one or more product photos, prefers the flat fabric swatch
// (the photo with the least white background), crops a square without stretching and repeats it
// unmirrored, so vehicles, animals and lettering read the right way round.
function loadImg(url) {
  return new Promise(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
}
function whiteShare(img) {
  try {
    const k = document.createElement('canvas'); k.width = k.height = 48; const x = k.getContext('2d');
    x.drawImage(img, 0, 0, 48, 48); const d = x.getImageData(0, 0, 48, 48).data; let w = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 238 && d[i + 1] > 238 && d[i + 2] > 238) w++;
    return w / (48 * 48);
  } catch (e) { return 1; }
}
// Fabric prints repeat on a fixed grid, but product photos rarely end exactly on a repeat. Find the repeat
// distance along one axis by comparing the photo with shifted copies of itself (grey, downsampled).
function grey(img, sx, sy, sw, sh, W) {
  const H = Math.round(W * sh / sw), k = document.createElement('canvas'); k.width = W; k.height = H;
  const x = k.getContext('2d'); x.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data, g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
  return { g, W, H };
}
function findPeriod({ g, W, H }, axis) {
  const L = axis === 'x' ? W : H, min = Math.round(L * 0.18), max = Math.round(L * 0.82), at = (x, y) => g[y * W + x];
  const diff = p => { let s = 0, n = 0;
    if (axis === 'x') { for (let y = 0; y < H; y += 2) for (let x = 0; x + p < W; x += 2) { s += Math.abs(at(x, y) - at(x + p, y)); n++; } }
    else { for (let y = 0; y + p < H; y += 2) for (let x = 0; x < W; x += 2) { s += Math.abs(at(x, y) - at(x, y + p)); n++; } }
    return n ? s / n : 999; };
  const scores = []; for (let p = min; p <= max; p++) scores.push([p, diff(p)]);
  if (!scores.length) return 0;
  const sorted = scores.map(v => v[1]).sort((a, b) => a - b), median = sorted[sorted.length >> 1];
  const best = scores.reduce((a, b) => (b[1] < a[1] ? b : a));
  return best[1] < median * 0.55 ? best[0] / L : 0;   // fraction of the crop; 0 = no clear repeat
}
// Make a tile wrap smoothly along an axis with no known repeat: fade the far edge band over the near edge.
function crossFade(src, axis, frac = 0.1) {
  const w = src.width, h = src.height, b = Math.round((axis === 'x' ? w : h) * frac);
  const out = document.createElement('canvas'); out.width = axis === 'x' ? w - b : w; out.height = axis === 'y' ? h - b : h;
  const x = out.getContext('2d'); x.drawImage(src, 0, 0);
  const band = document.createElement('canvas'); band.width = axis === 'x' ? b : w; band.height = axis === 'y' ? b : h;
  const bx = band.getContext('2d');
  if (axis === 'x') bx.drawImage(src, w - b, 0, b, h, 0, 0, b, h); else bx.drawImage(src, 0, h - b, w, b, 0, 0, w, b);
  const gr = axis === 'x' ? bx.createLinearGradient(0, 0, b, 0) : bx.createLinearGradient(0, 0, 0, b);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  bx.globalCompositeOperation = 'destination-in'; bx.fillStyle = gr; bx.fillRect(0, 0, band.width, band.height);
  x.drawImage(band, 0, 0);
  return out;
}
async function patternTexture(urls) {
  const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean).slice(0, 6);
  const imgs = (await Promise.all(list.map(loadImg))).filter(Boolean);
  if (!imgs.length) return null;
  try {
    const scored = imgs.map(img => ({ img, w: whiteShare(img) })).sort((a, b) => a.w - b.w);
    const best = scored[0], img = best.img, W = img.naturalWidth, H = img.naturalHeight, swatch = best.w < 0.08;
    // crop: whole swatch (minus a hairline border), or a square from the crown of a cap photo
    let sx, sy, sw, sh;
    if (swatch) { sx = W * 0.02; sy = H * 0.02; sw = W * 0.96; sh = H * 0.96; }
    else { sw = sh = Math.min(W, H) * 0.34; sx = W * 0.5 - sw / 2; sy = H * 0.42 - sh / 2; }
    let px = 0, py = 0;
    if (swatch) { const gm = grey(img, sx, sy, sw, sh, 220); px = findPeriod(gm, 'x'); py = findPeriod(gm, 'y'); }
    const tw = px ? sw * px : sw, th = py ? sh * py : sh;
    const scale = 1024 / Math.max(tw, th);
    let tile = document.createElement('canvas'); tile.width = Math.round(tw * scale); tile.height = Math.round(th * scale);
    tile.getContext('2d').drawImage(img, sx, sy, tw, th, 0, 0, tile.width, tile.height);
    if (!px) tile = crossFade(tile, 'x');
    if (!py) tile = crossFade(tile, 'y');
    // square texture so the cap's repeat counts keep motifs in proportion
    const side = Math.max(tile.width, tile.height), c = document.createElement('canvas'); c.width = c.height = 1024;
    const x = c.getContext('2d');
    const rx = Math.max(1, Math.round(side / tile.width)), ry = Math.max(1, Math.round(side / tile.height));
    const cw = 1024 / rx, ch = 1024 / ry;
    for (let i = 0; i < rx; i++) for (let j = 0; j < ry; j++) x.drawImage(tile, i * cw, j * ch, cw, ch);
    x.getImageData(0, 0, 1, 1);
    for (let k = 0; k < 1024; k += 4) { x.fillStyle = 'rgba(0,0,0,.03)'; x.fillRect(k, 0, 1, 1024); x.fillRect(0, k, 1024, 1); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    t.userData = { swatch, repeatX: !!px, repeatY: !!py, sizeK: Math.max(tw / sw, th / sh) };
    return t;
  } catch (e) { return null; }
}

function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'); const g = x.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

// Welding-cap flap: hangs straight DOWN at the back/sides and curves slightly in towards the neck at the hem.
function flapGeometry(r0, y0) {
  const segA = 72, segL = 12, maxA = FLAP.maxA, len = FLAP.len, flare = FLAP.flare, pos = [], uv = [], idx = [];
  for (let i = 0; i <= segA; i++) {
    const u = -1 + (2 * i) / segA, a = Math.PI + u * maxA;
    const L = len * flapProfile(u) + 0.001;
    for (let j = 0; j <= segL; j++) {
      const t = j / segL, d = L * t;
      const r = r0 + d * Math.sin(flare) + FLAP.curve * Math.pow(t, 2) * (L / len);
      pos.push(Math.sin(a) * r, y0 - d * Math.cos(flare), Math.cos(a) * r);
      uv.push(i / segA, t);
    }
  }
  const id = (i, j) => i * (segL + 1) + j;
  for (let i = 0; i < segA; i++) for (let j = 0; j < segL; j++) {
    idx.push(id(i, j), id(i, j + 1), id(i + 1, j), id(i + 1, j), id(i, j + 1), id(i + 1, j + 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return { g, pos, segA, segL, id };
}

export function createCapViewer(el, { onPlace, onView } = {}, T) {
  THREE = T;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const cv = renderer.domElement;
  Object.assign(cv.style, { width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'grab' });
  el.appendChild(cv);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0, 6.9); camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a948c, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 5, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.7); fill.position.set(-4, 1, -3); scene.add(fill);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1.02; scene.add(shadow);

  const cap = new THREE.Group(); scene.add(cap);
  const weave = weaveTexture();
  const fabric = new THREE.MeshStandardMaterial({ color: 0xf6f6f4, map: weave, roughness: 0.92 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xeeeeeb, map: weave, roughness: 0.92 });
  const liner = new THREE.MeshStandardMaterial({ color: 0x1f1f20, roughness: 0.95, side: THREE.BackSide });
  const seamMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 });
  // Crown panel seams: dashed stitching like the band (welding caps have no top button). Dash sizes allow for the crown's vertical scale.
  const crownStitch = new THREE.LineDashedMaterial({ color: 0x000000, transparent: true, opacity: 0.45, dashSize: 0.024, gapSize: 0.017 });
  const stitchMat = new THREE.LineDashedMaterial({ color: 0x000000, transparent: true, opacity: 0.45, dashSize: 0.025, gapSize: 0.018 });

  const crown = new THREE.Group(); crown.scale.set(1, CROWN_Y, 1); cap.add(crown);
  const domeGeo = new THREE.SphereGeometry(1, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2);
  const dome = new THREE.Mesh(domeGeo, fabric); crown.add(dome);
  crown.add(new THREE.Mesh(domeGeo, liner));
  for (let i = 0; i < 6; i++) {
    const phi = (i * Math.PI) / 3 + Math.PI / 6, pts = [];
    for (let k = 0; k <= 40; k++) { const th = (k / 40) * (Math.PI / 2); pts.push(new THREE.Vector3(-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th)).multiplyScalar(1.003)); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.slice(1)), crownStitch); l.computeLineDistances(); crown.add(l);
  }

  const bandH = BAND_H;
  const bandGeo = new THREE.CylinderGeometry(1.0, 1.01, bandH, 96, 1, true);
  const band = new THREE.Mesh(bandGeo, bandMat); band.position.y = -bandH / 2; cap.add(band);
  const bandIn = new THREE.Mesh(bandGeo, liner); bandIn.position.y = -bandH / 2; cap.add(bandIn);
  const ring = (r, y) => { const pts = []; for (let k = 0; k <= 128; k++) { const a = (k / 128) * Math.PI * 2; pts.push(new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r)); } const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), stitchMat); l.computeLineDistances(); cap.add(l); };
  ring(1.006, -0.03); ring(1.014, -bandH + 0.03);

  const flap = flapGeometry(FLAP.r0, 0);
  const flapG = new THREE.Group(); flapG.position.y = -bandH; cap.add(flapG);
  const flapOut = new THREE.Mesh(flap.g, new THREE.MeshStandardMaterial({ color: 0xf6f6f4, map: weave, roughness: 0.92, side: THREE.FrontSide })); flapG.add(flapOut);
  const flapIn = new THREE.Mesh(flap.g, new THREE.MeshStandardMaterial({ color: 0x1f1f20, roughness: 0.95, side: THREE.BackSide })); flapG.add(flapIn);
  const flapLine = (j, off) => {

    const pts = [];
    for (let i = 2; i <= flap.segA - 2; i++) { const o = flap.id(i, j) * 3; const x = flap.pos[o], y = flap.pos[o + 1], z = flap.pos[o + 2], k = 1 + off / Math.hypot(x, z); pts.push(new THREE.Vector3(x * k, y, z * k)); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), stitchMat); l.computeLineDistances(); flapG.add(l);
  };
  [0.3, 0.6, 0.88].forEach(t => flapLine(Math.round(t * flap.segL), 0.006));
  const edge = []; for (let i = 0; i <= flap.segA; i++) { const o = flap.id(i, flap.segL) * 3; edge.push(new THREE.Vector3(flap.pos[o], flap.pos[o + 1], flap.pos[o + 2])); }
  flapG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(edge), seamMat));
  // Woven DBK label: white tag with the logo drawn onto it (falls back to a plain tag if the logo can't load).
  const tagC = document.createElement('canvas'); tagC.width = 512; tagC.height = 320;
  const tagTex = new THREE.CanvasTexture(tagC); tagTex.colorSpace = THREE.SRGBColorSpace; tagTex.anisotropy = 8;
  const drawTag = img => {
    const x = tagC.getContext('2d'); x.fillStyle = '#fbfbf9'; x.fillRect(0, 0, 512, 320);
    for (let i = 0; i < 320; i += 3) { x.fillStyle = 'rgba(0,0,0,.025)'; x.fillRect(0, i, 512, 1); }
    x.strokeStyle = 'rgba(0,0,0,.18)'; x.setLineDash([10, 7]); x.lineWidth = 3; x.strokeRect(14, 14, 484, 292);
    if (img) { const k = Math.min(440 / img.width, 250 / img.height), w = img.width * k, h = img.height * k; x.drawImage(img, (512 - w) / 2, (320 - h) / 2, w, h); }
    tagTex.needsUpdate = true;
  };
  drawTag(null);
  { const img = new Image(); img.onload = () => drawTag(img); try { img.src = (window.__resources && window.__resources.tagLogo) || new URL('../assets/dbk-logo.avif', import.meta.url).href; } catch (e) {} }
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.163), new THREE.MeshStandardMaterial({ map: tagTex, roughness: 0.85, side: THREE.DoubleSide }));
  const ta = Math.PI + 0.95; // DBK tag on the right side, where staff sew it
  tag.position.set(Math.sin(ta) * 1.02, -bandH - 0.12, Math.cos(ta) * 1.02); tag.rotation.y = ta; cap.add(tag);

  // embroidery patch
  const embCanvas = document.createElement('canvas'); embCanvas.width = embCanvas.height = 1024;
  const embTex = new THREE.CanvasTexture(embCanvas); embTex.colorSpace = THREE.SRGBColorSpace; embTex.anisotropy = 8;
  const embMat = new THREE.MeshStandardMaterial({ map: embTex, transparent: true, alphaTest: 0.02, roughness: 0.45, metalness: 0.08, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  embMat.side = THREE.DoubleSide;
  const patch = new THREE.Mesh(new THREE.BufferGeometry(), embMat); patch.renderOrder = 2; cap.add(patch);
  const outline = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0x1d1d1f, dashSize: 0.03, gapSize: 0.02, transparent: true, opacity: 0.7 }));
  cap.add(outline);

  const tagMat = tag.material, flapMat = flapOut.material;
  const fabricMeshes = [[fabric, [5, 1.8]], [bandMat, [6, 0.42]], [flapMat, [3, 0.6]]];
  let patReq = 0;
  let flapK = 1;
  let place = { phi: Math.PI * 1.5, s: 1.02 }, emb = null, locked = false, hover = false, dragging = null;
  // Intro: open on the side elevation (flap visible), tilted slightly down, then turn to the front after 2s.
  // Any drag or view change before then cancels the turn.
  const INTRO = { yaw: VIEWS.right[0], pitch: 0.32, delay: 2000, front: [VIEWS.front[0], 0.28] };
  let yaw = INTRO.yaw, pitch = INTRO.pitch, tYaw = yaw, tPitch = pitch, ease = 0.14;
  let introT = setTimeout(() => { introT = null; ease = 0.045; tYaw = INTRO.front[0]; tPitch = INTRO.front[1]; onView && onView('front'); setTimeout(() => { ease = 0.14; }, 1600); }, INTRO.delay);
  const cancelIntro = () => { if (introT) { clearTimeout(introT); introT = null; } ease = 0.14; };

  function sizeAngle() { return 0.62 * ((emb && emb.scale) || 1); }
  // Whole-cap surface param: phi around the head, s = distance down from the button (crown → band → flap).
  function flapL(phi) {
    let a = Math.atan2(-Math.cos(phi), Math.sin(phi)); if (a < 0) a += 2 * Math.PI;
    const u = (a - Math.PI) / FLAP.maxA; if (Math.abs(u) >= 1) return 0;
    return FLAP.len * flapProfile(u);
  }
  const sMax = phi => HALF + bandH + flapL(phi) * flapK - 0.01;
  function surf(phi, s, off) {
    const cx = -Math.cos(phi), cz = Math.sin(phi);
    if (s <= HALF) { const st = Math.sin(s) * (1 + off); return new THREE.Vector3(cx * st, Math.cos(s) * (1 + off) * CROWN_Y, cz * st); }
    if (s <= HALF + bandH) { const d = s - HALF, r = 1.0 + 0.01 * (d / bandH) + off; return new THREE.Vector3(cx * r, -d, cz * r); }
    const L = flapL(phi); let dd = Math.min((s - HALF - bandH) / flapK, L); const t = L ? dd / L : 0;
    const r = FLAP.r0 + dd * Math.sin(FLAP.flare) + FLAP.curve * t * t * (L / FLAP.len) + off;
    return new THREE.Vector3(cx * r, -bandH - dd * Math.cos(FLAP.flare) * flapK, cz * r);
  }
  function invert(p) {
    const phi = Math.atan2(p.z, -p.x);
    if (p.y > 0) return { phi, s: Math.acos(Math.min(1, Math.max(-1, p.y / CROWN_Y / Math.max(1e-6, Math.hypot(p.x, p.y / CROWN_Y, p.z))))) };
    if (p.y >= -bandH) return { phi, s: HALF - p.y };
    return { phi, s: HALF + bandH + (-bandH - p.y) / Math.cos(FLAP.flare) };
  }
  function region(p) { return p.s < HALF ? 'Crown' : p.s < HALF + bandH ? 'Band' : 'Flap'; }
  // Placement rules (DBK): on the flap, embroidery may cross the flap stitching. On the band it must sit between the
  // top and bottom stitch rows. On the crown it must stay inside one of the 6 panels, clear of the panel seams and the
  // crown/band seam. If the design is too big for its zone it is scaled down to fit (fitK < 1).
  let ink = { x0: 0.08, x1: 0.92, y0: 0.38, y1: 0.62 }, fitK = 1;
  const STITCH_M = 0.03, BAND_TOP = 0.03 + STITCH_M, BAND_BOT = 0.03 + STITCH_M, PANEL = Math.PI / 3;
  function measureInk(mask) {
    const d = mask.getContext('2d').getImageData(0, 0, 1024, 1024).data;
    let x0 = 1024, x1 = -1, y0 = 1024, y1 = -1;
    for (let y = 0; y < 1024; y += 4) for (let x = 0; x < 1024; x += 4) if (d[(y * 1024 + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return;
    ink = { x0: Math.max(0, x0 - 6) / 1024, x1: Math.min(1024, x1 + 10) / 1024, y0: Math.max(0, y0 - 6) / 1024, y1: Math.min(1024, y1 + 10) / 1024 };
  }
  const clamp = (v, lo, hi) => lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi);
  function clampPlace(p) {
    const W0 = sizeAngle(), hF = ink.y1 - ink.y0, wF = ink.x1 - ink.x0;
    let phi = p.phi, s = p.s, k = 1;
    const cs = s + W0 * ((ink.y0 + ink.y1) / 2 - 0.5);
    const zone = cs < HALF ? 'crown' : cs < HALF + bandH ? 'band' : 'flap';
    const lo = zone === 'crown' ? 0.07 : zone === 'band' ? HALF + BAND_TOP : HALF + bandH + 0.01;
    const hi = zone === 'crown' ? HALF - STITCH_M : zone === 'band' ? HALF + bandH - BAND_BOT : sMax(phi);
    if (zone !== 'flap' && W0 * hF > hi - lo) k = (hi - lo) / (W0 * hF);
    let W = W0 * k;
    s = clamp(s, lo + W * (0.5 - ink.y0), hi - W * (ink.y1 - 0.5));
    if (zone === 'crown') {
      const rc = Math.max(Math.sin(s), 0.35), mA = STITCH_M / rc, avail = PANEL - 2 * mA, wA = W * wF / rc;
      if (wA > avail) { k *= avail / wA; W = W0 * k; s = clamp(s, lo + W * (0.5 - ink.y0), hi - W * (ink.y1 - 0.5)); }
      const span = W / Math.max(Math.sin(s), 0.35);
      const rel = (((phi - Math.PI / 6) % PANEL) + PANEL) % PANEL, pLo = phi - rel;
      phi = clamp(phi, pLo + mA + span * (0.5 - ink.x0), pLo + PANEL - mA - span * (ink.x1 - 0.5));
    }
    fitK = k;
    return { phi, s };
  }
  function rebuildPatch() {
    place = clampPlace(place); const W = sizeAngle() * fitK;
    const rc = place.s < HALF ? Math.max(Math.sin(place.s), 0.35) : 1.03, span = W / rc, n = 36;
    const P = (i, j, off) => { const ph = place.phi - span / 2 + (span * i) / n; return surf(ph, Math.min(place.s - W / 2 + (W * j) / n, sMax(ph)), off); };
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { const v = P(i, j, 0.008); pos.push(v.x, v.y, v.z); uv.push(i / n, 1 - j / n); }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + n + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    patch.geometry.dispose(); patch.geometry = g;
    // Dashed guide hugs the actual text/image (not the full square patch), so it shows exactly what must clear the stitching.
    const pts = [], i0 = ink.x0 * n, i1 = ink.x1 * n, j0 = ink.y0 * n, j1 = ink.y1 * n, q = 24;
    for (let k = 0; k <= q; k++) pts.push(P(i0 + (i1 - i0) * k / q, j0, 0.013));
    for (let k = 0; k <= q; k++) pts.push(P(i1, j0 + (j1 - j0) * k / q, 0.013));
    for (let k = q; k >= 0; k--) pts.push(P(i0 + (i1 - i0) * k / q, j1, 0.013));
    for (let k = q; k >= 0; k--) pts.push(P(i0, j0 + (j1 - j0) * k / q, 0.013));
    outline.geometry.dispose(); outline.geometry = new THREE.BufferGeometry().setFromPoints(pts); outline.computeLineDistances();
    patch.visible = !!emb; outline.visible = !!emb && !locked && (hover || !!dragging);
  }

  // Satin-stitch embroidery: thread-direction fill with raised shading.
  function stitchFill(th, angle, pitch) {
    const c = document.createElement('canvas'); c.width = c.height = 1024; const x = c.getContext('2d');
    x.fillStyle = th.d; x.fillRect(0, 0, 1024, 1024);
    x.save(); x.translate(512, 512); x.rotate(angle);
    for (let i = -760; i < 760; i += pitch) {
      const g = x.createLinearGradient(0, i, 0, i + pitch);
      g.addColorStop(0, th.d); g.addColorStop(0.35, th.c); g.addColorStop(0.55, th.l); g.addColorStop(0.8, th.c); g.addColorStop(1, th.d);
      x.globalAlpha = 0.85 + Math.random() * 0.15; x.fillStyle = g; x.fillRect(-760, i, 1520, pitch - 0.6);
    }
    x.restore(); x.globalAlpha = 1;
    return c;
  }
  function lum(hex) { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }
  async function drawEmb() {
    const x = embCanvas.getContext('2d'); x.clearRect(0, 0, 1024, 1024);
    if (!emb) { embTex.needsUpdate = true; return; }
    const th = emb.thread;
    const mask = document.createElement('canvas'); mask.width = mask.height = 1024; const m = mask.getContext('2d');
    m.translate(512, 512); m.rotate(((emb.rot || 0) * Math.PI) / 180);
    let bw = 18;
    if (emb.mode === 'text') {
      const fam = `${emb.weight || 400} 300px "${emb.font}"`;
      try { await document.fonts.load(fam, emb.text); } catch (e) {}
      m.font = fam; const w = m.measureText(emb.text).width || 1;
      const fs = Math.min(300, (300 * 860) / w); bw = Math.max(10, fs / 11);
      m.font = `${emb.weight || 400} ${fs}px "${emb.font}"`; m.textAlign = 'center'; m.textBaseline = 'middle';
      m.fillStyle = '#000'; m.lineJoin = 'round'; m.lineWidth = Math.max(2, fs / 60); m.strokeStyle = '#000';
      m.fillText(emb.text, 0, 0); m.strokeText(emb.text, 0, 0);
    } else if ((emb.mode === 'upload' || emb.mode === 'stitch') && emb.upload) {
      const img = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = emb.upload; });
      if (!img) { embTex.needsUpdate = true; return; }
      const k = Math.min(820 / img.width, 820 / img.height), w = img.width * k, h = img.height * k;
      m.drawImage(img, -w / 2, -h / 2, w, h);
    } else { embTex.needsUpdate = true; return; }
    m.setTransform(1, 0, 0, 1, 0, 0);
    measureInk(mask);
    const fill = document.createElement('canvas'); fill.width = fill.height = 1024; const fx = fill.getContext('2d');
    if (emb.mode === 'text') {
      fx.drawImage(stitchFill(th, -0.6, 7), 0, 0);
    } else if (emb.mode === 'stitch') {
      fx.drawImage(mask, 0, 0); // real stitches from a DST font: already shaded, no fake satin overlay
    } else {
      fx.drawImage(mask, 0, 0);
      fx.globalCompositeOperation = 'multiply'; fx.globalAlpha = 0.55; fx.drawImage(stitchFill({ c: '#ffffff', l: '#ffffff', d: '#8a8a8a' }, -0.6, 6), 0, 0);
      fx.globalAlpha = 1; fx.globalCompositeOperation = 'source-over';
    }
    fx.globalCompositeOperation = 'destination-in'; fx.drawImage(mask, 0, 0); fx.globalCompositeOperation = 'source-over';
    // raised edge: dark inner shadow bottom-right, light top-left
    const edge = (dx, dy, col, a) => { const c = document.createElement('canvas'); c.width = c.height = 1024; const cx = c.getContext('2d');
      cx.fillStyle = col; cx.fillRect(0, 0, 1024, 1024); cx.globalCompositeOperation = 'destination-out'; cx.drawImage(mask, dx, dy);
      cx.globalCompositeOperation = 'destination-in'; cx.drawImage(mask, 0, 0); fx.globalAlpha = a; fx.drawImage(c, 0, 0); fx.globalAlpha = 1; };
    if (emb.mode !== 'stitch') { edge(-4, -4, '#000', 0.45); edge(4, 4, '#fff', 0.35); }
    // No outline border: just the raised stitched fill with a soft contact shadow.
    x.save(); x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 8; x.shadowOffsetY = 4; x.drawImage(fill, 0, 0); x.restore();
    embTex.needsUpdate = true;
    rebuildPatch(); emitPlace();
  }

  // interaction
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function hit(ev, objs) {
    const r = cv.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); return ray.intersectObjects(objs, false)[0];
  }
  function toPlace(pt) { return invert(cap.worldToLocal(pt.clone())); }
  const surfaces = () => [dome, band, flapOut];
  function emitPlace() { onPlace && onPlace(describe()); }
  let down = null;
  cv.addEventListener('pointerdown', ev => {
    cancelIntro();
    cv.setPointerCapture(ev.pointerId);
    const onPatch = emb && !locked && hit(ev, [patch]);
    down = { x: ev.clientX, y: ev.clientY, yaw: tYaw, pitch: tPitch, moved: false };
    dragging = onPatch ? 'emb' : 'orbit';
    cv.style.cursor = 'grabbing'; rebuildPatch();
  });
  cv.addEventListener('pointermove', ev => {
    if (!dragging) {
      const h = emb && !locked && !!hit(ev, [patch]);
      if (h !== hover) { hover = h; cv.style.cursor = h ? 'move' : 'grab'; rebuildPatch(); }
      return;
    }
    if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 4) down.moved = true;
    if (dragging === 'emb') {
      const h = hit(ev, surfaces()); if (h) { place = toPlace(h.point); rebuildPatch(); emitPlace(); }
    } else {
      tYaw = down.yaw + (ev.clientX - down.x) * 0.01;
      tPitch = Math.max(-0.25, Math.min(1.25, down.pitch + (ev.clientY - down.y) * 0.006));
    }
  });
  const up = ev => {
    if (!dragging) return;
    if (dragging === 'orbit' && !down.moved && emb && !locked) {
      const h = hit(ev, surfaces()); if (h) { place = toPlace(h.point); rebuildPatch(); emitPlace(); }
    }
    if (dragging === 'orbit' && down.moved) onView && onView(nearestView());
    dragging = null; cv.style.cursor = hover ? 'move' : 'grab'; rebuildPatch();
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { if (!dragging && hover) { hover = false; rebuildPatch(); } });

  function nearestView() {
    if (tPitch > 0.85) return 'top';
    const y = ((tYaw % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    const opts = [['back', 0], ['left', -Math.PI / 2], ['front', Math.PI], ['front', -Math.PI], ['right', Math.PI / 2]];
    return opts.reduce((b, o) => (Math.abs(o[1] - y) < Math.abs(b[1] - y) ? o : b))[0];
  }
  function describe() {
    const az = THREE.MathUtils.radToDeg(place.phi + Math.PI / 2);
    const a = ((az + 540) % 360) - 180, reg = region(place);
    const side = Math.abs(a) < 20 ? 'Front' : Math.abs(a) > 160 ? 'Back' : a > 0 ? 'Wearer’s left' : 'Wearer’s right';
    const up = Math.round(THREE.MathUtils.radToDeg(HALF - place.s));
    const detail = reg === 'Crown' ? `${up}° above band` : reg === 'Band' ? 'on the band' : `${Math.round((place.s - HALF - bandH) / (flapK * FLAP.len) * 100)}% down the flap`;
    const fitted = fitK < 0.995;
    return { phi: place.phi, s: place.s, azimuth: Math.round(a), region: reg, side, fitted, fit: Math.round(fitK * 100), text: `${side} · ${reg} · ${Math.abs(Math.round(a))}° from centre front · ${detail}${fitted ? ` · reduced to ${Math.round(fitK * 100)}% to fit between the stitching` : ''}` };
  }

  function resize() {
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(el); resize();
  window.addEventListener('resize', resize); requestAnimationFrame(resize); setTimeout(resize, 250);

  let raf, alive = true, lastFrame = 0;
  function frame() {
    yaw += (tYaw - yaw) * ease; pitch += (tPitch - pitch) * ease;
    cap.rotation.set(pitch, yaw, 0, 'XYZ'); cap.position.y = 0.12;
    renderer.render(scene, camera); lastFrame = performance.now();
  }
  (function loop() { if (!alive) return; frame(); raf = requestAnimationFrame(loop); })();
  const fallback = setInterval(() => { if (alive && performance.now() - lastFrame > 150) frame(); }, 60);

  rebuildPatch();
  return {
    setFlap(k) { flapG.scale.y = k; flapK = k; rebuildPatch(); },
    setColors({ fabric: f, liner: l }) {
      if (l) { liner.color.set(l); flapIn.material.color.set(l); }
    },
    // look: { mode: 'white'|'colour'|'print', fabric: hex, pattern: url, seam: hex }
    async setAppearance({ mode, fabric: fx, pattern, seam }) {
      if (seam) { seamMat.color.set(seam); stitchMat.color.set(seam); crownStitch.color.set(seam); const lum = new THREE.Color(seam).getHSL({}).l; seamMat.opacity = stitchMat.opacity = crownStitch.opacity = lum > 0.6 ? 0.95 : 0.6; }
      const req = ++patReq;
      const apply = (tex, col) => fabricMeshes.forEach(([m, r]) => {
        if (tex) { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(r[0], r[1]); m.map = t; } else m.map = weave;
        m.color.set(col); m.needsUpdate = true;
      });
      if (mode === 'print' && pattern) {
        const t = await patternTexture(pattern); if (req !== patReq) return false;
        if (t) { apply(t, 0xffffff); return true; }
        apply(null, fx || 0xf6f6f4); return false;
      }
      apply(null, mode === 'colour' && fx ? fx : 0xf6f6f4); return true;
    },
    async setEmbroidery(cfg) { emb = cfg; rebuildPatch(); await drawEmb(); },
    setView(k) {
      const v = VIEWS[k]; if (!v) return; cancelIntro();
      const cur = tYaw, target = v[0];
      tYaw = cur + ((((target - cur) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI); tPitch = v[1];
    },
    faceCamera() {
      const y = tYaw; place = clampPlace({ phi: Math.atan2(Math.cos(y), Math.sin(y)), s: Math.max(0.5, 1.05 - tPitch * 0.55) });
      rebuildPatch(); emitPlace();
    },
    setLocked(v) { locked = v; rebuildPatch(); },
    setPlace(p) {
      if (!p) return; cancelIntro(); place = clampPlace({ phi: p.phi, s: p.s }); rebuildPatch(); emitPlace();
      const target = Math.atan2(Math.cos(place.phi), Math.sin(place.phi));
      tYaw = tYaw + ((((target - tYaw) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
      tPitch = place.s > HALF ? 0.05 : 0.3; onView && onView(nearestView());
    },
    resize,
    describe,
    capture() { renderer.render(scene, camera); return cv.toDataURL('image/png'); },
    destroy() { cancelIntro(); window.removeEventListener('resize', resize); alive = false; cancelAnimationFrame(raf); clearInterval(fallback); ro.disconnect(); renderer.dispose(); cv.remove(); },
  };
}
