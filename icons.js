/* icons.js — thin line icons drawn to match the tab bar.
   Sections still store an emoji (so old backups and data keep working); it's shown through the matching icon here. */

const svg = body => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const BOWL = '<path d="M3.5 11h17c0 4.7-3.8 8.5-8.5 8.5S3.5 15.7 3.5 11z"/>';

export const ICONS = {
  dish: svg('<path d="M4.5 16.5a7.5 7.5 0 0 1 15 0"/><path d="M2.5 16.5h19"/><path d="M5 19.5h14"/><path d="M12 9V7.5"/><path d="M10.8 7.5h2.4"/>'),
  soup: svg(BOWL + '<path d="M8.5 8.5c-1-1 1-2 0-3.5M12 8.5c-1-1 1-2 0-3.5M15.5 8.5c-1-1 1-2 0-3.5"/>'),
  pot: svg('<path d="M4.5 10.5h15V16a3.5 3.5 0 0 1-3.5 3.5H8A3.5 3.5 0 0 1 4.5 16z"/><path d="M4.5 12.5h-2M19.5 12.5h2"/><path d="M5.5 10.5a6.5 2.8 0 0 1 13 0"/><path d="M12 7.7V6"/>'),
  sushi: svg('<ellipse cx="12" cy="8.5" rx="7.5" ry="3"/><path d="M4.5 8.5v6.5c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V8.5"/><ellipse cx="12" cy="8.5" rx="3" ry="1.1"/>'),
  bowl: svg(BOWL + '<path d="M7 11c.6-2 2.6-3.3 5-3.3s4.4 1.3 5 3.3"/><path d="M15.5 7.8 19.5 4"/>'),
  salad: svg(BOWL + '<path d="M11.5 11C9 10 8 7.5 9 4.5c2.6 1 3.9 3.6 2.5 6.5z"/><path d="M12.5 11c.5-2.5 2.8-4.2 5.5-3.8-.6 2.6-2.7 4-5.5 3.8z"/>'),
  pasta: svg('<ellipse cx="12" cy="16.5" rx="9" ry="3.5"/><path d="M8.2 16c.4-1.3 2-2.2 3.8-2.2 2.1 0 3.8.9 3.8 2.1s-1.7 1.7-3.6 1.7c-1.4 0-2.3-.5-2.3-1.2s1-1.1 2.3-1.1"/><path d="M12 13.5V3.5M10.3 3.5v3c0 1 .8 1.7 1.7 1.7s1.7-.8 1.7-1.7v-3"/>'),
  pizza: svg('<path d="M12 21 3.6 5.7a17 17 0 0 1 16.8 0z"/><path d="M5 8.3a14 14 0 0 1 14 0"/><circle cx="10.5" cy="11.5" r="1"/><circle cx="13.6" cy="14.8" r="1"/>'),
  egg: svg('<circle cx="10" cy="13" r="6.5"/><path d="M16.5 13h5"/><circle cx="10" cy="13" r="2.2"/>'),
  bread: svg('<path d="M6 20v-8.6A3.9 3.9 0 0 1 8.2 4h7.6a3.9 3.9 0 0 1 2.2 7.4V20z"/><path d="M9.5 9.5l1.5-1.5M13 9.5l1.5-1.5"/>'),
  dessert: svg('<path d="M3.5 13.5 20.5 9.5v10h-17z"/><path d="M3.5 13.5h17M3.5 16.5h17"/><circle cx="15.5" cy="9" r="1.4"/>'),
  cake: svg('<rect x="4" y="11" width="16" height="9" rx="1.5"/><path d="M4 15c2 1 4 1 6 0s4-1 6 0 3 .5 4 0"/><path d="M12 11V8"/><path d="M12 3.5c.9 1 .9 2.5 0 3-.9-.5-.9-2 0-3z"/>'),
  cupcake: svg('<path d="M6.3 13 7.7 20h8.6l1.4-7"/><path d="M5 13a2.3 2.3 0 0 1 .8-4.2A4.5 4.5 0 0 1 12 5a4.5 4.5 0 0 1 6.2 3.8A2.3 2.3 0 0 1 19 13z"/><path d="M10 13.5l.4 6M14 13.5l-.4 6"/>'),
  cookie: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="9" cy="9.5" r=".9"/><circle cx="14.5" cy="8.5" r=".9"/><circle cx="15" cy="14" r=".9"/><circle cx="9.5" cy="15" r=".9"/>'),
  icecream: svg('<path d="M7.5 11.5 12 21l4.5-9.5"/><path d="M7 11.5a5 5 0 1 1 10 0z"/>'),
  fruit: svg('<path d="M5 12.5c0-4 3.3-7 7.3-7 1.9 0 3.4.5 4.5 1.5l1.7-.5-.5 1.7c1 1.1 1.5 2.6 1.5 4.3 0 4-3.3 7-7.3 7-1.9 0-3.4-.5-4.5-1.5l-1.7.5.5-1.7C5.5 15.7 5 14.2 5 12.5z"/>'),
  leaf: svg('<path d="M5 19C5 10.5 10 5 19.5 4.5 19.5 14 14 19 5 19z"/><path d="M5 19l8.5-8.5"/>'),
  chili: svg('<path d="M7.5 9c-2 3-2.8 7-1 10.2.9 1.4 3 .7 3.2-.8.4-3.6 2.2-5.8 5.3-7.7 1.5-1 1.9-2.6.8-3.6-1.6-1.4-6.2-.8-8.3 1.9z"/><path d="M14.5 6.2c0-1.6.8-2.7 2.5-2.7"/>'),
  mushroom: svg('<path d="M3.5 12a8.5 7 0 0 1 17 0z"/><path d="M9.5 12v6a2.5 2.5 0 0 0 5 0v-6"/>'),
  fish: svg('<path d="M21 12c-1.8 3-4.6 4.5-7.5 4.5S8.5 15 7 12c1.5-3 3.6-4.5 6.5-4.5S19.2 9 21 12z"/><path d="M7 12 3 8.5v7z"/><circle cx="17.2" cy="11.3" r=".7"/>'),
  meat: svg('<path d="M5.2 9.3C5.6 6 8.4 4 11.8 4 16.2 4 20 7.2 20 11.6c0 4.6-3.8 8.4-9 8.4-3.9 0-7-2.3-7-5.4 0-1.6.6-2.7 1.2-3.6z"/><circle cx="14" cy="10.5" r="2"/>'),
  cheese: svg('<path d="M3.5 18.5V13L14 6l6.5 5v7.5z"/><path d="M3.5 13h17"/><circle cx="8" cy="16" r="1"/><circle cx="15" cy="15.7" r="1.3"/>'),
  taco: svg('<path d="M3 18.5a9 9 0 0 1 18 0z"/><path d="M6 12.3c1-.7 2-.2 3-.9s2-.7 3 0 2 .3 3-.4 2-.2 3 .6"/>'),
  burger: svg('<path d="M4 11a8 6 0 0 1 16 0z"/><path d="M3.5 14h17"/><path d="M4.5 17h15v.5A2.5 2.5 0 0 1 17 20H7a2.5 2.5 0 0 1-2.5-2.5z"/>'),
  dumpling: svg('<path d="M3 15.5C3 11 7 7 12 7s9 4 9 8.5c-1.3 2.4-4.7 3.5-9 3.5s-7.7-1.1-9-3.5z"/><path d="M8 8.3l1.2 2.4M12 7v2.7M16 8.3l-1.2 2.4"/>'),
  cocktail: svg('<path d="M4 4.5h16L12 13z"/><path d="M12 13v7M8 20h8"/><circle cx="10" cy="7.5" r="1"/><path d="M16 4.5l2.5-2"/>'),
  wine: svg('<path d="M7.5 3h9l-.3 4.7a4.2 4.2 0 0 1-8.4 0z"/><path d="M12 12v8M8.5 20h7M7.7 6.5h8.6"/>'),
  coffee: svg('<path d="M4.5 9h12v4.5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z"/><path d="M16.5 10.5h1.3a2.5 2.5 0 0 1 0 5h-1.6"/><path d="M8.5 6.5c-.7-.8.7-1.6 0-2.8M12.5 6.5c-.7-.8.7-1.6 0-2.8"/><path d="M3.5 21h15"/>'),
  heart: svg('<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>'),
  sparkle: svg('<path d="M11 3l1.8 5.4L18.5 10l-5.7 1.6L11 17l-1.8-5.4L3.5 10l5.7-1.6z"/><path d="M18.5 15.5v5M16 18h5"/>'),
  tray: svg('<path d="M3.5 13.5 6 5h12l2.5 8.5v5h-17z"/><path d="M3.5 13.5h5a3.5 3.5 0 0 0 7 0h5"/>'),
  /* UI */
  bookmark: svg('<path d="M7 3.5h10v17l-5-3.6-5 3.6z"/>'),
  book: svg('<path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5c.8 0 1.5-.7 1.5-1.5z"/>'),
  cart: svg('<path d="M3.5 5h2.2l2 10.2a1.5 1.5 0 0 0 1.5 1.2h7.6a1.5 1.5 0 0 0 1.5-1.1L20 8.5H6.6"/><circle cx="9.5" cy="20" r="1.2"/><circle cx="17" cy="20" r="1.2"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  camera: svg('<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.5-2h5.4l1.5 2h2.3A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.8" r="3.3"/>'),
  pen: svg('<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="M13.5 7l3 3"/>'),
  shield: svg('<path d="M12 3.5 19 6v5.5c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6z"/>'),
  chef: svg('<path d="M7 14.5a4 4 0 0 1-.8-7.9A5 5 0 0 1 12 3.5a5 5 0 0 1 5.8 3.1A4 4 0 0 1 17 14.5V20H7z"/><path d="M7 17h10"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  moon: svg('<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>')
};

/* Each emoji the app has ever offered → its line icon. Anything else falls back to the covered dish. */
const MAP = {
  '🍜': 'soup', '🍲': 'pot', '🥘': 'pot', '🫕': 'pot',
  '🍣': 'sushi', '🍱': 'sushi', '🍙': 'sushi',
  '🥣': 'bowl', '🍛': 'bowl', '🍚': 'bowl',
  '🥗': 'salad', '🍝': 'pasta', '🍕': 'pizza', '🥟': 'dumpling',
  '🌮': 'taco', '🌯': 'taco', '🥙': 'taco', '🍔': 'burger', '🥪': 'burger',
  '🍳': 'egg', '🥞': 'egg', '🧇': 'egg', '🥚': 'egg',
  '🥐': 'bread', '🥖': 'bread', '🍞': 'bread', '🥯': 'bread',
  '🍰': 'dessert', '🍮': 'dessert', '🥧': 'dessert', '🎂': 'cake', '🧁': 'cupcake',
  '🍪': 'cookie', '🍩': 'cookie', '🍫': 'cookie', '🍨': 'icecream',
  '🍓': 'fruit', '🍋': 'fruit',
  '🥑': 'leaf', '🍆': 'leaf', '🥦': 'leaf', '🧄': 'leaf', '🌱': 'leaf',
  '🌶️': 'chili', '🌶': 'chili', '🍄': 'mushroom',
  '🐟': 'fish', '🦐': 'fish', '🦞': 'fish',
  '🍗': 'meat', '🥩': 'meat', '🍖': 'meat', '🧀': 'cheese',
  '🍸': 'cocktail', '🍹': 'cocktail', '🍷': 'wine',
  '☕': 'coffee', '🍵': 'coffee', '🫖': 'coffee', '🥤': 'coffee',
  '🎉': 'sparkle', '❤️': 'heart', '🍽️': 'dish', '📎': 'tray'
};

/** The choices offered when picking a section icon: [icon name, emoji it's saved as]. */
export const SECTION_CHOICES = [
  ['soup', '🍜'], ['pot', '🍲'], ['bowl', '🥣'], ['salad', '🥗'], ['pasta', '🍝'], ['pizza', '🍕'],
  ['sushi', '🍣'], ['dumpling', '🥟'], ['taco', '🌮'], ['burger', '🍔'], ['egg', '🍳'], ['bread', '🥐'],
  ['fish', '🐟'], ['meat', '🥩'], ['cheese', '🧀'], ['leaf', '🌱'], ['mushroom', '🍄'], ['chili', '🌶️'],
  ['fruit', '🍋'], ['dessert', '🍰'], ['cake', '🎂'], ['cupcake', '🧁'], ['cookie', '🍪'], ['icecream', '🍨'],
  ['cocktail', '🍸'], ['wine', '🍷'], ['coffee', '☕'], ['sparkle', '🎉'], ['heart', '❤️'], ['dish', '🍽️']
];

export const iconName = emoji => MAP[emoji] || 'dish';
export const secIcon = emoji => ICONS[iconName(emoji)];
