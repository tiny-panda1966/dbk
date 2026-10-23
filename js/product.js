import { mountChrome, esc, toast, openCart, busy } from './ui.js';
import { getMember, getPrefs, savePrefs, getSurplus, login, isHidden, listCategories, builderCategoryId } from './wix.js';
import { listProducts, getProduct, addToCart, linkLines, getEmbroideryProduct, getThreads, saveDesign, getMode, IMG, IMG_FIT, money, FEATURED, findFeatured } from './wix.js';
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
const p0 = slug ? await getProduct(slug) : null;
const p = p0 && !isHidden(p0) ? p0 : null;
if (!p) { root.innerHTML = '<div class="pad"><h1 class="display">Product not found</h1><p><a href="index.html#prints" class="btn btn-dark" style="white-space:nowrap">See all products</a></p></div>'; throw new Error('not found'); }

document.title = `${p.name} – DBK Welding Caps`;
const choiceMods = p.modifiers.filter(m => m.type !== 'FREE_TEXT')
  .sort((a, b) => ((ORDER.indexOf(a.name) + 1 || 99) - (ORDER.indexOf(b.name) + 1 || 99)));
choiceMods.forEach(m => { if (m.name === 'Cap Size') m.choices.sort((a, b) => sizeVal(a.name) - sizeVal(b.name)); if (m.name === 'Bill Size') m.choices.sort((a, b) => (/custom/i.test(a.name) - /custom/i.test(b.name)) || (/standard/i.test(b.name) - /standard/i.test(a.name))); });
const textMods = p.modifiers.filter(m => m.type === 'FREE_TEXT');
const [allItems, cats, capCatId] = await Promise.all([listProducts(), listCategories(), builderCategoryId()]);
p.cats = allItems.find(x => x.id === p.id)?.cats || p.cats || [];
const isCap = !capCatId || p.cats.includes(capCatId);
const myCat = cats.find(c => p.cats.includes(c.id));
const state = { sel: {}, text: {}, qty: 1, photo: 0, tab: isCap ? '3d' : 'photos', tried: false };

const [embProduct, threads] = await Promise.all([getEmbroideryProduct().catch(() => null), getThreads()]);
const embPrice = kind => {
  if (embProduct?.[kind]) return embProduct[kind].price;
  return getMode() === 'live' ? null : CONFIG.embroidery.fallbackPrices[kind];
};
const prices = { text: embPrice('text'), logo: embPrice('logo') };

const label = m => LABEL[m.name] || m.name.replace('?', '');
const chosen = m => m.choices.find(c => c.key === state.sel[m.key]);
let builder = null;
const embCost = () => !builder || !builder.active() ? 0 : (builder.mode() === 'upload' ? prices.logo : prices.text) || 0;
const unit = () => p.price + choiceMods.reduce((a, m) => a + (chosen(m)?.add || 0), 0) + textMods.reduce((a, m) => a + (state.text[m.key]?.trim() ? m.text.add : 0), 0) + embCost();
const missing = () => choiceMods.filter(m => m.mandatory && !state.sel[m.key]);
const needsNote = () => choiceMods.some(m => /advise below/i.test(chosen(m)?.name || '')) && !textMods.some(m => state.text[m.key]?.trim());

root.innerHTML = `
  <nav class="crumbs pad-x"><a href="index.html">Home</a> / <a href="index.html${myCat ? '?cat=' + encodeURIComponent(myCat.slug) : ''}#prints">${esc(myCat?.name || 'All products')}</a> / <span>${esc(p.name)}</span></nav>
  <div class="pdp pad-x">
    <div class="pdp-media">
      ${isCap ? '<div class="tabs"><button type="button" data-tab="3d">3D builder</button><button type="button" data-tab="photos">Photos</button></div><div data-builder></div>' : ''}
      <div data-photos hidden>
        <div class="pdp-main"><img data-main alt="${esc(p.name)}"></div>
        <div class="pdp-thumbs">${p.images.map((id, i) => `<button type="button" data-ph="${i}" aria-label="Photo ${i + 1}"><img src="${IMG(id, 160)}" alt=""></button>`).join('')}</div>
      </div>
    </div>
    <div class="pdp-info">
      <div class="pdp-title">
        <span class="kicker">${isCap ? 'Build your cap' : esc(myCat?.name || 'DBK Welding Caps')}</span>
        <h1 class="display">${esc(p.name)}</h1>
        <span class="price mono" data-price></span>
        ${p.description.length ? `<div class="pdp-desc">${p.description.map(t => `<p>${esc(t)}</p>`).join('')}</div>` : ''}
      </div>
      <div data-member-box></div>
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
      ${isCap ? '<section class="step" data-emb-step></section>' : ''}
      <div data-instr></div>
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
  if ($('[data-builder]')) $('[data-builder]').hidden = state.tab !== '3d';
  $('[data-photos]').hidden = state.tab !== 'photos';
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
  $('[data-bar-sub]').textContent = `Qty ${state.qty}${builder && builder.active() ? ' · with embroidery' : ''}`;
  const miss = missing()[0];
  $$('[data-add]').forEach(b => b.textContent = miss ? `Choose ${label(miss).toLowerCase()}` : needsNote() ? 'Add details in notes' : `Add to cart · ${total}`);
  builder?.setOptions({ liner: linerMod && chosen(linerMod)?.hex, deep: billMod && /deep/i.test(chosen(billMod)?.name || '') });
}

if (isCap) builder = createBuilder({ wrap: $('[data-builder]'), step: $('[data-emb-step]'), stepNo: String(choiceMods.length + 1).padStart(2, '0'), product: p, threads, prices, onChange: () => sync() });

$$('[data-tab]').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; sync(); });
$$('[data-ph]').forEach(b => b.onclick = () => { state.photo = +b.dataset.ph; sync(); });
$$('[data-k]').forEach(b => b.onclick = () => { state.sel[b.dataset.m] = b.dataset.k; sync(); });
$$('[data-t]').forEach(t => t.oninput = () => { state.text[t.dataset.t] = t.value; sync(); });
$$('[data-qty]').forEach(b => b.onclick = () => { state.qty = Math.max(1, Math.min(99, state.qty + +b.dataset.qty)); sync(); });

// Short tag written on both the cap and its embroidery line. Makes each embroidered cap a unique cart line
// (Wix won't merge it with an identical cap) and tells Kelly which embroidery belongs to which cap.
const newTag = () => Array.from(crypto.getRandomValues(new Uint8Array(3)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('') + Date.now().toString(36).slice(-2).toUpperCase();
const tagMod = () => textMods.find(m => /custom size information|additional notes/i.test(m.name + ' ' + m.text.title)) || textMods[textMods.length - 1];

function embSpec(e, ref, tag) {
  const what = e.mode === 'text' ? `Text: "${e.text}" | Font: ${e.font}` : `Logo/image: ${e.uploadName}`;
  return [`Embroidery ref: ${tag}`, `For: ${p.name} x${state.qty}`, what, `Thread: ${e.thread}`, `Size: ${e.scale}%`, `Rotation: ${e.rot}°`, `Placement: ${e.placement || 'not set'}${e.locked ? '' : ' (not locked)'}`, ref ? `Design ref: ${ref}` : 'Design ref: none – check with customer'].join(' | ');
}

$$('[data-add]').forEach(b => b.onclick = async () => {
  state.tried = true; sync();
  const miss = missing()[0];
  if (miss) { const el = root.querySelector(`[data-step="${CSS.escape(miss.key)}"]`); window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 140, behavior: 'smooth' }); return; }
  if (needsNote()) { root.querySelector('[data-t]')?.focus(); return; }
  $('[data-add]').forEach(x => { x.disabled = true; x.textContent = 'Adding…'; });
  busy.show('Checking your cap options');
  try {
    const e = builder ? await builder.snapshot() : null;
    const capTexts = { ...state.text };
    let spec = '', ref = '', tag = '';
    if (e) {
      tag = newTag();
      busy.step(e.mode === 'upload' ? 'Uploading your logo and saving the design' : 'Saving your embroidery design and placement');
      ref = await saveDesign({ title: `${p.name} – ${e.mode === 'text' ? e.text : e.uploadName}`, embroideryRef: tag, capName: p.name, capSlug: p.slug, quantity: state.qty, mode: e.mode, text: e.text, font: e.font, thread: e.thread, size: e.scale, rotation: e.rot, placement: e.placement, locked: e.locked, uploadName: e.uploadName, logo: e.logo, preview: e.preview, status: 'New' });
      spec = embSpec(e, ref, tag);
      const tm = tagMod();
      if (tm) capTexts[tm.key] = [`Embroidery ref: ${tag}`, capTexts[tm.key]].filter(Boolean).join('\n').slice(0, tm.text.max);
      if (!(embProduct?.[e.mode === 'upload' ? 'logo' : 'text']) && textMods[0]) { const k = textMods[0].key; capTexts[k] = [capTexts[k], 'EMBROIDERY – ' + spec].filter(Boolean).join('\n').slice(0, textMods[0].text.max); }
    }
    const instr = instrForOrder();
    if (instr) { const tm = tagMod(); if (tm) capTexts[tm.key] = [capTexts[tm.key], instr.line].filter(Boolean).join('\n').slice(0, tm.text.max); }
    if (instr?.changed) savePrefs({ instructions: instr.text }).then(x => { prefs = x; renderInstr(); }).catch(() => {});
    const fit = [...(tag ? [`Embroidery ref: ${tag}`] : []), ...(instr ? [instr.line] : []), ...choiceMods.map(m => `${label(m)}: ${chosen(m)?.name || '—'}`), ...textMods.filter(m => state.text[m.key]?.trim()).map(m => `${m.name.replace(' (Please Specify)', '')}: ${state.text[m.key].trim()}`)];
    busy.step(`Adding ${p.name.replace(/ Welding Cap$/, '')} to your cart`);
    const capLine = await addToCart(p, { choices: state.sel, texts: capTexts, qty: state.qty, unit: unit() - embCost(), summary: fit });
    const choice = e && embProduct?.[e.mode === 'upload' ? 'logo' : 'text'];
    if (e && choice) {
      busy.step('Adding embroidery');
      const embLine = await addToCart(embProduct.kind === 'variant' ? { ...embProduct.product, variantId: choice.variantId } : embProduct.product, {
        choices: embProduct.kind === 'modifier' ? { [embProduct.mod.key]: choice.key } : {},
        texts: embProduct.note ? { [embProduct.note.text.key]: spec.slice(0, embProduct.note.text.max) } : {},
        qty: state.qty, unit: embCost(), summary: [spec],
      });
      linkLines(capLine, embLine);
    } else if (e && getMode() !== 'live') {
      const embLine = await addToCart({ ...p, id: p.id + '-emb', name: `Embroidery – ${e.mode === 'text' ? 'Name | Word' : 'Logo | Image'}`, live: false, images: p.images }, { qty: state.qty, unit: embCost(), summary: [spec] });
      linkLines(capLine, embLine);
    }
    await busy.done(e ? 'Cap and embroidery added' : 'Added to your cart');
    openCart();
  } catch (err) { console.error(err); busy.hide(); toast('Couldn’t add to cart. Please try again.'); }
  $$('[data-add]').forEach(x => x.disabled = false); sync();
});

// ---------- members: saved preferences + special instructions ----------
const memberBox = $('[data-member-box]'), instrBox = $('[data-instr]');
let member = null, prefs = null, surplusHit = null;
const optNames = () => Object.fromEntries(choiceMods.map(m => [m.name, chosen(m)?.name || '']).filter(([, v]) => v));
function applyPrefs(pr) {
  choiceMods.forEach(m => { const want = pr.options?.[m.name]; const ch = want && m.choices.find(c => c.name === want); if (ch) state.sel[m.key] = ch.key; });
  builder?.applyPrefs({ font: pr.font, thread: pr.thread }); sync();
}
function renderMember(msg = '') {
  if (!member) {
    memberBox.innerHTML = `<div class="member-box guest"><div class="member-copy"><strong>Bought from us before?</strong><span>Members get their size, liner and bill preferences filled in automatically.</span></div><button type="button" class="btn btn-dark" data-login>Log in</button></div>`;
    memberBox.querySelector('[data-login]').onclick = () => login(location.href).catch(e => toast(e.message));
    return;
  }
  memberBox.innerHTML = `<div class="member-box">
    <div class="member-head"><strong>Welcome back${member.name ? ', ' + esc(member.name) : ''}</strong><span class="tag">Member</span></div>
    ${msg ? `<p class="member-msg">✓ ${esc(msg)}</p>` : ''}
    ${surplusHit ? `<p class="member-msg">Member price: ${surplusHit.discountPercent}% off this cap, applied at checkout.</p>` : ''}
    <div class="member-actions">
      ${prefs ? '<button type="button" class="btn-sm" data-apply>Apply my saved preferences</button>' : ''}
      <button type="button" class="btn-sm dark" data-save-prefs>Save these as my preferences</button>
      ${msg ? '<button type="button" class="link-btn" data-clear>Clear</button>' : ''}
    </div></div>`;
  memberBox.querySelector('[data-apply]')?.addEventListener('click', () => { applyPrefs(prefs); renderMember('Loaded your saved preferences'); });
  memberBox.querySelector('[data-clear]')?.addEventListener('click', () => { state.sel = {}; sync(); renderMember(); });
  memberBox.querySelector('[data-save-prefs]').onclick = async e => {
    e.target.disabled = true;
    try { prefs = await savePrefs({ options: optNames(), ...(builder?.prefs() || {}), instructions: currentInstr() }); toast('Saved to your member profile'); renderMember('Preferences saved'); renderInstr(); }
    catch (err) { toast('Couldn’t save your preferences. Please try again.'); e.target.disabled = false; }
  };
}
const currentInstr = () => (state.instr ?? prefs?.instructions ?? '').trim();
const isConfirmed = t => !!(prefs && prefs.instructionsStatus === 'confirmed' && prefs.instructionsConfirmed && t === (prefs.instructions || '').trim());
function instrForOrder() {
  if (!member) return null;
  const t = currentInstr(); if (!t) return null;
  const ok = isConfirmed(t);
  return { text: t, changed: t !== (prefs?.instructions || '').trim(), line: ok ? `Instructions (confirmed by DBK): ${prefs.instructionsConfirmed}` : `Instructions (awaiting DBK): ${t}` };
}
function renderConfirm() {
  const box = instrBox.querySelector('[data-confirm]'); if (!box) return;
  const t = currentInstr(), ok = isConfirmed(t);
  box.hidden = !t; box.className = 'confirm' + (ok ? ' ok' : '');
  box.innerHTML = `<div class="confirm-head"><span class="kicker">Confirmed by DBK</span><span class="tag${ok ? ' ok' : ''}">${ok ? 'Confirmed' : 'Awaiting DBK'}</span></div><p>${ok ? esc(prefs.instructionsConfirmed) : 'Kelly will read your instructions and confirm the details with you before your cap is made.'}</p>`;
}
function renderInstr() {
  if (!member) { instrBox.innerHTML = ''; return; }
  instrBox.innerHTML = `<label class="field"><span><strong>Special instructions</strong> <span class="muted">· in your own words, saved to your profile</span></span>
    <textarea rows="2" maxlength="500" data-instr-t placeholder="e.g. Can you move the seam to the back or other side please"></textarea></label><div data-confirm></div>`;
  const ta = instrBox.querySelector('[data-instr-t]'); ta.value = currentInstr();
  ta.oninput = () => { state.instr = ta.value; renderConfirm(); };
  renderConfirm();
}
if (isCap) renderMember();
if (isCap) (async () => {
  member = await getMember().catch(() => null);
  if (!member) return renderMember();
  prefs = await getPrefs();
  try { surplusHit = (await getSurplus()).find(x => x.p.id === p.id) || null; } catch (e) {}
  let msg = '';
  if (prefs?.autoApply) { applyPrefs(prefs); msg = 'Your saved preferences were applied'; }
  renderMember(msg); renderInstr();
})();
sync();
