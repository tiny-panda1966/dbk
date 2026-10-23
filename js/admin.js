import { mountChrome, esc, toast } from './ui.js';
import { getMember, login, authedFetch, listProducts, listCategories, IMG, money } from './wix.js';

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
  if (who) await mountSurplus();
}

async function mountSurplus() {
  root.innerHTML = `
  <section class="pad admin">
    <div class="acct-head"><div><span class="kicker">DBK admin · ${esc(member.email || '')}</span><h1 class="display">Member surplus caps</h1><span class="muted">Shown to logged-in members on their account page, in this order. The discount is applied at checkout with the member coupon.</span></div>
      <div class="hero-ctas"><button type="button" class="btn btn-yellow" data-save disabled>Save changes</button></div></div>
    <div class="panel">
      <div class="panel-head"><h2>Surplus list</h2><span class="kicker" data-dirty></span></div>
      <div class="adm-head" aria-hidden="true"><span></span><span>Product</span><span>Discount</span><span>Member price</span><span>Active</span><span></span></div>
      <ol class="adm-rows" data-rows></ol>
      <div class="pad-s adm-add">
        <label class="field"><span><strong>Add a product</strong> <span class="muted">· search the store</span></span>
          <div class="adm-picker">
            <select data-pcat aria-label="Category"><option value="">All categories</option></select>
            <input type="search" data-pq placeholder="Search by name or SKU" autocomplete="off">
          </div></label>
        <div class="adm-results" data-pres></div>
      </div>
    </div>
  </section>`;

  const [items, cats, saved] = await Promise.all([listProducts(), listCategories(), api('surplus').then(r => r.items)]);
  const find = ref => items.find(p => p.id === ref || p.slug === ref || p.name.toLowerCase() === String(ref).toLowerCase());
  let rows = saved.map(s => ({ ...s, p: find(s.product) }));
  let dirty = false;
  const $ = s => root.querySelector(s);
  const setDirty = v => { dirty = v; $('[data-save]').disabled = !v; $('[data-dirty]').textContent = v ? 'Unsaved changes' : ''; };
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  $('[data-pcat]').innerHTML += cats.map(c => `<option value="${esc(c.id)}">${esc(c.name)} (${c.count})</option>`).join('');

  function renderRows() {
    const box = $('[data-rows]');
    box.innerHTML = rows.length ? rows.map((r, i) => `
      <li class="adm-row" draggable="true" data-i="${i}">
        <span class="adm-drag" title="Drag to reorder" aria-hidden="true">⋮⋮</span>
        <span class="adm-prod">${r.p ? `<span class="pick-img" style="background-image:url('${IMG(r.p.images[0], 120)}')"></span><span><strong>${esc(r.p.name)}</strong><small class="muted">${money(r.p.price)}</small></span>` : `<span class="pick-img"></span><span><strong>${esc(r.product)}</strong><small class="err">Product not found in the store</small></span>`}</span>
        <label class="adm-pct"><input type="number" min="0" max="90" step="1" value="${r.discountPercent}" data-pct aria-label="Discount percent">%</label>
        <span class="mono adm-price">${r.p ? money(r.p.price * (1 - r.discountPercent / 100)) : '—'}</span>
        <label class="toggle"><input type="checkbox" data-act ${r.active ? 'checked' : ''} aria-label="Active"><span></span></label>
        <span class="adm-btns"><button type="button" data-up aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-down aria-label="Move down" ${i === rows.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-del aria-label="Remove">✕</button></span>
      </li>`).join('') : '<li class="pad-s muted">No surplus caps yet. Add one below.</li>';
    box.querySelectorAll('.adm-row').forEach(li => {
      const i = +li.dataset.i;
      li.querySelector('[data-pct]').oninput = e => { rows[i].discountPercent = Math.max(0, Math.min(90, +e.target.value || 0)); li.querySelector('.adm-price').textContent = rows[i].p ? money(rows[i].p.price * (1 - rows[i].discountPercent / 100)) : '—'; setDirty(true); };
      li.querySelector('[data-act]').onchange = e => { rows[i].active = e.target.checked; setDirty(true); };
      li.querySelector('[data-up]').onclick = () => move(i, i - 1);
      li.querySelector('[data-down]').onclick = () => move(i, i + 1);
      li.querySelector('[data-del]').onclick = () => { rows.splice(i, 1); setDirty(true); renderRows(); renderPicker(); };
      li.addEventListener('dragstart', e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); li.classList.add('dragging'); });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      li.addEventListener('dragover', e => { e.preventDefault(); li.classList.add('over'); });
      li.addEventListener('dragleave', () => li.classList.remove('over'));
      li.addEventListener('drop', e => { e.preventDefault(); li.classList.remove('over'); move(+e.dataTransfer.getData('text/plain'), i); });
    });
  }
  function move(from, to) {
    if (to < 0 || to >= rows.length || from === to) return;
    const [r] = rows.splice(from, 1); rows.splice(to, 0, r); setDirty(true); renderRows();
  }

  function renderPicker() {
    const q = $('[data-pq]').value.trim().toLowerCase().split(/\s+/).filter(Boolean), cat = $('[data-pcat]').value;
    const used = new Set(rows.map(r => r.p?.id).filter(Boolean));
    const res = $('[data-pres]');
    if (!q.length && !cat) { res.innerHTML = ''; return; }
    const hits = items.filter(p => !used.has(p.id) && (!cat || p.cats?.includes(cat)) && q.every(t => `${p.name} ${p.sku}`.toLowerCase().includes(t))).slice(0, 12);
    res.innerHTML = hits.length ? hits.map(p => `<button type="button" class="adm-hit" data-add="${esc(p.id)}"><span class="pick-img" style="background-image:url('${IMG(p.images[0], 120)}')"></span><span class="clamp2">${esc(p.name)}</span><span class="mono">${money(p.price)}</span><span class="adm-plus">+ Add</span></button>`).join('') : '<p class="note">No matching products.</p>';
    res.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
      const p = items.find(x => x.id === b.dataset.add);
      rows.push({ id: null, product: p.id, discountPercent: 15, active: true, p }); setDirty(true); renderRows(); renderPicker();
    });
  }
  let t; $('[data-pq]').oninput = () => { clearTimeout(t); t = setTimeout(renderPicker, 120); };
  $('[data-pcat]').onchange = renderPicker;

  $('[data-save]').onclick = async e => {
    e.target.disabled = true; e.target.textContent = 'Saving…';
    try {
      const out = await api('surplus', { items: rows.map(r => ({ id: r.id, product: r.p?.id || r.product, discountPercent: r.discountPercent, active: r.active })) });
      rows = out.items.map(s => ({ ...s, p: find(s.product) })); setDirty(false); renderRows(); renderPicker(); toast('Surplus list saved');
    } catch (err) { toast('Couldn’t save: ' + err.message); e.target.disabled = false; }
    e.target.textContent = 'Save changes';
  };
  renderRows();
}
