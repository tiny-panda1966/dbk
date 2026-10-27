// Cloudflare Pages Function: /api/member?action=…
// Member-only data. The caller's Wix member token is verified with Wix on every request, then the Wix API key
// (server-side only) reads/writes that member's data. Members can never read other members' data or edit
// the DBK-confirmed instruction wording.
//
// Uses the same variables as /api/embroidery, plus optional:
//   WIX_PREFS_COLLECTION    (default memberPreferences)
//   MEMBER_RULE_MATCH       text in a Wix discount rule's name that marks it as a member surplus rule (default "member")

const WIX = 'https://www.wixapis.com';
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const H = env => ({ Authorization: env.WIX_API_KEY, 'wix-site-id': env.WIX_SITE_ID, 'content-type': 'application/json' });
const str = (v, n = 200) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, n);
const PREFS = env => env.WIX_PREFS_COLLECTION || 'memberPreferences';
// Wix Stores option name → CMS field
const OPTION_FIELDS = { 'Cap Size': 'capSize', 'Cap Liner Color': 'linerColour', 'Liner Type': 'linerType', 'Cap Length': 'capLength', 'Batting in Bill?': 'batting', 'Bill Size': 'billSize' };

async function wix(env, path, body, method = 'POST') {
  const r = await fetch(WIX + path, { method, headers: H(env), body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path} ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : {};
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

async function verifyMember(request) {
  const tok = request.headers.get('x-member-token');
  if (!tok) return null;
  const r = await fetch(`${WIX}/members/v1/members/my?fieldsets=FULL`, { headers: { Authorization: tok } });
  if (!r.ok) return null;
  return (await r.json()).member || null;
}

async function findPrefs(env, memberId) {
  const j = await wix(env, '/wix-data/v2/items/query', { dataCollectionId: PREFS(env), query: { filter: { memberId: { $eq: memberId } }, paging: { limit: 1 } } });
  return j.dataItems?.[0] || null;
}
function toClient(item) {
  if (!item) return null;
  const d = item.data || {};
  return {
    options: Object.fromEntries(Object.entries(OPTION_FIELDS).map(([name, f]) => [name, d[f] || ''])),
    font: d.font || '', thread: d.thread || '', autoApply: d.autoApply !== false,
    instructions: d.instructions || '', instructionsConfirmed: d.instructionsConfirmed || '',
    instructionsStatus: d.instructionsStatus || (d.instructions ? 'awaiting' : ''),
  };
}

async function savePrefs(env, member, body) {
  const memberId = member._id || member.id;
  const cur = await findPrefs(env, memberId);
  const old = cur?.data || {};
  const data = { ...Object.fromEntries(Object.entries(old).filter(([k]) => !k.startsWith('_') || k === '_id')), memberId, email: str(member.loginEmail, 200) };
  const o = body.options || {};
  Object.entries(OPTION_FIELDS).forEach(([name, f]) => { if (name in o) data[f] = str(o[name], 120); });
  if ('font' in body) data.font = str(body.font, 60);
  if ('thread' in body) data.thread = str(body.thread, 40);
  if ('autoApply' in body) data.autoApply = !!body.autoApply;
  if ('instructions' in body) {
    const next = str(body.instructions, 500).trim();
    if (next !== (old.instructions || '')) { data.instructions = next; data.instructionsStatus = next ? 'awaiting' : ''; }
  }
  // instructionsConfirmed / instructionsStatus 'confirmed' are only ever set by Kelly in the CMS.
  const saved = cur
    ? await wix(env, `/wix-data/v2/items/${cur.id || cur._id}`, { dataCollectionId: PREFS(env), dataItem: { id: cur.id || cur._id, data } }, 'PUT')
    : await wix(env, '/wix-data/v2/items', { dataCollectionId: PREFS(env), dataItem: { data } });
  return toClient(saved.dataItem);
}

async function orders(env, member) {
  const tries = [{ 'buyerInfo.memberId': { $eq: member._id || member.id } }, { 'buyerInfo.contactId': { $eq: member.contactId } }];
  let list = [], lastErr;
  for (const filter of tries) {
    if (!Object.values(filter)[0].$eq) continue;
    try {
      const j = await wix(env, '/ecom/v1/orders/search', { search: { filter, sort: [{ fieldName: 'createdDate', order: 'DESC' }], cursorPaging: { limit: 20 } } });
      list = j.orders || [];
      if (list.length) break;
    } catch (e) { lastErr = e; }
  }
  if (!list.length && lastErr) throw lastErr;
  return list.map(o => ({
    id: o.id || o._id, number: o.number, date: o.createdDate || o._createdDate,
    payment: o.paymentStatus, fulfilment: o.fulfillmentStatus, status: o.status,
    total: o.priceSummary?.total?.formattedAmount || o.priceSummary?.total?.amount || '',
    lines: (o.lineItems || []).map(li => ({
      name: li.productName?.original || li.productName?.translated || '', qty: li.quantity,
      price: li.totalPriceAfterTax?.formattedAmount || li.price?.formattedAmount || '',
      image: li.image?.url || li.image || '',
      desc: (li.descriptionLines || []).map(d => `${d.name?.original || ''}: ${d.plainText?.original || d.colorInfo?.original || ''}`),
      catalogReference: li.catalogReference || null,
    })),
  }));
}

async function surplus(env) {
  const seen = new Set(), out = [];
  for (const r of await discountRules(env)) {
    if (!ruleLive(r) || !(r.name || '').toLowerCase().includes(RULE_MATCH(env))) continue;
    for (const it of ruleItems(r)) if (!seen.has(it.product)) { seen.add(it.product); out.push({ ...it, rule: r.name || '' }); }
  }
  return out;
}

export async function onRequest({ request, env }) {
  const action = new URL(request.url).searchParams.get('action');
  if (action === 'ping') return json({ ok: true, configured: !!(env.WIX_API_KEY && env.WIX_SITE_ID), prefs: PREFS(env), memberRuleMatch: RULE_MATCH(env) });
  if (!env.WIX_API_KEY || !env.WIX_SITE_ID) return json({ error: 'Server not configured' }, 501);
  const member = await verifyMember(request);
  if (!member) return json({ error: 'Not logged in' }, 401);
  try {
    switch (action) {
      case 'me': return json({ id: member._id || member.id, email: member.loginEmail || '', name: member.contact?.firstName || member.profile?.nickname || (member.loginEmail || '').split('@')[0], since: member._createdDate || member.createdDate || '' });
      case 'prefs':
        if (request.method === 'POST') return json({ prefs: await savePrefs(env, member, await request.json()) });
        return json({ prefs: toClient(await findPrefs(env, member._id || member.id)) });
      case 'orders': return json({ orders: await orders(env, member) });
      case 'surplus': return json({ items: await surplus(env) });
      default: return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
}
