// Cloudflare Pages Function: /api/admin?action=…
// Admin-only tools. The caller's Wix member token is verified with Wix, then their login email must be in ADMIN_EMAILS.
//   ADMIN_EMAILS  comma-separated (default: tiny.panda@tiny-panda.com)
// Uses WIX_API_KEY / WIX_SITE_ID (and optional MEMBER_RULE_MATCH) like the other functions.

const WIX = 'https://www.wixapis.com';
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const H = env => ({ Authorization: env.WIX_API_KEY, 'wix-site-id': env.WIX_SITE_ID, 'content-type': 'application/json' });
const PREFS = env => env.WIX_PREFS_COLLECTION || 'memberPreferences';
const admins = env => (env.ADMIN_EMAILS || 'tiny.panda@tiny-panda.com').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

async function wix(env, path, body, method = 'POST') {
  const r = await fetch(WIX + path, { method, headers: H(env), body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path} ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : {};
}
async function verifyAdmin(request, env) {
  const tok = request.headers.get('x-member-token');
  if (!tok) return { status: 401 };
  const r = await fetch(`${WIX}/members/v1/members/my?fieldsets=FULL`, { headers: { Authorization: tok } });
  if (!r.ok) return { status: 401 };
  const m = (await r.json()).member;
  const email = (m?.loginEmail || '').toLowerCase();
  return admins(env).includes(email) ? { member: m, email } : { status: 403, email };
}

// ---- Wix automatic discount rules (Marketing → Discounts). Source of truth for member surplus prices. ----
// A rule counts as a member surplus rule when its name contains MEMBER_RULE_MATCH (default "member", e.g. "memberSale").
// Who gets the discount (members / labelled contacts) is set on the rule in the Wix dashboard; checkout applies it.
const RULE_MATCH = env => (env.MEMBER_RULE_MATCH || 'member').toLowerCase();
async function discountRules(env) {
  const out = []; let cursor = null;
  for (let i = 0; i < 10; i++) {
    const j = await wix(env, '/ecom/v1/discount-rules/query', { query: { cursorPaging: cursor ? { limit: 100, cursor } : { limit: 100 } } });
    out.push(...(j.discountRules || []));
    cursor = j.pagingMetadata?.cursors?.next; if (!cursor) break;
  }
  return out;
}
function ruleLive(r) {
  if (r.active === false) return false;
  const now = Date.now(), t = r.activeTimeInfo || {};
  if (t.start && Date.parse(t.start) > now) return false;
  if (t.end && Date.parse(t.end) < now) return false;
  return true;
}
function ruleItems(r) {
  const res = [];
  for (const d of r.discounts?.values || []) {
    const ids = new Set();
    const walk = o => { if (!o || typeof o !== 'object') return; if (Array.isArray(o.catalogItemIds)) o.catalogItemIds.forEach(x => typeof x === 'string' && ids.add(x)); Object.values(o).forEach(walk); };
    walk(d.specificItemsInfo || d);
    const type = d.discountType || 'PERCENTAGE';
    const val = { type, percent: type === 'PERCENTAGE' ? Number(d.percentage) || 0 : null, amount: type === 'FIXED_AMOUNT' ? Number(d.fixedAmount) || 0 : null, fixedPrice: type === 'FIXED_PRICE' ? Number(d.fixedPrice) || 0 : null };
    ids.forEach(id => res.push({ product: id, ...val }));
  }
  return res;
}

async function listRules(env) {
  const match = RULE_MATCH(env);
  return (await discountRules(env)).map(r => ({
    id: r.id || r._id, name: r.name || '', live: ruleLive(r), member: (r.name || '').toLowerCase().includes(match),
    start: r.activeTimeInfo?.start || '', end: r.activeTimeInfo?.end || '', items: ruleItems(r),
  }));
}

// Site settings (Wix CMS collection, default "siteSettings": key + value Text fields). value holds JSON.
const SETTINGS = env => env.WIX_SETTINGS_COLLECTION || 'siteSettings';
async function findSetting(env, key) {
  const j = await wix(env, '/wix-data/v2/items/query', { dataCollectionId: SETTINGS(env), query: { filter: { key: { $eq: key } }, paging: { limit: 1 } } });
  return (j.dataItems || [])[0] || null;
}
async function getSettingValue(env, key) {
  const it = await findSetting(env, key);
  try { return it?.data?.value ? JSON.parse(it.data.value) : null; } catch (e) { return null; }
}
async function saveSetting(env, key, value) {
  const it = await findSetting(env, key), data = { key, value: JSON.stringify(value) };
  if (it) await wix(env, `/wix-data/v2/items/${it.id || it._id}`, { dataCollectionId: SETTINGS(env), dataItem: { id: it.id || it._id, data } }, 'PUT');
  else await wix(env, '/wix-data/v2/items', { dataCollectionId: SETTINGS(env), dataItem: { data } });
  return value;
}

async function listInstructions(env) {
  const out = []; let offset = 0;
  for (;;) {
    const j = await wix(env, '/wix-data/v2/items/query', { dataCollectionId: PREFS(env), query: { sort: [{ fieldName: '_updatedDate', order: 'DESC' }], paging: { limit: 100, offset } } });
    const items = j.dataItems || [];
    items.forEach(i => { const d = i.data || {}; if ((d.instructions || '').trim()) out.push({ id: i.id || i._id, email: d.email || '', memberId: d.memberId || '', instructions: d.instructions, instructionsConfirmed: d.instructionsConfirmed || '', status: d.instructionsStatus === 'confirmed' ? 'confirmed' : 'awaiting', updated: d._updatedDate || '' }); });
    if (items.length < 100) break; offset += 100;
  }
  return out;
}
async function confirmInstructions(env, { id, confirmed, status }) {
  if (!id) throw new Error('Missing id');
  const cur = await wix(env, `/wix-data/v2/items/${id}?dataCollectionId=${encodeURIComponent(PREFS(env))}`, null, 'GET');
  const data = { ...(cur.dataItem?.data || {}) };
  const text = String(confirmed ?? '').trim().slice(0, 500);
  if (status === 'awaiting') data.instructionsStatus = 'awaiting';
  else { if (!text) throw new Error('Enter the confirmed wording'); data.instructionsConfirmed = text; data.instructionsStatus = 'confirmed'; }
  await wix(env, `/wix-data/v2/items/${id}`, { dataCollectionId: PREFS(env), dataItem: { id, data } }, 'PUT');
  return { id, instructionsConfirmed: data.instructionsConfirmed || '', status: data.instructionsStatus };
}

export async function onRequest({ request, env }) {
  if (!env.WIX_API_KEY || !env.WIX_SITE_ID) return json({ error: 'Server not configured' }, 501);
  const a = await verifyAdmin(request, env);
  if (!a.member) return json({ error: a.status === 403 ? 'This account doesn’t have admin access.' : 'Not logged in' }, a.status);
  const action = new URL(request.url).searchParams.get('action');
  try {
    if (action === 'whoami') return json({ admin: true, email: a.email });
    if (action === 'rules') return json({ rules: await listRules(env), match: RULE_MATCH(env) });
    if (action === 'popular') {
      if (request.method === 'POST') { const ids = ((await request.json()).ids || []).filter(x => typeof x === 'string' && x).slice(0, 4); return json({ ids: await saveSetting(env, 'popularPrints', ids) }); }
      return json({ ids: (await getSettingValue(env, 'popularPrints')) || [] });
    }
    if (action === 'instructions') {
      if (request.method === 'POST') return json(await confirmInstructions(env, await request.json()));
      return json({ items: await listInstructions(env) });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
}
