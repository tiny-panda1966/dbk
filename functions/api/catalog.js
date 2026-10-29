// Product list + categories for the website, cached at Cloudflare's edge.
//   GET /api/catalog                         → { at, count, cats, items }      (whole store, trimmed)
//   GET /api/catalog?part=first&cat=Welding Caps&n=12 → { at, cats, total, items } (first products of one category)
// Wix Headless pages through 100 products at a time (40+ requests for the full store). This function does
// that once on the server and caches the result: fresh for 10 minutes, then served stale for up to a day
// while it refreshes in the background. Needs env WIX_API_KEY (Wix Stores read) + WIX_SITE_ID.
const WIX = 'https://www.wixapis.com';
const FRESH_MS = 10 * 60 * 1000, STALE_S = 24 * 60 * 60;
const json = (b, s = 200, extra = {}) => new Response(typeof b === 'string' ? b : JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json', ...extra } });
const H = env => ({ Authorization: env.WIX_API_KEY, 'wix-site-id': env.WIX_SITE_ID, 'content-type': 'application/json' });
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');
const catIds = p => [...new Set([p.mainCategoryId, ...p.allCategoriesInfo.categories.map(c => c.id), ...p.directCategoriesInfo.categories.map(c => c.id)].filter(Boolean))];

const trim = p => ({
  id: p.id || p._id, slug: p.slug, name: p.name, visible: p.visible,
  media: { main: p.media?.main ? { image: p.media.main.image } : undefined, itemsInfo: { items: (p.media?.itemsInfo?.items || []).slice(0, 8).map(i => ({ image: i.image })) } },
  actualPriceRange: { minValue: { amount: p.actualPriceRange?.minValue?.amount } },
  mainCategoryId: p.mainCategoryId,
  allCategoriesInfo: { categories: (p.allCategoriesInfo?.categories || []).map(c => ({ id: c.id || c._id })) },
  directCategoriesInfo: { categories: (p.directCategoriesInfo?.categories || []).map(c => ({ id: c.id || c._id })) },
  variantsInfo: { variants: (p.variantsInfo?.variants || []).slice(0, 1).map(v => ({ _id: v.id || v._id, sku: v.sku })) },
});

async function queryCategories(env) {
  const out = []; let cursor = null, guard = 0;
  try {
    do {
      const r = await fetch(`${WIX}/categories/v1/categories/query`, { method: 'POST', headers: H(env),
        body: JSON.stringify({ query: { cursorPaging: { limit: 100, ...(cursor ? { cursor } : {}) } }, treeReference: { appNamespace: '@wix/stores' } }) });
      if (!r.ok) break;
      const j = await r.json();
      out.push(...(j.categories || []).map(c => ({ id: c.id || c._id, name: c.name, slug: c.slug, visible: c.visible })));
      cursor = j.pagingMetadata?.cursors?.next || null;
    } while (cursor && ++guard < 10);
  } catch (e) {}
  return out;
}

async function build(env) {
  const items = []; let cursor = null, guard = 0;
  const catsP = queryCategories(env);
  do {
    const body = { query: { cursorPaging: { limit: 100, ...(cursor ? { cursor } : {}) } }, fields: ['ALL_CATEGORIES_INFO'] };
    const r = await fetch(`${WIX}/stores/v3/products/query`, { method: 'POST', headers: H(env), body: JSON.stringify(body) });
    if (!r.ok) throw new Error('products query ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const j = await r.json();
    items.push(...(j.products || []).map(trim));
    cursor = j.pagingMetadata?.cursors?.next || null;
  } while (cursor && ++guard < 120);
  // same products a visitor sees: visible ones, plus the hidden "Custom Embroidery" product the cart needs
  const out = items.filter(p => p.visible !== false || /^custom embroidery$/i.test((p.name || '').trim()));
  const counts = {}; out.forEach(p => { if (p.visible === false) return; catIds(p).forEach(id => { counts[id] = (counts[id] || 0) + 1; }); });
  const cats = (await catsP).map(c => ({ ...c, count: counts[c.id] || 0 }));
  return JSON.stringify({ at: Date.now(), count: out.length, cats, items: out });
}

export async function onRequestGet({ request, env, waitUntil }) {
  if (!env.WIX_API_KEY || !env.WIX_SITE_ID) return json({ error: 'Server not configured' }, 501);
  const url = new URL(request.url), cache = caches.default;
  const key = new Request(`${url.origin}/__cache/catalog-v2`);
  const refresh = async () => {
    const body = await build(env);
    await cache.put(key, json(body, 200, { 'cache-control': `public, max-age=${STALE_S}` }));
    return body;
  };
  let body, state = 'HIT';
  const hit = url.searchParams.get('fresh') === '1' ? null : await cache.match(key);
  if (hit) {
    body = await hit.text();
    const m = body.slice(0, 40).match(/"at":(\d+)/), at = m ? +m[1] : 0;
    if (Date.now() - at > FRESH_MS) waitUntil(refresh().catch(() => {}));
  } else {
    try { body = await refresh(); state = 'MISS'; } catch (e) { return json({ error: String(e.message || e) }, 502); }
  }
  const head = { 'cache-control': 'public, max-age=60', 'x-dbk-cache': state };
  if (url.searchParams.get('part') !== 'first') return json(body, 200, head);
  // first page of one category: small response so the homepage can draw straight away
  const all = JSON.parse(body), want = norm(url.searchParams.get('cat') || 'Welding Caps');
  const n = Math.min(60, Math.max(1, +url.searchParams.get('n') || 12));
  const cat = all.cats.find(c => c.visible !== false && norm(c.name) === want);
  const list = all.items.filter(p => p.visible !== false && (!cat || catIds(p).includes(cat.id)));
  return json({ at: all.at, cats: all.cats, total: list.length, items: list.slice(0, n) }, 200, head);
}
