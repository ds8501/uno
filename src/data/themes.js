// Regional festival-themed card packs.
// Each theme reskins the table background and the 4 card colors while keeping
// the same underlying color KEYS (red/yellow/green/blue) so game logic is
// theme-independent. `label` + `icon` give each color festival flavor.

export const THEMES = {
  classic: {
    id: 'classic',
    name: 'Classic',
    tagline: 'The original deck',
    emoji: '🎴',
    premium: false,
    price: 0,
    table: 'from-slate-900 via-slate-800 to-slate-900',
    accent: '#facc15',
    colors: {
      red:    { hex: '#ef4444', label: 'Red',    icon: '🔴' },
      yellow: { hex: '#eab308', label: 'Yellow', icon: '🟡' },
      green:  { hex: '#22c55e', label: 'Green',  icon: '🟢' },
      blue:   { hex: '#3b82f6', label: 'Blue',   icon: '🔵' },
    },
  },

  diwali: {
    id: 'diwali',
    name: 'Diwali',
    tagline: 'Festival of Lights · India',
    emoji: '🪔',
    premium: true,
    price: 250,
    table: 'from-[#1a0b2e] via-[#3d1a4d] to-[#0f0620]',
    accent: '#ffb703',
    colors: {
      red:    { hex: '#e63946', label: 'Marigold Red', icon: '🪔' },
      yellow: { hex: '#ffb703', label: 'Diya Gold',    icon: '✨' },
      green:  { hex: '#2a9d8f', label: 'Rangoli Teal', icon: '🎇' },
      blue:   { hex: '#5a189a', label: 'Night Violet', icon: '🎆' },
    },
  },

  holi: {
    id: 'holi',
    name: 'Holi',
    tagline: 'Festival of Colours · India',
    emoji: '🎨',
    premium: true,
    price: 250,
    table: 'from-[#2b1055] via-[#7597de] to-[#2b1055]',
    accent: '#ff2d95',
    colors: {
      red:    { hex: '#ff2d95', label: 'Gulal Pink',  icon: '💗' },
      yellow: { hex: '#ffd60a', label: 'Haldi',       icon: '🌼' },
      green:  { hex: '#06d6a0', label: 'Neem Green',  icon: '🌿' },
      blue:   { hex: '#4361ee', label: 'Indigo',      icon: '💦' },
    },
  },

  lunar: {
    id: 'lunar',
    name: 'Lunar New Year',
    tagline: 'Spring Festival · East Asia',
    emoji: '🧧',
    premium: true,
    price: 400,
    seasonPass: true,
    table: 'from-[#4a0404] via-[#7a0a0a] to-[#2b0101]',
    accent: '#ffd700',
    colors: {
      red:    { hex: '#d90429', label: 'Lantern Red', icon: '🏮' },
      yellow: { hex: '#ffd700', label: 'Fortune Gold',icon: '🧧' },
      green:  { hex: '#38b000', label: 'Jade',        icon: '🐉' },
      blue:   { hex: '#0077b6', label: 'Porcelain',   icon: '🎏' },
    },
  },

  yuletide: {
    id: 'yuletide',
    name: 'Yuletide',
    tagline: 'Christmas · Worldwide',
    emoji: '🎄',
    premium: true,
    price: 400,
    seasonPass: true,
    table: 'from-[#0b3d2e] via-[#14532d] to-[#082018]',
    accent: '#f8d548',
    colors: {
      red:    { hex: '#c1121f', label: 'Holly Red',   icon: '🎅' },
      yellow: { hex: '#f8d548', label: 'Star Gold',   icon: '⭐' },
      green:  { hex: '#2d6a4f', label: 'Pine',        icon: '🎄' },
      blue:   { hex: '#48cae4', label: 'Frost',       icon: '❄️' },
    },
  },
}

export const THEME_LIST = Object.values(THEMES)

export function getTheme(id) {
  return THEMES[id] || THEMES.classic
}
