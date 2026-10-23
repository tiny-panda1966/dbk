// Cloudflare Pages Function: /api/member?action=…
// Member-only data. The caller's Wix member token is verified with Wix on every request, then the Wix API key
// (server-side only) reads/writes that member's data. Members can never read other members' data or edit
// the DBK-confirmed instruction wording.
//
// Uses the same variables as /api/embroidery, plus optional:
//   WIX_PREFS_COLLECTION    (default memberPreferences)
//   WIX_SURPLUS_COLLECTION  (default memberSurplus)
//   MEMBER_COUPON           Wix coupon code applied at checkout for members (scoped to surplus caps in Wix)

const WIX = 'https://www.wixapis.com';
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const H = env => ({ Authorization: env.WIX_API_KEY, 'wix-site-id': env.WIX_SITE_ID, 'content-type': 'application/json' });
const str = (v, n = 200) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, n);
const PREFS = env => env.WIX_PREFS_COLLECTION || 'memberPreferences';
const SURPLUS = env => env.WIX_SURPLUS_COLLECTION || 'memberSurplus';
// Wix Stores option name → CMS field
const OPTION_FIELDS = { 'Cap Size': 'capSize', 'Cap Liner Color': 'linerColour', 'Liner Type': 'linerType', 'Cap Length': 'capLength', 'Batting in Bill?': 'batting', 'Bill Size': 'billSize' };

async function wix(env, path, body, method = 'POST') {
  const r = await fetch(WIX + path, { method, headers: H(env), body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path} ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : {};
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
  const j = await wix(env, '/wix-data/v2/items/query', { dataCollectionId: SURPLUS(env), query: { filter: { active: { $eq: true } }, sort: [{ fieldName: 'sortOrder', order: 'ASC' }], paging: { limit: 100 } } });
  return (j.dataItems || []).map(i => ({ product: str(i.data?.product, 200).trim(), discountPercent: Number(i.data?.discountPercent) || 15 })).filter(i => i.product);
}

export async function onRequest({ request, env }) {
  const action = new URL(request.url).searchParams.get('action');
  if (action === 'ping') return json({ ok: true, configured: !!(env.WIX_API_KEY && env.WIX_SITE_ID), prefs: PREFS(env), surplus: SURPLUS(env), coupon: !!env.MEMBER_COUPON });
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
      case 'surplus': return json({ items: await surplus(env), coupon: env.MEMBER_COUPON || '' });
      default: return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
}
