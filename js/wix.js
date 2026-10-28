// Data layer: Wix Headless (Stores Catalog V3 + eCommerce) with a fallback to the exported catalogue.
// Every page talks to this module only, so the rest of the site doesn't care where data comes from.
import { CONFIG } from './config.js';

const TOKENS_KEY = 'dbk.wixTokens';
const LOCAL_CART_KEY = 'dbk.localCart';
const LIST_CACHE_KEY = 'dbk.products.v2';
const LINKS_KEY = 'dbk.cartLinks'; // { embroideryLineId: capLineId }
const readLinks = () => { try { return JSON.parse(localStorage.getItem(LINKS_KEY) || '{}'); } catch (e) { return {}; } };
const writeLinks = l => localStorage.setItem(LINKS_KEY, JSON.stringify(l));
export function linkLines(capId, embId) { if (!capId || !embId) return; const l = readLinks(); l[embId] = capId; writeLinks(l); }

let clientPromise = null;
let mode = null; // 'live' | 'fallback'

export const IMG = (id, w = 600) => id ? `https://static.wixstatic.com/media/${id}/v1/fill/w_${w},h_${w},al_c,q_80/${id}` : '';
export const IMG_FIT = (id, w = 1000) => id ? `https://static.wixstatic.com/media/${id}/v1/fit/w_${w},h_${w},q_85/${id}` : '';
export const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: CONFIG.currency }).format(Number(n) || 0);
export const getMode = () => mode;
// Featured caps, matched by SKU (exported catalogue) or name (live – visitors don't receive SKUs).
export const FEATURED = [['YELBLUFLAMCAP', 'Yellow Blue Flame Welding Cap'], ['BLAZTECCAP', 'Black Aztec Welding Cap'], ['BLAMAZGRACAP', 'Black Amazing Grace Welding Cap'], ['BLBANDCAP', 'Black Bandana Welding Cap']];
export const findFeatured = (items, [sku, name]) => items.find(p => p.sku === sku) || items.find(p => p.name?.trim().toLowerCase() === name.toLowerCase());

export const COLOURS = { Black: '#1b1b1c', Blue: '#2753c8', Brown: '#6b4a2e', Cream: '#efe4c8', Gray: '#8e8d8a', Green: '#1f8a3b', Orange: '#e8641c', Pink: '#e678a6', Purple: '#6a3d9a', Red: '#c62a22', White: '#f4f4f1', Yellow: '#f2c200', Peach: '#f3b58a', Maroon: '#6b1f2a' };
// Wix returns descriptions as HTML; keep only non-empty paragraphs as plain text.
const descLines = html => {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  const blocks = [...doc.body.querySelectorAll('p, li, h1, h2, h3, h4')];
  const parts = (blocks.length ? blocks : [doc.body]).map(n => n.textContent.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ').replace(/\s+/g, ' ').trim());
  return parts.filter(Boolean);
};
const colourOf = name => { const w = (name || '').split(/\s+/)[0].replace(/^Grey$/i, 'Gray'); return COLOURS[w] ? w : 'Other'; };

// wix:image://v1/<mediaId>/name.jpg#…  |  https://static.wixstatic.com/media/<mediaId>…  |  { image: … } | { url: … }
export function mediaId(m) {
  if (!m) return '';
  if (typeof m === 'object') return mediaId(m.image?.url || m.image?.id || m.image || m.url || m.id || '');
  const a = /wix:image:\/\/v1\/([^/#]+)/.exec(m); if (a) return a[1];
  const b = /static\.wixstatic\.com\/media\/([^/?#]+)/.exec(m); if (b) return b[1];
  return /~mv2|\.(jpe?g|png|webp)$/i.test(m) ? m : '';
}

// Wix SDK packages from esm.sh. Each is tried in order: a pinned, known-good version first, then latest.
// Pinning means a broken upstream publish can't take the live site down; bump versions deliberately.
const SDK_VERSIONS = {
  sdk: ['@wix/sdk'],
  stores: ['@wix/stores'],
  ecom: ['@wix/ecom@1.0.2603', '@wix/ecom'],
  redirects: ['@wix/redirects'],
  data: ['@wix/data'],
  members: ['@wix/members'],
  categories: ['@wix/categories'],
  forms: ['@wix/forms'],
};
export const sdkStatus = {};
async function loadMod(name, required = false) {
  let lastErr;
  for (const spec of SDK_VERSIONS[name]) {
    try { const m = await import('https://esm.sh/' + spec); sdkStatus[name] = spec; return m; }
    catch (e) { lastErr = e; console.warn(`[DBK] Couldn't load ${spec}: ${e?.message || e}`); }
  }
  sdkStatus[name] = 'failed';
  if (required) throw lastErr || new Error('Failed to load @wix/' + name);
  return null;
}

async function getClient() {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    if (CONFIG.dataMode === 'fallback' || !CONFIG.clientId) return null;
    try {
      const [sdk, stores, ecom, redir, data, mem, cats, forms] = await Promise.all([
        loadMod('sdk', true), loadMod('stores', true), loadMod('ecom'), loadMod('redirects'), loadMod('data'), loadMod('members'), loadMod('categories'), loadMod('forms'),
      ]);
      const { createClient, OAuthStrategy } = sdk;
      let tokens = null; try { tokens = JSON.parse(localStorage.getItem(TOKENS_KEY) || 'null'); } catch (e) {}
      const c = createClient({
        modules: { productsV3: stores.productsV3, readOnlyVariantsV3: stores.readOnlyVariantsV3, ...(ecom?.currentCart ? { currentCart: ecom.currentCart } : {}), ...(redir?.redirects ? { redirects: redir.redirects } : {}), ...(data?.items ? { items: data.items } : {}), ...(mem?.members ? { members: mem.members } : {}), ...(cats?.categories ? { categories: cats.categories } : {}), ...(forms?.submissions ? { submissions: forms.submissions } : {}) },
        auth: OAuthStrategy({ clientId: CONFIG.clientId, tokens: tokens || undefined }),
      });
      if (!tokens) localStorage.setItem(TOKENS_KEY, JSON.stringify(await c.auth.generateVisitorTokens()));
      return c;
    } catch (e) {
      console.warn('[DBK] Wix Headless unavailable:', e?.message || String(e), e);
      if (CONFIG.dataMode === 'live') throw e;
      return null;
    }
  })();
  return clientPromise;
}
const saveTokens = c => { try { localStorage.setItem(TOKENS_KEY, JSON.stringify(c.auth.getTokens())); } catch (e) {} };

// ---------- normalised product model ----------
// { id, slug, name, sku, price, colour, images[], modifiers[], variantId, live }
// modifier: { key, name, type: TEXT_CHOICES|SWATCH_CHOICES|FREE_TEXT, mandatory, choices[{ key, name, hex, add }], text{ key, title, max, add } }
function normV3(p) {
  const items = p.media?.itemsInfo?.items || [];
  const imgs = [mediaId(p.media?.main), ...items.map(mediaId)].filter(Boolean);
  return {
    id: p._id || p.id, slug: p.slug, name: p.name, sku: p.variantsInfo?.variants?.[0]?.sku || '',
    price: Number(p.actualPriceRange?.minValue?.amount ?? p.priceData?.price ?? 0),
    colour: colourOf(p.name), images: [...new Set(imgs)],
    cats: [...new Set([p.mainCategoryId, ...(p.allCategoriesInfo?.categories || []).map(x => x._id || x.id), ...(p.directCategoriesInfo?.categories || []).map(x => x._id || x.id)].filter(Boolean))],
    description: descLines(p.plainDescription || p.description),
    // Wix "Additional info sections" (e.g. Care, Sizing, Returns)
    info: (p.infoSections || []).map(s => ({ title: s.title || s.uniqueName || '', lines: descLines(s.plainDescription || s.description) })).filter(s => s.title && s.lines.length),
    modifiers: (p.modifiers || []).map(m => ({
      key: m.key || m._id, name: m.name, type: m.modifierRenderType, mandatory: !!m.mandatory,
      choices: (m.choicesSettings?.choices || []).map(ch => ({ key: ch.key || ch.choiceId, name: ch.name, hex: ch.colorCode, add: Number(ch.addedPrice || 0) })),
      text: m.freeTextSettings ? { key: m.freeTextSettings.key || m.key, title: m.freeTextSettings.title || m.name, max: m.freeTextSettings.maxCharCount || 500, add: Number(m.freeTextSettings.defaultAddedPrice || 0) } : null,
    })),
    variantId: p.variantsInfo?.variants?.[0]?._id || null, live: true,
  };
}

let fallbackCat = null;
async function loadFallback() {
  if (!fallbackCat) fallbackCat = await fetch('data/catalog.json').then(r => r.json());
  return fallbackCat;
}
function fallbackModifiers(cat) {
  return Object.entries(cat.modifiers).map(([name, m]) => {
    const parts = m.choices.split(';').filter(Boolean);
    if (m.type === 'FREE_TEXT') return { key: name, name, type: 'FREE_TEXT', mandatory: false, choices: [], text: { key: name, title: m.choices, max: 500, add: 0 } };
    return { key: name, name, type: m.type, mandatory: true, text: null,
      choices: parts.map(v => m.type === 'SWATCH_CHOICES' ? { key: v.split(':')[1], name: v.split(':')[1], hex: v.split(':')[0], add: 0 } : { key: v, name: v, add: 0 }) };
  });
}
const normFallback = (p, mods) => ({ cats: ['welding-caps'], id: p.s, slug: p.h, name: p.n, sku: p.s, price: p.p, colour: p.c || colourOf(p.n), images: p.m || [], description: [], info: [], modifiers: mods, variantId: null, live: false });

// ---------- catalogue ----------
const hiddenIds = () => new Set([...(CONFIG.hiddenProductIds || []), CONFIG.embroidery?.productId].filter(Boolean));
export const isHidden = p => hiddenIds().has(p.id) || /^custom embroidery$/i.test((p.name || '').trim());
export async function listProducts({ includeHidden = false } = {}) {
  const all = await listAllProducts();
  return includeHidden ? all : all.filter(p => !isHidden(p));
}
async function listAllProducts() {
  try { const c = JSON.parse(sessionStorage.getItem(LIST_CACHE_KEY) || 'null'); if (c) { mode = c.mode; return c.items; } } catch (e) {}
  let items = null;
  const c = await getClient();
  if (c) {
    try {
      let res;
      try { res = await c.productsV3.queryProducts({ fields: ['ALL_CATEGORIES_INFO'] }).limit(100).find(); }
      catch (e) { res = await c.productsV3.queryProducts().limit(100).find(); }
      const all = [...res.items];
      while (res.hasNext && res.hasNext()) { res = await res.next(); all.push(...res.items); }
      saveTokens(c);
      if (all.length) { items = all.map(normV3); mode = 'live'; }
    } catch (e) { console.warn('[DBK] Live product query failed:', e); if (CONFIG.dataMode === 'live') throw e; }
  }
  if (!items) {
    const cat = await loadFallback(), mods = fallbackModifiers(cat);
    items = cat.products.map(p => normFallback(p, mods)); mode = 'fallback';
  }
  try { sessionStorage.setItem(LIST_CACHE_KEY, JSON.stringify({ mode, items: items.map(p => ({ ...p, modifiers: [] })) })); } catch (e) {}
  return items;
}

// Variants (product OPTIONS such as "Embroidery options") with their own price. Visitors don't get variantsInfo
// from product queries, so read them from the read-only variants API.
const choiceLookup = raw => {
  const m = {};
  (raw?.options || []).forEach(o => (o.choicesSettings?.choices || o.choices || []).forEach(ch => { m[ch.choiceId || ch._id || ch.key] = { option: o.name, choice: ch.name }; }));
  return m;
};
const normVariant = (v, look = {}) => {
  const list = v.choices || v.optionChoices || v.variant?.choices || [];
  return {
    id: v.variantId || v._id || v.id || v.variant?._id,
    choices: list.map(c => {
      const n = c.optionChoiceNames || {};
      const ids = c.optionChoiceIds || c;
      const viaId = look[ids.choiceId] || {};
      return { option: n.optionName || c.optionName || viaId.option || '', choice: n.choiceName || c.choiceName || c.name || viaId.choice || '' };
    }),
    price: Number(v.price?.actualPrice?.amount ?? v.actualPrice?.amount ?? v.price?.amount ?? v.productData?.actualPriceRange?.minValue?.amount ?? NaN),
    sku: v.sku || '',
  };
};
export async function getVariants(productId, raw) {
  const look = choiceLookup(raw), nv = v => normVariant(v, look);
  const fromRaw = raw?.variantsInfo?.variants;
  if (fromRaw?.length && fromRaw.some(v => v.price)) return fromRaw.map(nv);
  const c = await getClient(); if (!c) return [];
  try {
    let res = await c.readOnlyVariantsV3.queryVariants().eq('productData.productId', productId).limit(100).find();
    const all = [...res.items];
    while (res.hasNext && res.hasNext()) { res = await res.next(); all.push(...res.items); }
    saveTokens(c); return all.map(nv);
  } catch (e) { console.warn('[DBK] Variant query failed:', e); return (fromRaw || []).map(nv); }
}

export async function getProduct(slug) {
  const c = await getClient();
  if (c) {
    try {
      let res;
      try { res = await c.productsV3.getProductBySlug(slug, { fields: ['MEDIA_ITEMS_INFO', 'PLAIN_DESCRIPTION', 'CURRENCY', 'VARIANT_OPTION_CHOICE_NAMES', 'INFO_SECTION', 'INFO_SECTION_PLAIN_DESCRIPTION'] }); }
      catch (e) { res = null; }
      if (!res) try { res = await c.productsV3.getProductBySlug(slug, { fields: ['MEDIA_ITEMS_INFO', 'PLAIN_DESCRIPTION', 'CURRENCY', 'VARIANT_OPTION_CHOICE_NAMES'] }); }
      catch (e) { res = await c.productsV3.getProductBySlug(slug, { fields: ['MEDIA_ITEMS_INFO', 'PLAIN_DESCRIPTION', 'CURRENCY'] }); }
      const raw = res.product || res;
      const p = normV3(raw); p._raw = raw;
      if (!p.variantId) {
        try {
          const v = await c.readOnlyVariantsV3.queryVariants().eq('productData.productId', p.id).limit(1).find();
          p.variantId = v.items?.[0]?.variantId || v.items?.[0]?._id || null;
          if (!p.sku) p.sku = v.items?.[0]?.sku || '';
        } catch (e) { console.warn('[DBK] Variant lookup failed:', e); }
      }
      saveTokens(c); mode = 'live'; return p;
    } catch (e) { console.warn('[DBK] Live product fetch failed:', e); if (CONFIG.dataMode === 'live') throw e; }
  }
  const cat = await loadFallback(), mods = fallbackModifiers(cat);
  const raw = cat.products.find(p => p.h === slug) || cat.products.find(p => p.s === slug);
  mode = 'fallback';
  return raw ? normFallback(raw, mods) : null;
}

// ---------- cart ----------
// line: { id, name, qty, unit, img, lines[] }
const readLocal = () => { try { return JSON.parse(localStorage.getItem(LOCAL_CART_KEY) || '[]'); } catch (e) { return []; } };
const writeLocal = c => localStorage.setItem(LOCAL_CART_KEY, JSON.stringify(c));
const emit = () => window.dispatchEvent(new CustomEvent('dbk:cart'));

export async function getCart() {
  const lines = await rawCart();
  const links = readLinks(), ids = new Set(lines.map(l => l.id)), fresh = {};
  Object.entries(links).forEach(([e, cap]) => { if (ids.has(e) && ids.has(cap)) fresh[e] = cap; });
  if (Object.keys(fresh).length !== Object.keys(links).length) writeLinks(fresh);
  return lines.map(l => ({ ...l, parent: fresh[l.id] || null }));
}
async function rawCart() {
  const c = await getClient();
  if (c && c.currentCart && mode !== 'fallback') {
    try {
      const cart = await c.currentCart.getCurrentCart(); saveTokens(c);
      return (cart.lineItems || []).map(li => ({
        id: li._id, name: li.productName?.translated || li.productName?.original || 'Cap', qty: li.quantity,
        unit: Number(li.price?.convertedAmount ?? li.price?.amount ?? 0), img: mediaId(li.image),
        lines: (li.descriptionLines || []).map(d => `${d.name?.translated || d.name?.original || ''}: ${d.plainText?.translated || d.plainText?.original || d.colorInfo?.translated || d.colorInfo?.original || ''}`),
      }));
    } catch (e) { if (String(e?.message || e).match(/404|not ?found|OWNED_CART_NOT_FOUND/i)) return []; console.warn('[DBK] Cart fetch failed:', e); return []; }
  }
  return readLocal();
}

export async function addToCart(product, { choices = {}, texts = {}, qty = 1, unit, summary = [] }) {
  const c = await getClient();
  if (c && product.live) {
    if (!c.currentCart) throw new Error('Cart is temporarily unavailable.');
    const options = { options: choices };
    if (product.variantId) options.variantId = product.variantId;
    const ct = Object.fromEntries(Object.entries(texts).filter(([, v]) => v && v.trim()));
    if (Object.keys(ct).length) options.customTextFields = ct;
    const before = new Map((await rawCart()).map(l => [l.id, l.qty]));
    const res = await c.currentCart.addToCurrentCart({ lineItems: [{ catalogReference: { appId: CONFIG.storesAppId, catalogItemId: product.id, options }, quantity: qty }] });
    saveTokens(c);
    const after = res?.cart?.lineItems || [];
    const hit = after.find(li => !before.has(li._id)) || after.find(li => before.get(li._id) !== li.quantity && li.catalogReference?.catalogItemId === product.id);
    emit(); return hit?._id || null;
  }
  const cart = readLocal(), id = 'l' + Date.now() + Math.random().toString(36).slice(2, 6);
  cart.push({ id, name: product.name, qty, unit, img: product.images[0], lines: summary });
  writeLocal(cart); emit(); return id;
}

export async function setQty(id, qty) {
  const links = readLinks();
  const kids = Object.keys(links).filter(e => links[e] === id);
  const ids = [id, ...(qty < 1 || kids.length === 1 ? kids : [])]; // with several embroideries on one merged cap line, only removal cascades
  const c = await getClient();
  if (c && mode === 'live') {
    if (qty < 1) await c.currentCart.removeLineItemsFromCurrentCart(ids);
    else await c.currentCart.updateCurrentCartLineItemQuantity(ids.map(_id => ({ _id, quantity: qty })));
    saveTokens(c);
  } else {
    writeLocal(readLocal().map(l => ids.includes(l.id) ? { ...l, qty } : l).filter(l => l.qty > 0));
  }
  if (qty < 1) { ids.forEach(i => delete links[i]); writeLinks(links); }
  emit();
}

export async function checkout() {
  const c = await getClient();
  if (!c || mode !== 'live') throw new Error('Checkout opens once the store is connected to Wix. This preview is using the exported catalogue.');
  if (!c.currentCart || !c.redirects) throw new Error('Checkout is temporarily unavailable. Please try again in a few minutes.');
  const embId = CONFIG.embroidery?.productId;
  if (embId) {
    const cart = await c.currentCart.getCurrentCart().catch(() => null);
    const links = readLinks(), ids = new Set((cart?.lineItems || []).map(l => l._id));
    const orphans = (cart?.lineItems || []).filter(li => li.catalogReference?.catalogItemId === embId && !(links[li._id] && ids.has(links[li._id]))).map(li => li._id);
    if (orphans.length) await c.currentCart.removeLineItemsFromCurrentCart(orphans);
  }
  const { checkoutId } = await c.currentCart.createCheckoutFromCurrentCart({ channelType: 'WEB' });
  const origin = location.origin;
  const { redirectSession } = await c.redirects.createRedirectSession({
    ecomCheckout: { checkoutId },
    callbacks: { postFlowUrl: origin + '/', thankYouPageUrl: origin + CONFIG.thankYouPath, cartPageUrl: origin + '/' },
  });
  saveTokens(c);
  location.href = redirectSession.fullUrl;
}

// ---------- contact form (Wix Forms) ----------
export async function submitContact(values) {
  const { formId, fields } = CONFIG.contact || {};
  const c = await getClient();
  if (!formId || !c?.submissions) throw new Error('not-configured');
  const submissions = {};
  Object.entries(fields).forEach(([k, key]) => { if (values[k]) submissions[key] = values[k]; });
  const res = await c.submissions.createSubmission({ formId, submissions });
  saveTokens(c); return res;
}

// ---------- FAQs (Wix CMS) ----------
export async function getFaqs() {
  const c = await getClient(), col = CONFIG.faqCollection || 'faqs';
  let rows = [];
  if (c?.items) {
    try {
      const res = c.items.query ? await c.items.query(col).ascending('sortOrder').limit(200).find() : await c.items.queryDataItems({ dataCollectionId: col }).ascending('sortOrder').limit(200).find();
      rows = (res.items || []).map(i => i.data || i);
      saveTokens(c);
    } catch (e) { console.warn('[DBK] FAQ query failed:', e?.message || e); }
  }
  if (!rows.length) { try { rows = await fetch('data/faqs.json').then(r => r.json()); } catch (e) {} }
  return rows.filter(r => r.question).map(r => ({ category: r.category || 'General Questions', question: r.question, answer: r.answer || '' }));
}

// ---------- admin settings (Wix CMS, e.g. popular prints in the mega menu) ----------
export async function getSetting(key) {
  const c = await getClient(), col = CONFIG.settingsCollection || 'siteSettings';
  if (!c?.items) return null;
  try {
    const q = c.items.query ? c.items.query(col) : c.items.queryDataItems({ dataCollectionId: col });
    const res = await q.eq('key', key).limit(1).find(); saveTokens(c);
    const v = (res.items?.[0]?.data || res.items?.[0])?.value;
    return v ? JSON.parse(v) : null;
  } catch (e) { console.warn('[DBK] Setting read failed:', e?.message || e); return null; }
}

// ---------- categories ----------
const norm = s => (s || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim().split(' ').map(x => x.replace(/s$/, '')).join(' ');
export const slugify = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
let catPromise = null;
// [{ id, name, slug, count }] in CONFIG.categories order, only categories that have visible products
export function listCategories() {
  if (catPromise) return catPromise;
  catPromise = (async () => {
    const items = await listProducts();
    const want = CONFIG.categories || [];
    let wixCats = [];
    const c = await getClient();
    if (c?.categories && mode === 'live') {
      try {
        const tree = { treeReference: { appNamespace: '@wix/stores' } };
        let res, lastErr;
        for (const q of [() => c.categories.queryCategories(tree).eq('visible', true).limit(100).find(), () => c.categories.queryCategories(tree).ne('name', '').limit(100).find(), () => c.categories.queryCategories(tree).limit(100).find()]) {
          try { res = await q(); break; } catch (e) { lastErr = e; }
        }
        if (!res) throw lastErr;
        wixCats = [...res.items];
        while (res.hasNext && res.hasNext()) { res = await res.next(); wixCats.push(...res.items); }
        saveTokens(c);
      } catch (e) { console.warn('[DBK] Category query failed:', e?.message || e); }
    }
    if (mode !== 'live') wixCats = [{ _id: 'welding-caps', name: 'Welding Caps', slug: 'welding-caps', visible: true }];
    const out = want.map(name => {
      const wc = wixCats.find(x => x.visible !== false && norm(x.name) === norm(name));
      if (!wc) return null;
      const id = wc._id || wc.id;
      return { id, name: wc.name || name, slug: wc.slug || slugify(name), count: items.filter(p => p.cats?.includes(id)).length };
    }).filter(x => x && x.count);
    return out;
  })();
  return catPromise;
}
export async function builderCategoryId() {
  const cats = await listCategories();
  return cats.find(x => norm(x.name) === norm(CONFIG.builderCategory))?.id || null;
}

// ---------- embroidery ----------
const FALLBACK_THREADS = ['Black', 'White', 'Red', 'Blue', 'Yellow', 'Orange', 'Green', 'Gray'];
export async function getThreads() {
  try { const c = await loadFallback(); return c.threads?.length ? c.threads : FALLBACK_THREADS; } catch (e) { return FALLBACK_THREADS; }
}

// The Wix product that charges for embroidery. Set CONFIG.embroidery.productSlug, or it's found by name.
export async function getEmbroideryProduct() {
  if (mode !== 'live') return null;
  const items = await listProducts({ includeHidden: true });
  const { productId, productSlug } = CONFIG.embroidery || {};
  const cand = (productId && items.find(p => p.id === productId)) || (productSlug && items.find(p => p.slug === productSlug))
    || items.find(p => /embroider/i.test(p.name) && !/welding cap|beanie|skull|fabric|pattern/i.test(p.name));
  if (!cand) return null;
  const p = await getProduct(cand.slug); if (!p) return null;
  const note = p.modifiers.find(m => m.type === 'FREE_TEXT') || null;
  // A) "Embroidery options" is a product option → one variant per choice, each with its own price
  const variants = await getVariants(p.id, p._raw);
  const vPick = re => { const v = variants.find(v => v.choices.some(c => re.test(c.choice))); return v ? { variantId: v.id, name: v.choices.map(c => c.choice).join(' / '), price: Number.isFinite(v.price) && v.price > 0 ? v.price : (CONFIG.embroidery.fallbackPrices[re.source.includes('logo') ? 'logo' : 'text'] ?? p.price) } : null; };
  const vt = vPick(/name|word/i), vl = vPick(/logo|image/i);
  if (vt || vl) return { product: p, kind: 'variant', text: vt, logo: vl, note, variants };
  // B) a choice modifier with added prices
  const mod = p.modifiers.find(m => m.type !== 'FREE_TEXT' && m.choices.some(c => /name|word|logo|image/i.test(c.name)));
  const mPick = re => { const ch = mod?.choices.find(c => re.test(c.name)); return ch ? { key: ch.key, name: ch.name, price: p.price + (ch.add || 0) } : null; };
  return { product: p, kind: 'modifier', mod, text: mPick(/name|word/i), logo: mPick(/logo|image/i), note, variants };
}

// Saves the design + placement preview to the Wix CMS so Kelly can see exactly what the customer saw.
// 1st choice: server function (uploads preview/logo to Wix Media Manager, CMS Image fields).
// Fallback: visitor-level CMS insert of the text fields only (needs "Add content: Anyone" on the collection).
export async function saveDesign(design) {
  if (mode !== 'live') return '';
  const ep = CONFIG.embroidery?.designsEndpoint;
  if (ep) {
    try {
      const res = await fetch(ep, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(design) });
      const out = await res.json().catch(() => ({}));
      if (res.ok && out.id) return out.id;
      console.warn('[DBK] Design upload function failed:', res.status, out.error || out);
    } catch (e) { console.warn('[DBK] Design upload function unreachable:', e); }
  }
  const c = await getClient();
  if (!c || !c.items) return '';
  const col = CONFIG.embroidery?.designsCollection || 'embroideryDesigns';
  const { preview, logo, ...textOnly } = design;
  try {
    const item = c.items.insert ? await c.items.insert(col, textOnly) : (await c.items.insertDataItem({ dataCollectionId: col, dataItem: { data: textOnly } })).dataItem;
    saveTokens(c);
    return item?._id || item?.id || '';
  } catch (e) { console.warn('[DBK] Saving embroidery design to CMS failed:', e); return ''; }
}

// diagnostics.html "Test save": runs both save paths and reports each result verbatim
export async function _testSave() {
  const design = { title: 'TEST – diagnostics', capName: 'Test cap', capSlug: 'test', quantity: 1, mode: 'text', text: 'TEST', font: 'Graduate', thread: 'Black', size: 100, rotation: 0, placement: 'Front · Crown', locked: true, uploadName: '', status: 'Test',
    preview: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' };
  const out = {};
  try { const res = await fetch(CONFIG.embroidery.designsEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(design) }); out.function = { status: res.status, body: await res.text() }; }
  catch (e) { out.function = { error: String(e) }; }
  const c = await getClient(); const col = CONFIG.embroidery.designsCollection; const { preview, ...t } = design;
  if (!c?.items) out.sdk = { error: '@wix/data module not loaded' };
  else try { const item = c.items.insert ? await c.items.insert(col, t) : (await c.items.insertDataItem({ dataCollectionId: col, dataItem: { data: t } })).dataItem; out.sdk = { ok: true, id: item?._id || item?.id }; }
  catch (e) { out.sdk = { collection: col, error: e?.details?.applicationError || e?.message || String(e) }; }
  return out;
}

// ---------- members (Wix-hosted login) ----------
const OAUTH_KEY = 'dbk.oauth', MEMBER_KEY = 'dbk.member';
export async function isLoggedIn() { const c = await getClient(); return !!(c && c.auth.loggedIn && c.auth.loggedIn()); }
export async function login(returnTo = location.href) {
  const c = await getClient(); if (!c) throw new Error('Login is available once the store is connected to Wix.');
  const data = c.auth.generateOAuthData(location.origin + '/login-callback.html', returnTo);
  localStorage.setItem(OAUTH_KEY, JSON.stringify(data));
  const { authUrl } = await c.auth.getAuthUrl(data);
  location.href = authUrl;
}
export async function finishLogin() {
  const c = await getClient(); if (!c) throw new Error('Wix is not reachable.');
  const { code, state, error, errorDescription } = c.auth.parseFromUrl();
  if (error) throw new Error(errorDescription || error);
  const data = JSON.parse(localStorage.getItem(OAUTH_KEY) || 'null');
  if (!data) throw new Error('Login session expired. Please try again.');
  const tokens = await c.auth.getMemberTokens(code, state, data);
  c.auth.setTokens(tokens);
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  localStorage.removeItem(OAUTH_KEY); sessionStorage.removeItem(MEMBER_KEY);
  return data.originalUri || '/account.html';
}
export async function logout() {
  const c = await getClient(); let url = location.origin + '/';
  try { const r = await c.auth.logout(url); if (r?.logoutUrl) url = r.logoutUrl; } catch (e) {}
  localStorage.removeItem(TOKENS_KEY); localStorage.removeItem(LINKS_KEY);
  sessionStorage.removeItem(MEMBER_KEY);
  location.href = url;
}
async function memberToken() {
  const c = await getClient(); if (!c?.auth.loggedIn?.()) return null;
  try { await c.members?.getCurrentMember(); } catch (e) {} // refreshes the token if needed
  saveTokens(c); return c.auth.getTokens()?.accessToken?.value || null;
}
export async function authedFetch(url, body) {
  const tok = await memberToken(); if (!tok) throw Object.assign(new Error('Not logged in'), { code: 401 });
  const res = await fetch(url, { method: body ? 'POST' : 'GET', headers: { 'x-member-token': tok, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(out.error || 'Request failed'), { code: res.status });
  return out;
}
export async function memberApi(action, body) {
  const tok = await memberToken(); if (!tok) throw Object.assign(new Error('Not logged in'), { code: 401 });
  const res = await fetch(`/api/member?action=${action}`, { method: body ? 'POST' : 'GET', headers: { 'x-member-token': tok, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(out.error || 'Request failed'), { code: res.status });
  return out;
}
export async function getMember() {
  if (!(await isLoggedIn())) return null;
  try { const s = JSON.parse(sessionStorage.getItem(MEMBER_KEY) || 'null'); if (s) return s; } catch (e) {}
  let m = await memberApi('me').catch(() => null);
  if (!m) { // function not configured yet – fall back to the SDK for name/email
    const c = await getClient();
    try { const r = await c.members.getCurrentMember({ fieldsets: ['FULL'] }); const x = r.member || r; m = { id: x._id, email: x.loginEmail, name: x.contact?.firstName || x.profile?.nickname || '' }; } catch (e) { return null; }
  }
  sessionStorage.setItem(MEMBER_KEY, JSON.stringify(m)); return m;
}
export const getPrefs = () => memberApi('prefs').then(r => r.prefs).catch(() => null);
export const savePrefs = p => memberApi('prefs', p).then(r => r.prefs);
export const getOrders = () => memberApi('orders').then(r => r.orders);
// Member surplus caps = live Wix discount rules whose name contains "member" (see /api/member). Prices shown here
// mirror the rule; Wix applies the actual discount at checkout to eligible logged-in members.
export function memberDeal(p, s) {
  const price = Number(p.price) || 0;
  if (s.type === 'FIXED_PRICE') return { memberPrice: s.fixedPrice, label: 'Member price' };
  if (s.type === 'FIXED_AMOUNT') return { memberPrice: Math.max(0, price - s.amount), label: money(s.amount) + ' off' };
  return { memberPrice: price * (1 - (s.percent || 0) / 100), label: (s.percent || 0) + '% off' };
}
export async function getSurplus() {
  const r = await memberApi('surplus');
  const items = await listProducts();
  return r.items.map(s => { const p = items.find(x => x.id === s.product); return p ? { ...s, p, ...memberDeal(p, s) } : null; }).filter(Boolean);
}
// Re-adds every line of a past order (caps + embroidery) and re-links each embroidery to its cap by Embroidery ref.
export async function reorder(order) {
  const c = await getClient(); if (!c) throw new Error('Not connected');
  const lineItems = order.lines.filter(l => l.catalogReference?.catalogItemId).map(l => ({ catalogReference: l.catalogReference, quantity: l.qty }));
  if (!lineItems.length) throw new Error('Nothing to reorder');
  const res = await c.currentCart.addToCurrentCart({ lineItems }); saveTokens(c);
  const after = res?.cart?.lineItems || [], embId = CONFIG.embroidery?.productId;
  const tagOf = li => (JSON.stringify(li.catalogReference?.options || {}).match(/Embroidery ref: ([A-Z0-9]+)/) || [])[1];
  after.filter(li => li.catalogReference?.catalogItemId === embId).forEach(e => {
    const t = tagOf(e), cap = t && after.find(li => li.catalogReference?.catalogItemId !== embId && tagOf(li) === t);
    if (cap) linkLines(cap._id, e._id);
  });
  emit();
}

export function clearLocalCart() { writeLocal([]); emit(); }

// For diagnostics.html
export async function _debug() {
  const c = await getClient();
  if (!c) return { client: false };
  const res = await c.productsV3.queryProducts().limit(1).find();
  await listProducts();
  const emb = await getEmbroideryProduct().catch(e => ({ error: String(e) }));
  const fn = await fetch(CONFIG.embroidery?.designsEndpoint || '/api/embroidery').then(r => r.ok ? r.json() : { ok: false, status: r.status }).catch(e => ({ ok: false, error: String(e) }));
  const memberFn = await fetch('/api/member?action=ping').then(r => r.ok ? r.json() : { ok: false, status: r.status }).catch(e => ({ ok: false, error: String(e) }));
  return { client: true, sdk: sdkStatus, cms: !!c.items, membersModule: !!c.members, loggedIn: !!c.auth.loggedIn?.(), uploadFunction: fn, memberFunction: memberFn, embroidery: emb && { name: emb.product?.name, id: emb.product?.id, kind: emb.kind, text: emb.text, logo: emb.logo, note: emb.note && { name: emb.note.name, key: emb.note.text?.key }, variants: emb.variants, error: emb.error }, sample: res.items[0] || null };
}
