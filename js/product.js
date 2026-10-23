import { mountChrome, esc, toast, openCart } from './ui.js';
import { listProducts, getProduct, addToCart, IMG, IMG_FIT, money, FEATURED, findFeatured } from './wix.js';

await mountChrome();
const root = document.querySelector('[data-product]');

// Kelly's option order; anything else in Wix follows in its own order.
const ORDER = ['Cap Size', 'Cap Liner Color', 'Liner Type', 'Cap Length', 'Batting in Bill?', 'Bill Size'];
const LABEL = { 'Cap Liner Color': 'Liner colour', 'Batting in Bill?': 'Batting in bill' };
const sizeVal = s => { if (/custom/i.test(s)) return 99; const m = /(\d+)(?:\s+(\d+)\/(\d+))?/.exec(s); return m ? +m[1] + (m[2] ? m[2] / m[3] : 0) : 50; };

let slug = new URLSearchParams(location.search).get('slug');
if (!slug) { const items = await listProducts(); slug = (findFeatured(items, FEATURED[0]) || items[0])?.slug; }
const p = slug ? await getProduct(slug) : null;
if (!p) { root.innerHTML = '<div class="pad"><h1 class="display">Cap not found</h1><p><a href="index.html#prints" class="btn btn-dark">See all caps</a></p></div>'; throw new Error('not found'); }

document.title = `${p.name} – DBK Welding Caps`;
const choiceMods = p.modifiers.filter(m => m.type !== 'FREE_TEXT')
  .sort((a, b) => ((ORDER.indexOf(a.name) + 1 || 99) - (ORDER.indexOf(b.name) + 1 || 99)));
choiceMods.forEach(m => { if (m.name === 'Cap Size') m.choices.sort((a, b) => sizeVal(a.name) - sizeVal(b.name)); if (m.name === 'Bill Size') m.choices.sort((a, b) => (/custom/i.test(a.name) - /custom/i.test(b.name)) || (/standard/i.test(b.name) - /standard/i.test(a.name))); });
const textMods = p.modifiers.filter(m => m.type === 'FREE_TEXT');
const state = { sel: {}, text: {}, qty: 1, photo: 0, tried: false };

const label = m => LABEL[m.name] || m.name.replace('?', '');
const chosen = m => m.choices.find(c => c.key === state.sel[m.key]);
const unit = () => p.price + choiceMods.reduce((a, m) => a + (chosen(m)?.add || 0), 0) + textMods.reduce((a, m) => a + (state.text[m.key]?.trim() ? m.text.add : 0), 0);
const missing = () => choiceMods.filter(m => m.mandatory && !state.sel[m.key]);
const needsNote = () => choiceMods.some(m => /advise below/i.test(chosen(m)?.name || '')) && !textMods.some(m => state.text[m.key]?.trim());

root.innerHTML = `
  <nav class="crumbs pad-x"><a href="index.html">Home</a> / <a href="index.html#prints">Welding caps</a> / <span>${esc(p.name)}</span></nav>
  <div class="pdp pad-x">
    <div class="pdp-media">
      <div class="pdp-main"><img data-main alt="${esc(p.name)}"></div>
      <div class="pdp-thumbs">${p.images.map((id, i) => `<button type="button" data-ph="${i}" aria-label="Photo ${i + 1}"><img src="${IMG(id, 160)}" alt=""></button>`).join('')}</div>
    </div>
    <div class="pdp-info">
      <div class="pdp-title">
        <span class="kicker">${esc(p.sku || 'Welding cap')}</span>
        <h1 class="display">${esc(p.name)}</h1>
        <span class="price mono" data-price></span>
        ${p.description.length ? `<div class="pdp-desc">${p.description.map(t => `<p>${esc(t)}</p>`).join('')}</div>` : ''}
      </div>
      ${choiceMods.map((m, i) => `
      <section class="step" data-step="${esc(m.key)}">
        <div class="step-head"><span class="step-n">${String(i + 1).padStart(2, '0')}</span><h2>${esc(label(m))}</h2><span class="step-val" data-val></span></div>
        <div class="${m.type === 'SWATCH_CHOICES' ? 'swatches' : 'choices'}">
          ${m.choices.map(c => m.type === 'SWATCH_CHOICES'
            ? `<button type="button" class="swatch" data-m="${esc(m.key)}" data-k="${esc(c.key)}" title="${esc(c.name)}"><span style="background:${esc(c.hex || '#ccc')}"></span><small>${esc(c.name.replace(' Liner', ''))}</small></button>`
            : `<button type="button" class="choice" data-m="${esc(m.key)}" data-k="${esc(c.key)}">${esc(c.name.replace(' (Advise Below)', ' ✎'))}${c.add ? ` <small>+${money(c.add)}</small>` : ''}</button>`).join('')}
        </div>
        <p class="step-err" hidden>Choose a ${esc(label(m).toLowerCase())}</p>
      </section>`).join('')}
      ${textMods.map(m => `
      <label class="field"><span><strong>${esc(m.name.replace(' (Please Specify)', ''))}</strong> <span class="muted">· optional</span></span>
        <textarea rows="2" maxlength="${m.text.max}" data-t="${esc(m.key)}" placeholder="${esc(m.text.title)}"></textarea></label>`).join('')}
      <p class="step-err" data-note-err hidden>You chose a custom option. Tell Kelly the details in the notes above.</p>
      <div class="buy">
        <div class="qty"><button type="button" data-qty="-1" aria-label="Decrease quantity">−</button><span data-qty-val>1</span><button type="button" data-qty="1" aria-label="Increase quantity">+</button></div>
        <button type="button" class="btn btn-yellow grow" data-add>Add to cart</button>
      </div>
    </div>
  </div>
  <div class="mobile-bar"><div><span class="mono" data-bar-price></span><small data-bar-sub></small></div><button type="button" class="btn btn-yellow grow" data-add>Add to cart</button></div>`;

const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
function sync() {
  $('[data-main]').src = IMG_FIT(p.images[state.photo], 1000);
  $$('[data-ph]').forEach(b => b.classList.toggle('on', +b.dataset.ph === state.photo));
  choiceMods.forEach(m => {
    const sec = root.querySelector(`[data-step="${CSS.escape(m.key)}"]`);
    sec.querySelectorAll('[data-k]').forEach(b => b.classList.toggle('on', b.dataset.k === state.sel[m.key]));
    sec.querySelector('[data-val]').textContent = chosen(m)?.name.replace(' (Advise Below)', '') || '';
    sec.querySelector('.step-err').hidden = !(state.tried && m.mandatory && !state.sel[m.key]);
  });
  $('[data-note-err]').hidden = !(state.tried && needsNote());
  const total = money(unit() * state.qty);
  $('[data-price]').textContent = money(unit());
  $('[data-qty-val]').textContent = state.qty;
  $('[data-bar-price]').textContent = total;
  $('[data-bar-sub]').textContent = `Qty ${state.qty}`;
  const miss = missing()[0];
  $$('[data-add]').forEach(b => b.textContent = miss ? `Choose ${label(miss).toLowerCase()}` : needsNote() ? 'Add details in notes' : `Add to cart · ${total}`);
}
$$('[data-ph]').forEach(b => b.onclick = () => { state.photo = +b.dataset.ph; sync(); });
$$('[data-k]').forEach(b => b.onclick = () => { state.sel[b.dataset.m] = b.dataset.k; sync(); });
$$('[data-t]').forEach(t => t.oninput = () => { state.text[t.dataset.t] = t.value; sync(); });
$$('[data-qty]').forEach(b => b.onclick = () => { state.qty = Math.max(1, Math.min(99, state.qty + +b.dataset.qty)); sync(); });
$$('[data-add]').forEach(b => b.onclick = async () => {
  state.tried = true; sync();
  const miss = missing()[0];
  if (miss) { const el = root.querySelector(`[data-step="${CSS.escape(miss.key)}"]`); window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 140, behavior: 'smooth' }); return; }
  if (needsNote()) { root.querySelector('[data-t]')?.focus(); return; }
  $$('[data-add]').forEach(x => { x.disabled = true; x.textContent = 'Adding…'; });
  try {
    await addToCart(p, {
      choices: state.sel, texts: state.text, qty: state.qty, unit: unit(),
      summary: [...choiceMods.map(m => `${label(m)}: ${chosen(m)?.name || '—'}`), ...textMods.filter(m => state.text[m.key]?.trim()).map(m => `${m.name.replace(' (Please Specify)', '')}: ${state.text[m.key].trim()}`)],
    });
    openCart();
  } catch (e) { console.error(e); toast('Couldn’t add to cart. Please try again.'); }
  $$('[data-add]').forEach(x => x.disabled = false); sync();
});
sync();
