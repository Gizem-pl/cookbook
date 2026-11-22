/* store.js — persistence, no DOM rendering.
   - localStorage: recipes (text only), sections, grocery list, settings, running timers  (Safari gives ~5 MB: thousands of recipes)
   - IndexedDB: photos, compressed in the browser to ~1000px JPEG (+ a ~420px thumbnail for grids), typically 100–200 KB each
   - backup / restore to a single .json file (photos included) */

const LS = {
  recipes: 'cb.recipes.v1',
  sections: 'cb.sections.v1',
  grocery: 'cb.grocery.v1',
  settings: 'cb.settings.v1',
  timers: 'cb.timers.v1'
};
const DB_NAME = 'cookbook';
const PHOTO_STORE = 'photos';

export const DEFAULT_SECTIONS = [
  ['soups', '🍜', 'Soups'], ['sushi', '🍣', 'Sushi'], ['bowls', '🥣', 'Bowls'], ['pasta', '🍝', 'Pasta'],
  ['salads', '🥗', 'Salads'], ['breakfast', '🍳', 'Breakfast'],
  ['baking', '🥐', 'Baking'], ['desserts', '🍰', 'Desserts'], ['cocktails', '🍸', 'Cocktails']
].map(([key, emoji, name]) => ({ id: 'sec_' + key, key, emoji, name }));

export const DEFAULT_SETTINGS = { textSize: 'm', theme: 'auto', lastBackup: 0 };

/* ---------- localStorage helpers ---------- */

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { console.warn('localStorage write failed', e); return false; }
}
export function newId(prefix = 'r') { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* ---------- Recipes ---------- */

let recipeCache = null;
export function getRecipes() { return recipeCache || (recipeCache = read(LS.recipes, [])); }
export function getRecipe(id) { return getRecipes().find(r => r.id === id) || null; }
export function saveRecipe(recipe) {
  const list = [...getRecipes()];
  const i = list.findIndex(r => r.id === recipe.id);
  recipe = { ...recipe, updatedAt: Date.now() };
  if (i >= 0) list[i] = recipe; else list.unshift({ createdAt: Date.now(), ...recipe });
  if (!write(LS.recipes, list)) return false;
  recipeCache = list;
  return true;
}
export function patchRecipe(id, patch) {
  const r = getRecipe(id);
  return r ? saveRecipe({ ...r, ...patch }) : false;
}
export async function deleteRecipe(id) {
  recipeCache = getRecipes().filter(r => r.id !== id);
  write(LS.recipes, recipeCache);
  await deletePhotos(id);
}

/* ---------- Sections ---------- */

export function getSections() {
  const s = read(LS.sections, null);
  if (s) return s;
  write(LS.sections, DEFAULT_SECTIONS);
  return DEFAULT_SECTIONS;
}
export function saveSections(list) { return write(LS.sections, list); }
export function saveSection(sec) {
  const list = [...getSections()];
  const i = list.findIndex(s => s.id === sec.id);
  if (i >= 0) list[i] = sec; else list.push(sec);
  return saveSections(list);
}
export function deleteSection(id) {
  saveSections(getSections().filter(s => s.id !== id));
  recipeCache = getRecipes().map(r => (r.sectionIds || []).includes(id) ? { ...r, sectionIds: r.sectionIds.filter(x => x !== id) } : r);
  write(LS.recipes, recipeCache);
}
export function moveSection(id, dir) {
  const list = [...getSections()];
  const i = list.findIndex(s => s.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  saveSections(list);
}

/* ---------- Grocery list ---------- */

export function getGrocery() { return read(LS.grocery, []); }
export function saveGrocery(list) { return write(LS.grocery, list); }
export function addGrocery(items) {
  const list = getGrocery();
  saveGrocery([...list, ...items.map(it => ({ id: newId('g'), done: false, ...it }))]);
}

/* ---------- Settings / timers ---------- */

export function getSettings() { return { ...DEFAULT_SETTINGS, ...read(LS.settings, {}) }; }
export function saveSettings(patch) { return write(LS.settings, { ...getSettings(), ...patch }); }
export function getTimers() { return read(LS.timers, []); }
export function saveTimers(list) { return write(LS.timers, list); }

/* ---------- IndexedDB (photos) ---------- */

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(PHOTO_STORE)) req.result.createObjectStore(PHOTO_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbPromise = null; reject(req.error); };
    });
  }
  return dbPromise;
}
function tx(mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(PHOTO_STORE, mode);
    const r = fn(t.objectStore(PHOTO_STORE));
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
const thumbKey = id => id + ':thumb';
export function getPhoto(id, thumb = false) { return tx('readonly', s => s.get(thumb ? thumbKey(id) : id)); }
export async function putPhotos(id, { full, thumb }) {
  await tx('readwrite', s => { s.put(full, id); s.put(thumb, thumbKey(id)); });
  revokePhotoURLs(id);
}
export async function deletePhotos(id) {
  revokePhotoURLs(id);
  try { await tx('readwrite', s => { s.delete(id); s.delete(thumbKey(id)); }); } catch (e) { console.warn(e); }
}

const urlCache = new Map();
/** Object URL for a recipe photo (cached), or '' if none. */
export async function getPhotoURL(id, thumb = false) {
  const k = thumb ? thumbKey(id) : id;
  if (urlCache.has(k)) return urlCache.get(k);
  try {
    const blob = await getPhoto(id, thumb);
    if (!blob) return '';
    const url = URL.createObjectURL(blob);
    urlCache.set(k, url);
    return url;
  } catch { return ''; }
}
export function photoURLSync(id, thumb = false) { return urlCache.get(thumb ? thumbKey(id) : id) || ''; }
function revokePhotoURLs(id) {
  for (const k of [id, thumbKey(id)]) { const u = urlCache.get(k); if (u) { URL.revokeObjectURL(u); urlCache.delete(k); } }
}

export async function requestPersistence() {
  try { if (navigator.storage?.persist) return await navigator.storage.persist(); } catch {}
  return false;
}
export async function isPersisted() {
  try { return navigator.storage?.persisted ? await navigator.storage.persisted() : false; } catch { return false; }
}
export async function storageEstimate() {
  try { if (navigator.storage?.estimate) return await navigator.storage.estimate(); } catch {}
  return null;
}
export function textBytes() {
  let n = 0;
  try { for (const k of Object.values(LS)) n += (localStorage.getItem(k) || '').length * 2; } catch {}
  return n;
}

/* ---------- Image processing ---------- */

const FULL_EDGE = 1080, THUMB_EDGE = 420;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}
function render(source, edge, quality) {
  const sw = source.width || source.naturalWidth, sh = source.height || source.naturalHeight;
  const scale = Math.min(1, edge / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#121013';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Could not compress that photo.')), 'image/jpeg', quality));
}

/** Shrinks a camera photo (often 3–8 MB) to { full: ~150 KB, thumb: ~30 KB } JPEG blobs. */
export async function processPhoto(file) {
  let source = null;
  try { if (window.createImageBitmap) source = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { source = null; }
  if (!source) source = await loadImage(file);
  const full = await render(source, FULL_EDGE, 0.74);
  const thumb = await render(source, THUMB_EDGE, 0.72);
  if (source.close) source.close();
  return { full, thumb };
}

/* ---------- Backup / restore ---------- */

const APP_ID = 'cookbook';

function blobToDataURL(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
}
async function dataURLToBlob(url) { return (await fetch(url)).blob(); }

/** One JSON file with everything (photos as data URLs). */
export async function createBackup() {
  const recipes = getRecipes();
  const photos = {};
  for (const r of recipes) {
    if (!r.hasPhoto) continue;
    try {
      const full = await getPhoto(r.id), thumb = await getPhoto(r.id, true);
      if (full) photos[r.id] = { full: await blobToDataURL(full), thumb: thumb ? await blobToDataURL(thumb) : null };
    } catch (e) { console.warn('photo skipped', r.id, e); }
  }
  const data = { app: APP_ID, version: 1, exportedAt: new Date().toISOString(), recipes, sections: getSections(), grocery: getGrocery(), settings: getSettings(), photos };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  return { blob, filename: `cookbook-backup-${new Date().toISOString().slice(0, 10)}.json`, count: recipes.length };
}

/** mode: 'merge' (keep what's here, add/overwrite by id) or 'replace'. */
export async function restoreBackup(file, mode = 'merge') {
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('That file is not a valid backup.'); }
  if (data?.app !== APP_ID || !Array.isArray(data.recipes)) throw new Error('That does not look like a Cookbook backup.');

  if (mode === 'replace') {
    for (const r of getRecipes()) await deletePhotos(r.id);
    recipeCache = []; write(LS.recipes, []);
    saveSections(data.sections || DEFAULT_SECTIONS);
    saveGrocery(data.grocery || []);
  } else {
    const have = new Set(getSections().map(s => s.id));
    saveSections([...getSections(), ...(data.sections || []).filter(s => !have.has(s.id))]);
  }
  let photos = 0;
  for (const r of data.recipes) {
    const p = data.photos?.[r.id];
    if (p?.full) {
      const full = await dataURLToBlob(p.full);
      await putPhotos(r.id, { full, thumb: p.thumb ? await dataURLToBlob(p.thumb) : full });
      photos++;
    }
  }
  const byId = new Map(getRecipes().map(r => [r.id, r]));
  for (const r of data.recipes) byId.set(r.id, r);
  const list = [...byId.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!write(LS.recipes, list)) throw new Error('Not enough storage space to restore.');
  recipeCache = list;
  return { recipes: data.recipes.length, photos };
}
