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

// Crop the print from the middle of a product photo and mirror-tile it so repeats are seamless.
function patternTexture(url) {
  return new Promise(res => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const W = img.naturalWidth, H = img.naturalHeight, sw = W * 0.26, sh = H * 0.2, sx = W * 0.37, sy = H * 0.3;
        const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
          x.save(); x.translate(i * 256 + (i ? 256 : 0), j * 256 + (j ? 256 : 0)); x.scale(i ? -1 : 1, j ? -1 : 1);
          x.drawImage(img, sx, sy, sw, sh, 0, 0, 256, 256); x.restore();
        }
        x.getImageData(0, 0, 1, 1);
        for (let k = 0; k < 512; k += 3) { x.fillStyle = 'rgba(0,0,0,.035)'; x.fillRect(k, 0, 1, 512); x.fillRect(0, k, 512, 1); }
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
        res(t);
      } catch (e) { res(null); }
    };
    img.onerror = () => res(null); img.src = url;
  });
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
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.2), new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.8 }));
  const ta = Math.PI - 0.95; tag.position.set(Math.sin(ta) * 1.02, -bandH - 0.12, Math.cos(ta) * 1.02); tag.rotation.y = ta; cap.add(tag);

  // embroidery patch
  const embCanvas = document.createElement('canvas'); embCanvas.width = embCanvas.height = 1024;
  const embTex = new THREE.CanvasTexture(embCanvas); embTex.colorSpace = THREE.SRGBColorSpace; embTex.anisotropy = 8;
  const embMat = new THREE.MeshStandardMaterial({ map: embTex, transparent: true, alphaTest: 0.02, roughness: 0.45, metalness: 0.08, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  embMat.side = THREE.DoubleSide;
  const patch = new THREE.Mesh(new THREE.BufferGeometry(), embMat); patch.renderOrder = 2; cap.add(patch);
  const outline = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0x1d1d1f, dashSize: 0.03, gapSize: 0.02, transparent: true, opacity: 0.7 }));
  cap.add(outline);

  const tagMat = tag.material, flapMat = flapOut.material;
  const fabricMeshes = [[fabric, [6, 2.2]], [bandMat, [7, 0.5]], [flapMat, [3.6, 0.7]]];
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
  function clampPlace(p) {
    const W = sizeAngle();
    return { phi: p.phi, s: Math.min(Math.max(p.s, W / 2 + 0.02), Math.max(W / 2 + 0.02, sMax(p.phi) - W / 2)) };
  }
  function rebuildPatch() {
    const W = sizeAngle(); place = clampPlace(place);
    const rc = place.s < HALF ? Math.max(Math.sin(place.s), 0.35) : 1.03, span = W / rc, n = 36;
    const P = (i, j, off) => { const ph = place.phi - span / 2 + (span * i) / n; return surf(ph, Math.min(place.s - W / 2 + (W * j) / n, sMax(ph)), off); };
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { const v = P(i, j, 0.008); pos.push(v.x, v.y, v.z); uv.push(i / n, 1 - j / n); }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + n + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    patch.geometry.dispose(); patch.geometry = g;
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(P(i, 0, 0.013));
    for (let j = 0; j <= n; j++) pts.push(P(n, j, 0.013));
    for (let i = n; i >= 0; i--) pts.push(P(i, n, 0.013));
    for (let j = n; j >= 0; j--) pts.push(P(0, j, 0.013));
    outline.geometry.dispose(); outline.geometry = new THREE.BufferGeometry().setFromPoints(pts); outline.computeLineDistances();
    patch.visible = !!emb; outline.visible = !!emb && !locked && (hover || !!dragging);
  }

  // Satin-stitch embroidery: thread-direction fill, raised shading, contrasting merrow border so it reads on busy prints.
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
    const th = emb.thread, border = lum(th.c) > 0.45 ? '#141415' : '#f7f6f2';
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
    } else if (emb.mode === 'upload' && emb.upload) {
      const img = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = emb.upload; });
      if (!img) { embTex.needsUpdate = true; return; }
      const k = Math.min(820 / img.width, 820 / img.height), w = img.width * k, h = img.height * k;
      m.drawImage(img, -w / 2, -h / 2, w, h);
    } else { embTex.needsUpdate = true; return; }
    m.setTransform(1, 0, 0, 1, 0, 0);
    const fill = document.createElement('canvas'); fill.width = fill.height = 1024; const fx = fill.getContext('2d');
    if (emb.mode === 'text') {
      fx.drawImage(stitchFill(th, -0.6, 7), 0, 0);
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
    edge(-4, -4, '#000', 0.45); edge(4, 4, '#fff', 0.35);
    // border ring (merrow / outline stitch) built by dilating the mask
    const ring = document.createElement('canvas'); ring.width = ring.height = 1024; const rx = ring.getContext('2d');
    for (let a = 0; a < 24; a++) { const t = (a / 24) * Math.PI * 2; rx.drawImage(mask, Math.cos(t) * bw, Math.sin(t) * bw); rx.drawImage(mask, Math.cos(t) * bw * 0.5, Math.sin(t) * bw * 0.5); }
    rx.globalCompositeOperation = 'source-in'; rx.fillStyle = border; rx.fillRect(0, 0, 1024, 1024);
    rx.globalCompositeOperation = 'source-atop'; rx.globalAlpha = 0.35;
    rx.drawImage(stitchFill(border === '#141415' ? { c: '#2a2a2c', l: '#4a4a4e', d: '#000' } : { c: '#f7f6f2', l: '#ffffff', d: '#b9b6ae' }, 0.9, 5), 0, 0);
    rx.globalAlpha = 1;
    x.save(); x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = 10; x.shadowOffsetY = 5; x.drawImage(ring, 0, 0); x.restore();
    x.drawImage(fill, 0, 0);
    embTex.needsUpdate = true;
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
    return { phi: place.phi, s: place.s, azimuth: Math.round(a), region: reg, side, text: `${side} · ${reg} · ${Math.abs(Math.round(a))}° from centre front · ${detail}` };
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
