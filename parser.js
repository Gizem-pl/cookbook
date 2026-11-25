/* parser.js — pure text logic, no DOM.
   - parseRecipe(text): turns pasted text into { title, servings, prepTime, cookTime, totalTime, ingredients[], steps[], notes, source, hints }
   - splitIngredient(line, factor): leading amount (scaled) + the rest, for the servings scaler
   - findTimers(text): "10 minutes", "1 hour 30 min", "10–12 dk" → seconds, for tappable timers
   - suggestSections(title, hint, sections): guesses sections from the title
   Understands English and Turkish recipe wording. */

/* ---------- Quantities ---------- */

const UNI_FRAC = { '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5, '⅘': 4 / 5,
  '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8 };
const UF = Object.keys(UNI_FRAC).join('');
const NUM = `(?:\\d+(?:[.,]\\d+)?\\s*[${UF}]|[${UF}]|\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|\\d+(?:[.,]\\d+)?)`;
const QTY_RE = new RegExp(`^(${NUM})(\\s*(?:-|–|—|to|or|ila|ile|veya)\\s*(${NUM}))?`, 'i');
const QTY_ONLY_RE = new RegExp(`^${NUM}(?:\\s*(?:-|–|—|to)\\s*${NUM})?$`, 'i');

const UNITS = 'cups?|c\\.|tbsps?|tbs|tablespoons?|tsps?|teaspoons?|oz|ounces?|lbs?|pounds?|g|gr|grams?|kg|kilos?|ml|cl|dl|l|liters?|litres?|pinch(?:es)?|handfuls?|cloves?|cans?|tins?|sticks?|slices?|pieces?|bunch(?:es)?|sprigs?|packs?|packets?|' +
  'su bardağı|çay bardağı|yemek kaşığı|tatlı kaşığı|çay kaşığı|kahve fincanı|paket|adet|demet|diş|tutam|avuç|dilim|kase';
const QTY_UNIT_ONLY_RE = new RegExp(`^${NUM}\\s*(?:${UNITS})\\.?$`, 'i');
const METRIC_RE = /^\s*(?:g|gr|grams?|kg|kilos?|ml|cl|dl|l|liters?|litres?)\b/i;

export function parseNum(s) {
  s = String(s).trim().replace(/\s+/g, ' ');
  let m;
  if ((m = s.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*([${UF}])$`)))) return parseFloat(m[1].replace(',', '.')) + UNI_FRAC[m[2]];
  if (UNI_FRAC[s] != null) return UNI_FRAC[s];
  if ((m = s.match(/^(\d+) (\d+) ?\/ ?(\d+)$/))) return +m[1] + (+m[3] ? +m[2] / +m[3] : 0);
  if ((m = s.match(/^(\d+) ?\/ ?(\d+)$/))) return +m[2] ? +m[1] / +m[2] : NaN;
  return parseFloat(s.replace(',', '.'));
}

const FRACS = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, '']];

export function formatQty(v, { metric = false, comma = false } = {}) {
  if (!isFinite(v) || v <= 0) return '0';
  let out;
  if (metric || v >= 10) {
    if (v >= 100 && metric) out = String(Math.round(v / 5) * 5);
    else if (v >= 10) out = String(Math.round(v));
    else out = String(Math.round(v * 10) / 10);
  } else if (v < 0.1) {
    out = String(Math.round(v * 100) / 100);
  } else {
    let whole = Math.floor(v), frac = v - whole, best = FRACS[0];
    for (const f of FRACS) if (Math.abs(f[0] - frac) < Math.abs(best[0] - frac)) best = f;
    if (best[0] === 1) { whole += 1; best = FRACS[0]; }
    out = whole === 0 ? (best[1] || '0') : `${whole}${best[1]}`;
  }
  return comma ? out.replace('.', ',') : out;
}

/** Split an ingredient line into { amount, rest }. amount is scaled by factor (null when the line has no amount). */
export function splitIngredient(line, factor = 1) {
  const m = String(line).match(QTY_RE);
  if (!m) return { amount: null, rest: line };
  const rest = line.slice(m[0].length);
  // "2025" or "1-2-3" style things that aren't amounts: leave alone
  if (/^\d{4,}$/.test(m[1])) return { amount: null, rest: line };
  if (factor === 1) return { amount: m[0], rest };
  const opts = { metric: METRIC_RE.test(rest), comma: /\d,\d/.test(m[0]) };
  const a = parseNum(m[1]);
  if (!isFinite(a)) return { amount: m[0], rest };
  let amount = formatQty(a * factor, opts);
  if (m[3]) {
    const b = parseNum(m[3]);
    if (isFinite(b)) amount += '–' + formatQty(b * factor, opts);
  }
  // keep "400g" tight but "2 cups" spaced, as in the original
  return { amount, rest };
}

export function scaleLine(line, factor) {
  const { amount, rest } = splitIngredient(line, factor);
  return amount == null ? line : amount + rest;
}

/* ---------- Same ingredient listed twice (for the grocery list) ---------- */
// A recipe often names an ingredient twice: "400 g sushi rice" in one part and "Sushi rice" again in another.
// For shopping that is one item: the line without an amount is dropped in favour of the one with it.
// Amounts are never added up (the ingredient may be used in two places), they are shown side by side.

const UNIT_LEAD_RE = new RegExp(`^\\s*(${UNITS})\\.?(?![\\p{L}])\\s*`, 'iu');
const AMOUNT_TAIL_RE = new RegExp(`^(.*?\\S)[\\s:–—,-]*\\(?${NUM}(?:\\s*(?:-|–|—|to)\\s*${NUM})?\\s*(?:${UNITS})\\.?\\)?\\s*$`, 'iu');
const COUNT_TAIL = /\s+(?:cloves?|cans?|tins?|slices?|sticks?|sprigs?|sheets?|pieces?|bunch(?:es)?|packs?|packets?)(?=\s*(?:[,(;]|$))/i;

// lower case without accents, so "Kırmızı" and "kirmizi" read the same
const fold = s => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
// words that describe size or preparation, not what you buy
const PREP_WORDS = new Set(fold('a an the of some about approx approximately fresh freshly large small medium big cooked prepared seasoned ripe ' +
  'chopped finely roughly minced sliced thinly diced grated shredded peeled softened melted beaten ' +
  'büyük küçük orta boy taze doğranmış ince rendelenmiş haşlanmış pişmiş').split(' '));
const NAME_TAIL = /\b(?:to taste|for serving|for garnish|to serve|optional|or more|plus (?:more|extra)|isteğe (?:göre|bağlı)|süslemek için)\b.*$/iu;

/** The shopping name of an ingredient: "Sushi Rice, rinsed" → "sushi rice", "large eggs" → "egg". */
function itemName(s) {
  s = s.replace(/\([^)]*\)/g, ' ').split(/[,;]|\s[-–—]\s/)[0].replace(NAME_TAIL, '').replace(COUNT_TAIL, '');
  const words = fold(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  while (words.length > 1 && PREP_WORDS.has(words[0])) words.shift();
  if (!words.length) return '';
  const k = words.length - 1;
  words[k] = words[k].replace(/ies$/, 'y').replace(/(ch|sh|ss|x|o)es$/, '$1').replace(/([^s])s$/, '$1');
  return words.join(' ');
}

/** { key, measured }: the ingredient's shopping name, and whether the line gives an amount. */
function readItem(line) {
  const m = line.match(QTY_RE);
  if (m && !/^\d{4,}$/.test(m[1])) {
    const rest = line.slice(m[0].length).replace(/\([^)]*\)/g, ' ');   // "1 (400 g) can tomatoes"
    return { key: itemName(rest.replace(UNIT_LEAD_RE, '').replace(/^\s*of\s+/i, '')), measured: true };
  }
  const t = line.match(AMOUNT_TAIL_RE);                                  // "Sushi rice – 400 g", "Mayo (2 tbsp)"
  if (t) return { key: itemName(t[1]), measured: true };
  // "a pinch of salt", "a handful of basil": the measure word isn't part of the name
  return { key: itemName(line.replace(/^\s*(?:a|an|some|bir)\s+/i, '').replace(UNIT_LEAD_RE, '').replace(/^\s*of\s+/i, '')), measured: false };
}

/**
 * One grocery line per ingredient:
 * "Sushi rice" + "400 gr sushi rice" → "400 gr sushi rice";
 * "2 tbsp sesame seeds" + "1 tbsp sesame seeds" → "2 tbsp sesame seeds + 1 tbsp sesame seeds".
 * A line with no amount stays when nothing else names that ingredient ("Kewpie mayo"). Headings ("# …") are left out.
 */
export function mergeIngredients(lines) {
  const groups = new Map();
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const it = { line, ...readItem(line) };
    const k = it.key || ' ' + groups.size;           // nothing readable: keep it as its own line
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  return [...groups.values()].map(items => {
    const measured = items.filter(i => i.measured);
    return measured.length ? measured.map(i => i.line).join(' + ') : items[0].line;
  });
}

/* ---------- Timers ---------- */
// Catches every way a recipe writes a time: "10 minutes", "10-minute", "10–12 min", "1½ hours", "1 1/2 hrs",
// "an hour and a half", "two minutes", "thirty-five minutes", "30 sec", "10m", "1h30m",
// and Turkish "10 dakika", "10 dakikada", "bir buçuk saat", "yarım saat", "on beş dakika".

const EN_ONES = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const EN_WORDS = { ...EN_ONES, a: 1, an: 1, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90 };
const TR_ONES = { bir: 1, iki: 2, 'üç': 3, 'dört': 4, 'beş': 5, 'altı': 6, yedi: 7, sekiz: 8, dokuz: 9 };
const TR_WORDS = { ...TR_ONES, on: 10, yirmi: 20, otuz: 30, 'kırk': 40, elli: 50, 'altmış': 60, 'doksan': 90 };
const alt = o => Object.keys(o).sort((a, b) => b.length - a.length).join('|');

const WORD_NUM = `(?:(?:twenty|thirty|forty|fifty)[- ](?:${alt(EN_ONES)})|(?:on|yirmi|otuz|kırk|elli)\\s(?:${alt(TR_ONES)})|${alt(EN_WORDS)}|${alt(TR_WORDS)}|a couple of|couple of|a few|few|half an?|half|yarım|çeyrek)`;
const DIGIT_NUM = `(?:\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|\\d+(?:[.,]\\d+)?(?:\\s?[½¼¾⅓⅔])?|[½¼¾⅓⅔])`;
const T_NUM = `(?:${DIGIT_NUM}|${WORD_NUM})(?:\\s+buçuk)?`;
const T_UNIT = 'hours?|hrs?|hr|h|minutes?|mins?|min|m|seconds?|secs?|sec|s|saat\\p{L}*|dakika\\p{L}*|dakka\\p{L}*|dk|saniye\\p{L}*|sn';
const TIME_RE = new RegExp(
  `(?:(${T_NUM})(?:\\s*(?:-|–|—|to|or|ila|ile|veya|ya da)\\s*(${T_NUM}))?(\\s*[-‑–]\\s*|\\s*)(${T_UNIT})\\.?` +
  `|(half an hour|quarter of an hour|quarter hour))(?![\\p{L}]|\\d(?!\\d*\\s?m))`, 'giu');   // a digit may follow only in "1h30m"

function unitSeconds(u) {
  u = u.toLowerCase();
  if (/^(h|hr|hrs|hour|hours)$/.test(u) || u.startsWith('saat')) return 3600;
  if (/^(s|sec|secs|second|seconds|sn)$/.test(u) || u.startsWith('saniye')) return 1;
  return 60;
}

function timeNum(s) {
  s = s.toLowerCase().trim();
  let extra = 0;
  if (/\s+buçuk$/.test(s)) { extra = 0.5; s = s.replace(/\s+buçuk$/, ''); }
  let n;
  if (/^half/.test(s) || s === 'yarım') n = 0.5;
  else if (s === 'çeyrek') n = 0.25;
  else if (/couple/.test(s)) n = 2;
  else if (/few/.test(s)) n = 3;
  else if (/^\d|^[½¼¾⅓⅔]/.test(s)) n = parseNum(s);
  else {
    const parts = s.split(/[- ]/);
    n = parts.reduce((t, w) => t + (EN_WORDS[w] ?? TR_WORDS[w] ?? NaN), 0);
  }
  return n + extra;
}

/** Returns [{ index, length, seconds, text }] for every cooking time in a piece of text. */
export function findTimers(text) {
  const out = [];
  TIME_RE.lastIndex = 0;
  let m;
  while ((m = TIME_RE.exec(text))) {
    // must start on a word boundary ("pizza minute" is not "a minute")
    const prev = out[out.length - 1];
    const joined = prev && prev.index + prev.length === m.index;          // "30m" right after "1h"
    if (m.index > 0 && !joined && /[\p{L}\p{N}]/u.test(text[m.index - 1])) { TIME_RE.lastIndex = m.index + 1; continue; }
    let seconds, length = m[0].length;
    if (m[5]) {
      seconds = /^half/i.test(m[5]) ? 1800 : 900;
    } else {
      const unit = m[4], glue = m[3];
      const isWord = !/^[\d½¼¾⅓⅔]/.test(m[1]);
      // single-letter units only when glued to a digit: "10m", "1h", "30s"
      if (/^[mhs]$/i.test(unit) && (glue.length || isWord)) continue;
      // "a second egg", "a minute amount" are not times
      if (/^(a|an|one|few|a few)$/i.test(m[1].trim()) && /^(s|sec|secs|second|seconds)$/i.test(unit)) continue;
      // a full stop after a whole word ("two minutes.") ends the sentence; keep it only for "min." / "hr."
      if (m[0].endsWith('.') && !/^(?:mins?|hrs?|secs?|dk|sn)$/i.test(unit)) length -= 1;
      const n = timeNum(m[1]);
      if (!isFinite(n) || n <= 0) continue;
      seconds = Math.round(n * unitSeconds(unit));
      // "an hour and a half", "2 minutes and a half"
      const tail = text.slice(m.index + length).match(/^\s+and a half(?![\p{L}])/iu);
      if (tail) { seconds += Math.round(unitSeconds(unit) / 2); length += tail[0].length; }
    }
    if (!seconds || seconds > 48 * 3600) continue;
    out.push({ index: m.index, length, seconds, text: text.slice(m.index, m.index + length) });
    TIME_RE.lastIndex = m.index + length;
  }
  // merge "1 hour 30 minutes", "1h30m", "1 saat 15 dakika" into one timer
  for (let i = out.length - 2; i >= 0; i--) {
    const a = out[i], b = out[i + 1];
    const between = text.slice(a.index + a.length, b.index);
    if (/^\s*(?:and|ve|,)?\s*$/i.test(between) && a.seconds >= 3600 && b.seconds < 3600) {
      out.splice(i, 2, { index: a.index, length: b.index + b.length - a.index, seconds: a.seconds + b.seconds, text: text.slice(a.index, b.index + b.length) });
    }
  }
  return out;
}

export function formatClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = n => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}
export function formatDuration(sec) {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  if (sec < 60) return `${sec} sec`;
  return `${m} min`;
}

/* ---------- Smart paste ---------- */

/** Some apps copy list markers as the word "bullet" ("bullet butter bullet pasta").
    Turns each one back into a real • point on its own line. */
export function fixBulletWords(text) {
  return String(text || '')
    .replace(/[ \t]*\bbullet[ \t]+(?=\S)/gi, '\n• ')
    .replace(/\n[ \t]*\n• /g, '\n• ')
    .replace(/^\n/, '');
}


const HEAD = {
  ingredients: /^(?:ingredients?(?: list)?|what you(?:'|’)?ll need|you(?:'|’)?ll need|you will need|shopping list|malzemeler(?:i)?|gerekli malzemeler|malzeme listesi)(?![\p{L}])/iu,
  steps: /^(?:instructions?|directions?|method|steps?|preparation|cooking instructions|how to (?:make|cook|prepare)(?: it| them| this)?|yap[ıi]l[ıi][şs][ıi]|haz[ıi]rlan[ıi][şs][ıi]|nas[ıi]l yap[ıi]l[ıi]r|tarifi?n? yap[ıi]l[ıi][şs][ıi])(?![\p{L}])/iu,
  notes: /^(?:notes?|recipe notes|tips?(?: (?:and|&) tricks)?|cook(?:'|’)?s notes|chef(?:'|’)?s (?:notes?|tips?)|storage|to store|make ahead|notlar|not|p[üu]f noktas[ıi]|ipu[çc]lar[ıi]|servis [öo]nerisi)(?![\p{L}])/iu,
  equipment: /^(?:equipment|tools|you(?:'|’)?ll also need|ekipman|gerekenler)(?![\p{L}])/iu,
  skip: /^(?:nutrition(?: facts| information| info)?|besin de[ğg]erleri|related recipes|more recipes|you may also like|comments|reviews|yorumlar)(?![\p{L}])/iu
};

const JUNK = /^(?:print(?: recipe)?|pin(?: (?:recipe|it))?|save(?: recipe)?|saved!?|jump to (?:recipe|video)|rate (?:this )?recipe|share(?: this)?|email|tweet|facebook|pinterest|instagram|video|watch(?: video)?|advertisement|ad|sponsored|scroll to .*|cook mode|prevent your screen from going dark|keep screen awake|metric|us customary|imperial|[½\d]+ ?x|ingredients? list|check out .*|click .*|subscribe.*|follow .*|link in bio.*|tag me.*|as an amazon associate.*|yield:?|reklam|tarifi kaydet|yazd[ıi]r|payla[şs])$/i;

const META = [
  ['servings', /^(?:serves|servings?|yield|yields|makes|portions?|porsiyon|ki[şs]i(?: say[ıi]s[ıi])?|ka[çc] ki[şs]ilik)\s*[:\-–]?\s*(.*)$/i],
  ['prepTime', /^(?:prep(?:aration)?(?: time)?|haz[ıi]rl[ıi]k(?: s[üu]resi)?)\s*[:\-–]?\s*(.*)$/i],
  ['cookTime', /^(?:cook(?:ing)? time|bake time|baking time|pi[şs]irme(?: s[üu]resi)?)\s*[:\-–]?\s*(.*)$/i],
  ['cookTime', /^(?:cook|bake)\s*[:\-–]\s*(.*)$/i],
  ['totalTime', /^(?:total(?: time)?|ready in|toplam(?: s[üu]re)?)\s*[:\-–]?\s*(.*)$/i],
  ['hint', /^(?:course|cuisine|category|categories|kategori|mutfak|diet|type)\s*[:\-–]?\s*(.*)$/i],
  ['ignore', /^(?:keywords?|author|by|calories|kcal|kalori|rest(?:ing)? time|additional time|chill(?:ing)? time|marinat(?:e|ing) time|inactive time|difficulty|zorluk|level|skill level|bekleme s[üu]resi|dinlenme s[üu]resi|source|kaynak|published|updated)\s*[:\-–]?\s*(.*)$/i]
];

const EMOJI_LEAD = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|️|‍|⃣)+\s*/u;
const BULLET_LEAD = /^(?:[•·●○◦▪▫■□▢☐☑✓✔➤►▶→*+~]+|-(?=\s)|–(?=\s)|—(?=\s))\s*/;
const STEP_NUM = /^(?:(?:step|adım)\s*\d+\s*[:.)\-–]?\s*|\d{1,2}\s*[.):]\s+|\d{1,2}\s*-\s+(?=\D))/i;

function clean(line) {
  let s = line.replace(/[​-‍⁠﻿]/g, '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  let prev;
  do { prev = s; s = s.replace(BULLET_LEAD, '').replace(EMOJI_LEAD, '').trim(); } while (s !== prev);
  return s;
}

function looksLikeIngredient(s) {
  if (QTY_RE.test(s)) return true;
  if (/^(?:a |an |one |half |pinch|handful|dash|splash|some |few |salt|pepper|olive oil|bir |yarım |çeyrek |tuz|karabiber|biraz )/i.test(s) && s.length < 70) return true;
  return s.length <= 45 && !/[.!?]$/.test(s);
}

export function shortTime(s) {
  return String(s).replace(/\s+/g, ' ').trim()
    .replace(/\b(?:hours?|hrs?)\b/gi, 'h').replace(/\b(?:minutes?|mins)\b/gi, 'min').replace(/\bseconds?\b/gi, 'sec')
    .replace(/\b(?:dakika|dk)\b/gi, 'dk').replace(/\s*(?:and|ve)\s*/gi, ' ');
}

function isTimeValue(s) { return /\d/.test(s) && s.length < 40; }

function splitSentences(text) {
  const parts = text.replace(/([.!?])\s+(?=[A-ZÇĞİÖŞÜ0-9])/g, '$1\n').split('\n').map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    if (out.length && out[out.length - 1].length < 70) out[out.length - 1] += ' ' + p;
    else out.push(p);
  }
  return out;
}

function tidyIngredients(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let s = lines[i];
    // amounts copied onto their own line ("2" / "cups" / "flour"): glue them back together
    while (QTY_ONLY_RE.test(s) && i + 1 < lines.length) s += ' ' + lines[++i];
    if (QTY_UNIT_ONLY_RE.test(s) && i + 1 < lines.length) s += ' ' + lines[++i];
    s = s.replace(/\s+/g, ' ').trim();
    if (!s) continue;
    // group headings: "For the sauce:", "Sauce:", "Sos için:"
    if (!QTY_RE.test(s) && s.length <= 45 && (/:$/.test(s) || /^for (?:the )?\S/i.test(s) && s.split(' ').length <= 5 || /\biçin:?$/i.test(s))) {
      out.push('# ' + s.replace(/:$/, '').trim());
      continue;
    }
    out.push(s.replace(/^#\s*(?=\d)/, ''));
  }
  // Instagram-style "Ingredients: 2 eggs, 1 cup flour, sugar" on one line
  if (out.length === 1 && out[0].length > 50 && (out[0].match(/,/g) || []).length >= 2) {
    return out[0].split(/\s*,\s*|\s*;\s*/).map(s => s.replace(/^and\s+/i, '').replace(/\.$/, '').trim()).filter(Boolean);
  }
  return out;
}

/** A sub-heading inside a method: "Season the sushi:", "For the sauce", "## Topping", "**Dressing**", "Sos için". */
export function stepHeading(line) {
  let s = String(line || '').replace(STEP_NUM, '').trim();
  let m;
  if ((m = s.match(/^#{1,6}\s*(.+)$/))) s = m[1];
  else if ((m = s.match(/^\*{0,2}(.{2,50}?)\*\*:?$/))) s = m[1];
  else if (!(s.length <= 50 && !QTY_RE.test(s) && (
    /^[^.!?:]{2,49}[:：]$/.test(s) && s.split(' ').length <= 7 ||
    /^for (?:the )?\S/i.test(s) && s.split(' ').length <= 5 && !/[.!?,]/.test(s) ||
    /^[^.!?:,]{2,30}\biçin$/i.test(s)
  ))) return null;
  s = s.replace(/[:：]\s*$/, '').replace(/\*+/g, '').trim();
  if (!s) return null;
  return s.charAt(0).toLocaleUpperCase() + s.slice(1);
}

function tidySteps(lines) {
  const raw = [];
  for (let i = 0; i < lines.length; i++) {
    let s = lines[i];
    // "1" or "Step 1" alone on a line → belongs to the next line
    if (/^(?:(?:step|adım)\s*)?\d{1,2}[.):]?$/i.test(s)) continue;
    const numbered = STEP_NUM.test(s);
    const last = raw[raw.length - 1];
    const fresh = numbered || !last || last.startsWith('#') || /[.!?:)"”]$/.test(last) || !/^[a-zçğıöşü(]/.test(s.trim());
    const head = fresh && stepHeading(s);
    if (head) { raw.push('# ' + head); continue; }
    s = s.replace(STEP_NUM, '').trim();
    if (!s) continue;
    // a sentence that was wrapped onto the next line
    if (last && !last.startsWith('#') && !/[.!?:)"”]$/.test(last) && /^[a-zçğıöşü(]/.test(s)) raw[raw.length - 1] = last + ' ' + s;
    else raw.push(s);
  }
  // a heading with no steps under it is just noise
  const out = raw.filter((s, k) => !(s.startsWith('#') && (k === raw.length - 1 || raw[k + 1].startsWith('#'))));
  if (out.length === 1 && out[0].length > 220) return splitSentences(out[0]);
  return out;
}

/**
 * Turn any pasted text into a recipe draft.
 * Handles: recipe websites (with ▢ checkboxes, "Prep Time / 15 minutes" on two lines, nutrition blocks),
 * Notes, messages, Instagram captions (emojis, hashtags, one-line ingredient lists) and Turkish recipes.
 */
export function parseRecipe(input) {
  const text = fixBulletWords(String(input || '').replace(/\r\n?/g, '\n'));
  const urlMatch = text.match(/https?:\/\/[^\s)]+/);
  const lines = text.split('\n').flatMap(l => l.split(/\s+•\s+/)).map(clean);

  const r = { title: '', servings: null, prepTime: '', cookTime: '', totalTime: '', ingredients: [], steps: [], notes: '', source: urlMatch ? urlMatch[0] : '', hints: [] };
  const buckets = { pre: [], ingredients: [], steps: [], notes: [], equipment: [] };
  let mode = 'pre';
  let sawIng = false, sawSteps = false;

  for (let i = 0; i < lines.length; i++) {
    let s = lines[i];
    if (!s) continue;
    if (/^(?:#[\p{L}\p{N}_]+\s*)+$/u.test(s)) continue;                    // hashtag lines
    s = s.replace(/(?:\s+#[\p{L}\p{N}_]+)+\s*$/u, '').trim();                 // trailing hashtags
    if (/^https?:\/\/\S+$/.test(s)) continue;                                // bare links (kept as source)
    if (s.length <= 45 && JUNK.test(s)) continue;
    if (/^(?:(?:print|pin|save|share|rate|jump to|recipe|video|email|yazdır|kaydet)\s*)+$/i.test(s)) continue;
    if (/^[\d.,]+\s*(?:from|stars?|votes?|ratings?|reviews?)\b/i.test(s) || /^[★☆]+/.test(s)) continue; // "4.9 from 120 votes"

    // section headings
    const bare = s.replace(/[:：]\s*$/, '').trim();
    let heading = null;
    if (bare.length <= 48) for (const k of Object.keys(HEAD)) {
      const hm = bare.match(HEAD[k]);
      if (!hm) continue;
      const restOfLine = bare.slice(hm[0].length).trim();
      if (restOfLine === '' || /^[(\[]/.test(restOfLine)) { heading = k; break; }
    }
    if (!heading) {
      // "Ingredients: 2 eggs, flour…" — heading with content on the same line
      const m = s.match(/^([^:：]{3,30})[:：]\s*(.+)$/);
      if (m) for (const k of ['ingredients', 'steps', 'notes']) if (HEAD[k].test(m[1].trim()) && m[1].trim().split(' ').length <= 4) {
        heading = k; s = m[2];
        break;
      }
      if (heading) {
        mode = heading; if (heading === 'ingredients') sawIng = true; if (heading === 'steps') sawSteps = true;
        buckets[mode].push(s);
        continue;
      }
    } else {
      mode = heading === 'skip' ? 'skip' : heading;
      if (heading === 'ingredients') sawIng = true;
      if (heading === 'steps') sawSteps = true;
      // "Ingredients (serves 4)"
      const sv = bare.match(/(\d+)\s*(?:servings?|people|persons|portions?|ki[şs]ilik|porsiyon)|serves\s*(\d+)/i);
      if (sv && !r.servings) r.servings = +(sv[1] || sv[2]);
      continue;
    }

    // meta lines (servings, times, course…)
    let metaHit = false;
    if (s.length <= 60) {
      for (const [key, re] of META) {
        // inside the method only clear "Label: value" lines count (e.g. "Course: Main")
        if (mode === 'steps' && !/^[^:]{2,22}:\s*\S/.test(s)) continue;
        const m = s.match(re);
        if (!m) continue;
        let val = (m[1] || '').trim();
        const iBefore = i;
        // value on the next line ("Prep Time" ⏎ "15 minutes")
        if (!val && i + 1 < lines.length) { val = lines[i + 1]; i++; if (/^\d+$/.test(val) && /^(?:mins?|minutes?|hours?|servings?|people|dakika|saat|ki[şs]ilik)$/i.test(lines[i + 1] || '')) val += ' ' + lines[++i]; }
        if (key === 'servings') {
          const n = val.match(/\d+/);
          if (!n) { i = iBefore; continue; }
          if (!r.servings) r.servings = +n[0];
        } else if (key === 'hint') {
          r.hints.push(val);
        } else if (key !== 'ignore') {
          if (!isTimeValue(val)) { i = iBefore; continue; }
          if (!r[key]) r[key] = shortTime(val);
        }
        metaHit = true;
        break;
      }
      if (!metaHit && !r.servings) {
        const sv = s.match(/^(\d+)\s*(?:servings?|people|portions?|ki[şs]ilik|porsiyon)\b\.?$/i) || s.match(/^(\d+)\s*-\s*\d+\s*ki[şs]ilik$/i);
        if (sv) { r.servings = +sv[1]; metaHit = true; }
      }
    }
    if (metaHit || mode === 'skip') continue;
    buckets[mode].push(s);
  }

  // Title: first short line before the recipe body
  const pre = buckets.pre;
  const tIdx = pre.findIndex(l => l.length <= 90 && !QTY_RE.test(l) && !(/\.$/.test(l) && l.length > 50));
  if (tIdx >= 0 && tIdx < 3) {
    r.title = pre[tIdx].replace(/(?:\p{Extended_Pictographic}|\uFE0F|\u200D)+/gu, ' ').replace(/\s+/g, ' ').trim().replace(/\s*[|–—-]\s*(?:recipe|tarifi)?\s*$/i, '').replace(/\s+recipe$/i, '').trim();
    pre.splice(tIdx, 1);
  }

  let ings = buckets.ingredients, steps = buckets.steps, leftovers = [];
  if (!sawIng && !sawSteps) {
    // no headings at all: sort line by line
    const isIng = l => looksLikeIngredient(l) && !STEP_NUM.test(l);
    pre.forEach((l, k) => {
      if (stepHeading(l) && !QTY_RE.test(l)) {
        const next = pre.slice(k + 1).find(x => !stepHeading(x));
        (next === undefined || isIng(next) ? ings : steps).push(l);
      } else (isIng(l) ? ings : steps).push(l);
    });
  } else if (!sawIng) {
    for (const l of pre) (looksLikeIngredient(l) ? ings : leftovers).push(l);
  } else if (!sawSteps) {
    // steps often follow the ingredient list without a heading
    const moved = [];
    const isStep = l => !looksLikeIngredient(l) || STEP_NUM.test(l);
    // method sub-headings ("Season the sushi:") between steps move along with them
    while (ings.length && (isStep(ings[ings.length - 1]) || moved.length && isStep(moved[0]) && stepHeading(ings[ings.length - 1]))) moved.unshift(ings.pop());
    steps = moved;
    leftovers = pre;
  } else {
    leftovers = pre;
  }

  r.ingredients = tidyIngredients(ings);
  r.steps = tidySteps(steps);
  const notes = [...buckets.notes];
  if (buckets.equipment.length) notes.push('Equipment: ' + buckets.equipment.join(', '));
  if (leftovers.length) notes.unshift(...leftovers);
  r.notes = notes.join('\n').trim();
  if (!r.title && r.ingredients.length === 0 && r.steps.length === 1 && r.steps[0].length < 80) { r.title = r.steps[0]; r.steps = []; }
  return r;
}

/* ---------- Section suggestions ---------- */

export const SECTION_WORDS = {
  soups: 'soup|broth|ramen|pho|stew|chowder|bisque|gazpacho|minestrone|laksa|consomm|çorba|corba|tarhana|paça',
  sushi: 'sushi|maki|nigiri|sashimi|onigiri|uramaki|temaki|futomaki|california roll|hand roll',
  bowls: 'bowl|poke|buddha|bibimbap|donburi|burrito bowl|grain bowl|açaí|acai|kase',
  pasta: 'pasta|spaghetti|penne|lasagn|tagliatelle|fettuccin|linguin|rigatoni|ravioli|tortellini|gnocchi|carbonara|bolognese|orzo|mac and cheese|makarna|erişte',
  curries: 'curry|curries|masala|korma|vindaloo|dal|dhal|daal|tikka|biryani|rendang|köri',
  dumplings: 'dumpling|gyoza|wonton|dim sum|bao|momo|pierogi|mantı|manti|xiao long|har gow|shumai|siu mai',
  salads: 'salad|slaw|tabbouleh|tabule|fattoush|salata|piyaz|caprese',
  breakfast: 'breakfast|pancake|waffle|omelet|omelette|frittata|granola|porridge|oatmeal|overnight oats|shakshuka|menemen|french toast|eggs benedict|kahvaltı|kahvalti|brunch',
  baking: 'bread|focaccia|sourdough|bagel|brioche|croissant|muffin|scone|bun|rolls|loaf|pizza dough|ekmek|poğaça|pogaca|simit|börek|borek|pide|açma',
  desserts: 'dessert|cake|cookie|brownie|blondie|tart|pie|pudding|ice cream|gelato|tiramisu|cheesecake|mousse|panna cotta|crème|creme brulee|macaron|baklava|künefe|sütlaç|tatlı|tatli|kurabiye|cupcake|donut|doughnut|truffle|chocolate',
  cocktails: 'cocktail|margarita|martini|spritz|mojito|negroni|daiquiri|sangria|mocktail|smoothie|lemonade|latte|kokteyl|limonata|drink'
};

function stem(name) {
  return name.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim().replace(/ies$/, 'y').replace(/(?:es|s)$/, '');
}

/** Returns section ids whose name or keywords appear in the title (or the "Course:" line). */
export function suggestSections(title, hints, sections) {
  const hay = ' ' + [title, ...(hints || [])].join(' ').toLowerCase() + ' ';
  const ids = [];
  for (const s of sections) {
    const words = [];
    const st = stem(s.name);
    if (st.length >= 3) words.push(st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (s.key && SECTION_WORDS[s.key]) words.push(SECTION_WORDS[s.key]);
    if (!words.length) continue;
    const re = new RegExp(`(?:^|[^\\p{L}])(?:${words.join('|')})`, 'iu');
    if (re.test(hay)) ids.push(s.id);
  }
  return ids.length > 2 ? ids.slice(0, 2) : ids;
}
