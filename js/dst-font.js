// Reads a Tajima .dst lettering file exported from Embrilliance (one line of characters, in order)
// and turns it into a stitched font: each glyph keeps its real stitch path. Units: 0.1 mm.
export const DEFAULT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,&-!?';

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

export function buildFont(buf, chars = DEFAULT_CHARS) {
  const pts = parseDST(buf);
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
  let minY = Infinity, maxY = -Infinity; for (const p of pts) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
  const capG = glyphs[chars.indexOf('H')] || glyphs[0];
  let capTop = -Infinity, base = Infinity; capG.runs.forEach(r => r.forEach(p => { if (p.y > capTop) capTop = p.y; if (p.y < base) base = p.y; }));
  const gaps = glyphs.slice(1).map((g, i) => g.x0 - glyphs[i].x1).filter(v => v > 0).sort((a, b) => a - b);
  const tracking = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 25;
  const map = {}; glyphs.forEach((g, i) => { if (chars[i]) map[chars[i]] = g; });
  return { map, ok: glyphs.length === chars.length, count: glyphs.length, expected: chars.length, minY, maxY, capHeight: capTop - base, tracking, stitches: pts.length };
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
