// Shared chrome: header, mega menu, cart drawer, footer, toast.
import { CONFIG } from './config.js';
import { getSetting, listProducts, listCategories, getCart, setQty, checkout, getMode, getMember, IMG, money, COLOURS, FEATURED, findFeatured } from './wix.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const productUrl = p => `product.html?slug=${encodeURIComponent(p.slug)}`;

// Full-screen "working on it" overlay with step messages: busy.show(text) → busy.step(text) → busy.done(text) / busy.hide()
export const busy = (() => {
  let el, t0 = 0;
  const ensure = () => {
    if (el) return el;
    el = document.createElement('div'); el.className = 'busy'; el.hidden = true;
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="busy-card"><div class="busy-spin" aria-hidden="true"><span></span></div><strong data-busy-t></strong><ol class="busy-steps" data-busy-steps></ol><div class="busy-bar" aria-hidden="true"><span></span></div></div>';
    document.body.appendChild(el); return el;
  };
  const steps = () => ensure().querySelector('[data-busy-steps]');
  const mark = () => steps().querySelectorAll('li:not(.ok)').forEach(li => li.classList.add('ok'));
  return {
    show(text) { const e = ensure(); t0 = Date.now(); e.querySelector('[data-busy-t]').textContent = 'Please wait…'; steps().innerHTML = ''; e.classList.remove('is-done'); e.hidden = false; document.body.classList.add('no-scroll'); this.step(text); },
    step(text) { mark(); steps().insertAdjacentHTML('beforeend', `<li>${esc(text)}</li>`); },
    async done(text = 'Added to your cart') {
      const e = ensure(); mark(); e.classList.add('is-done'); e.querySelector('[data-busy-t]').textContent = text;
      await new Promise(r => setTimeout(r, Math.max(450, 900 - (Date.now() - t0)))); this.hide();
    },
    hide() { if (!el) return; el.hidden = true; document.body.classList.remove('no-scroll'); },
  };
})();

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
      <span class="nav-cats" data-nav-cats></span>
    </nav>
    <div class="mega" hidden>
      <div class="hazard thin"></div>
      <div class="mega-inner">
        <div class="mega-col">
          <span class="kicker">Shop by colour</span>
          <div class="mega-colours">${Object.entries(COLOURS).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 12).map(([k, h]) => `<a href="index.html?cat=welding-caps&colour=${k}#prints" data-cap-link data-colour="${k}"><span class="dot" style="background:${h}"></span>${k}</a>`).join('')}</div>
          <a href="index.html?cat=welding-caps#prints" class="mega-all" data-cap-link>All welding caps</a>
        </div>
        <div class="mega-col wide">
          <span class="kicker">Popular prints</span>
          <div class="mega-picks" data-mega-picks></div>
          <a href="product.html" class="mega-build"><span><strong>Customize your cap</strong><small>Size, liner, bill and options in one place</small></span><span aria-hidden="true">→</span></a>
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

const ICONS = {
  facebook: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.5 1.6-1.5h1.7V4.4c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1v2.4H7.7V14h2.7v8z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/></svg>',
};
function footerHtml() {
  const { phone, email } = CONFIG.contact || {};
  const social = Object.entries(CONFIG.social || {}).filter(([, url]) => url);
  return `<footer class="site-footer">
    <div class="foot-brand"><img src="assets/dbk-logo.avif" alt="DBK Welding Caps" class="foot-logo"><p>Handmade welding caps by DBK – Welding Caps.</p>
      ${social.length ? `<div class="foot-social">${social.map(([k, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener" aria-label="${k[0].toUpperCase() + k.slice(1)}">${ICONS[k] || k}</a>`).join('')}</div>` : ''}</div>
    <nav class="foot-links" aria-label="Footer">
      <a href="index.html#prints">Shop</a><a href="product.html">Customize your cap</a><a href="account.html">Members</a>
      <a href="faq.html">FAQs</a><a href="contact.html">Contact</a><button type="button" class="link-btn" data-open-policy>Shipping &amp; Returns</button>
    </nav>
    <div class="foot-meta"><a href="mailto:${esc(email)}">${esc(email)}</a><span>Phone / text: ${esc(phone)}</span><span>© ${new Date().getFullYear()} DBK – Welding Caps</span></div>
  </footer>`;
}
// Product page info section (personalised items). Full policy stays in the Shipping & Returns pop-up.
export function policyInfoHtml() {
  return `<details class="pdp-more"><summary>Returns, refunds &amp; exchanges</summary>
    <div class="pdp-more-body">
      <p><strong>Personalized items are final sale.</strong> Caps made to your size, or with name or logo embroidery, can’t be refunded, returned or exchanged. Please check your sizes, spelling and placement before you check out.</p>
      <p><button type="button" class="link-btn" data-open-policy>Read the full Shipping &amp; Returns policy</button></p>
    </div></details>`;
}
function policyHtml() {
  return `<div class="drawer-scrim" data-close-policy hidden></div>
  <div class="policy" role="dialog" aria-modal="true" aria-labelledby="policy-h" hidden>
    <div class="policy-head"><h2 id="policy-h">Shipping &amp; Returns</h2><button type="button" class="link-btn" data-close-policy>Close</button></div>
    <div class="policy-body">
      <h3>Shipping Policy</h3>
      <p>At DBK Welding Caps, we prioritize your satisfaction and timely delivery of our high-quality welding caps. Our shipping methods are designed to ensure that your order arrives safely and on time. We offer a variety of shipping options at competitive rates to meet your needs.</p>
      <p>For more details on our shipping process and packaging, please feel free to reach out!</p>
      <h3>Return &amp; Exchange Policy</h3>
      <p>We understand that sometimes purchases don’t meet expectations. If you’re not completely satisfied with your welding cap, our return and exchange policy is here to help. We offer a straightforward process for returns and exchanges to ensure that our customers can shop with confidence.</p>
      <p>If you have any questions, our team is ready to assist you!</p>
      <p>Once you've made the decision to return your item, we will send you a free return shipping label (for 1 or all purchased items) by email to you directly. Once the return parcel is received at our return PO Box, the item/s will be inspected before confirmation of a refund is issued.</p>
      <p>Please be mindful of the following:</p>
      <ul><li>The refund will be issued back to the original payment method used at time of original purchase &amp; may take up to 7-10 days depending on your service provider</li>
      <li>However, if you opted for in-store credit as your preferred return option, the funds will be available within 1-2 days of receiving the returned goods</li></ul>
      <h3>Postal Address</h3>
      <p>DBK Welding Caps | Attn: Kelly<br>PO Box 161, 16043 Eagle Drive, Mont Belvieu, TX 77580</p>
    </div>
    <div class="policy-foot"><a href="contact.html" class="btn btn-dark">Contact us</a></div>
  </div>`;
}
export function openPolicy() { document.querySelector('.policy').hidden = false; document.querySelector('[data-close-policy].drawer-scrim').hidden = false; document.body.classList.add('no-scroll'); document.querySelector('.policy [data-close-policy]').focus(); }
function closePolicy() { const p = document.querySelector('.policy'); if (!p || p.hidden) return; p.hidden = true; document.querySelector('[data-close-policy].drawer-scrim').hidden = true; document.body.classList.remove('no-scroll'); if (location.hash === '#shipping-returns') history.replaceState(null, '', location.pathname + location.search); }

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
  document.body.insertAdjacentHTML('beforeend', drawerHtml() + searchHtml() + policyHtml());
  // delegated so policy links added later (e.g. product page info section) also work
  document.addEventListener('click', e => { if (e.target.closest('[data-open-policy]')) { e.preventDefault(); openPolicy(); } });
  document.querySelectorAll('[data-close-policy]').forEach(b => b.onclick = closePolicy);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePolicy(); });
  if (location.hash === '#shipping-returns') openPolicy();
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
  Promise.all([listProducts(), getSetting('popularPrints').catch(() => null)]).then(([items, ids]) => {
    const chosen = Array.isArray(ids) ? ids.map(id => items.find(p => p.id === id)).filter(Boolean) : [];
    const picks = chosen.length ? chosen.slice(0, 4) : FEATURED.map(f => findFeatured(items, f)).filter(Boolean);
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
