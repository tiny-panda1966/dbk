import { mountChrome, esc, productUrl, reveal } from './ui.js';
import { listProducts, listCategories, builderCategoryId, IMG, money, COLOURS } from './wix.js';
import { CONFIG } from './config.js';

await mountChrome();

const grid = document.querySelector('[data-grid]');
const catsEl = document.querySelector('[data-cats]');
const filters = document.querySelector('[data-filters]');
const more = document.querySelector('[data-more]');
const countEl = document.querySelector('[data-count]');
const titleEl = document.querySelector('[data-title]');
const searchEl = document.querySelector('[data-search]');
const qs = new URLSearchParams(location.search);
let all = [], cats = [], builderCat = null;
let cat = qs.get('cat') || '', colour = qs.get('colour') || 'All', q = qs.get('q') || '', shown = CONFIG.pageSize;
searchEl.value = q;

const words = s => s.toLowerCase().split(/\s+/).filter(Boolean);
const matches = (p, terms) => { const hay = `${p.name} ${p.sku} ${p.colour}`.toLowerCase(); return terms.every(t => hay.includes(t)); };
const catObj = () => cats.find(c => c.slug === cat) || null;

function pushUrl() {
  const u = new URLSearchParams();
  u.set('cat', cat);
  if (colour !== 'All') u.set('colour', colour);
  if (q) u.set('q', q);
  history.replaceState(null, '', 'index.html' + (u.toString() ? '?' + u : '') + '#prints');
}

function render() {
  const co = catObj(), terms = words(q);
  let list = co ? all.filter(p => p.cats?.includes(co.id)) : all;
  if (terms.length) list = list.filter(p => matches(p, terms));
  const colours = Object.keys(COLOURS).filter(c => list.some(p => p.colour === c)).sort((a, b) => a.localeCompare(b));
  if (colour !== 'All' && !colours.includes(colour)) colour = 'All';
  const shownList = colour === 'All' ? list : list.filter(p => p.colour === colour);

  catsEl.innerHTML = [{ slug: 'all', name: 'All products', count: all.length }, ...cats].map(c =>
    `<button type="button" class="cat${c.slug === cat ? ' on' : ''}" data-cat="${esc(c.slug)}">${esc(c.name)} <span>${c.count}</span></button>`).join('');
  catsEl.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { cat = b.dataset.cat; colour = 'All'; shown = CONFIG.pageSize; pushUrl(); render(); });

  filters.hidden = colours.length < 2;
  filters.innerHTML = ['All', ...colours].map(c => `<button type="button" class="chip${c === colour ? ' on' : ''}" data-c="${c}">${c !== 'All' ? `<span class="dot" style="background:${COLOURS[c]}"></span>` : ''}${c === 'All' ? 'All colours' : c}</button>`).join('');
  filters.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { colour = b.dataset.c; shown = CONFIG.pageSize; pushUrl(); render(); });

  titleEl.textContent = q ? `Results for “${q}”` : co ? co.name : 'All products';
  countEl.textContent = `${shownList.length} product${shownList.length === 1 ? '' : 's'}`;
  grid.innerHTML = shownList.length ? shownList.slice(0, shown).map(p => {
    const isCap = builderCat && p.cats?.includes(builderCat);
    return `
    <article class="card" data-reveal>
      <a href="${productUrl(p)}" class="card-img"><img loading="lazy" src="${IMG(p.images[0], 500)}" alt="${esc(p.name)}"></a>
      <div class="card-text"><a href="${productUrl(p)}" class="clamp2 card-name" title="${esc(p.name)}">${esc(p.name)}</a><span class="mono">${money(p.price)}</span></div>
      <a href="${productUrl(p)}" class="btn btn-outline btn-block card-btn">${isCap ? 'Customize this cap' : 'View'}</a>
    </article>`;
  }).join('') : `<p class="empty">No products match${q ? ` “${esc(q)}”` : ''}. <button type="button" class="link-btn" data-reset>Clear search and filters</button></p>`;
  grid.querySelector('[data-reset]')?.addEventListener('click', () => { q = ''; searchEl.value = ''; cat = 'all'; colour = 'All'; pushUrl(); render(); });
  more.hidden = shown >= shownList.length;
  reveal(grid);
}
more.onclick = () => { shown += CONFIG.pageSize; render(); };
let t; searchEl.oninput = () => { clearTimeout(t); t = setTimeout(() => { q = searchEl.value.trim(); shown = CONFIG.pageSize; pushUrl(); render(); }, 180); };
searchEl.closest('form').onsubmit = e => { e.preventDefault(); q = searchEl.value.trim(); pushUrl(); render(); };

try {
  all = await listProducts();
  [cats, builderCat] = await Promise.all([listCategories(), builderCategoryId()]);
  if (!cat || (cat !== 'all' && !cats.some(c => c.slug === cat))) cat = cats.find(c => c.id === builderCat)?.slug || 'all';
  document.querySelectorAll('[data-total]').forEach(e => e.textContent = all.filter(p => p.cats?.includes(builderCat)).length || all.length);
  searchEl.placeholder = `Search ${all.length} products`;
  render();
  if (qs.get('focus') === 'search') searchEl.focus();
} catch (e) {
  console.error(e);
  grid.innerHTML = '<p class="empty">We couldn’t load the products right now. Please refresh the page.</p>';
}
reveal();
