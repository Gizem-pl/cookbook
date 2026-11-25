/* app.js — all UI: navigation, views, editor, cooking mode, timers, grocery list, settings. */

import * as S from './store.js';
import { ICONS, SECTION_CHOICES, iconName, secIcon } from './icons.js';
import { parseRecipe, fixBulletWords, splitIngredient, scaleLine, mergeIngredients, findTimers, formatClock, formatDuration, suggestSections } from './parser.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const fmtDate = ts => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const norm = s => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
const lines = v => String(v || '').split('\n').map(s => s.trim()).filter(Boolean);
const viewEl = $('#view');
const overlayRoot = $('#overlay-root');

const ICON = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.5l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};

/* ---------- Toast ---------- */

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ---------- Scroll lock for overlays ---------- */

let locks = 0;
function lockScroll(d) { locks = Math.max(0, locks + d); document.body.classList.toggle('locked', locks > 0); }

/* ---------- Navigation ---------- */

const nav = { tab: 'home', stack: [{ view: 'home', params: {} }] };
const top = () => nav.stack[nav.stack.length - 1];
const BACK_LABEL = { home: 'Cookbook', search: 'Search', grocery: 'Groceries', settings: 'Settings', list: 'Back', recipe: 'Back' };

function go(view, params = {}) {
  top().scroll = window.scrollY;
  nav.stack.push({ view, params });
  render('fwd');
  window.scrollTo(0, 0);
}
function back() {
  if (nav.stack.length > 1) nav.stack.pop();
  render('back');
  window.scrollTo(0, top().scroll || 0);
}
function switchTab(tab) {
  if (tab === 'add') { openEditor({}); return; }
  if (nav.tab === tab && nav.stack.length === 1) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  nav.tab = tab;
  nav.stack = [{ view: tab, params: {} }];
  render('fade');
  window.scrollTo(0, 0);
}
/** anim: 'fwd' | 'back' | 'fade' when moving between screens; nothing when redrawing the same screen. */
function render(anim) {
  const cur = top();
  viewEl.className = '';
  viewEl.innerHTML = VIEWS[cur.view](cur.params);
  viewEl.dataset.view = cur.view;
  if (anim) { void viewEl.offsetWidth; viewEl.className = 'anim-' + anim; }
  $$('#tabbar .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === nav.tab));
  hydratePhotos(viewEl);
  AFTER[cur.view]?.(cur.params);
  updateBadge();
}
function rerender() { const y = window.scrollY; render(); window.scrollTo(0, y); }

/* ---------- Shared bits ---------- */

function topbar(right = '') {
  const prev = nav.stack[nav.stack.length - 2];
  return `<div class="topbar">
    ${prev ? `<button class="back" data-act="back">${ICON.back}<span>${BACK_LABEL[prev.view] || 'Back'}</span></button>` : '<span></span>'}
    <div class="tb-right">${right}</div>
  </div>`;
}

const secMap = () => new Map(S.getSections().map(s => [s.id, s]));
function recipeEmoji(r, map) {
  for (const id of r.sectionIds || []) { const s = map.get(id); if (s) return s.emoji; }
  return '🍽️';
}
/** A recipe with no photo shows its section's line icon in a gold circle, like the section tiles. */
function coverHTML(r, map, small = false) {
  return `<span class="cover ${small ? 'sm' : ''}"><span class="cv-ico">${secIcon(recipeEmoji(r, map))}</span></span>`;
}
function timeOf(r) { return r.totalTime || r.cookTime || r.prepTime || ''; }

function photoImg(r, thumb, cls = '') {
  const url = S.photoURLSync(r.id, thumb);
  return `<img class="${cls}" alt="" ${url ? `src="${url}"` : `data-photo="${esc(r.id)}" data-thumb="${thumb ? 1 : ''}"`}>`;
}
async function hydratePhotos(root) {
  for (const img of $$('img[data-photo]', root)) {
    const url = await S.getPhotoURL(img.dataset.photo, !!img.dataset.thumb);
    if (url) { img.src = url; img.removeAttribute('data-photo'); }
  }
}

function card(r, map) {
  const meta = [timeOf(r) && esc(timeOf(r)), r.servings && `Serves ${r.servings}`].filter(Boolean).join(' · ');
  return `<button class="rcard" data-act="recipe" data-id="${esc(r.id)}">
    <div class="rc-img">${r.hasPhoto ? photoImg(r, true) : coverHTML(r, map)}
      ${r.favorite ? `<span class="rc-badge">${ICON.star}</span>` : r.wantToTry ? `<span class="rc-badge try">${ICONS.bookmark}</span>` : ''}
    </div>
    <div class="rc-title">${esc(r.title || 'Untitled')}</div>
    ${meta ? `<div class="rc-meta">${meta}</div>` : ''}
  </button>`;
}

/** Method lines → real steps (numbered within their sub-heading) and the sub-heading each one sits under. */
function methodSteps(steps) {
  let head = '', n = 0;
  const out = [];
  for (const s of steps || []) {
    if (s.startsWith('#')) { head = s.replace(/^#+\s*/, ''); n = 0; continue; }
    out.push({ text: s, head, n: ++n, label: head ? `${head} · step ${n}` : `Step ${n}` });
  }
  return out;
}
function methodHTML(r) {
  const steps = methodSteps(r.steps);
  let k = 0;
  return r.steps.map(s => {
    if (s.startsWith('#')) return `<li class="step-h">${esc(s.replace(/^#+\s*/, ''))}</li>`;
    const st = steps[k++];
    return `<li class="step"><span class="step-n">${st.n < 10 ? '0' + st.n : st.n}</span><p>${withTimers(st.text, st.label, r.title)}</p></li>`;
  }).join('');
}

/** Step text with every cooking time turned into a tappable timer chip. */
function withTimers(text, label, title) {
  let out = '', last = 0;
  for (const t of findTimers(text)) {
    out += esc(text.slice(last, t.index));
    out += `<button class="tchip" data-act="timer" data-s="${t.seconds}" data-label="${esc(label)}" data-title="${esc(title)}">${ICONS.clock}${esc(t.text)}</button>`;
    last = t.index + t.length;
  }
  return out + esc(text.slice(last));
}

/* ---------- Per-recipe session state: servings scale + ticked ingredients ---------- */

const scales = new Map();
const checks = new Map();
const FACTORS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
const scaleOf = id => scales.get(id) || 1;
const checksOf = id => { if (!checks.has(id)) checks.set(id, new Set()); return checks.get(id); };
function stepScale(r, d) {
  if (r.servings) {
    const cur = Math.round(r.servings * scaleOf(r.id));
    scales.set(r.id, Math.max(1, Math.min(99, cur + d)) / r.servings);
  } else {
    let i = FACTORS.indexOf(scaleOf(r.id)); if (i < 0) i = 3;
    scales.set(r.id, FACTORS[Math.max(0, Math.min(FACTORS.length - 1, i + d))]);
  }
}
function fmtFactor(f) { return ({ 0.25: '¼', 0.5: '½', 0.75: '¾', 1.5: '1½' })[f] || String(f); }

function ingredientsHTML(r, actAttr = 'data-act="check-ing"') {
  const f = scaleOf(r.id), done = checksOf(r.id);
  return r.ingredients.map((line, i) => {
    if (line.startsWith('#')) return `<li class="ing-h">${esc(line.replace(/^#+\s*/, ''))}</li>`;
    const { amount, rest } = splitIngredient(line, f);
    return `<li class="ing ${done.has(i) ? 'done' : ''}" ${actAttr} data-i="${i}">
      <span class="tick" aria-hidden="true"></span>
      <span class="ing-t">${amount != null ? `<b class="amt ${f !== 1 ? 'scaled' : ''}">${esc(amount)}</b>` : ''}${withTimers(rest, 'Ingredients', r.title)}</span>
    </li>`;
  }).join('');
}

/* ---------- Views ---------- */

let listSort = 'new';
let searchQ = '';

const VIEWS = {
  home() {
    const recipes = S.getRecipes(), secs = S.getSections(), map = secMap();
    const counts = new Map();
    let unsorted = 0;
    for (const r of recipes) {
      const ids = (r.sectionIds || []).filter(id => map.has(id));
      if (!ids.length) unsorted++;
      ids.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
    }
    const fav = recipes.filter(r => r.favorite).length, tryN = recipes.filter(r => r.wantToTry).length;
    const byNew = [...recipes].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const recent = byNew.slice(0, 8);
    const st = S.getSettings();
    const nudge = recipes.length >= 5 && Date.now() - (st.lastBackup || 0) > 30 * 864e5;

    // Each section's tile shows a photo from its newest recipe that has one.
    const coverOf = new Map();
    for (const r of byNew) if (r.hasPhoto) for (const id of r.sectionIds || []) if (!coverOf.has(id)) coverOf.set(id, r);
    const tile = (id, name, emoji, n) => {
      const c = coverOf.get(id);
      return `<button class="sec-tile ${c ? 'photo' : ''}" data-act="section" data-id="${esc(id)}">
        ${c ? photoImg(c, true) : `<span class="st-ico">${secIcon(emoji)}</span>`}
        <span class="st-cap"><span class="st-name">${esc(name)}</span><span class="st-n">${plural(n, 'recipe')}</span></span>
      </button>`;
    };

    return `
    <header class="masthead">
      <h1 class="wordmark">Cookbook</h1>
      <div class="ornament" aria-hidden="true"><i></i><span>✦</span><i></i></div>
      <p class="tagline">${recipes.length ? `${plural(recipes.length, 'recipe')} · ${plural(secs.length, 'section')}` : 'Your favourite recipes, beautifully kept'}</p>
    </header>

    ${nudge ? `<button class="nudge" data-act="go-settings">${ICONS.shield}<span class="nd-t">${st.lastBackup ? 'It’s been a while since your last backup' : 'Save your first backup'}</span><span class="nd-go">›</span></button>` : ''}

    <div class="row-head first"><h2>Sections</h2><button class="link" data-act="new-section">+ New</button></div>
    <div class="sec-grid">
      ${secs.map(s => tile(s.id, s.name, s.emoji, counts.get(s.id) || 0)).join('')}
      ${unsorted ? tile('__none', 'Unsorted', '📎', unsorted) : ''}
    </div>

    ${recipes.length ? `
    <nav class="quick" aria-label="Collections">
      <button data-act="list" data-filter="fav"><span class="q-ico star">${ICON.star}</span><span class="q-n">${fav}</span><span class="q-label">Favorites</span></button>
      <button data-act="list" data-filter="try"><span class="q-ico">${ICONS.bookmark}</span><span class="q-n">${tryN}</span><span class="q-label">Want to try</span></button>
      <button data-act="list" data-filter="all"><span class="q-ico">${ICONS.book}</span><span class="q-n">${recipes.length}</span><span class="q-label">All recipes</span></button>
    </nav>` : `
    <div class="empty-hero">
      <div class="ornament" aria-hidden="true"><i></i><span>✦</span><i></i></div>
      <p class="eyebrow">Start here</p>
      <h2>Add your first recipe</h2>
      <p class="sub">Paste one from anywhere and it gets sorted into ingredients and steps for you, or write your own.</p>
      <div class="btn-row">
        <button class="btn primary" data-act="new-recipe" data-mode="paste">${ICONS.sparkle} Smart paste</button>
        <button class="btn ghost" data-act="new-recipe" data-mode="write">${ICONS.pen} Write</button>
      </div>
    </div>`}

    ${recent.length ? `
    <div class="row-head"><h2>Recently added</h2></div>
    <div class="strip">${recent.map(r => card(r, map)).join('')}</div>` : ''}
    `;
  },

  list(p) {
    const all = S.getRecipes(), map = secMap();
    let title, emoji, items, sec = null;
    if (p.filter === 'fav') { title = 'Favorites'; emoji = '★'; items = all.filter(r => r.favorite); }
    else if (p.filter === 'try') { title = 'Want to try'; emoji = '🔖'; items = all.filter(r => r.wantToTry); }
    else if (p.filter === 'all') { title = 'All recipes'; emoji = '📖'; items = all; }
    else if (p.sectionId === '__none') { title = 'Unsorted'; emoji = '📎'; items = all.filter(r => !(r.sectionIds || []).some(id => map.has(id))); }
    else {
      sec = map.get(p.sectionId);
      title = sec ? sec.name : 'Section removed'; emoji = sec ? sec.emoji : '🍽️';
      items = sec ? all.filter(r => (r.sectionIds || []).includes(sec.id)) : [];
    }
    items = [...items].sort(listSort === 'az'
      ? (a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
      : (a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const emptyText = { fav: 'Tap ★ on a recipe to keep it here.', try: 'Mark recipes as “Want to try” to collect them here.' }[p.filter] || 'Nothing here yet.';
    return `
    ${topbar(sec ? `<button class="pill-btn" data-act="edit-section" data-id="${esc(sec.id)}">Edit</button>` : '')}
    <header class="page-head">
      <div class="ph-ico ${emoji === '★' ? 'star' : ''}">${emoji === '★' ? ICON.star : emoji === '🔖' ? ICONS.bookmark : emoji === '📖' ? ICONS.book : secIcon(emoji)}</div>
      <h1>${esc(title)}</h1>
      <p class="sub">${plural(items.length, 'recipe')}</p>
    </header>
    ${items.length > 1 ? `<div class="seg small" role="radiogroup" aria-label="Sort">
      <button class="seg-b ${listSort === 'new' ? 'on' : ''}" data-act="sort" data-v="new">Newest</button>
      <button class="seg-b ${listSort === 'az' ? 'on' : ''}" data-act="sort" data-v="az">A–Z</button>
    </div>` : ''}
    ${items.length ? `<div class="r-grid">${items.map(r => card(r, map)).join('')}</div>` : `
      <div class="empty">
        <p>${esc(emptyText)}</p>
        ${sec || p.sectionId === '__none' || p.filter === 'all' ? `<button class="btn primary" data-act="new-recipe" data-mode="paste" data-section="${esc(sec?.id || '')}">Add a recipe</button>` : ''}
      </div>`}
    `;
  },

  recipe(p) {
    const r = S.getRecipe(p.id);
    if (!r) return `${topbar()}<div class="empty"><p>This recipe was deleted.</p></div>`;
    const map = secMap(), f = scaleOf(r.id);
    const chips = (r.sectionIds || []).map(id => map.get(id)).filter(Boolean)
      .map(s => `<button data-act="section" data-id="${esc(s.id)}">${esc(s.name)}</button>`).join('<i>·</i>');
    const times = [['Prep', r.prepTime], ['Cook', r.cookTime], ['Total', r.totalTime]].filter(x => x[1]);
    const servingsNow = r.servings ? Math.max(1, Math.round(r.servings * f)) : null;
    const scaler = r.ingredients.some(l => !l.startsWith('#')) ? `
      <div class="scaler" role="group" aria-label="Servings">
        <button data-act="scale" data-d="-1" aria-label="Fewer">−</button>
        <button class="scale-v ${f !== 1 ? 'changed' : ''}" data-act="scale-reset" aria-label="Reset servings">${servingsNow ? `Serves <b>${servingsNow}</b>` : `<b>×${fmtFactor(f)}</b>`}</button>
        <button data-act="scale" data-d="1" aria-label="More">+</button>
      </div>` : '';
    let source = '';
    if (r.source) {
      if (/^https?:\/\//i.test(r.source)) {
        let host = r.source; try { host = new URL(r.source).hostname.replace(/^www\./, ''); } catch {}
        source = `<a class="source" href="${esc(r.source)}" target="_blank" rel="noopener noreferrer">Original recipe · ${esc(host)} ↗</a>`;
      } else source = `<p class="source">From ${esc(r.source)}</p>`;
    }

    return `
    ${topbar(`<button class="icon-btn fav ${r.favorite ? 'on' : ''}" data-act="toggle-fav" aria-label="${r.favorite ? 'Remove from favorites' : 'Add to favorites'}">${ICON.star}</button>
      <button class="pill-btn" data-act="edit-recipe">Edit</button>`)}
    ${r.hasPhoto ? `<div class="hero">${photoImg(r, false)}</div>` : ''}
    <header class="r-head ${r.hasPhoto ? 'on-hero' : ''}">
      ${chips ? `<div class="r-secs">${chips}</div>` : ''}
      <h1 class="r-title">${esc(r.title || 'Untitled')}</h1>
      <div class="ornament" aria-hidden="true"><i></i><span>✦</span><i></i></div>
      ${times.length || r.servings ? `<div class="r-times">
        ${r.servings ? `<div><span>Serves</span><b>${r.servings}</b></div>` : ''}
        ${times.map(([k, v]) => `<div><span>${k}</span><b>${withTimers(v, k, r.title)}</b></div>`).join('')}
      </div>` : ''}
      <div class="r-flags">
        <button class="flag ${r.favorite ? 'on' : ''}" data-act="toggle-fav">${ICON.star} Favorite</button>
        <button class="flag ${r.wantToTry ? 'on' : ''}" data-act="toggle-try">${ICONS.bookmark} Want to try</button>
      </div>
    </header>

    ${methodSteps(r.steps).length ? `<button class="btn primary wide cook-btn" data-act="cook">${ICONS.chef} Start cooking</button>` : ''}

    ${r.ingredients.length ? `
    <section class="r-block reading">
      <div class="block-head"><h2>Ingredients</h2>${scaler}</div>
      <ul class="ings">${ingredientsHTML(r)}</ul>
      <button class="btn ghost wide" data-act="to-grocery">${ICONS.cart} Add to grocery list</button>
    </section>` : ''}

    ${r.steps.length ? `
    <section class="r-block reading">
      <h2>Method</h2>
      <ol class="steps">${methodHTML(r)}</ol>
    </section>` : ''}

    <section class="r-block">
      <h2>My notes</h2>
      <textarea class="notes-inline auto" data-id="${esc(r.id)}" placeholder="Less salt next time…" rows="2">${esc(r.notes || '')}</textarea>
    </section>
    ${source}
    <p class="added">Added ${fmtDate(r.createdAt || Date.now())}</p>
    `;
  },

  search() {
    return `
    <header class="page-head"><h1>Search</h1></header>
    <div class="searchbox">${ICON.search}<input id="q" type="search" placeholder="Recipe, ingredient, note…" value="${esc(searchQ)}" autocomplete="off" autocorrect="off" enterkeyhint="search" aria-label="Search recipes"></div>
    <div id="results">${searchResults(searchQ)}</div>`;
  },

  grocery() {
    const list = S.getGrocery();
    const left = list.filter(i => !i.done).length;
    const groups = new Map();
    for (const it of list) { const k = it.from || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
    return `
    <header class="page-head"><h1>Groceries</h1><p class="sub">${list.length ? `${left} to buy` : 'Your shopping list'}</p></header>
    <form class="add-row" id="g-add" autocomplete="off">
      <input id="g-input" placeholder="Add an item…" enterkeyhint="done" aria-label="Add an item">
      <button class="btn primary sm" type="submit">Add</button>
    </form>
    ${list.length ? [...groups].map(([label, items]) => `
      <section class="g-group">
        <h3>${esc(label || 'My items')}</h3>
        <ul class="g-list">${[...items].sort((a, b) => a.done - b.done).map(it => `
          <li class="g-item ${it.done ? 'done' : ''}" data-act="g-toggle" data-id="${esc(it.id)}">
            <span class="tick" aria-hidden="true"></span><span class="g-t">${esc(it.text)}</span>
            <button class="g-del" data-act="g-del" data-id="${esc(it.id)}" aria-label="Remove">${ICON.close}</button>
          </li>`).join('')}
        </ul>
      </section>`).join('') + `
      <div class="btn-row wrap">
        <button class="btn ghost sm" data-act="g-share">Share list</button>
        <button class="btn ghost sm" data-act="g-clear-done">Clear ticked</button>
        <button class="btn ghost sm danger" data-act="g-clear-all">Clear all</button>
      </div>` : `<div class="empty"><p>Open a recipe and tap <b>Add to grocery list</b>, or type items above.</p></div>`}
    `;
  },

  settings() {
    const st = S.getSettings(), secs = S.getSections(), recipes = S.getRecipes();
    const count = id => recipes.filter(r => (r.sectionIds || []).includes(id)).length;
    return `
    <header class="page-head"><h1>Settings</h1></header>

    <section class="card">
      <h2>Appearance</h2>
      <p class="hint">Auto follows your iPhone's light or dark mode.</p>
      <div class="seg" role="radiogroup" aria-label="Appearance">
        ${[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button class="seg-b ${st.theme === k ? 'on' : ''}" data-act="theme" data-v="${k}" role="radio" aria-checked="${st.theme === k}">${l}</button>`).join('')}
      </div>
    </section>

    <section class="card">
      <h2>Reading size</h2>
      <p class="hint">Text size for recipes and cooking mode.</p>
      <div class="seg" role="radiogroup" aria-label="Reading size">
        ${['s', 'm', 'l', 'xl'].map((k, i) => `<button class="seg-b ${st.textSize === k ? 'on' : ''}" data-act="text-size" data-v="${k}" style="font-size:${13 + i * 3}px" aria-label="${['Small', 'Medium', 'Large', 'Extra large'][i]}">Aa</button>`).join('')}
      </div>
      <p class="preview reading">Simmer gently for <b class="amt">20 minutes</b>, until the broth is rich and golden.</p>
    </section>

    <section class="card">
      <div class="row-head flush"><h2>Sections</h2><button class="link" data-act="new-section">+ New</button></div>
      <ul class="sec-list">
        ${secs.map((s, i) => `<li>
          <span class="sl-ico">${secIcon(s.emoji)}</span>
          <span class="sl-name">${esc(s.name)}<small>${plural(count(s.id), 'recipe')}</small></span>
          <button class="mini" data-act="sec-move" data-d="-1" data-id="${esc(s.id)}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button class="mini" data-act="sec-move" data-d="1" data-id="${esc(s.id)}" ${i === secs.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
          <button class="mini" data-act="edit-section" data-id="${esc(s.id)}">Edit</button>
        </li>`).join('')}
      </ul>
    </section>

    <section class="card">
      <h2>Backup</h2>
      <p class="hint">Your recipes live only on this iPhone. Now and then, save a backup to <b>iCloud Drive</b> using “Save to Files”, so nothing is lost if you change phones.</p>
      <p class="hint" id="backup-status">${st.lastBackup ? `Last backup: ${fmtDate(st.lastBackup)}` : 'No backup yet.'}</p>
      <div class="btn-row">
        <button class="btn primary" data-act="backup">Save backup</button>
        <label class="btn ghost">Restore<input type="file" id="restore-input" accept=".json,application/json" hidden></label>
      </div>
    </section>

    <section class="card">
      <h2>Storage</h2>
      <p class="hint" id="storage-info">Checking…</p>
    </section>

    <section class="card">
      <h2>Install on your iPhone</h2>
      <ol class="howto">
        <li>Open this page in <b>Safari</b>.</li>
        <li>Tap the <b>Share</b> button.</li>
        <li>Choose <b>Add to Home Screen</b>.</li>
      </ol>
      <p class="hint">From the Home Screen, Cookbook opens full-screen, works offline, and Safari keeps your recipes safe.</p>
    </section>
    <p class="added">Cookbook · version 2</p>
    `;
  }
};

const AFTER = {
  recipe() {
    $$('textarea.auto', viewEl).forEach(autoGrow);
    const hero = $('.hero', viewEl), bar = $('.topbar', viewEl);
    if (!hero || !bar) return;
    bar.classList.add('over');
    const img = $('img', hero);
    let ticking = false;
    const update = () => {
      ticking = false;
      if (!hero.isConnected) { removeEventListener('scroll', onScroll); return; }
      const y = window.scrollY, h = hero.offsetHeight;
      bar.classList.toggle('solid', y > h - 110);
      if (y < h) img.style.transform = `translate3d(0, ${y * 0.35}px, 0) scale(${1 + Math.max(0, -y) / 600})`;
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    addEventListener('scroll', onScroll, { passive: true });
    update();
  },
  search() {
    const q = $('#q');
    q.addEventListener('input', () => {
      searchQ = q.value;
      $('#results').innerHTML = searchResults(searchQ);
      hydratePhotos($('#results'));
    });
    if (!searchQ) setTimeout(() => q.focus(), 60);
  },
  async settings() {
    const el = $('#storage-info');
    const recipes = S.getRecipes();
    const photos = recipes.filter(r => r.hasPhoto).length;
    const est = await S.storageEstimate();
    const persisted = await S.isPersisted();
    const mb = b => b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB'
      : b < 1073741824 ? (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB'
      : (b / 1073741824).toFixed(1).replace(/\.0$/, '') + ' GB';
    if (!el.isConnected) return;
    el.innerHTML = `${plural(recipes.length, 'recipe')} (${Math.max(1, Math.round(S.textBytes() / 1024))} KB of text) · ${plural(photos, 'photo')}<br>
      ${est?.usage != null ? `Using ${mb(est.usage)}${est.quota ? ` of ${mb(est.quota)} available` : ''}.` : ''}
      Photos are shrunk to about 150 KB each.<br>
      ${persisted ? '✓ Protected from automatic clearing.' : 'Add to Home Screen to keep it protected from automatic clearing.'}`;
  }
};

function searchResults(q) {
  const recipes = S.getRecipes();
  if (!recipes.length) return `<div class="empty"><p>Your recipes will be searchable here.</p></div>`;
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return `<p class="hint pad">Search by name, an ingredient (try <i>salmon</i> or <i>miso</i>), a section, or something from your notes.</p>`;
  const map = secMap();
  const hits = [];
  for (const r of recipes) {
    const title = norm(r.title), secs = norm((r.sectionIds || []).map(id => map.get(id)?.name).join(' '));
    const ings = r.ingredients.map(norm), rest = norm(r.steps.join(' ') + ' ' + (r.notes || ''));
    let score = 0, snippet = '';
    let ok = true;
    for (const t of terms) {
      let s = 0;
      if (title.includes(t)) s += 10;
      if (secs.includes(t)) s += 6;
      const ii = ings.findIndex(l => l.includes(t));
      if (ii >= 0) { s += 4; if (!snippet && !title.includes(t)) snippet = r.ingredients[ii].replace(/^#\s*/, ''); }
      if (!s && rest.includes(t)) s += 1;
      if (!s) { ok = false; break; }
      score += s;
    }
    if (ok) hits.push({ r, score, snippet });
  }
  if (!hits.length) return `<div class="empty"><p>No recipes match “${esc(q.trim())}”.</p></div>`;
  hits.sort((a, b) => b.score - a.score || (a.r.title || '').localeCompare(b.r.title || ''));
  return `<p class="hint">${plural(hits.length, 'recipe')}</p><ul class="rrows">${hits.map(({ r, snippet }) => `
    <li><button class="rrow" data-act="recipe" data-id="${esc(r.id)}">
      <span class="rr-img">${r.hasPhoto ? photoImg(r, true) : coverHTML(r, map, true)}</span>
      <span class="rr-t"><b>${esc(r.title || 'Untitled')}</b>${snippet ? `<small>${esc(snippet)}</small>` : timeOf(r) ? `<small>${esc(timeOf(r))}</small>` : ''}</span>
      <span class="rr-go" aria-hidden="true">›</span>
    </button></li>`).join('')}</ul>`;
}

function updateBadge() {
  const n = S.getGrocery().filter(i => !i.done).length;
  const b = $('#grocery-badge');
  b.hidden = !n;
  b.textContent = n > 99 ? '99+' : n;
}

function autoGrow(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; }

function applyTextSize() { document.documentElement.dataset.size = S.getSettings().textSize; }

const darkMQ = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = S.getSettings().theme, dark = t === 'dark' || (t !== 'light' && darkMQ.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('meta[name="theme-color"]')?.setAttribute('content', dark ? '#131110' : '#F7F2E9');
}
darkMQ.addEventListener?.('change', applyTheme);

/* ---------- Global events ---------- */

$('#tabbar').addEventListener('click', e => {
  const b = e.target.closest('.tab');
  if (b) switchTab(b.dataset.tab);
});

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.closest('.overlay-own') && b.dataset.act !== 'timer') return;   // overlays handle their own buttons
  const act = b.dataset.act, cur = top();
  const r = cur.view === 'recipe' ? S.getRecipe(cur.params.id) : null;

  switch (act) {
    case 'back': back(); break;
    case 'go-settings': switchTab('settings'); break;
    case 'list': go('list', { filter: b.dataset.filter }); break;
    case 'section': go('list', { filter: 'section', sectionId: b.dataset.id }); break;
    case 'recipe': go('recipe', { id: b.dataset.id }); break;
    case 'sort': listSort = b.dataset.v; rerender(); break;
    case 'new-recipe': openEditor({ mode: b.dataset.mode, sectionId: b.dataset.section || cur.params.sectionId }); break;
    case 'new-section': openSectionSheet(null, rerender); break;
    case 'edit-section': {
      const sec = S.getSections().find(s => s.id === b.dataset.id);
      if (sec) openSectionSheet(sec, (res) => {
        if (res === 'deleted' && cur.view === 'list' && cur.params.sectionId === sec.id) back(); else rerender();
      });
      break;
    }
    case 'sec-move': S.moveSection(b.dataset.id, +b.dataset.d); rerender(); break;

    case 'toggle-fav': if (r) { S.patchRecipe(r.id, { favorite: !r.favorite }); toast(r.favorite ? 'Removed from favorites' : 'Added to favorites ★'); rerender(); } break;
    case 'toggle-try': if (r) { S.patchRecipe(r.id, { wantToTry: !r.wantToTry }); rerender(); } break;
    case 'edit-recipe': if (r) openEditor({ id: r.id }); break;
    case 'cook': if (r) openCook(r); break;
    case 'check-ing': if (r) {
      const set = checksOf(r.id), i = +b.dataset.i;
      set.has(i) ? set.delete(i) : set.add(i);
      b.classList.toggle('done', set.has(i));
      break;
    }
    case 'scale': if (r) { stepScale(r, +b.dataset.d); rerender(); } break;
    case 'scale-reset': if (r) { scales.delete(r.id); rerender(); } break;
    case 'to-grocery': if (r) openGrocerySheet(r); break;
    case 'timer': startTimer(+b.dataset.s, b.dataset.label, b.dataset.title); break;

    case 'g-toggle': {
      if (e.target.closest('.g-del')) break;
      const list = S.getGrocery(), it = list.find(x => x.id === b.dataset.id);
      if (it) { it.done = !it.done; S.saveGrocery(list); rerender(); }
      break;
    }
    case 'g-del': S.saveGrocery(S.getGrocery().filter(x => x.id !== b.dataset.id)); rerender(); break;
    case 'g-clear-done': S.saveGrocery(S.getGrocery().filter(x => !x.done)); rerender(); break;
    case 'g-clear-all': if (confirm('Clear the whole grocery list?')) { S.saveGrocery([]); rerender(); } break;
    case 'g-share': shareGrocery(); break;

    case 'theme': S.saveSettings({ theme: b.dataset.v }); applyTheme(); rerender(); break;
    case 'text-size': S.saveSettings({ textSize: b.dataset.v }); applyTextSize(); rerender(); break;
    case 'backup': doBackup(); break;
  }
});

document.addEventListener('submit', e => {
  if (e.target.id !== 'g-add') return;
  e.preventDefault();
  const input = $('#g-input');
  const items = input.value.split(/\s*[,;]\s*|\n/).map(s => s.trim()).filter(Boolean);
  if (!items.length) return;
  S.addGrocery(items.map(text => ({ text, from: '' })));
  render();
  $('#g-input')?.focus();
});

let notesTimer;
document.addEventListener('input', e => {
  const t = e.target;
  if (t.matches('textarea.auto')) autoGrow(t);
  if (e.inputType === 'insertFromPaste' && t.matches('.notes-inline') && /\bbullet\s/i.test(t.value)) { t.value = fixBulletWords(t.value); autoGrow(t); }
  if (t.matches('.notes-inline')) {
    clearTimeout(notesTimer);
    notesTimer = setTimeout(() => S.patchRecipe(t.dataset.id, { notes: t.value.trim() }), 400);
  }
});
document.addEventListener('focusout', e => {
  if (e.target.matches?.('.notes-inline')) { clearTimeout(notesTimer); S.patchRecipe(e.target.dataset.id, { notes: e.target.value.trim() }); }
});

document.addEventListener('change', async e => {
  if (e.target.id !== 'restore-input') return;
  const f = e.target.files?.[0]; e.target.value = '';
  if (!f) return;
  const replace = confirm('Restore this backup?\n\nOK = replace everything on this iPhone with the backup.\nCancel = choose to merge instead.');
  const merge = !replace && confirm('Merge the backup into your current cookbook (keeps what you have)?');
  if (!replace && !merge) return;
  const st = $('#backup-status'); if (st) st.textContent = 'Restoring…';
  try {
    const res = await S.restoreBackup(f, replace ? 'replace' : 'merge');
    rerender();
    toast(`Restored ${plural(res.recipes, 'recipe')}`);
  } catch (err) { if ($('#backup-status')) $('#backup-status').textContent = err.message || 'Restore failed.'; }
});

async function deliverFile(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function doBackup() {
  const st = $('#backup-status');
  if (st) st.textContent = 'Preparing backup…';
  try {
    const { blob, filename, count } = await S.createBackup();
    await deliverFile(blob, filename);
    S.saveSettings({ lastBackup: Date.now() });
    if ($('#backup-status')) $('#backup-status').textContent = `Last backup: ${fmtDate(Date.now())} · ${plural(count, 'recipe')}, ${(blob.size / 1048576).toFixed(1)} MB`;
  } catch (err) {
    if (err?.name === 'AbortError') { if (st) st.textContent = 'Backup cancelled.'; return; }
    if (st) st.textContent = 'Could not create the backup.';
  }
}

async function shareGrocery() {
  const list = S.getGrocery().filter(i => !i.done);
  if (!list.length) { toast('Nothing left to buy'); return; }
  const text = 'Groceries\n' + list.map(i => '• ' + i.text).join('\n');
  try {
    if (navigator.share) await navigator.share({ text });
    else { await navigator.clipboard.writeText(text); toast('List copied'); }
  } catch {}
}

/* ---------- Bottom sheets ---------- */

function openSheet(inner) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap overlay-own';
  wrap.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div>${inner}</div>`;
  overlayRoot.append(wrap);
  lockScroll(1);
  requestAnimationFrame(() => wrap.classList.add('open'));
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 240);
    lockScroll(-1);
  };
  wrap.querySelector('.sheet-backdrop').addEventListener('click', close);
  return { el: wrap.querySelector('.sheet'), close };
}


/** onDone(result) — result: the saved section, 'deleted', or undefined when dismissed. */
function openSectionSheet(sec, onDone) {
  const isNew = !sec;
  const draft = sec ? { ...sec } : { id: S.newId('sec'), emoji: '🍽️', name: '' };
  const used = isNew ? 0 : S.getRecipes().filter(r => (r.sectionIds || []).includes(draft.id)).length;
  const { el, close } = openSheet(`
    <h2>${isNew ? 'New section' : 'Edit section'}</h2>
    <div class="sec-edit">
      <span class="ico-prev" id="sec-ico" aria-hidden="true">${secIcon(draft.emoji)}</span>
      <input id="sec-name" class="name-in" value="${esc(draft.name)}" placeholder="e.g. Tacos, Noodles, Mezze" maxlength="30" aria-label="Section name">
    </div>
    <p class="hint small">Choose an icon.</p>
    <div class="ico-grid">${SECTION_CHOICES.map(([k, e]) => `<button type="button" data-emoji="${e}" class="${k === iconName(draft.emoji) ? 'on' : ''}" aria-label="${k}">${ICONS[k]}</button>`).join('')}</div>
    <button class="btn primary wide" data-s="save">${isNew ? 'Add section' : 'Save'}</button>
    ${isNew ? '' : `<button class="btn ghost danger wide" data-s="delete">Delete section</button>
      <p class="hint small center">${used ? `${plural(used, 'recipe')} will stay in your cookbook.` : 'No recipes in this section.'}</p>`}
  `);
  const nameIn = $('#sec-name', el);
  if (isNew) setTimeout(() => nameIn.focus(), 250);
  el.addEventListener('click', e => {
    const em = e.target.closest('[data-emoji]');
    if (em) {
      draft.emoji = em.dataset.emoji; $('#sec-ico', el).innerHTML = secIcon(draft.emoji);
      $$('.ico-grid button', el).forEach(x => x.classList.toggle('on', x === em));
      return;
    }
    const a = e.target.closest('[data-s]')?.dataset.s;
    if (a === 'save') {
      draft.name = nameIn.value.trim();
      if (!draft.name) { nameIn.focus(); toast('Give the section a name'); return; }
      draft.emoji = draft.emoji || '🍽️';
      S.saveSection(draft);
      close(); onDone?.(draft);
      toast(isNew ? `${draft.name} added` : 'Section saved');
    }
    if (a === 'delete') {
      if (!confirm(`Delete “${draft.name}”? ${used ? 'Its recipes stay in your cookbook.' : ''}`)) return;
      S.deleteSection(draft.id);
      close(); onDone?.('deleted');
      toast('Section deleted');
    }
  });
}

function openGrocerySheet(r) {
  const f = scaleOf(r.id);
  const lines = r.ingredients.filter(l => !l.startsWith('#'));
  // an ingredient named twice in the recipe ("Sushi rice" and "400 g sushi rice") is one thing to buy
  const items = mergeIngredients(lines.map(l => scaleLine(l, f)));
  const combined = lines.length - items.length;
  const { el, close } = openSheet(`
    <h2>Add to groceries</h2>
    <p class="hint">${esc(r.title)}${f !== 1 ? (r.servings ? ` · for ${Math.round(r.servings * f)}` : ` · ×${fmtFactor(f)}`) : ''}. Untick what you already have.</p>
    ${combined ? `<p class="hint small">Repeated ingredients are combined.</p>` : ''}
    <ul class="pick-list">${items.map((t, i) => `<li class="ing" data-i="${i}"><span class="tick" aria-hidden="true"></span><span>${esc(t)}</span></li>`).join('')}</ul>
    <button class="btn primary wide" data-s="add">Add ${plural(items.length, 'item')}</button>
  `);
  const on = new Set(items.map((_, i) => i));
  const btn = $('[data-s="add"]', el);
  $$('.pick-list .ing', el).forEach(li => li.classList.add('done'));
  el.addEventListener('click', e => {
    const li = e.target.closest('.pick-list .ing');
    if (li) {
      const i = +li.dataset.i;
      on.has(i) ? on.delete(i) : on.add(i);
      li.classList.toggle('done', on.has(i));
      btn.textContent = on.size ? `Add ${plural(on.size, 'item')}` : 'Nothing selected';
      return;
    }
    if (e.target.closest('[data-s="add"]')) {
      if (!on.size) return;
      S.addGrocery([...on].sort((a, b) => a - b).map(i => ({ text: items[i], from: r.title, recipeId: r.id })));
      close(); updateBadge();
      toast(`${plural(on.size, 'item')} added to Groceries`);
    }
  });
}

/* ---------- Editor (smart paste + write) ---------- */

function openEditor({ id, sectionId, mode } = {}) {
  const existing = id ? S.getRecipe(id) : null;
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : {
    id: S.newId(), title: '', sectionIds: sectionId && sectionId !== '__none' ? [sectionId] : [], servings: null,
    prepTime: '', cookTime: '', totalTime: '', ingredients: [], steps: [], notes: '', source: '', favorite: false, wantToTry: false, hasPhoto: false
  };
  const photo = { state: existing?.hasPhoto ? 'keep' : 'none', blobs: null, url: '' };
  let pane = existing ? 'write' : (mode || 'paste');
  let busy = false;

  const el = document.createElement('div');
  el.className = 'editor overlay-own';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  overlayRoot.append(el);
  lockScroll(1);
  requestAnimationFrame(() => el.classList.add('open'));

  const snapshot = () => JSON.stringify({ ...draft, photo: photo.state });

  function photoHTML() {
    const url = photo.state === 'new' ? photo.url : photo.state === 'keep' ? S.photoURLSync(draft.id) : '';
    if (photo.state === 'keep' && !url) S.getPhotoURL(draft.id).then(() => { if (el.isConnected) $('#ed-photo', el).innerHTML = photoHTML(); });
    if (url) return `<img src="${url}" alt="">
      <div class="ph-actions">
        <label class="pill-btn">Change<input type="file" accept="image/*" hidden class="ed-file"></label>
        <button class="pill-btn" data-ed="rm-photo">Remove</button>
      </div>`;
    return `<label class="ph-add"><input type="file" accept="image/*" hidden class="ed-file">
      <span class="ph-ico">${ICONS.camera}</span><b>Add a photo</b><small>Take one or choose from your library</small></label>`;
  }
  function secChips() {
    return S.getSections().map(s => `<button type="button" class="chip ${draft.sectionIds.includes(s.id) ? 'on' : ''}" data-ed="sec" data-id="${esc(s.id)}">${secIcon(s.emoji)}${esc(s.name)}</button>`).join('') +
      `<button type="button" class="chip add" data-ed="new-sec">+ New</button>`;
  }

  function draw() {
    el.innerHTML = `
    <div class="ed-bar">
      <button class="link" data-ed="cancel">Cancel</button>
      <div class="ed-title">${existing ? 'Edit recipe' : 'New recipe'}</div>
      <button class="link strong" data-ed="save">Save</button>
    </div>
    <div class="ed-body">
      ${existing ? '' : `<div class="seg ed-seg" role="tablist">
        <button class="seg-b ${pane === 'paste' ? 'on' : ''}" data-ed="pane" data-v="paste" role="tab">Smart paste</button>
        <button class="seg-b ${pane === 'write' ? 'on' : ''}" data-ed="pane" data-v="write" role="tab">Write</button>
      </div>`}

      <div class="ed-pane" data-pane="paste" ${pane === 'paste' ? '' : 'hidden'}>
        <p class="hint">Copy a recipe from a website, Notes, a message or an Instagram caption and paste it below. The title, servings, times, ingredients and steps get sorted into place, and you check them before saving.</p>
        <textarea id="ed-paste" class="paste-box" placeholder="Paste the whole recipe here…" autocapitalize="sentences"></textarea>
        <div class="btn-row">
          ${navigator.clipboard?.readText ? '<button class="btn ghost" data-ed="paste-clip">Paste</button>' : ''}
          <button class="btn primary grow" data-ed="sort">Sort it for me</button>
        </div>
        <p class="hint small">Is the recipe in a photo or screenshot? Open it in Photos, press and hold the text, tap <b>Copy</b>, then paste it here.</p>
      </div>

      <div class="ed-pane" data-pane="write" ${pane === 'write' ? '' : 'hidden'}>
        <div class="ed-photo" id="ed-photo">${photoHTML()}</div>
        <label class="field"><span>Title</span><input id="ed-title" value="${esc(draft.title)}" placeholder="Grandma’s lentil soup" autocapitalize="words"></label>
        <div class="field"><span>Sections</span><div class="chips pick" id="ed-secs">${secChips()}</div></div>
        <div class="grid4">
          <label class="field"><span>Serves</span><input id="ed-serv" value="${draft.servings || ''}" inputmode="numeric" pattern="[0-9]*" placeholder="4"></label>
          <label class="field"><span>Prep</span><input id="ed-prep" value="${esc(draft.prepTime)}" placeholder="15 min"></label>
          <label class="field"><span>Cook</span><input id="ed-cook" value="${esc(draft.cookTime)}" placeholder="30 min"></label>
          <label class="field"><span>Total</span><input id="ed-total" value="${esc(draft.totalTime)}" placeholder="45 min"></label>
        </div>
        <label class="field"><span>Ingredients</span>
          <textarea id="ed-ings" class="auto" rows="5" placeholder="2 cups flour&#10;1 tsp salt&#10;# Sauce&#10;3 tbsp soy sauce">${esc(draft.ingredients.join('\n'))}</textarea>
          <small>One per line. Start a line with # for a heading, like “# Sauce”.</small>
        </label>
        <label class="field"><span>Method</span>
          <textarea id="ed-steps" class="auto" rows="5" placeholder="Heat the oil and soften the onion, 5 minutes.&#10;Add the lentils and simmer for 25 minutes.">${esc(draft.steps.join('\n'))}</textarea>
          <small>One step per line. Start a line with # for a heading, like “# Sushi rice”. Times like “10 minutes” become tap-to-start timers.</small>
        </label>
        <label class="field"><span>My notes</span><textarea id="ed-notes" class="auto" rows="2" placeholder="Less salt next time…">${esc(draft.notes)}</textarea></label>
        <label class="field"><span>Source</span><input id="ed-source" value="${esc(draft.source)}" placeholder="Website link, book or person" autocapitalize="off"></label>
        <div class="r-flags">
          <button type="button" class="flag ${draft.favorite ? 'on' : ''}" data-ed="fav">${ICON.star} Favorite</button>
          <button type="button" class="flag ${draft.wantToTry ? 'on' : ''}" data-ed="try">${ICONS.bookmark} Want to try</button>
        </div>
        <p class="hint small">Tip: tap the microphone on the keyboard to dictate instead of typing.</p>
        ${existing ? '<button class="btn ghost danger wide" data-ed="delete">Delete recipe</button>' : ''}
      </div>
    </div>`;
    $$('textarea.auto', el).forEach(autoGrow);
  }

  function collect() {
    if (!$('#ed-title', el)) return;
    draft.title = $('#ed-title', el).value.trim();
    const sv = parseInt($('#ed-serv', el).value, 10);
    draft.servings = sv > 0 ? sv : null;
    draft.prepTime = $('#ed-prep', el).value.trim();
    draft.cookTime = $('#ed-cook', el).value.trim();
    draft.totalTime = $('#ed-total', el).value.trim();
    draft.ingredients = lines($('#ed-ings', el).value);
    draft.steps = lines($('#ed-steps', el).value).map(s => s.replace(/^(?:(?:step|adım)\s*\d+\s*[:.)\-–]?\s*|\d{1,2}\s*[.)]\s+)/i, ''));
    draft.notes = $('#ed-notes', el).value.trim();
    draft.source = $('#ed-source', el).value.trim();
  }

  function setPane(p) {
    collect();
    pane = p;
    $$('[data-ed="pane"]', el).forEach(b => b.classList.toggle('on', b.dataset.v === p));
    $$('.ed-pane', el).forEach(x => { x.hidden = x.dataset.pane !== p; });
    $('.ed-body', el).scrollTop = 0;
    $$('textarea.auto', el).forEach(autoGrow);
  }

  function close() {
    el.classList.remove('open');
    setTimeout(() => el.remove(), 260);
    lockScroll(-1);
    if (photo.url) setTimeout(() => URL.revokeObjectURL(photo.url), 1000);
  }

  function sortPaste() {
    const text = $('#ed-paste', el).value;
    if (!text.trim()) { toast('Paste a recipe first'); $('#ed-paste', el).focus(); return; }
    collect();
    const p = parseRecipe(text);
    if (p.title) draft.title = p.title;
    if (p.servings) draft.servings = p.servings;
    for (const k of ['prepTime', 'cookTime', 'totalTime']) if (p[k]) draft[k] = p[k];
    if (p.ingredients.length) draft.ingredients = p.ingredients;
    if (p.steps.length) draft.steps = p.steps;
    if (p.notes) draft.notes = draft.notes ? draft.notes + '\n' + p.notes : p.notes;
    if (p.source && !draft.source) draft.source = p.source;
    for (const sid of suggestSections(draft.title, p.hints, S.getSections())) if (!draft.sectionIds.includes(sid)) draft.sectionIds.push(sid);
    const pasted = text;
    draw();
    $('#ed-paste', el).value = pasted;
    setPane('write');
    if (!p.ingredients.length && !p.steps.length) toast('Couldn’t spot ingredients or steps. Please check below.');
    else toast(`Sorted: ${plural(p.ingredients.filter(l => !l.startsWith('#')).length, 'ingredient')} · ${plural(p.steps.filter(l => !l.startsWith('#')).length, 'step')}. Check & Save`);
  }

  async function save() {
    if (busy) return;
    collect();
    if (!draft.title && !draft.ingredients.length && !draft.steps.length) {
      toast(pane === 'paste' ? 'Tap “Sort it for me” first' : 'Add a title or some ingredients first');
      return;
    }
    busy = true;
    if (!draft.title) draft.title = 'Untitled recipe';
    try {
      if (photo.state === 'new') { await S.putPhotos(draft.id, photo.blobs); draft.hasPhoto = true; }
      else if (photo.state === 'none' && draft.hasPhoto) { await S.deletePhotos(draft.id); draft.hasPhoto = false; }
    } catch { toast('The photo could not be saved'); draft.hasPhoto = photo.state === 'keep'; }
    if (!S.saveRecipe(draft)) { busy = false; toast('Storage is full. The recipe was not saved.'); return; }
    S.requestPersistence();
    close();
    if (existing) rerender();
    else go('recipe', { id: draft.id });
    toast(existing ? 'Saved' : 'Added to your cookbook');
  }

  draw();
  const initial = snapshot();
  if (pane === 'paste' && !existing) setTimeout(() => $('#ed-paste', el)?.focus(), 300);

  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-ed]');
    if (!b) return;
    const a = b.dataset.ed;
    if (a === 'cancel') {
      collect();
      const dirty = snapshot() !== initial || ($('#ed-paste', el)?.value.trim() && !existing);
      if (dirty && !confirm('Discard this recipe?')) return;
      close();
    }
    if (a === 'save') save();
    if (a === 'pane') setPane(b.dataset.v);
    if (a === 'sort') sortPaste();
    if (a === 'paste-clip') {
      try { const t = await navigator.clipboard.readText(); if (t) { $('#ed-paste', el).value = t; sortPaste(); } else toast('The clipboard is empty'); }
      catch { toast('Press and hold in the box, then tap Paste'); $('#ed-paste', el).focus(); }
    }
    if (a === 'sec') {
      const i = draft.sectionIds.indexOf(b.dataset.id);
      i >= 0 ? draft.sectionIds.splice(i, 1) : draft.sectionIds.push(b.dataset.id);
      b.classList.toggle('on', i < 0);
    }
    if (a === 'new-sec') openSectionSheet(null, sec => {
      if (sec && sec.id) { draft.sectionIds.push(sec.id); $('#ed-secs', el).innerHTML = secChips(); }
    });
    if (a === 'fav' || a === 'try') {
      const k = a === 'fav' ? 'favorite' : 'wantToTry';
      draft[k] = !draft[k]; b.classList.toggle('on', draft[k]);
    }
    if (a === 'rm-photo') {
      if (photo.url) URL.revokeObjectURL(photo.url);
      photo.state = 'none'; photo.blobs = null; photo.url = '';
      $('#ed-photo', el).innerHTML = photoHTML();
    }
    if (a === 'delete') {
      if (!confirm(`Delete “${existing.title}”? This can’t be undone.`)) return;
      await S.deleteRecipe(existing.id);
      close();
      nav.stack = nav.stack.filter(x => !(x.view === 'recipe' && x.params.id === existing.id));
      if (!nav.stack.length) nav.stack = [{ view: nav.tab, params: {} }];
      render();
      toast('Recipe deleted');
    }
  });

  el.addEventListener('input', e => {
    const t = e.target;
    if (e.inputType === 'insertFromPaste' && t.tagName === 'TEXTAREA' && /\bbullet\s/i.test(t.value)) {
      t.value = fixBulletWords(t.value);
      if (t.classList.contains('auto')) autoGrow(t);
    }
  });

  el.addEventListener('change', async e => {
    if (!e.target.classList.contains('ed-file')) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const box = $('#ed-photo', el);
    box.classList.add('loading');
    try {
      const blobs = await S.processPhoto(file);
      if (photo.url) URL.revokeObjectURL(photo.url);
      photo.state = 'new'; photo.blobs = blobs; photo.url = URL.createObjectURL(blobs.full);
      box.innerHTML = photoHTML();
      toast(`Photo shrunk to ${Math.round((blobs.full.size + blobs.thumb.size) / 1024)} KB`);
    } catch (err) { toast(err.message || 'Could not use that photo'); }
    box.classList.remove('loading');
  });
}

/* ---------- Cooking mode ---------- */

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); return true; }
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch {}
  return false;
}

function openCook(r) {
  let i = 0, drawer = false, awake = false;
  const steps = methodSteps(r.steps), n = steps.length;
  const el = document.createElement('div');
  el.className = 'cook overlay-own reading';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  overlayRoot.append(el);
  lockScroll(1);
  document.body.classList.add('cooking');
  requestAnimationFrame(() => el.classList.add('open'));
  keepAwake(true).then(ok => { awake = ok; const a = $('.cook-awake', el); if (a) a.textContent = ok ? 'Screen stays on while you cook' : ''; });

  function draw() {
    const f = scaleOf(r.id);
    el.innerHTML = `
      <div class="cook-top">
        <button class="icon-btn" data-c="close" aria-label="Close cooking mode">${ICON.close}</button>
        <div class="cook-title">${esc(r.title)}</div>
        <button class="pill-btn ${drawer ? 'on' : ''}" data-c="ings">Ingredients</button>
      </div>
      <div class="cook-progress" aria-hidden="true"><i style="width:${((i + 1) / n) * 100}%"></i></div>
      <div class="cook-main">
        ${steps[i].head ? `<div class="cook-head">${esc(steps[i].head)}</div>` : ''}
        <div class="cook-count">Step ${i + 1} <span>of ${n}</span></div>
        <p class="cook-text">${withTimers(steps[i].text, steps[i].label, r.title)}</p>
        ${i === n - 1 ? '<p class="cook-last">Last step. Enjoy!</p>' : ''}
      </div>
      <p class="cook-awake">${awake ? 'Screen stays on while you cook' : ''}</p>
      <div class="cook-nav">
        <button class="btn ghost" data-c="prev" ${i === 0 ? 'disabled' : ''}>‹ Back</button>
        <button class="btn primary" data-c="next">${i === n - 1 ? 'Done' : 'Next ›'}</button>
      </div>
      <div class="cook-drawer ${drawer ? 'open' : ''}">
        <div class="drawer-inner">
          <h3>Ingredients${r.servings ? ` · serves ${Math.max(1, Math.round(r.servings * f))}` : f !== 1 ? ` · ×${fmtFactor(f)}` : ''}</h3>
          <ul class="ings">${ingredientsHTML(r, 'data-c="ing"')}</ul>
        </div>
      </div>`;
  }
  function close(done) {
    keepAwake(false);
    document.body.classList.remove('cooking');
    el.classList.remove('open');
    setTimeout(() => el.remove(), 260);
    lockScroll(-1);
    if (done) toast('Bon appétit! 🍽️');
    rerender();
  }
  const goStep = d => { const j = i + d; if (j < 0) return; if (j >= n) { close(true); return; } i = j; draw(); };

  el.addEventListener('click', e => {
    if (e.target.closest('.tchip')) return;          // timer chips are handled globally
    const b = e.target.closest('[data-c]');
    if (!b) return;
    const a = b.dataset.c;
    if (a === 'close') close(false);
    if (a === 'prev') goStep(-1);
    if (a === 'next') goStep(1);
    if (a === 'ings') { drawer = !drawer; draw(); }
    if (a === 'ing') {
      const set = checksOf(r.id), k = +b.dataset.i;
      set.has(k) ? set.delete(k) : set.add(k);
      b.classList.toggle('done', set.has(k));
    }
  });
  let sx = 0, sy = 0;
  el.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', e => {
    if (drawer || !e.target.closest('.cook-main')) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) goStep(dx < 0 ? 1 : -1);
  });
  draw();
}

/* ---------- Timers ---------- */

let timers = S.getTimers();
let audioCtx = null, tickHandle = null;

function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {}
}
function chime() {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  [880, 1174.66, 1567.98, 1174.66, 1567.98].forEach((freq, k) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = t0 + k * 0.2;
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g).connect(audioCtx.destination);
    o.start(t); o.stop(t + 0.75);
  });
}

function startTimer(seconds, label, title) {
  unlockAudio();
  timers.push({ id: S.newId('t'), label, title, seconds, endsAt: Date.now() + seconds * 1000 });
  S.saveTimers(timers);
  drawTimers();
  toast(`Timer started: ${formatDuration(seconds)}`);
}
function drawTimers() {
  const el = $('#timers');
  if (!timers.length) {
    el.hidden = true; el.innerHTML = '';
    clearInterval(tickHandle); tickHandle = null;
    return;
  }
  el.hidden = false;
  el.innerHTML = timers.map(t => `<div class="timer" data-id="${esc(t.id)}">
    <div class="t-main"><span class="t-clock"></span><span class="t-label">${esc(t.label)} · ${esc(t.title)}</span></div>
    <button class="t-x" data-t="${esc(t.id)}" aria-label="Stop timer">${ICON.close}</button>
  </div>`).join('');
  tickTimers();
  if (!tickHandle) tickHandle = setInterval(tickTimers, 1000);
}
function tickTimers() {
  const now = Date.now();
  for (const t of timers) {
    const row = $(`#timers .timer[data-id="${t.id}"]`);
    if (!row) continue;
    const left = (t.endsAt - now) / 1000;
    const done = left <= 0;
    row.classList.toggle('ringing', done);
    row.querySelector('.t-clock').textContent = done ? 'Time’s up!' : formatClock(Math.ceil(left));
    if (done) {
      if (!t.alerted) { t.alerted = now; S.saveTimers(timers); toast(`⏰ ${t.label}: time’s up!`); chime(); }
      else if (now - t.alerted < 120000 && Math.round((now - t.alerted) / 1000) % 5 === 0) chime();
    }
  }
}
$('#timers').addEventListener('click', e => {
  const x = e.target.closest('[data-t]') || e.target.closest('.timer.ringing');
  if (!x) return;
  const id = x.dataset.t || x.dataset.id;
  timers = timers.filter(t => t.id !== id);
  S.saveTimers(timers);
  drawTimers();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (document.body.classList.contains('cooking')) keepAwake(true);
  if (timers.length) tickTimers();
});

/* ---------- Boot ---------- */

applyTextSize();
applyTheme();
render();
drawTimers();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    // Check for a new version whenever the app is brought back to the foreground.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
  // When a new version takes over, reload once so it shows straight away.
  let hadController = !!navigator.serviceWorker.controller, reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
    hadController = true;
  });
}
