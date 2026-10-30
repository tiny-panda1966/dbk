// 3D cap builder + embroidery designer. Wraps js/cap3d.js (three.js) and renders its own controls.
import { esc } from './ui.js';
import { money } from './wix.js';
import { CONFIG } from './config.js';
import { buildFont, renderText } from './dst-font.js';

const BASE = { Black: '#1b1b1c', Blue: '#2753c8', Brown: '#6b4a2e', Cream: '#efe4c8', Gray: '#8e8d8a', Green: '#1f8a3b', Orange: '#e8641c', Pink: '#e678a6', Purple: '#6a3d9a', Red: '#c62a22', White: '#f4f4f1', Yellow: '#f2c200', Peach: '#f3b58a', Maroon: '#6b1f2a' };
const mix = (hex, to, t) => { const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16); return '#' + [16, 8, 0].map(s => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t).toString(16).padStart(2, '0')).join(''); };
export const threadHex = n => {
  if (n === 'Black (Charcoal)') return '#3a3a3c';
  if (n === 'Green (Lime)') return '#8cc63f';
  const base = BASE[n.split(' ')[0]] || '#888888';
  return n.includes('(Dark)') ? mix(base, '#000000', 0.35) : n.includes('(Light)') ? mix(base, '#ffffff', 0.4) : base;
};
// Uses the same thread colours as embroidery (CONFIG.stitchColours).
export const STITCHES = (CONFIG.stitchColours || []).map(n => [n, threadHex(n)]);

// Embroidery fonts are Kelly's own Embrilliance lettering, exported as DST stitch files (characters in the order of DEFAULT_CHARS in dst-font.js).
// To add a font: export it from Embrilliance as .dst, put it in data/fonts/ and add a line here.
const STITCH_FONTS = [
  { name: 'Alphi Bold', file: 'alphi-bold.dst' },
];
export const FONTS = STITCH_FONTS.map(f => ({ ...f, url: new URL('../data/fonts/' + f.file, import.meta.url).href }));
const fontCache = {};
export function loadStitchFont(name) {
  const f = FONTS.find(x => x.name === name) || FONTS[0];
  return fontCache[f.name] || (fontCache[f.name] = fetch(f.url).then(r => { if (!r.ok) throw new Error('font ' + r.status); return r.arrayBuffer(); }).then(buf => buildFont(buf)));
}
// Stitch thread colours offered on SOLID fabric caps (printed caps keep the standard stitch). The cap's own colour is left out.
// A cap is solid when "Solid" is in its name.
export const isSolidCap = product => /\bsolid\b/i.test(product.name || '');
const sameColour = (a, b) => a.split(' ')[0].toLowerCase() === (b || '').toLowerCase();
const MAX_TEXT = 20;

function linkFonts() {}
const loadImg = src => new Promise((res, rej) => { const i = new Image(); if (!/^data:|^blob:/.test(src)) i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
async function resize(dataUrl, max, type = 'image/png', q) {
  const img = await loadImg(dataUrl), k = Math.min(1, max / Math.max(img.width || max, img.height || max));
  const c = document.createElement('canvas'); c.width = Math.round((img.width || max) * k); c.height = Math.round((img.height || max) * k);
  const x = c.getContext('2d'); if (type === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
  x.drawImage(img, 0, 0, c.width, c.height); return c.toDataURL(type, q);
}

// photoOnly: no 3D cap (Custom Items, Embroidery Designs). The customer's chosen product photo is saved as the preview.
export function createBuilder({ wrap, step, stepNo, product, threads, prices, onChange, startMode, photoOnly = false, getPhoto }) {
  const solid = isSolidCap(product);
  const stitchList = solid ? STITCHES.filter(([n]) => !sameColour(n, product.colour)) : [];
  const st = { look: 'print', stitch: stitchList.some(x => x[0] === 'Black') ? 'Black' : (stitchList[0]?.[0] || 'Black'), view: 'front', mode: startMode || 'none', text: '', font: FONTS[0].name, thread: threads.includes('Black') ? 'Black' : threads[0],
    scale: 100, rot: 0, upload: null, uploadName: '', locked: false, capture: null, place: null, fontQuery: '', fontCat: 'All', printFailed: false };
  const opt = { fabric: BASE[product.colour] || '#8e8d8a', liner: '#1b1b1c', deep: false };
  let viewer = null, last = {};

  wrap.innerHTML = photoOnly ? '' : `
    <div class="stage" data-stage><div class="stage-load">Loading 3D cap…</div></div>
    <div class="model-row">
      ${solid ? `<div class="seg seg-wrap"><span class="kicker">Stitch colour <span data-stitch-name></span></span><div class="seam-sw">${stitchList.map(([n, h]) => `<button type="button" data-stitch="${n}" title="${n}" aria-label="${n} stitching"><span style="background:${h}"></span></button>`).join('')}</div></div>` : ''}
    </div>
    <div class="place-row" data-place-row hidden>
      <div class="place-txt"><span class="kicker">Embroidery placement</span><strong data-place-text>—</strong></div>
      <div class="place-btns"><button type="button" class="btn-sm" data-face>Move to this view</button><button type="button" class="btn-sm dark" data-lock>Lock position</button></div>
    </div>
    <p class="note" data-look-note></p>`;

  const priceTag = n => n == null ? '' : ` <small>+${money(n)}</small>`;
  step.innerHTML = `
    <div class="step-head"><span class="step-n">${stepNo}</span><h2>Embroidery</h2><span class="step-val" data-emb-val>Optional</span></div>
    <div class="choices">
      <button type="button" class="choice" data-mode="none">None</button>
      <button type="button" class="choice" data-mode="text">Name | Word${priceTag(prices.text)}</button>
      <button type="button" class="choice" data-mode="upload">Logo | Image${priceTag(prices.logo)}</button>
    </div>
    <div class="emb-panel" data-emb-text hidden>
      <label class="field"><span><strong>Your text</strong> <span class="muted" data-count></span></span><input type="text" maxlength="${MAX_TEXT}" data-text placeholder="e.g. Murph" autocomplete="off"><span class="note" data-chars-note hidden></span></label>
      <div class="field font-field"><strong>Font</strong>
        <button type="button" class="font-btn" data-font-btn aria-expanded="false"><span data-font-name></span><span aria-hidden="true">▾</span></button>
        <div class="font-pop" data-font-pop hidden>
          <input type="search" placeholder="Search ${FONTS.length} font${FONTS.length === 1 ? '' : 's'}" data-font-q${FONTS.length < 8 ? ' hidden' : ''}>
          <div class="font-list" data-font-list></div>
        </div>
      </div>
    </div>
    <div class="emb-panel" data-emb-upload hidden>
      <label class="upload"><input type="file" accept="image/png,image/jpeg,image/svg+xml" data-file><span data-file-name>Choose a logo or image (PNG, JPG or SVG)</span></label>
      <p class="note copyright"><strong>Copyright reminder:</strong> only upload logos or images you own or have permission to use. DBK can’t stitch trademarked logos, team or brand artwork without the owner’s permission.</p>
      <p class="note">Kelly prepares your artwork for stitching and emails a proof before your cap is made.</p>
    </div>
    <div class="emb-panel" data-emb-common hidden>
      <div class="field"><span><strong>Thread colour</strong> <span class="muted" data-thread-name></span></span>
        <div class="threads">${threads.map(n => `<button type="button" data-thread="${esc(n)}" title="${esc(n)}"><span style="background:${threadHex(n)}"></span></button>`).join('')}</div>
        <span class="note">100% cotton thread, fire-resistant to industry standard.</span>
      </div>
      <div class="sliders"${photoOnly ? ' hidden' : ''}>
        <label class="field"><span><strong>Size</strong> <span class="mono" data-scale-v></span></span><input type="range" min="50" max="150" step="5" value="100" data-scale></label>
        <label class="field"><span><strong>Rotation</strong> <span class="mono" data-rot-v></span></span><input type="range" min="-45" max="45" step="1" value="0" data-rot></label>
      </div>
      <p class="note">${photoOnly ? 'We save the photo you have selected with your order. Kelly places the embroidery to match and emails a proof before it’s made.' : 'Drag the embroidery on the 3D cap to place it anywhere on the crown, band or flaps, then lock the position.'}</p>
    </div>`;

  const W = s => wrap.querySelector(s), S = s => step.querySelector(s), SA = s => [...step.querySelectorAll(s)];
  const active = () => (st.mode === 'text' && st.text.trim()) || (st.mode === 'upload' && st.upload);
  const F = () => FONTS.find(f => f.name === st.font) || FONTS[0];

  const fonts = {};
  const preview = (name, text, color, scale) => { const f = fonts[name]; return f ? renderText(f, text, { color, scale, pad: 4 }).canvas.toDataURL('image/png') : ''; };
  function renderFonts() {
    const q = st.fontQuery.trim().toLowerCase();
    const list = FONTS.filter(f => !q || f.name.toLowerCase().includes(q));
    const sample = st.text.trim() || 'DBK Caps';
    S('[data-font-list]').innerHTML = list.length ? list.map(f => `<button type="button" data-font="${esc(f.name)}" class="${f.name === st.font ? 'on' : ''}">${fonts[f.name] ? `<img src="${preview(f.name, sample, '#1d1d1f', 0.12)}" alt="" style="height:34px;width:auto;max-width:100%;object-fit:contain;object-position:left">` : '<span class="muted">Loading…</span>'}<small>${esc(f.name)} · real stitches</small></button>`).join('') : '<p class="note">No fonts match.</p>';
    S('[data-font-list]').querySelectorAll('[data-font]').forEach(b => b.onclick = () => { st.font = b.dataset.font; closeFonts(); ensureFont(); sync(); });
  }
  function ensureFont(name = st.font) {
    if (fonts[name]) return;
    loadStitchFont(name).then(f => { fonts[name] = f; cleanText(); if (!S('[data-font-pop]').hidden) renderFonts(); last.emb = null; sync(); }).catch(e => console.error('[DBK] stitch font failed', e));
  }
  const supported = ch => ch === ' ' || !!(fonts[st.font] && (fonts[st.font].map[ch] || fonts[st.font].map[ch.toUpperCase()] || fonts[st.font].map[ch.toLowerCase()]));
  function cleanText() {
    if (!fonts[st.font]) return;
    const kept = [...st.text].filter(supported).join(''), dropped = st.text.length !== kept.length;
    st.text = kept; const inp = S('[data-text]'); if (inp.value !== kept) inp.value = kept;
    const n = S('[data-chars-note]'); n.hidden = !dropped; n.textContent = 'This font has letters, numbers and . , & - ! ? only.';
  }
  const closeFonts = () => { S('[data-font-pop]').hidden = true; S('[data-font-btn]').setAttribute('aria-expanded', 'false'); };

  function sync() {
    wrap.querySelectorAll('[data-stitch]').forEach(b => b.classList.toggle('on', b.dataset.stitch === st.stitch));
    const sn = W('[data-stitch-name]'); if (sn) sn.textContent = '· ' + st.stitch;
    if (!photoOnly) W('[data-look-note]').textContent = st.look === 'print' ? (st.printFailed ? 'The print couldn’t be loaded, so the model shows the base colour.' : 'Print preview taken from the product photo. Kelly emails a stitch proof on your real fabric.') : st.look === 'colour' ? 'Showing the fabric’s base colour.' : 'Plain white cap, for placing embroidery clearly. Your liner colour shows inside.';
    const on = !!active();
    if (!photoOnly) {
      W('[data-place-row]').hidden = !on;
      W('[data-place-text]').textContent = (st.locked && st.capture ? st.capture.text : st.place?.text) || '—';
      W('[data-lock]').textContent = st.locked ? 'Edit position' : 'Lock position';
      W('[data-face]').disabled = st.locked;
    }
    SA('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === st.mode));
    S('[data-emb-text]').hidden = st.mode !== 'text';
    S('[data-emb-upload]').hidden = st.mode !== 'upload';
    S('[data-emb-common]').hidden = st.mode === 'none';
    S('[data-count]').textContent = `${st.text.length}/${MAX_TEXT}`;
    S('[data-font-name]').textContent = F().name;
    SA('[data-thread]').forEach(b => b.classList.toggle('on', b.dataset.thread === st.thread));
    S('[data-thread-name]').textContent = '· ' + st.thread;
    S('[data-scale-v]').textContent = st.scale + '%'; S('[data-rot-v]').textContent = st.rot + '°';
    S('[data-emb-val]').textContent = st.mode === 'none' ? 'Optional' : !on ? (st.mode === 'text' ? 'Type your text' : 'Choose a file') : photoOnly ? 'Added' : st.locked ? 'Position locked' : 'Drag to position';
    syncViewer(); onChange && onChange();
  }

  function syncViewer() {
    if (!viewer) return;
    const lk = [st.look, st.stitch, opt.fabric].join('|');
    if (lk !== last.look) {
      last.look = lk;
      viewer.setAppearance({ mode: st.look, fabric: opt.fabric, pattern: (product.images || []).map(m => `https://static.wixstatic.com/media/${m}/v1/fit/w_900,h_900,q_85/${m}`), seam: (solid ? (STITCHES.find(x => x[0] === st.stitch) || STITCHES[0])[1] : '#1d1d1f') })
        .then(ok => { const f = st.look === 'print' && !ok; if (f !== st.printFailed) { st.printFailed = f; sync(); } });
    }
    if (opt.liner !== last.liner) { last.liner = opt.liner; viewer.setColors({ fabric: opt.fabric, liner: opt.liner }); }
    const fk = opt.deep ? 1.3 : 1; if (fk !== last.flap) { last.flap = fk; viewer.setFlap(fk); }
    const tc = threadHex(st.thread), f = F();
    const stitched = st.mode === 'text' && fonts[f.name];
    if (st.mode === 'text' && !stitched) { ensureFont(); }
    const cfg = active() && (st.mode !== 'text' || stitched) ? { mode: st.mode === 'text' ? 'stitch' : st.mode, text: st.text.trim(), font: f.name, upload: st.mode === 'text' ? null : st.upload, scale: st.scale / 100, rot: st.rot, thread: { c: tc, d: mix(tc, '#000000', 0.45), l: mix(tc, '#ffffff', 0.45) } } : null;
    const ek = JSON.stringify(cfg && { ...cfg, upload: st.mode === 'text' ? '' : st.uploadName + (st.upload ? st.upload.length : '') });
    if (ek !== last.emb) { last.emb = ek; if (cfg && cfg.mode === 'stitch') cfg.upload = preview(f.name, cfg.text, tc, 0.5); viewer.setEmbroidery(cfg).then(() => { if (st.locked) { st.capture = { png: viewer.capture(), ...viewer.describe() }; } }); }
    if (st.locked !== last.locked) { last.locked = st.locked; viewer.setLocked(st.locked); }
  }

  const unlock = () => { st.locked = false; st.capture = null; };
  wrap.querySelectorAll('[data-stitch]').forEach(b => b.onclick = () => { st.stitch = b.dataset.stitch; sync(); });
  if (!photoOnly) W('[data-face]').onclick = () => { if (!st.locked && viewer) viewer.faceCamera(); };
  if (!photoOnly) W('[data-lock]').onclick = () => {
    if (!viewer) return;
    if (st.locked) unlock(); else { st.locked = true; st.capture = { png: viewer.capture(), ...viewer.describe() }; }
    sync();
  };
  SA('[data-mode]').forEach(b => b.onclick = () => { st.mode = b.dataset.mode; unlock(); if (st.mode === 'text') ensureFont(); sync(); });
  S('[data-text]').oninput = e => { st.text = e.target.value.slice(0, MAX_TEXT); cleanText(); sync(); };
  S('[data-font-btn]').onclick = () => { const pop = S('[data-font-pop]'); pop.hidden = !pop.hidden; S('[data-font-btn]').setAttribute('aria-expanded', String(!pop.hidden)); if (!pop.hidden) { ensureFont(); FONTS.forEach(f => ensureFont(f.name)); renderFonts(); S('[data-font-q]').focus(); } };
  S('[data-font-q]').oninput = e => { st.fontQuery = e.target.value; renderFonts(); };
  document.addEventListener('click', e => { if (!step.querySelector('.font-field').contains(e.target)) closeFonts(); });
  SA('[data-thread]').forEach(b => b.onclick = () => { st.thread = b.dataset.thread; sync(); });
  S('[data-scale]').oninput = e => { st.scale = +e.target.value; sync(); };
  S('[data-rot]').oninput = e => { st.rot = +e.target.value; sync(); };
  S('[data-file]').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 8 * 1024 * 1024) { S('[data-file-name]').textContent = 'That file is over 8 MB. Please choose a smaller one.'; return; }
    const r = new FileReader();
    r.onload = async () => { try { st.upload = await resize(r.result, 900); } catch (err) { st.upload = r.result; } st.uploadName = f.name; S('[data-file-name]').textContent = f.name + ' · change'; unlock(); sync(); };
    r.readAsDataURL(f);
  };

  if (!photoOnly) (async () => {
    try {
      const [THREE, m] = await Promise.all([import('../vendor/three.module.min.js'), import('./cap3d.js')]);
      const stage = W('[data-stage]'); stage.innerHTML = '<div class="stage-hint">Drag to rotate · drag the embroidery to move it</div>';
      viewer = m.createCapViewer(stage, { onPlace: p => { st.place = p; sync(); }, onView: v => { st.view = v; sync(); } }, THREE);
      st.place = viewer.describe(); last = {}; sync();
    } catch (e) { console.error('[DBK] 3D builder failed to load', e); W('[data-stage]').innerHTML = '<div class="stage-load">The 3D preview couldn’t load on this device. You can still order using the options and photos.</div>'; }
  })();
  sync();

  return {
    setOptions({ liner, deep }) { if (liner) opt.liner = liner; opt.deep = !!deep; syncViewer(); },
    active: () => !!active(),
    prefs: () => ({ font: st.font, thread: st.thread }),
    stitch: () => solid ? st.stitch : '',
    applyPrefs({ font, thread } = {}) {
      if (font && FONTS.some(f => f.name === font)) st.font = font;
      if (thread && threads.includes(thread)) st.thread = thread;
      sync();
    },
    mode: () => st.mode,
    state: () => st,
    async snapshot() {
      if (!active()) return null;
      if (photoOnly) {
        const ph = getPhoto ? getPhoto() : null;
        let preview = ''; try { if (ph?.url) preview = await resize(ph.url, 640, 'image/jpeg', 0.82); } catch (e) {}
        return { mode: st.mode, text: st.text.trim(), font: F().name, thread: st.thread, scale: st.scale, rot: st.rot,
          uploadName: st.uploadName, logo: st.mode === 'upload' ? st.upload : '', placement: ph ? `As shown in photo ${ph.n} of ${ph.total}` : 'As shown in product photo', locked: true, preview };
      }
      const cap = st.locked && st.capture ? st.capture : viewer ? { png: viewer.capture(), ...viewer.describe() } : null;
      let preview = ''; try { if (cap?.png) preview = await resize(cap.png, 640, 'image/jpeg', 0.82); } catch (e) {}
      return { mode: st.mode, text: st.text.trim(), font: F().name, thread: st.thread, scale: st.scale, rot: st.rot,
        uploadName: st.uploadName, logo: st.mode === 'upload' ? st.upload : '', placement: cap?.text || '', locked: st.locked, preview };
    },
  };
}
