// Reads a Tajima .dst lettering file exported from Embrilliance (one line of characters, in order)
// and turns it into a stitched font: each glyph keeps its real stitch path. Units: 0.1 mm.
// Kelly's Embrilliance export line ends with the punctuation .?!#$- (as stitched in Alphi Bold, Chickweed and others)
export const DEFAULT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.?!#$-';

export function parseDST(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const pts = []; let x = 0, y = 0;
  for (let i = 512; i + 2 < b.length; i += 3) {
    const b0 = b[i], b1 = b[i + 1], b2 = b[i + 2];
    if ((b2 & 0xF3) === 0xF3) break;
    let dx = 0, dy = 0;
    if (b0 & 1) dx += 1; if (b0 & 2) dx -= 1; if (b0 & 4) dx += 9; if (b0 & 8) dx -= 9;
    if (b0 & 0x80) dy += 1; if (b0 & 0x40) dy -= 1; if (b0 & 0x20) dy += 9; if (b0 & 0x10) dy -= 9;
    if (b1 & 1) dx += 3; if (b1 & 2) dx -= 3; if (b1 & 4) dx += 27; if (b1 & 8) dx -= 27;
    if (b1 & 0x80) dy += 3; if (b1 & 0x40) dy -= 3; if (b1 & 0x20) dy += 27; if (b1 & 0x10) dy -= 27;
    if (b2 & 4) dx += 81; if (b2 & 8) dx -= 81; if (b2 & 0x20) dy += 81; if (b2 & 0x10) dy -= 81;
    x += dx; y += dy;
    pts.push({ x, y, jump: !!(b2 & 0x80) });
  }
  return pts;
}

// Splits the stitch stream into pieces (one per letter, when the file is clean). Returned in stitch order.
export function pieces(pts) {
  const runs = []; let cur = null;
  for (const p of pts) {
    if (p.jump || !cur) { if (cur && cur.length > 1) runs.push(cur); cur = [p]; } else cur.push(p);
  }
  if (cur && cur.length > 1) runs.push(cur);
  // Glyphs are stitched in order: a run joins the current glyph while its centre sits inside it.
  const glyphs = [];
  for (const r of runs) {
    let x0 = Infinity, x1 = -Infinity; for (const p of r) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; }
    const g = glyphs[glyphs.length - 1], cx = (x0 + x1) / 2;
    if (g && cx <= g.x1) { g.runs.push(r); g.x0 = Math.min(g.x0, x0); g.x1 = Math.max(g.x1, x1); }
    else glyphs.push({ runs: [r], x0, x1 });
  }
  // A letter digitised in pieces (e.g. a crossbar stitched first) can start a separate "glyph"; merge pieces that mostly overlap.
  for (let i = glyphs.length - 1; i > 0; i--) {
    const p = glyphs[i - 1], g = glyphs[i], ov = Math.min(p.x1, g.x1) - Math.max(p.x0, g.x0);
    if (ov > 0.5 * Math.min(p.x1 - p.x0, g.x1 - g.x0)) { p.runs.push(...g.runs); p.x0 = Math.min(p.x0, g.x0); p.x1 = Math.max(p.x1, g.x1); glyphs.splice(i, 1); }
  }
  return glyphs;
}

// Cut one piece into k letters at the emptiest vertical lines (where the stitches are thinnest).
function splitPiece(g, k) {
  if (k < 2) return [g];
  const W = g.x1 - g.x0, B = 60, hist = new Array(B).fill(0);
  g.runs.forEach(r => r.forEach(p => { hist[Math.min(B - 1, Math.floor(((p.x - g.x0) / (W || 1)) * B))]++; }));
  const sm = hist.map((_, i) => (hist[i - 1] || 0) + 2 * hist[i] + (hist[i + 1] || 0));
  const cuts = [];
  for (let j = 1; j < k; j++) {
    const c = Math.round((j / k) * B), lo = Math.max(2, c - Math.round(B / (2 * k))), hi = Math.min(B - 3, c + Math.round(B / (2 * k)));
    let best = c, bv = Infinity; for (let i = lo; i <= hi; i++) if (sm[i] < bv) { bv = sm[i]; best = i; }
    cuts.push(g.x0 + ((best + 0.5) / B) * W);
  }
  const part = x => { let i = 0; while (i < cuts.length && x > cuts[i]) i++; return i; };
  const out = Array.from({ length: k }, () => ({ runs: [], x0: Infinity, x1: -Infinity }));
  for (const r of g.runs) {
    let seg = [r[0]], pi = part(r[0].x);
    const push = () => { if (seg.length > 1) { const o = out[pi]; o.runs.push(seg); seg.forEach(p => { o.x0 = Math.min(o.x0, p.x); o.x1 = Math.max(o.x1, p.x); }); } };
    for (let i = 1; i < r.length; i++) { const q = part(r[i].x); if (q !== pi) { push(); seg = [r[i - 1]]; pi = q; } seg.push(r[i]); }
    push();
  }
  return out.filter(o => o.runs.length);
}

// fix (optional): { "<piece number, 1-based>": "<what that piece really is>" }
//   "ij" → the piece holds two letters (split it)   "" → skip the piece   "+" → it belongs to the letter before
//   Pieces without a fix carry on in DEFAULT_CHARS order after the last labelled one.
export function buildFont(buf, chars = DEFAULT_CHARS, fix = null) {
  const pts = parseDST(buf), raw = pieces(pts);
  const map = {}, labels = []; let ptr = 0, last = null;
  raw.forEach((g, i) => {
    const f = fix && Object.prototype.hasOwnProperty.call(fix, String(i + 1)) ? String(fix[String(i + 1)]) : null;
    if (f === '+') { if (last) { last.runs.push(...g.runs); last.x0 = Math.min(last.x0, g.x0); last.x1 = Math.max(last.x1, g.x1); } labels.push('+'); return; }
    if (f === '' || f === '-') { labels.push(''); return; }
    let lab;
    if (f != null) { lab = [...f]; const at = chars.indexOf(lab[lab.length - 1], Math.max(0, ptr - 2)); ptr = at >= 0 ? at + 1 : ptr + lab.length; }
    else { if (ptr >= chars.length) { labels.push('?'); return; } lab = [chars[ptr++]]; }
    const parts = splitPiece(g, lab.length);
    lab.forEach((ch, j) => { const p = parts[j] || parts[parts.length - 1]; if (p) { map[ch] = p; last = p; } });
    labels.push(lab.join(''));
  });
  let minY = Infinity, maxY = -Infinity; for (const p of pts) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
  const capG = map.H || Object.values(map)[0] || raw[0];
  let capTop = -Infinity, base = Infinity; capG.runs.forEach(r => r.forEach(p => { if (p.y > capTop) capTop = p.y; if (p.y < base) base = p.y; }));
  const gl = Object.values(map).sort((a, b) => a.x0 - b.x0);
  const gaps = gl.slice(1).map((g, i) => g.x0 - gl[i].x1).filter(v => v > 0).sort((a, b) => a - b);
  const tracking = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 25;
  const missing = [...chars].filter(c => !map[c]);
  return { map, labels, ok: !missing.length && ptr === chars.length, missing, count: raw.length, expected: chars.length, minY, maxY, capHeight: capTop - base, tracking, stitches: pts.length };
}

const hex = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const mixHex = (a, b, t) => { const A = hex(a), B = hex(b); return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')'; };

export function layout(font, text) {
  const items = []; let pen = 0, count = 0;
  for (const ch of text) {
    if (ch === ' ') { pen += font.capHeight * 0.32; continue; }
    const g = font.map[ch] || font.map[ch.toUpperCase()] || font.map[ch.toLowerCase()];
    if (!g) continue;
    items.push({ g, dx: pen - g.x0 }); pen += (g.x1 - g.x0) + font.tracking; count += g.runs.reduce((n, r) => n + r.length, 0);
  }
  return { items, width: Math.max(0, pen - font.tracking), stitches: count };
}

// Draws real stitches with simple thread shading. scale = px per 0.1 mm.
export function renderText(font, text, { color = '#1d1d1f', scale = 0.4, pad = 12, threadMM = 0.42 } = {}) {
  const L = layout(font, text);
  const H = font.maxY - font.minY;
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(L.width * scale + pad * 2)); c.height = Math.ceil(H * scale + pad * 2);
  const g = c.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round';
  const w = Math.max(0.9, threadMM * 10 * scale);
  const dark = mixHex(color, '#000000', 0.55), light = mixHex(color, '#ffffff', 0.45);
  const X = (p, it) => pad + (p.x + it.dx) * scale, Y = p => pad + (font.maxY - p.y) * scale;
  for (const it of L.items) for (const r of it.g.runs) for (let i = 1; i < r.length; i++) {
    const a = r[i - 1], b = r[i], ax = X(a, it), ay = Y(a), bx = X(b, it), by = Y(b);
    g.strokeStyle = dark; g.lineWidth = w * 1.35; g.beginPath(); g.moveTo(ax + w * 0.25, ay + w * 0.35); g.lineTo(bx + w * 0.25, by + w * 0.35); g.stroke();
    g.strokeStyle = color; g.lineWidth = w; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.strokeStyle = light; g.lineWidth = w * 0.32; g.beginPath(); g.moveTo(ax - w * 0.12, ay - w * 0.12); g.lineTo(bx - w * 0.12, by - w * 0.12); g.stroke();
  }
  return { canvas: c, stitches: L.stitches, widthMM: L.width / 10, heightMM: H / 10 };
}
