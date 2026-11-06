// Live sitemap for search engines: GET /sitemap.xml
// Built from the cached /api/catalog (same products visitors see), so new products in Wix Stores
// appear automatically. Cached at the edge for 6 hours.
const SITE = 'https://dbk-weldingcaps.com';
const STATIC = [['/', '1.0', 'daily'], ['/faq', '0.5', 'monthly'], ['/contact', '0.5', 'monthly']];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const url = (loc, pr, freq) => `  <url><loc>${esc(SITE + loc)}</loc><changefreq>${freq}</changefreq><priority>${pr}</priority></url>`;

export async function onRequestGet({ request, waitUntil }) {
  const cache = caches.default, origin = new URL(request.url).origin;
  const key = new Request(origin + '/__cache/sitemap-v1');
  const hit = await cache.match(key);
  if (hit) return hit;
  let data = { items: [], cats: [] };
  try {
    const r = await fetch(origin + '/api/catalog');
    if (r.ok) data = await r.json();
  } catch (e) {}
  const rows = STATIC.map(s => url(...s));
  (data.cats || []).filter(c => c.visible !== false && c.slug && c.count > 0)
    .forEach(c => rows.push(url('/index.html?cat=' + encodeURIComponent(c.slug), '0.7', 'weekly')));
  (data.items || []).filter(p => p.visible !== false && p.slug && !/^custom embroidery$/i.test((p.name || '').trim()))
    .forEach(p => rows.push(url('/product.html?slug=' + encodeURIComponent(p.slug), '0.8', 'weekly')));
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + rows.join('\n') + '\n</urlset>\n';
  const res = new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=21600' } });
  if ((data.items || []).length) waitUntil(cache.put(key, res.clone()));
  return res;
}
