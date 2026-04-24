/**
 * Hardcoded table of European countries relevant to road costs.
 * Update manually when laws change (typically once a year at most).
 * Last verified: 2025.
 *
 * bbox: [west, south, east, north] in WGS-84 degrees.
 * Bboxes are approximate — used only to detect which countries a route
 * passes through, not for precise border determination.
 */

export interface CountryTollInfo {
  /** Display name. */
  name: string;
  /** True = vignette (sticker/e-pass) required to drive on motorways/all roads. */
  vignette: boolean;
  /** Short human-readable scope note when vignette=true. */
  vignetteNote?: string;
  /** True = additional pay-per-use toll roads exist (even in vignette countries). */
  hasTolls: boolean;
  /** Extra note shown alongside vignette countries that also have point tolls. */
  extraTollNote?: string;
  /** Bounding box [W, S, E, N]. */
  bbox: [number, number, number, number];
}

export const COUNTRY_TOLL_INFO: Record<string, CountryTollInfo> = {

  // ── Vignette countries ────────────────────────────────────────────────────

  AT: {
    name: "Австрия", vignette: true, hasTolls: true,
    vignetteNote: "Motorways & expressways",
    extraTollNote: "Ряд тоннелей (Brenner, Arlberg, Karawanken…) оплачивается отдельно",
    bbox: [9.5, 46.3, 17.2, 49.0],
  },
  CH: {
    name: "Швейцария", vignette: true, hasTolls: true,
    vignetteNote: "Все национальные дороги (40 CHF/год)",
    extraTollNote: "Тоннель Большого Сен-Бернара и некоторые горные перевалы — доп. оплата",
    bbox: [5.9, 45.8, 10.5, 47.8],
  },
  CZ: {
    name: "Чехия", vignette: true, hasTolls: false,
    vignetteNote: "Motorways (e-Vignette)",
    bbox: [12.1, 48.5, 18.9, 51.1],
  },
  SK: {
    name: "Словакия", vignette: true, hasTolls: false,
    vignetteNote: "Motorways & expressways (e-Vignette)",
    bbox: [16.8, 47.7, 22.6, 49.6],
  },
  HU: {
    name: "Венгрия", vignette: true, hasTolls: false,
    vignetteNote: "Motorways (e-Vignette)",
    bbox: [16.1, 45.7, 22.9, 48.6],
  },
  SI: {
    name: "Словения", vignette: true, hasTolls: false,
    vignetteNote: "Motorways & expressways",
    bbox: [13.4, 45.4, 16.6, 46.9],
  },
  BG: {
    name: "Болгария", vignette: true, hasTolls: false,
    vignetteNote: "Все дороги (e-Vignette)",
    bbox: [22.4, 41.2, 28.6, 44.2],
  },
  RO: {
    name: "Румыния", vignette: true, hasTolls: true,
    vignetteNote: "Все дороги (Rovinieta)",
    extraTollNote: "Отдельные мосты и скоростные участки — доп. оплата",
    bbox: [20.3, 43.6, 29.7, 48.3],
  },
  MD: {
    name: "Молдова", vignette: true, hasTolls: false,
    vignetteNote: "Все дороги",
    bbox: [26.6, 45.4, 30.1, 48.5],
  },
  MK: {
    name: "Северная Македония", vignette: true, hasTolls: false,
    vignetteNote: "Motorways",
    bbox: [20.4, 40.9, 23.0, 42.4],
  },

  // ── No vignette, but pay-per-use toll roads ───────────────────────────────

  FR: {
    name: "Франция", vignette: false, hasTolls: true,
    bbox: [-5.2, 41.3, 9.6, 51.1],
  },
  IT: {
    name: "Италия", vignette: false, hasTolls: true,
    bbox: [6.6, 35.5, 18.5, 47.1],
  },
  ES: {
    name: "Испания", vignette: false, hasTolls: true,
    bbox: [-9.4, 35.9, 4.4, 43.8],
  },
  PT: {
    name: "Португалия", vignette: false, hasTolls: true,
    bbox: [-9.5, 36.8, -6.2, 42.2],
  },
  HR: {
    name: "Хорватия", vignette: false, hasTolls: true,
    bbox: [13.5, 42.4, 19.4, 46.6],
  },
  RS: {
    name: "Сербия", vignette: false, hasTolls: true,
    bbox: [18.8, 42.2, 23.0, 46.2],
  },
  BA: {
    name: "Босния и Герцеговина", vignette: false, hasTolls: true,
    bbox: [15.7, 42.6, 19.6, 45.3],
  },
  ME: {
    name: "Черногория", vignette: false, hasTolls: true,
    bbox: [18.4, 41.8, 20.4, 43.6],
  },
  AL: {
    name: "Албания", vignette: false, hasTolls: true,
    bbox: [19.3, 39.6, 21.1, 42.7],
  },
  GR: {
    name: "Греция", vignette: false, hasTolls: true,
    bbox: [19.4, 34.8, 28.3, 42.0],
  },
  NO: {
    name: "Норвегия", vignette: false, hasTolls: true,
    bbox: [4.6, 57.9, 31.1, 71.2],
  },
  PL: {
    name: "Польша", vignette: false, hasTolls: true,
    bbox: [14.1, 49.0, 24.2, 54.8],
  },
  TR: {
    name: "Турция", vignette: false, hasTolls: true,
    bbox: [26.0, 35.8, 44.8, 42.1],
  },

  // ── Toll-free for private cars ────────────────────────────────────────────

  DE: { name: "Германия",    vignette: false, hasTolls: false, bbox: [5.9, 47.3, 15.0, 55.1] },
  NL: { name: "Нидерланды",  vignette: false, hasTolls: false, bbox: [3.3, 50.7, 7.2,  53.6] },
  BE: { name: "Бельгия",     vignette: false, hasTolls: false, bbox: [2.5, 49.5, 6.4,  51.5] },
  LU: { name: "Люксембург",  vignette: false, hasTolls: false, bbox: [5.7, 49.4, 6.5,  50.2] },
  DK: { name: "Дания",       vignette: false, hasTolls: false, bbox: [8.1, 54.6, 15.2, 57.8] },
  SE: { name: "Швеция",      vignette: false, hasTolls: false, bbox: [11.0,55.3, 24.2, 69.1] },
  FI: { name: "Финляндия",   vignette: false, hasTolls: false, bbox: [20.0,59.8, 31.6, 70.1] },
  LT: { name: "Литва",       vignette: false, hasTolls: false, bbox: [20.9,53.9, 26.8, 56.5] },
  LV: { name: "Латвия",      vignette: false, hasTolls: false, bbox: [21.0,55.7, 28.2, 57.8] },
  EE: { name: "Эстония",     vignette: false, hasTolls: false, bbox: [21.8,57.5, 28.2, 59.7] },
  UA: { name: "Украина",     vignette: false, hasTolls: false, bbox: [22.1,44.4, 40.2, 52.4] },
  BY: { name: "Беларусь",    vignette: false, hasTolls: false, bbox: [23.2,51.3, 32.8, 56.2] },
};
