import { mountChrome, esc, toast } from './ui.js';
import { getMember, login, authedFetch, listProducts, IMG, money } from './wix.js';

await mountChrome();
const root = document.querySelector('[data-admin]');
const api = (action, body) => authedFetch(`/api/admin?action=${action}`, body);

const member = await getMember().catch(() => null);
if (!member) {
  root.innerHTML = `<section class="pad admin-gate"><span class="kicker">DBK admin</span><h1 class="display">Admin log in</h1><p class="muted">Log in with an admin account to manage the store.</p><button type="button" class="btn btn-dark" data-login>Log in</button></section>`;
  root.querySelector('[data-login]').onclick = () => login(location.origin + '/admin.html').catch(e => toast(e.message));
} else {
  let who = null;
  try { who = await api('whoami'); } catch (e) {
    root.innerHTML = `<section class="pad admin-gate"><span class="kicker">DBK admin</span><h1 class="display">No access</h1><p class="muted">${esc(e.message)} Signed in as ${esc(member.email || '')}.</p><a href="index.html" class="btn btn-outline">Back to the shop</a></section>`;
  }
  if (who) {
    root.innerHTML = `<div class="pad-x admin-tabs-wrap"><div class="admin-tabs" role="tablist">
      <button type="button" role="tab" data-atab="instr">Special instructions <span class="tag" data-acount hidden></span></button>
      <button type="button" role="tab" data-atab="surplus">Member discounts</button>
      <button type="button" role="tab" data-atab="popular">Popular prints</button></div></div>
      <div data-apanel="instr"></div><div data-apanel="surplus" hidden></div><div data-apanel="popular" hidden></div>`;
    const show = k => { root.querySelectorAll('[data-atab]').forEach(b => { b.classList.toggle('on', b.dataset.atab === k); b.setAttribute('aria-selected', b.dataset.atab === k); }); root.querySelectorAll('[data-apanel]').forEach(p => p.hidden = p.dataset.apanel !== k); history.replaceState(null, '', '#' + k); };
    root.querySelectorAll('[data-atab]').forEach(b => b.onclick = () => show(b.dataset.atab));
    show(['#surplus', '#popular'].includes(location.hash) ? location.hash.slice(1) : 'instr');
    mountInstructions(root.querySelector('[data-apanel="instr"]'));
    mountSurplus(root.querySelector('[data-apanel="surplus"]'));
    mountPopular(root.querySelector('[data-apanel="popular"]'));
  }
}

// Read-only: member surplus prices now come from Wix automatic discount rules (Marketing → Discounts).
async function mountSurplus(el) {
  el.innerHTML = `
  <section class="pad admin">
    <div class="acct-head"><div><span class="kicker">DBK admin · ${esc(member.email || '')}</span><h1 class="display">Member discounts</h1>
      <span class="muted">Set up in the Wix dashboard under Marketing → Discounts → Automatic discounts. Any active rule with “<span data-match>member</span>” in its name, on specific products, shows as a member surplus cap. Wix applies it at checkout to the members chosen on the rule.</span></div>
      <div class="hero-ctas"><button type="button" class="btn btn-outline" data-reload>Refresh</button></div></div>
    <div data-rlist><p class="muted">Loading…</p></div>
  </section>`;
  const box = el.querySelector('[data-rlist]');
  async function load() {
    box.innerHTML = '<p class="muted">Loading…</p>';
    let out, items;
    try { [out, items] = await Promise.all([api('rules'), listProducts()]); }
    catch (e) { box.innerHTML = `<p class="err">Couldn’t read discount rules from Wix: ${esc(e.message)}</p><p class="note">Check the Cloudflare API key has the “Manage eCommerce” permission.</p>`; return; }
    el.querySelector('[data-match]').textContent = out.match;
    const find = id => items.find(p => p.id === id);
    const deal = (p, it) => it.type === 'FIXED_PRICE' ? [it.fixedPrice, 'Fixed price'] : it.type === 'FIXED_AMOUNT' ? [Math.max(0, p.price - it.amount), money(it.amount) + ' off'] : [p.price * (1 - it.percent / 100), it.percent + '% off'];
    const member = out.rules.filter(r => r.member), other = out.rules.filter(r => !r.member);
    const status = r => r.live ? '<span class="tag">Live</span>' : '<span class="tag muted">Off / scheduled</span>';
    const ruleHtml = r => `
      <div class="panel" style="margin-bottom:16px">
        <div class="panel-head"><h2>${esc(r.name || 'Untitled rule')}</h2>${status(r)}</div>
        ${r.items.length ? `<ol class="adm-rows">${r.items.map(it => { const p = find(it.product); if (!p) return `<li class="adm-row" style="grid-template-columns:minmax(0,1fr) auto minmax(80px,auto);gap:16px;align-items:center"><span class="adm-prod" style="display:flex;align-items:center;gap:12px;min-width:0"><span class="pick-img"></span><span><strong>${esc(it.product)}</strong><small class="err">Not found in the store (hidden or deleted?)</small></span></span></li>`;
          const [price, label] = deal(p, it);
          return `<li class="adm-row" style="grid-template-columns:minmax(0,1fr) auto minmax(80px,auto);gap:16px;align-items:center"><span class="adm-prod" style="display:flex;align-items:center;gap:12px;min-width:0"><span class="pick-img" style="background-image:url('${IMG(p.images[0], 120)}')"></span><span><strong>${esc(p.name)}</strong><small class="muted">${money(p.price)}</small></span></span><span class="mono">${esc(label)}</span><span class="mono adm-price" style="font-weight:700;text-align:right">${money(price)}</span></li>`; }).join('')}</ol>`
          : '<p class="pad-s note">This rule isn’t limited to specific products, so it isn’t listed as a surplus cap.</p>'}
      </div>`;
    box.innerHTML = (member.length ? member.map(ruleHtml).join('') : `<p class="muted">No discount rules with “${esc(out.match)}” in the name yet.</p>`)
      + (other.length ? `<p class="note" style="margin-top:24px">Other automatic discounts in Wix (not shown as surplus caps): ${other.map(r => esc(r.name || 'Untitled')).join(', ')}</p>` : '');
  }
  el.querySelector('[data-reload]').onclick = load;
  load();
}

// The four caps shown under "Popular prints" in the Welding caps mega menu (saved to the siteSettings CMS collection).
async function mountPopular(el) {
  el.innerHTML = `<section class="pad admin">
    <div class="acct-head"><div><span class="kicker">DBK admin · ${esc(member.email || '')}</span><h1 class="display">Popular prints</h1>
      <span class="muted">Choose the four welding caps shown in the Welding caps menu, in order. Leave a slot empty to skip it.</span></div>
      <div class="hero-ctas"><button type="button" class="btn btn-dark" data-pp-save>Save</button></div></div>
    <div data-pp><p class="muted">Loading…</p></div></section>`;
  const box = el.querySelector('[data-pp]');
  let items, ids;
  try { [items, { ids }] = await Promise.all([listProducts(), api('popular')]); }
  catch (e) { box.innerHTML = `<p class="err">Couldn’t load: ${esc(e.message)}</p><p class="note">Create the CMS collection “siteSettings” with Text fields key and value (Read: Anyone).</p>`; return; }
  const caps = items.filter(p => /welding cap/i.test(p.name)).sort((a, b) => a.name.localeCompare(b.name));
  const sel = [0, 1, 2, 3].map(i => ids[i] || '');
  const render = () => {
    box.innerHTML = `<div class="pp-slots">${sel.map((id, i) => { const p = caps.find(x => x.id === id);
      return `<div class="pp-slot"><span class="kicker">${i + 1}</span><span class="pick-img" style="${p ? `background-image:url('${IMG(p.images[0], 300)}')` : ''}"></span>
        <select data-slot="${i}" aria-label="Popular print ${i + 1}"><option value="">— None —</option>${caps.map(c => `<option value="${esc(c.id)}"${c.id === id ? ' selected' : ''}>${esc(c.name.replace(/ Welding Cap$/, ''))}</option>`).join('')}</select></div>`; }).join('')}</div>`;
    box.querySelectorAll('[data-slot]').forEach(s => s.onchange = () => { sel[+s.dataset.slot] = s.value; render(); });
  };
  render();
  el.querySelector('[data-pp-save]').onclick = async e => {
    const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Saving…';
    try { await api('popular', { ids: sel.filter(Boolean) }); toast('Popular prints saved'); }
    catch (err) { toast('Couldn’t save: ' + err.message); }
    btn.disabled = false; btn.textContent = 'Save';
  };
}

async function mountInstructions(el) {
  el.innerHTML = `
  <section class="pad admin">
    <div class="acct-head"><div><span class="kicker">DBK admin · ${esc(member.email || '')}</span><h1 class="display">Special instructions</h1>
      <span class="muted">Customers write instructions in their own words. Type the clear wording you'll follow and confirm it. It's then added to every order from that customer.</span></div>
      <div class="seg-btns" role="group" aria-label="Filter"><button type="button" data-f="awaiting" class="on">Awaiting</button><button type="button" data-f="confirmed">Confirmed</button><button type="button" data-f="all">All</button></div></div>
    <div data-ilist><p class="muted">Loading…</p></div>
  </section>`;
  const list = el.querySelector('[data-ilist]'), badge = root.querySelector('[data-acount]');
  let items = [], filter = 'awaiting';
  const fmt = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const updBadge = () => { const n = items.filter(i => i.status === 'awaiting').length; badge.hidden = !n; badge.textContent = n; };
  function render() {
    const rows = items.filter(i => filter === 'all' || i.status === filter);
    el.querySelectorAll('[data-f]').forEach(b => b.classList.toggle('on', b.dataset.f === filter));
    list.innerHTML = rows.length ? rows.map(i => `
      <article class="panel instr-card" data-id="${esc(i.id)}">
        <div class="panel-head"><div class="instr-who"><strong>${esc(i.email || 'Member')}</strong><span class="muted mono">Updated ${fmt(i.updated)}</span></div><span class="tag${i.status === 'confirmed' ? ' ok' : ''}">${i.status === 'confirmed' ? 'Confirmed' : 'Awaiting DBK'}</span></div>
        <div class="instr-body">
          <div class="instr-cust"><span class="kicker">Customer wrote</span><p>“${esc(i.instructions)}”</p></div>
          <label class="field"><span class="kicker">Confirmed wording · goes on every order</span><textarea rows="3" maxlength="500" data-c placeholder="e.g. Move the band seam from the back of the cap to the visor area, hidden under the bill."></textarea></label>
          <div class="instr-actions">
            <button type="button" class="btn btn-dark" data-confirm>${i.status === 'confirmed' ? 'Update wording' : 'Confirm'}</button>
            ${i.status === 'confirmed' ? '<button type="button" class="btn-sm" data-reopen>Mark as awaiting</button>' : '<button type="button" class="btn-sm" data-copy>Use customer’s words</button>'}
            ${i.email ? `<a class="link-btn" href="mailto:${esc(i.email)}?subject=${encodeURIComponent('Your DBK cap instructions')}">Email customer</a>` : ''}
          </div>
        </div>
      </article>`).join('') : `<p class="muted pad-s">${filter === 'awaiting' ? 'Nothing waiting. All customer instructions are confirmed.' : 'No instructions yet.'}</p>`;
    list.querySelectorAll('.instr-card').forEach(card => {
      const it = items.find(x => x.id === card.dataset.id), ta = card.querySelector('[data-c]');
      ta.value = it.instructionsConfirmed || '';
      card.querySelector('[data-copy]')?.addEventListener('click', () => { ta.value = it.instructions; ta.focus(); });
      card.querySelector('[data-confirm]').onclick = async e => {
        if (!ta.value.trim()) { ta.focus(); toast('Type the confirmed wording first'); return; }
        e.target.disabled = true; e.target.textContent = 'Saving…';
        try { const r = await api('instructions', { id: it.id, confirmed: ta.value }); Object.assign(it, { instructionsConfirmed: r.instructionsConfirmed, status: 'confirmed' }); toast('Instructions confirmed'); updBadge(); render(); }
        catch (err) { toast('Couldn’t save: ' + err.message); e.target.disabled = false; e.target.textContent = 'Confirm'; }
      };
      card.querySelector('[data-reopen]')?.addEventListener('click', async e => {
        e.target.disabled = true;
        try { await api('instructions', { id: it.id, status: 'awaiting' }); it.status = 'awaiting'; toast('Marked as awaiting'); updBadge(); render(); }
        catch (err) { toast('Couldn’t save: ' + err.message); e.target.disabled = false; }
      });
    });
  }
  el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; render(); });
  try { items = (await api('instructions')).items; updBadge(); render(); }
  catch (e) { list.innerHTML = `<p class="err pad-s">Couldn’t load instructions: ${esc(e.message)}</p>`; }
}
