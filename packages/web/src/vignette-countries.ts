/**
 * Hardcoded table of European countries relevant to road costs and borders.
 * Update manually when rules change (typically once a year at most).
 * Last verified: 2026 (Bulgaria & Romania are full Schengen since 2025-01).
 *
 * bbox: [west, south, east, north] — approximate, used only for route
 * country detection, not precise border determination.
 */

export interface CountryTollInfo {
  name: string;
  /** True = vignette (sticker / e-pass) required for motorways or all roads. */
  vignette: boolean;
  /** Short scope note shown next to the vignette flag. */
  vignetteNote?: string;
  /** True = pay-per-use toll roads exist (even inside vignette countries). */
  hasTolls: boolean;
  /** Shown alongside vignette entries that also have point-to-point tolls. */
  extraTollNote?: string;
  /** Member of the Schengen Area — no passport control between members. */
  schengen: boolean;
  /** Member of the European Union (used as a fallback when not in Schengen). */
  eu: boolean;
  bbox: [number, number, number, number]; // [W, S, E, N]
}

export const COUNTRY_TOLL_INFO: Record<string, CountryTollInfo> = {

  // ── Vignette countries ────────────────────────────────────────────────────

  AT: {
    name: "Austria", vignette: true, hasTolls: true,
    vignetteNote: "Motorways & expressways",
    extraTollNote: "Some tunnels (Brenner, Arlberg, Karawanken…) charged separately",
    schengen: true, eu: true,
    bbox: [9.5, 46.3, 17.2, 49.0],
  },
  CH: {
    name: "Switzerland", vignette: true, hasTolls: true,
    vignetteNote: "All national roads (40 CHF/year)",
    extraTollNote: "Great St Bernard tunnel and some alpine passes charged separately",
    schengen: true, eu: false,
    bbox: [5.9, 45.8, 10.5, 47.8],
  },
  CZ: {
    name: "Czech Republic", vignette: true, hasTolls: false,
    vignetteNote: "Motorways (e-Vignette)",
    schengen: true, eu: true,
    bbox: [12.1, 48.5, 18.9, 51.1],
  },
  SK: {
    name: "Slovakia", vignette: true, hasTolls: false,
    vignetteNote: "Motorways & expressways (e-Vignette)",
    schengen: true, eu: true,
    bbox: [16.8, 47.7, 22.6, 49.6],
  },
  HU: {
    name: "Hungary", vignette: true, hasTolls: false,
    vignetteNote: "Motorways (e-Vignette)",
    schengen: true, eu: true,
    bbox: [16.1, 45.7, 22.9, 48.6],
  },
  SI: {
    name: "Slovenia", vignette: true, hasTolls: false,
    vignetteNote: "Motorways & expressways",
    schengen: true, eu: true,
    bbox: [13.4, 45.4, 16.6, 46.9],
  },
  BG: {
    name: "Bulgaria", vignette: true, hasTolls: false,
    vignetteNote: "All roads (e-Vignette)",
    schengen: true, eu: true,
    bbox: [22.4, 41.2, 28.6, 44.2],
  },
  RO: {
    name: "Romania", vignette: true, hasTolls: true,
    vignetteNote: "All roads (Rovinieta)",
    extraTollNote: "Some bridges and motorway sections charged separately",
    schengen: true, eu: true,
    bbox: [20.3, 43.6, 29.7, 48.3],
  },
  MD: {
    name: "Moldova", vignette: true, hasTolls: false,
    vignetteNote: "All roads",
    schengen: false, eu: false,
    bbox: [26.6, 45.4, 30.1, 48.5],
  },
  MK: {
    name: "North Macedonia", vignette: true, hasTolls: false,
    vignetteNote: "Motorways",
    schengen: false, eu: false,
    bbox: [20.4, 40.9, 23.0, 42.4],
  },

  // ── No vignette, but pay-per-use toll roads ───────────────────────────────

  FR: { name: "France",              vignette: false, hasTolls: true, schengen: true,  eu: true,  bbox: [-5.2, 41.3,  9.6, 51.1] },
  IT: { name: "Italy",               vignette: false, hasTolls: true, schengen: true,  eu: true,  bbox: [ 6.6, 35.5, 18.5, 47.1] },
  ES: { name: "Spain",               vignette: false, hasTolls: true, schengen: true,  eu: true,  bbox: [-9.4, 35.9,  4.4, 43.8] },
  PT: { name: "Portugal",            vignette: false, hasTolls: true, schengen: true,  eu: true,  bbox: [-9.5, 36.8, -6.2, 42.2] },
  HR: { name: "Croatia",             vignette: false, hasTolls: true, schengen: true,  eu: true,  bbox: [13.5, 42.4, 19.4, 46.6] },
  RS: { name: "Serbia",              vignette: false, hasTolls: true, schengen: false, eu: false, bbox: [18.8, 42.2, 23.0, 46.2] },
  BA: { name: "Bosnia & Herzegovina",vignette: false, hasTolls: true, schengen: false, eu: false, bbox: [15.7, 42.6, 19.6, 45.3] },
  ME: { name: "Montenegro",          vignette: false, hasTolls: true, schengen: false, eu: false, bbox: [18.4, 41.8, 20.4, 43.6] },
  AL: { name: "Albania",             vignette: false, hasTolls: true, schengen: false, eu: false, bbox: [19.3, 39.6, 21.1, 42.7] },
  GR: { name: "Greece",              vignette: false, hasTolls: true, schengen: true,  eu: true,  bbox: [19.4, 34.8, 28.3, 42.0] },
  NO: { name: "Norway",              vignette: false, hasTolls: true, schengen: true,  eu: false, bbox: [ 4.6, 57.9, 31.1, 71.2] },
  PL: { name: "Poland",              vignette: false, hasTolls: true, schengen: true,  eu: true,  bbox: [14.1, 49.0, 24.2, 54.8] },
  TR: { name: "Turkey",              vignette: false, hasTolls: true, schengen: false, eu: false, bbox: [26.0, 35.8, 44.8, 42.1] },

  // ── Toll-free for private cars ────────────────────────────────────────────

  DE: { name: "Germany",     vignette: false, hasTolls: false, schengen: true,  eu: true,  bbox: [ 5.9, 47.3, 15.0, 55.1] },
  NL: { name: "Netherlands", vignette: false, hasTolls: false, schengen: true,  eu: true,  bbox: [ 3.3, 50.7,  7.2, 53.6] },
  BE: { name: "Belgium",     vignette: false, hasTolls: false, schengen: true,  eu: true,  bbox: [ 2.5, 49.5,  6.4, 51.5] },
  LU: { name: "Luxembourg",  vignette: false, hasTolls: false, schengen: true,  eu: true,  bbox: [ 5.7, 49.4,  6.5, 50.2] },
  DK: { name: "Denmark",     vignette: false, hasTolls: false, schengen: true,  eu: true,  bbox: [ 8.1, 54.6, 15.2, 57.8] },
  SE: { name: "Sweden",      vignette: false, hasTolls: false, schengen: true,  eu: true,  bbox: [11.0, 55.3, 24.2, 69.1] },
  FI: { name: "Finland",     vignette: false, hasTolls: false, schengen: true,  eu: true,  bbox: [20.0, 59.8, 31.6, 70.1] },
  LT: { name: "Lithuania",   vignette: false, hasTolls: false, schengen: true,  eu: true,  bbox: [20.9, 53.9, 26.8, 56.5] },
  LV: { name: "Latvia",      vignette: false, hasTolls: false, schengen: true,  eu: true,  bbox: [21.0, 55.7, 28.2, 57.8] },
  EE: { name: "Estonia",     vignette: false, hasTolls: false, schengen: true,  eu: true,  bbox: [21.8, 57.5, 28.2, 59.7] },
  UA: { name: "Ukraine",     vignette: false, hasTolls: false, schengen: false, eu: false, bbox: [22.1, 44.4, 40.2, 52.4] },
  BY: { name: "Belarus",     vignette: false, hasTolls: false, schengen: false, eu: false, bbox: [23.2, 51.3, 32.8, 56.2] },
};
