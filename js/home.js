import { mountChrome, esc, productUrl, reveal } from './ui.js';
import { listProducts, IMG, money, COLOURS } from './wix.js';
import { CONFIG } from './config.js';

await mountChrome();

const grid = document.querySelector('[data-grid]');
const filters = document.querySelector('[data-filters]');
const more = document.querySelector('[data-more]');
const countEl = document.querySelector('[data-count]');
let all = [], colour = new URLSearchParams(location.search).get('colour') || 'All', shown = CONFIG.pageSize;

function render() {
  const list = colour === 'All' ? all : all.filter(p => p.colour === colour);
  const used = ['All', ...Object.keys(COLOURS).filter(c => all.some(p => p.colour === c))];
  filters.innerHTML = used.map(c => `<button type="button" class="chip${c === colour ? ' on' : ''}" data-c="${c}">${c !== 'All' ? `<span class="dot" style="background:${COLOURS[c]}"></span>` : ''}${c}</button>`).join('');
  filters.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
    colour = b.dataset.c; shown = CONFIG.pageSize;
    history.replaceState(null, '', colour === 'All' ? 'index.html#prints' : `index.html?colour=${colour}#prints`); render();
  });
  countEl.textContent = `${list.length} cap${list.length === 1 ? '' : 's'}`;
  grid.innerHTML = list.slice(0, shown).map(p => `
    <article class="card" data-reveal>
      <a href="${productUrl(p)}" class="card-img"><img loading="lazy" src="${IMG(p.images[0], 500)}" alt="${esc(p.name)}"></a>
      <div class="card-text"><a href="${productUrl(p)}" class="clamp2 card-name" title="${esc(p.name)}">${esc(p.name)}</a><span class="mono">${money(p.price)}</span></div>
      <a href="${productUrl(p)}" class="btn btn-outline btn-block card-btn">Build this cap</a>
    </article>`).join('');
  more.hidden = shown >= list.length;
  reveal(grid);
}
more.onclick = () => { shown += CONFIG.pageSize; render(); };

try {
  all = await listProducts();
  document.querySelectorAll('[data-total]').forEach(e => e.textContent = all.length);
  render();
} catch (e) {
  grid.innerHTML = '<p class="empty">We couldn’t load the caps right now. Please refresh the page.</p>';
}
reveal();
