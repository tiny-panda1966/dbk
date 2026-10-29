// Product list for the website in ONE request, cached at Cloudflare's edge.
// Wix Headless pages through 100 products at a time (40+ requests for the full store), which made the
// first load slow. This function does that once on the server, trims each product to what the listing
// needs, and caches it: fresh for 10 minutes, then served stale for up to a day while it refreshes.
// Needs env WIX_API_KEY (Wix Stores read) + WIX_SITE_ID.
const WIX = 'https://www.wixapis.com';
const FRESH_MS = 10 * 60 * 1000, STALE_S = 24 * 60 * 60;
const json = (b, s = 200, extra = {}) => new Response(typeof b === 'string' ? b : JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json', ...extra } });

const trim = p => ({
  id: p.id || p._id, slug: p.slug, name: p.name, visible: p.visible,
  media: { main: p.media?.main ? { image: p.media.main.image } : undefined, itemsInfo: { items: (p.media?.itemsInfo?.items || []).slice(0, 8).map(i => ({ image: i.image })) } },
  actualPriceRange: { minValue: { amount: p.actualPriceRange?.minValue?.amount } },
  mainCategoryId: p.mainCategoryId,
  allCategoriesInfo: { categories: (p.allCategoriesInfo?.categories || []).map(c => ({ id: c.id || c._id })) },
  directCategoriesInfo: { categories: (p.directCategoriesInfo?.categories || []).map(c => ({ id: c.id || c._id })) },
  variantsInfo: { variants: (p.variantsInfo?.variants || []).slice(0, 1).map(v => ({ _id: v.id || v._id, sku: v.sku })) },
});

async function build(env, keep) {
  const items = []; let cursor = null, guard = 0;
  do {
    const body = { query: { cursorPaging: { limit: 100, ...(cursor ? { cursor } : {}) } }, fields: ['ALL_CATEGORIES_INFO'] };
    const r = await fetch(`${WIX}/stores/v3/products/query`, { method: 'POST', headers: { Authorization: env.WIX_API_KEY, 'wix-site-id': env.WIX_SITE_ID, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('products query ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const j = await r.json();
    items.push(...(j.products || []).map(trim));
    cursor = j.pagingMetadata?.cursors?.next || null;
  } while (cursor && ++guard < 120);
  // same products a visitor sees: visible ones, plus the hidden embroidery product the cart needs
  const out = items.filter(p => p.visible !== false || p.id === keep || /^custom embroidery$/i.test((p.name || '').trim()));
  return JSON.stringify({ at: Date.now(), count: out.length, items: out });
}

export async function onRequestGet({ request, env, waitUntil }) {
  if (!env.WIX_API_KEY || !env.WIX_SITE_ID) return json({ error: 'Server not configured' }, 501);
  const url = new URL(request.url), keep = url.searchParams.get('keep') || '';
  const key = new Request(`${url.origin}/__cache/catalog?keep=${encodeURIComponent(keep)}`);
  const cache = caches.default;
  const refresh = async () => {
    const body = await build(env, keep);
    await cache.put(key, json(body, 200, { 'cache-control': `public, max-age=${STALE_S}` }));
    return body;
  };
  const hit = await cache.match(key);
  if (hit && url.searchParams.get('fresh') !== '1') {
    const body = await hit.text();
    const m = body.slice(0, 40).match(/"at":(\d+)/), at = m ? +m[1] : 0;
    if (Date.now() - at > FRESH_MS) waitUntil(refresh().catch(() => {}));
    return json(body, 200, { 'cache-control': 'public, max-age=60', 'x-dbk-cache': 'HIT' });
  }
  try { return json(await refresh(), 200, { 'cache-control': 'public, max-age=60', 'x-dbk-cache': 'MISS' }); }
  catch (e) { return json({ error: String(e.message || e) }, 502); }
}
