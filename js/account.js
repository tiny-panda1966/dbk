import { mountChrome, esc, toast, openCart, productUrl } from './ui.js';
import { authedFetch, getMember, login, logout, getPrefs, savePrefs, getOrders, getSurplus, reorder, listProducts, getProduct, getThreads, mediaId, IMG, money, FEATURED, findFeatured } from './wix.js';
import { FONTS } from './builder.js';

await mountChrome();
const root = document.querySelector('[data-account]');
const ORDER = ['Cap Size', 'Cap Liner Color', 'Liner Type', 'Cap Length', 'Batting in Bill?', 'Bill Size'];
const LABEL = { 'Cap Liner Color': 'Liner colour', 'Batting in Bill?': 'Batting in bill' };
const sizeVal = s => { if (/custom/i.test(s)) return 99; const m = /(\d+)(?:\s+(\d+)\/(\d+))?/.exec(s); return m ? +m[1] + (m[2] ? m[2] / m[3] : 0) : 50; };
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const statusOf = o => o.fulfilment === 'FULFILLED' ? 'Shipped' : o.payment === 'PAID' ? 'Paid · in production' : (o.payment || o.status || '').replace(/_/g, ' ').toLowerCase();

const member = await getMember().catch(() => null);

if (!member) {
  root.innerHTML = `
    <section class="pad acct-guest">
      <span class="kicker">DBK Members</span>
      <h1 class="display">Order it once.<br>Reorder in a click.</h1>
      <ul class="benefits">
        <li>Save your size, liner, bill and embroidery preferences once</li>
        <li>Every new cap fills them in for you</li>
        <li>Special instructions confirmed by Kelly and applied to every order</li>
        <li>Reorder a past cap in one click, plus members-only surplus caps</li>
      </ul>
      <div class="hero-ctas"><button type="button" class="btn btn-yellow" data-login>Log in or join free</button></div>
      <p class="note">You’ll sign in on a secure Wix page and come straight back here.</p>
    </section>`;
  root.querySelector('[data-login]').onclick = () => login(location.origin + '/account.html').catch(e => toast(e.message));
} else {
  root.innerHTML = `
    <section class="pad acct">
      <div class="acct-head">
        <div><span class="kicker">Member</span><h1 class="display">Hi${member.name ? ', ' + esc(member.name) : ''}</h1><span class="muted">${esc(member.email || '')}</span></div>
        <div class="hero-ctas"><a href="product.html" class="btn btn-dark">Build a cap</a><button type="button" class="btn btn-outline" data-logout>Log out</button></div>
      </div>
      <div class="acct-grid">
        <div class="panel" data-prefs><div class="panel-head"><h2>Cap preferences</h2></div><p class="pad-s muted">Loading…</p></div>
        <div class="acct-col">
          <div class="panel" data-instr><div class="panel-head"><h2>Special instructions</h2></div><p class="pad-s muted">Loading…</p></div>
          <div class="panel"><div class="panel-head"><h2>Order history</h2></div><div data-orders class="pad-s"><p class="muted">Loading…</p></div></div>
        </div>
      </div>
      <div data-surplus></div>
    </section>`;
  root.querySelector('[data-logout]').onclick = () => logout();
  authedFetch('/api/admin?action=whoami').then(() => root.querySelector('.acct-head .hero-ctas').insertAdjacentHTML('afterbegin', '<a href="admin.html" class="btn btn-yellow">Admin</a>')).catch(() => {});

  const [prefs0, threads, items] = await Promise.all([getPrefs(), getThreads(), listProducts()]);
  let prefs = prefs0 || { options: {}, font: '', thread: '', autoApply: true, instructions: '', instructionsConfirmed: '', instructionsStatus: '' };
  const ref = findFeatured(items, FEATURED[0]) || items[0];
  const refP = ref ? await getProduct(ref.slug) : null;
  const mods = (refP?.modifiers || []).filter(m => m.type !== 'FREE_TEXT' && ORDER.includes(m.name)).sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name));
  mods.forEach(m => { if (m.name === 'Cap Size') m.choices.sort((a, b) => sizeVal(a.name) - sizeVal(b.name)); });

  // preferences form
  const pBox = root.querySelector('[data-prefs]');
  const sel = (name, opts, val) => `<select data-f="${esc(name)}"><option value="">—</option>${opts.map(o => `<option${o === val ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  pBox.innerHTML = `
    <div class="panel-head"><h2>Cap preferences</h2>
      <label class="toggle"><input type="checkbox" data-auto ${prefs.autoApply ? 'checked' : ''}><span></span>Auto-apply</label></div>
    <div class="pref-form">
      ${mods.map(m => `<label><span>${esc(LABEL[m.name] || m.name.replace('?', ''))}</span>${sel(m.name, m.choices.map(c => c.name), prefs.options?.[m.name])}</label>`).join('')}
      <label><span>Embroidery font</span>${sel('font', FONTS.map(f => f.name), prefs.font)}</label>
      <label><span>Thread colour</span>${sel('thread', threads, prefs.thread)}</label>
    </div>
    <div class="pad-s"><button type="button" class="btn btn-dark" data-save>Save preferences</button></div>`;
  const collect = () => {
    const options = {}; let font = '', thread = '';
    pBox.querySelectorAll('[data-f]').forEach(s => { if (s.dataset.f === 'font') font = s.value; else if (s.dataset.f === 'thread') thread = s.value; else options[s.dataset.f] = s.value; });
    return { options, font, thread, autoApply: pBox.querySelector('[data-auto]').checked };
  };
  pBox.querySelector('[data-save]').onclick = async e => {
    e.target.disabled = true;
    try { prefs = await savePrefs(collect()); toast('Preferences saved'); } catch (err) { toast('Couldn’t save. Please try again.'); }
    e.target.disabled = false;
  };
  pBox.querySelector('[data-auto]').onchange = async ev => { try { prefs = await savePrefs({ autoApply: ev.target.checked }); toast(ev.target.checked ? 'Preferences will fill in automatically' : 'Auto-apply off'); } catch (e) { toast('Couldn’t save.'); } };

  // special instructions
  const iBox = root.querySelector('[data-instr]');
  const renderInstr = () => {
    const ok = prefs.instructionsStatus === 'confirmed' && prefs.instructionsConfirmed;
    iBox.innerHTML = `
      <div class="panel-head"><h2>Special instructions</h2></div>
      <div class="pad-s instr">
        <label class="field"><span><strong>In your own words</strong></span><textarea rows="3" maxlength="500" data-it placeholder="e.g. Can you move the seam to the back or other side please"></textarea></label>
        ${prefs.instructions ? `<div class="confirm${ok ? ' ok' : ''}"><div class="confirm-head"><span class="kicker">Confirmed by DBK · applied to every order</span><span class="tag${ok ? ' ok' : ''}">${ok ? 'Confirmed' : 'Awaiting DBK'}</span></div><p>${ok ? esc(prefs.instructionsConfirmed) : 'Kelly will read your instructions and confirm the details with you.'}</p></div>` : ''}
        <button type="button" class="btn-sm dark" data-isave>Save instructions</button>
      </div>`;
    const ta = iBox.querySelector('[data-it]'); ta.value = prefs.instructions || '';
    iBox.querySelector('[data-isave]').onclick = async e => {
      e.target.disabled = true;
      try { prefs = await savePrefs({ instructions: ta.value }); toast('Instructions saved. Kelly will confirm them.'); renderInstr(); } catch (err) { toast('Couldn’t save.'); e.target.disabled = false; }
    };
  };
  renderInstr();

  // orders
  const oBox = root.querySelector('[data-orders]');
  getOrders().then(orders => {
    if (!orders.length) { oBox.innerHTML = '<p class="muted">No orders yet. Your caps will appear here after your first order.</p>'; return; }
    oBox.innerHTML = orders.map((o, i) => `
      <div class="order">
        <div class="order-top"><span class="mono">#${esc(o.number)} · ${fmtDate(o.date)}</span><span class="tag ok">${esc(statusOf(o))}</span><span class="mono order-total">${esc(o.total)}</span></div>
        ${o.lines.map(l => `<div class="order-line"><span class="order-img" style="background-image:url('${IMG(mediaId(l.image), 160)}')"></span><div><strong>${esc(l.name)}</strong> <span class="muted">× ${l.qty}</span>${l.desc.length ? `<div class="order-desc">${l.desc.map(esc).join('<br>')}</div>` : ''}</div></div>`).join('')}
        <button type="button" class="btn btn-yellow" data-reorder="${i}">Reorder</button>
      </div>`).join('');
    oBox.querySelectorAll('[data-reorder]').forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = 'Adding…';
      try { await reorder(orders[+b.dataset.reorder]); openCart(); } catch (e) { console.error(e); toast('Some items from this order are no longer available.'); }
      b.disabled = false; b.textContent = 'Reorder';
    });
  }).catch(e => { oBox.innerHTML = `<p class="muted">Order history isn’t available right now.</p>`; console.warn('[DBK] orders', e); });

  // surplus caps
  getSurplus().then(list => {
    if (!list.length) return;
    root.querySelector('[data-surplus]').innerHTML = `
      <div class="section-head" style="margin-top:56px"><h2 class="display">Member surplus caps</h2><span class="kicker">Ready-made · members only</span></div>
      <div class="grid">${list.map(({ p, memberPrice, label }) => `
        <article class="card">
          <a href="${productUrl(p)}" class="card-img tagged"><img loading="lazy" src="${IMG(p.images[0], 500)}" alt="${esc(p.name)}"><span class="corner-tag">${esc(label)}</span></a>
          <div class="card-text"><a href="${productUrl(p)}" class="clamp2 card-name">${esc(p.name)}</a><span class="mono"><s class="muted">${money(p.price)}</s> ${money(memberPrice)}</span></div>
          <a href="${productUrl(p)}" class="btn btn-outline btn-block card-btn">View cap</a>
        </article>`).join('')}</div>
      <p class="note" style="margin-top:16px">Your member discount is applied automatically at checkout while you're logged in.</p>`;
  }).catch(() => {});
}
