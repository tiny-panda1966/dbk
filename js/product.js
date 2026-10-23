import { mountChrome, esc, toast, openCart } from './ui.js';
import { listProducts, getProduct, addToCart, getEmbroideryProduct, getThreads, saveDesign, getMode, IMG, IMG_FIT, money, FEATURED, findFeatured } from './wix.js';
import { createBuilder } from './builder.js';
import { CONFIG } from './config.js';

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
const state = { sel: {}, text: {}, qty: 1, photo: 0, tab: '3d', tried: false };

const [embProduct, threads] = await Promise.all([getEmbroideryProduct().catch(() => null), getThreads()]);
const embPrice = kind => {
  if (embProduct?.[kind]) return embProduct[kind].price;
  return getMode() === 'live' ? null : CONFIG.embroidery.fallbackPrices[kind];
};
const prices = { text: embPrice('text'), logo: embPrice('logo') };

const label = m => LABEL[m.name] || m.name.replace('?', '');
const chosen = m => m.choices.find(c => c.key === state.sel[m.key]);
let builder = null;
const embCost = () => !builder?.active() ? 0 : (builder.mode() === 'upload' ? prices.logo : prices.text) || 0;
const unit = () => p.price + choiceMods.reduce((a, m) => a + (chosen(m)?.add || 0), 0) + textMods.reduce((a, m) => a + (state.text[m.key]?.trim() ? m.text.add : 0), 0) + embCost();
const missing = () => choiceMods.filter(m => m.mandatory && !state.sel[m.key]);
const needsNote = () => choiceMods.some(m => /advise below/i.test(chosen(m)?.name || '')) && !textMods.some(m => state.text[m.key]?.trim());

root.innerHTML = `
  <nav class="crumbs pad-x"><a href="index.html">Home</a> / <a href="index.html#prints">Welding caps</a> / <span>${esc(p.name)}</span></nav>
  <div class="pdp pad-x">
    <div class="pdp-media">
      <div class="tabs"><button type="button" data-tab="3d">3D builder</button><button type="button" data-tab="photos">Photos</button></div>
      <div data-builder></div>
      <div data-photos hidden>
        <div class="pdp-main"><img data-main alt="${esc(p.name)}"></div>
        <div class="pdp-thumbs">${p.images.map((id, i) => `<button type="button" data-ph="${i}" aria-label="Photo ${i + 1}"><img src="${IMG(id, 160)}" alt=""></button>`).join('')}</div>
      </div>
    </div>
    <div class="pdp-info">
      <div class="pdp-title">
        <span class="kicker">Build your cap</span>
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
      <section class="step" data-emb-step></section>
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
const linerMod = choiceMods.find(m => m.type === 'SWATCH_CHOICES' && /liner/i.test(m.name));
const billMod = choiceMods.find(m => /bill size/i.test(m.name));

function sync() {
  $$('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === state.tab));
  $('[data-builder]').hidden = state.tab !== '3d'; $('[data-photos]').hidden = state.tab !== 'photos';
  if (state.tab === 'photos') $('[data-main]').src = IMG_FIT(p.images[state.photo], 1000);
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
  $('[data-bar-sub]').textContent = `Qty ${state.qty}${builder?.active() ? ' · with embroidery' : ''}`;
  const miss = missing()[0];
  $$('[data-add]').forEach(b => b.textContent = miss ? `Choose ${label(miss).toLowerCase()}` : needsNote() ? 'Add details in notes' : `Add to cart · ${total}`);
  builder?.setOptions({ liner: linerMod && chosen(linerMod)?.hex, deep: billMod && /deep/i.test(chosen(billMod)?.name || '') });
}

builder = createBuilder({ wrap: $('[data-builder]'), step: $('[data-emb-step]'), stepNo: String(choiceMods.length + 1).padStart(2, '0'), product: p, threads, prices, onChange: () => sync() });

$$('[data-tab]').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; sync(); });
$$('[data-ph]').forEach(b => b.onclick = () => { state.photo = +b.dataset.ph; sync(); });
$$('[data-k]').forEach(b => b.onclick = () => { state.sel[b.dataset.m] = b.dataset.k; sync(); });
$$('[data-t]').forEach(t => t.oninput = () => { state.text[t.dataset.t] = t.value; sync(); });
$$('[data-qty]').forEach(b => b.onclick = () => { state.qty = Math.max(1, Math.min(99, state.qty + +b.dataset.qty)); sync(); });

function embSpec(e, ref) {
  const what = e.mode === 'text' ? `Text: "${e.text}" | Font: ${e.font}` : `Logo/image: ${e.uploadName}`;
  return [`For: ${p.name} x${state.qty}`, what, `Thread: ${e.thread}`, `Size: ${e.scale}%`, `Rotation: ${e.rot}°`, `Placement: ${e.placement || 'not set'}${e.locked ? '' : ' (not locked)'}`, ref ? `Design ref: ${ref}` : 'Design ref: none – check with customer'].join(' | ');
}

$$('[data-add]').forEach(b => b.onclick = async () => {
  state.tried = true; sync();
  const miss = missing()[0];
  if (miss) { const el = root.querySelector(`[data-step="${CSS.escape(miss.key)}"]`); window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 140, behavior: 'smooth' }); return; }
  if (needsNote()) { root.querySelector('[data-t]')?.focus(); return; }
  $$('[data-add]').forEach(x => { x.disabled = true; x.textContent = 'Adding…'; });
  try {
    const e = await builder.snapshot();
    const capTexts = { ...state.text };
    let spec = '', ref = '';
    if (e) {
      ref = await saveDesign({ title: `${p.name} – ${e.mode === 'text' ? e.text : e.uploadName}`, capName: p.name, capSlug: p.slug, quantity: state.qty, mode: e.mode, text: e.text, font: e.font, thread: e.thread, size: e.scale, rotation: e.rot, placement: e.placement, locked: e.locked, uploadName: e.uploadName, logo: e.logo, preview: e.preview, status: 'New' });
      spec = embSpec(e, ref);
      if (!(embProduct?.[e.mode === 'upload' ? 'logo' : 'text']) && textMods[0]) { const k = textMods[0].key; capTexts[k] = [capTexts[k], 'EMBROIDERY – ' + spec].filter(Boolean).join('\n').slice(0, textMods[0].text.max); }
    }
    const fit = [...choiceMods.map(m => `${label(m)}: ${chosen(m)?.name || '—'}`), ...textMods.filter(m => state.text[m.key]?.trim()).map(m => `${m.name.replace(' (Please Specify)', '')}: ${state.text[m.key].trim()}`)];
    await addToCart(p, { choices: state.sel, texts: capTexts, qty: state.qty, unit: unit() - embCost(), summary: fit });
    const choice = e && embProduct?.[e.mode === 'upload' ? 'logo' : 'text'];
    if (e && choice) {
      await addToCart(embProduct.kind === 'variant' ? { ...embProduct.product, variantId: choice.variantId } : embProduct.product, {
        choices: embProduct.kind === 'modifier' ? { [embProduct.mod.key]: choice.key } : {},
        texts: embProduct.note ? { [embProduct.note.text.key]: spec.slice(0, embProduct.note.text.max) } : {},
        qty: state.qty, unit: embCost(), summary: [spec],
      });
    } else if (e && getMode() !== 'live') {
      await addToCart({ ...p, id: p.id + '-emb', name: `Embroidery – ${e.mode === 'text' ? 'Name | Word' : 'Logo | Image'}`, live: false, images: p.images }, { qty: state.qty, unit: embCost(), summary: [spec] });
    }
    openCart();
  } catch (err) { console.error(err); toast('Couldn’t add to cart. Please try again.'); }
  $$('[data-add]').forEach(x => x.disabled = false); sync();
});
sync();
