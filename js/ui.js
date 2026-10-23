// Shared chrome: header, mega menu, cart drawer, footer, toast.
import { listProducts, listCategories, getCart, setQty, checkout, getMode, getMember, IMG, money, COLOURS, FEATURED, findFeatured } from './wix.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const productUrl = p => `product.html?slug=${encodeURIComponent(p.slug)}`;

export function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2800);
}

function headerHtml() {
  return `
  <div class="hazard"></div>
  <div class="topstrip">Handmade to order · Ships in 7–10 business days</div>
  <header class="site-header">
    <div class="hdr-row">
      <a href="index.html" class="logo"><img src="assets/dbk-logo.avif" alt="DBK Welding Caps"></a>
      <div class="hdr-actions">
        <button type="button" class="search-btn" data-open-search aria-label="Search products"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Search</span></button>
        <a href="account.html" class="acct-btn" data-acct><span class="acct-ini" data-acct-ini>★</span><span class="acct-txt"><small data-acct-kicker>Members</small><strong data-acct-label>Join / Log in</strong></span></a>
        <button class="cart-btn" type="button" data-open-cart>Cart · <span data-cart-count>0</span></button>
      </div>
    </div>
    <nav class="main-nav">
      <a href="index.html#prints" data-mega-trigger>Welding caps <span aria-hidden="true">▾</span></a>
      <a href="product.html">Build your cap</a>
      <span class="nav-cats" data-nav-cats></span>
    </nav>
    <div class="mega" hidden>
      <div class="hazard thin"></div>
      <div class="mega-inner">
        <div class="mega-col">
          <span class="kicker">Shop by colour</span>
          <div class="mega-colours">${Object.entries(COLOURS).slice(0, 12).map(([k, h]) => `<a href="index.html?cat=welding-caps&colour=${k}#prints" data-cap-link data-colour="${k}"><span class="dot" style="background:${h}"></span>${k}</a>`).join('')}</div>
          <a href="index.html?cat=welding-caps#prints" class="mega-all" data-cap-link>All welding caps</a>
        </div>
        <div class="mega-col wide">
          <span class="kicker">Popular prints</span>
          <div class="mega-picks" data-mega-picks></div>
          <a href="product.html" class="mega-build"><span><strong>Build your cap</strong><small>Size, liner, bill and options in one place</small></span><span aria-hidden="true">→</span></a>
        </div>
      </div>
    </div>
  </header>`;
}

function searchHtml() {
  return `<div class="search-scrim" data-close-search hidden></div>
  <div class="search-pop" role="dialog" aria-label="Search products" hidden>
    <form class="search-form" data-search-form><input type="search" data-q placeholder="Search caps, fabrics, designs…" autocomplete="off" aria-label="Search products"><button type="button" class="link-btn" data-close-search>Close</button></form>
    <div class="search-results" data-results></div>
  </div>`;
}

function footerHtml() {
  return `<footer class="site-footer"><div><img src="assets/dbk-logo.avif" alt="" class="foot-logo"><p>Handmade welding caps by DBK – Welding Caps.</p></div>
  <div class="foot-meta"><a href="mailto:dbkweldingcaps@outlook.com">dbkweldingcaps@outlook.com</a><span>Text: 979 922 5053</span><span>© ${new Date().getFullYear()} DBK – Welding Caps</span></div></footer>`;
}

function drawerHtml() {
  return `<div class="drawer-scrim" data-close-cart hidden></div>
  <aside class="drawer" aria-label="Cart" hidden>
    <div class="drawer-head"><h2>Your cart</h2><button type="button" data-close-cart class="link-btn">Close</button></div>
    <div class="drawer-body" data-cart-lines></div>
    <div class="drawer-foot">
      <div class="drawer-total"><span>Subtotal</span><span data-cart-total>$0.00</span></div>
      <p class="drawer-note" data-cart-note hidden></p>
      <button type="button" class="btn btn-yellow btn-block" data-checkout>Checkout</button>
    </div>
  </aside>`;
}

async function renderCart() {
  const lines = await getCart();
  const count = lines.reduce((a, l) => a + l.qty, 0);
  document.querySelectorAll('[data-cart-count]').forEach(e => e.textContent = count);
  const box = document.querySelector('[data-cart-lines]'); if (!box) return;
  const ordered = [];
  lines.filter(l => !l.parent).forEach(l => { ordered.push(l); lines.filter(k => k.parent === l.id).forEach(k => ordered.push(k)); });
  box.innerHTML = lines.length ? ordered.map(l => l.parent ? `
    <div class="cart-line cart-child">
      <div class="cart-info">
        <div class="cart-name"><span>+ ${esc(l.name)}</span><span class="mono">${money(l.unit * l.qty)}</span></div>
        ${l.lines.length ? `<div class="cart-desc">${l.lines.map(esc).join('<br>')}</div>` : ''}
        <div class="qty small plain"><span class="muted">Qty ${l.qty} · follows the cap</span><button type="button" class="link-btn" data-q="${esc(l.id)}" data-d="remove">Remove embroidery</button></div>
      </div>
    </div>` : `
    <div class="cart-line">
      <div class="cart-thumb" style="background-image:url('${IMG(l.img, 200)}')"></div>
      <div class="cart-info">
        <div class="cart-name"><span>${esc(l.name)}</span><span class="mono">${money(l.unit * l.qty)}</span></div>
        ${l.lines.length ? `<div class="cart-desc">${l.lines.map(esc).join('<br>')}</div>` : ''}
        <div class="qty small"><button type="button" data-q="${esc(l.id)}" data-d="-1" aria-label="Decrease">−</button><span>${l.qty}</span><button type="button" data-q="${esc(l.id)}" data-d="1" aria-label="Increase">+</button>
        <button type="button" class="link-btn" data-q="${esc(l.id)}" data-d="remove">Remove</button></div>
      </div>
    </div>`).join('') : '<p class="empty">Your cart is empty.</p>';
  box.querySelectorAll('[data-q]').forEach(b => b.onclick = async () => {
    const l = lines.find(x => x.id === b.dataset.q); if (!l) return;
    b.disabled = true;
    try { await setQty(l.id, b.dataset.d === 'remove' ? 0 : l.qty + Number(b.dataset.d)); } catch (e) { toast('Couldn’t update the cart. Please try again.'); }
  });
  document.querySelector('[data-cart-total]').textContent = money(lines.reduce((a, l) => a + l.unit * l.qty, 0));
  const note = document.querySelector('[data-cart-note]');
  const offline = getMode() === 'fallback';
  note.hidden = !offline; note.textContent = offline ? 'Preview mode: checkout opens once the store is connected to Wix.' : '';
  document.querySelector('[data-checkout]').disabled = !lines.length;
}

export function openCart() {
  document.querySelector('.drawer').hidden = false; document.querySelector('.drawer-scrim').hidden = false;
  document.body.classList.add('no-scroll'); renderCart();
}
function closeCart() { document.querySelector('.drawer').hidden = true; document.querySelector('.drawer-scrim').hidden = true; document.body.classList.remove('no-scroll'); }

export async function mountChrome() {
  document.querySelector('[data-header]').innerHTML = headerHtml();
  document.querySelector('[data-footer]').innerHTML = footerHtml();
  document.body.insertAdjacentHTML('beforeend', drawerHtml() + searchHtml());
  // search overlay
  const sPop = document.querySelector('.search-pop'), sScrim = document.querySelector('.search-scrim'), sQ = sPop.querySelector('[data-q]'), sRes = sPop.querySelector('[data-results]');
  const openSearch = () => { sPop.hidden = sScrim.hidden = false; sQ.focus(); runSearch(); };
  const closeSearch = () => { sPop.hidden = sScrim.hidden = true; };
  async function runSearch() {
    const terms = sQ.value.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) { sRes.innerHTML = '<p class="note">Type a print, colour or product name.</p>'; return; }
    const items = await listProducts();
    const hits = items.filter(p => terms.every(t => `${p.name} ${p.sku} ${p.colour}`.toLowerCase().includes(t)));
    sRes.innerHTML = hits.length ? hits.slice(0, 8).map(p => `<a href="${productUrl(p)}" class="search-hit"><span class="pick-img" style="background-image:url('${IMG(p.images[0], 120)}')"></span><span class="clamp2">${esc(p.name)}</span><span class="mono">${money(p.price)}</span></a>`).join('')
      + `<a class="search-all" href="index.html?q=${encodeURIComponent(sQ.value.trim())}#prints">See all ${hits.length} result${hits.length === 1 ? '' : 's'} →</a>`
      : '<p class="note">No products found. Try another word.</p>';
  }
  let st; sQ.oninput = () => { clearTimeout(st); st = setTimeout(runSearch, 150); };
  sPop.querySelector('[data-search-form]').onsubmit = e => { e.preventDefault(); location.href = `index.html?q=${encodeURIComponent(sQ.value.trim())}#prints`; };
  document.querySelectorAll('[data-open-search]').forEach(b => b.onclick = openSearch);
  document.querySelectorAll('[data-close-search]').forEach(b => b.onclick = closeSearch);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSearch(); if (e.key === '/' && !/input|textarea/i.test(document.activeElement?.tagName || '')) { e.preventDefault(); openSearch(); } });
  document.querySelectorAll('[data-open-cart]').forEach(b => b.onclick = openCart);
  document.querySelectorAll('[data-close-cart]').forEach(b => b.onclick = closeCart);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCart(); });
  document.querySelector('[data-checkout]').onclick = async e => {
    e.target.disabled = true; e.target.textContent = 'Opening checkout…';
    try { await checkout(); } catch (err) { toast(err.message || 'Checkout failed. Please try again.'); e.target.disabled = false; e.target.textContent = 'Checkout'; }
  };
  window.addEventListener('dbk:cart', renderCart);

  // mega menu (hover on desktop only)
  const hdr = document.querySelector('.site-header'), mega = hdr.querySelector('.mega'), trig = hdr.querySelector('[data-mega-trigger]');
  const canHover = matchMedia('(hover: hover) and (min-width: 900px)');
  trig.addEventListener('mouseenter', () => { if (canHover.matches) mega.hidden = false; });
  hdr.addEventListener('mouseleave', () => { mega.hidden = true; });
  hdr.querySelectorAll('.main-nav a:not([data-mega-trigger])').forEach(a => a.addEventListener('mouseenter', () => mega.hidden = true));

  listCategories().then(cats => {
    const capCat = cats.find(c => /weld/i.test(c.name));
    if (capCat) hdr.querySelectorAll('[data-cap-link]').forEach(a => a.href = `index.html?cat=${capCat.slug}${a.dataset.colour ? '&colour=' + a.dataset.colour : ''}#prints`);
    hdr.querySelector('[data-nav-cats]').innerHTML = cats.filter(c => c !== capCat).map(c => `<a href="index.html?cat=${encodeURIComponent(c.slug)}#prints">${esc(c.name)}</a>`).join('');
    hdr.querySelectorAll('[data-nav-cats] a').forEach(a => a.addEventListener('mouseenter', () => mega.hidden = true));
    if (capCat) trig.href = `index.html?cat=${capCat.slug}#prints`;
  }).catch(() => {});
  listProducts().then(items => {
    const picks = FEATURED.map(f => findFeatured(items, f)).filter(Boolean);
    (picks.length ? picks : items.slice(0, 4)).forEach(p => hdr.querySelector('[data-mega-picks]').insertAdjacentHTML('beforeend',
      `<a href="${productUrl(p)}"><span class="pick-img" style="background-image:url('${IMG(p.images[0], 300)}')"></span><span class="clamp2">${esc(p.name.replace(' Welding Cap', ''))}</span><span class="mono">${money(p.price)}</span></a>`));
  }).catch(() => {});
  renderCart();
  getMember().then(m => {
    if (!m) return;
    const a = document.querySelector('[data-acct]'); a.classList.add('member');
    document.querySelector('[data-acct-ini]').textContent = (m.name || m.email || '?')[0].toUpperCase();
    document.querySelector('[data-acct-kicker]').textContent = 'Member';
    document.querySelector('[data-acct-label]').textContent = m.name ? 'Hi, ' + m.name : 'My account';
  }).catch(() => {});
}

// Scroll-in reveal (respects reduced motion)
export function reveal(root = document) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  const els = [...root.querySelectorAll('[data-reveal]:not(.revealed)')];
  const io = new IntersectionObserver(entries => {
    let i = 0;
    entries.filter(e => e.isIntersecting).forEach(e => { e.target.style.transitionDelay = Math.min(i++ * 60, 480) + 'ms'; e.target.classList.add('revealed'); io.unobserve(e.target); });
  }, { rootMargin: '0px 0px -6% 0px' });
  els.forEach(el => { el.classList.add('will-reveal'); io.observe(el); });
}
