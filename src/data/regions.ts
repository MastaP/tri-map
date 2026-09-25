/**
 * Countries and regions.
 *
 * Every country that plausibly hosts a long-distance triathlon is listed here, keyed by
 * ISO 3166-1 alpha-2 code. The region assignment follows docs/SPEC.md (Turkey and Cyprus
 * are Europe; Bermuda is North America; Mexico, Central & South America and the
 * Caribbean are Latin America).
 */

export const REGION_IDS = [
  'europe',
  'north-america',
  'latin-america',
  'middle-east',
  'africa',
  'asia',
  'oceania',
] as const;

export type RegionId = (typeof REGION_IDS)[number];

export const REGIONS: Record<RegionId, { label: string; short: string }> = {
  europe: { label: 'Europe', short: 'Europe' },
  'north-america': { label: 'North America', short: 'N. America' },
  'latin-america': { label: 'Latin America', short: 'Latin Am.' },
  'middle-east': { label: 'Middle East', short: 'Middle East' },
  africa: { label: 'Africa', short: 'Africa' },
  asia: { label: 'Asia', short: 'Asia' },
  oceania: { label: 'Oceania', short: 'Oceania' },
};

/**
 * Coarse bounding boxes per region, as [west, south, east, north] in degrees. Used by
 * `validate:data` to catch swapped signs and wrong country codes, not for display.
 */
export const REGION_BOXES: Record<RegionId, ReadonlyArray<readonly [number, number, number, number]>> = {
  // Azores/Canaries/Iceland in the west, Turkey/Caucasus/western Russia in the east.
  europe: [[-32, 27, 60, 72]],
  // Contiguous US, Canada, Alaska, Hawaii and Bermuda.
  'north-america': [[-180, 15, -50, 72]],
  // Baja California down to Tierra del Fuego, incl. the Caribbean.
  'latin-america': [[-120, -56, -30, 33]],
  'middle-east': [[34, 12, 64, 38]],
  // Cape Verde to Mauritius / Réunion / Seychelles.
  africa: [[-26, -35, 64, 38]],
  // Kazakhstan / India to Japan, Indonesia in the south.
  asia: [[40, -11, 150, 56]],
  // Australia, New Zealand, Micronesia, and the Pacific east of the antimeridian.
  oceania: [
    [110, -50, 180, 22],
    [-180, -50, -130, 22],
  ],
};

type CountryRow = readonly [name: string, region: RegionId];

const COUNTRY_TABLE: Record<string, CountryRow> = {
  // Europe
  AD: ['Andorra', 'europe'],
  AL: ['Albania', 'europe'],
  AM: ['Armenia', 'europe'],
  AT: ['Austria', 'europe'],
  AZ: ['Azerbaijan', 'europe'],
  BA: ['Bosnia and Herzegovina', 'europe'],
  BE: ['Belgium', 'europe'],
  BG: ['Bulgaria', 'europe'],
  BY: ['Belarus', 'europe'],
  CH: ['Switzerland', 'europe'],
  CY: ['Cyprus', 'europe'],
  CZ: ['Czechia', 'europe'],
  DE: ['Germany', 'europe'],
  DK: ['Denmark', 'europe'],
  EE: ['Estonia', 'europe'],
  ES: ['Spain', 'europe'],
  FI: ['Finland', 'europe'],
  FO: ['Faroe Islands', 'europe'],
  FR: ['France', 'europe'],
  GB: ['United Kingdom', 'europe'],
  GE: ['Georgia', 'europe'],
  GG: ['Guernsey', 'europe'],
  GI: ['Gibraltar', 'europe'],
  GR: ['Greece', 'europe'],
  HR: ['Croatia', 'europe'],
  HU: ['Hungary', 'europe'],
  IE: ['Ireland', 'europe'],
  IM: ['Isle of Man', 'europe'],
  IS: ['Iceland', 'europe'],
  IT: ['Italy', 'europe'],
  JE: ['Jersey', 'europe'],
  LI: ['Liechtenstein', 'europe'],
  LT: ['Lithuania', 'europe'],
  LU: ['Luxembourg', 'europe'],
  LV: ['Latvia', 'europe'],
  MC: ['Monaco', 'europe'],
  MD: ['Moldova', 'europe'],
  ME: ['Montenegro', 'europe'],
  MK: ['North Macedonia', 'europe'],
  MT: ['Malta', 'europe'],
  NL: ['Netherlands', 'europe'],
  NO: ['Norway', 'europe'],
  PL: ['Poland', 'europe'],
  PT: ['Portugal', 'europe'],
  RO: ['Romania', 'europe'],
  RS: ['Serbia', 'europe'],
  RU: ['Russia', 'europe'],
  SE: ['Sweden', 'europe'],
  SI: ['Slovenia', 'europe'],
  SK: ['Slovakia', 'europe'],
  SM: ['San Marino', 'europe'],
  TR: ['Turkey', 'europe'],
  UA: ['Ukraine', 'europe'],
  VA: ['Vatican City', 'europe'],
  XK: ['Kosovo', 'europe'],

  // North America
  US: ['United States', 'north-america'],
  CA: ['Canada', 'north-america'],
  BM: ['Bermuda', 'north-america'],

  // Latin America: Mexico, Central America, the Caribbean, South America
  MX: ['Mexico', 'latin-america'],
  BZ: ['Belize', 'latin-america'],
  CR: ['Costa Rica', 'latin-america'],
  GT: ['Guatemala', 'latin-america'],
  HN: ['Honduras', 'latin-america'],
  NI: ['Nicaragua', 'latin-america'],
  PA: ['Panama', 'latin-america'],
  SV: ['El Salvador', 'latin-america'],
  AG: ['Antigua and Barbuda', 'latin-america'],
  AI: ['Anguilla', 'latin-america'],
  AW: ['Aruba', 'latin-america'],
  BB: ['Barbados', 'latin-america'],
  BL: ['Saint Barthélemy', 'latin-america'],
  BQ: ['Caribbean Netherlands', 'latin-america'],
  BS: ['Bahamas', 'latin-america'],
  CU: ['Cuba', 'latin-america'],
  CW: ['Curaçao', 'latin-america'],
  DM: ['Dominica', 'latin-america'],
  DO: ['Dominican Republic', 'latin-america'],
  GD: ['Grenada', 'latin-america'],
  GP: ['Guadeloupe', 'latin-america'],
  HT: ['Haiti', 'latin-america'],
  JM: ['Jamaica', 'latin-america'],
  KN: ['Saint Kitts and Nevis', 'latin-america'],
  KY: ['Cayman Islands', 'latin-america'],
  LC: ['Saint Lucia', 'latin-america'],
  MF: ['Saint Martin', 'latin-america'],
  MQ: ['Martinique', 'latin-america'],
  PR: ['Puerto Rico', 'latin-america'],
  SX: ['Sint Maarten', 'latin-america'],
  TC: ['Turks and Caicos Islands', 'latin-america'],
  TT: ['Trinidad and Tobago', 'latin-america'],
  VC: ['Saint Vincent and the Grenadines', 'latin-america'],
  VG: ['British Virgin Islands', 'latin-america'],
  VI: ['U.S. Virgin Islands', 'latin-america'],
  AR: ['Argentina', 'latin-america'],
  BO: ['Bolivia', 'latin-america'],
  BR: ['Brazil', 'latin-america'],
  CL: ['Chile', 'latin-america'],
  CO: ['Colombia', 'latin-america'],
  EC: ['Ecuador', 'latin-america'],
  GF: ['French Guiana', 'latin-america'],
  GY: ['Guyana', 'latin-america'],
  PE: ['Peru', 'latin-america'],
  PY: ['Paraguay', 'latin-america'],
  SR: ['Suriname', 'latin-america'],
  UY: ['Uruguay', 'latin-america'],
  VE: ['Venezuela', 'latin-america'],

  // Middle East
  AE: ['United Arab Emirates', 'middle-east'],
  BH: ['Bahrain', 'middle-east'],
  IL: ['Israel', 'middle-east'],
  IQ: ['Iraq', 'middle-east'],
  IR: ['Iran', 'middle-east'],
  JO: ['Jordan', 'middle-east'],
  KW: ['Kuwait', 'middle-east'],
  LB: ['Lebanon', 'middle-east'],
  OM: ['Oman', 'middle-east'],
  QA: ['Qatar', 'middle-east'],
  SA: ['Saudi Arabia', 'middle-east'],

  // Africa
  AO: ['Angola', 'africa'],
  BF: ['Burkina Faso', 'africa'],
  BJ: ['Benin', 'africa'],
  BW: ['Botswana', 'africa'],
  CI: ["Côte d'Ivoire", 'africa'],
  CM: ['Cameroon', 'africa'],
  CV: ['Cape Verde', 'africa'],
  DJ: ['Djibouti', 'africa'],
  DZ: ['Algeria', 'africa'],
  EG: ['Egypt', 'africa'],
  ET: ['Ethiopia', 'africa'],
  GA: ['Gabon', 'africa'],
  GH: ['Ghana', 'africa'],
  KE: ['Kenya', 'africa'],
  LS: ['Lesotho', 'africa'],
  LY: ['Libya', 'africa'],
  MA: ['Morocco', 'africa'],
  MG: ['Madagascar', 'africa'],
  ML: ['Mali', 'africa'],
  MU: ['Mauritius', 'africa'],
  MW: ['Malawi', 'africa'],
  MZ: ['Mozambique', 'africa'],
  NA: ['Namibia', 'africa'],
  NG: ['Nigeria', 'africa'],
  RE: ['Réunion', 'africa'],
  RW: ['Rwanda', 'africa'],
  SC: ['Seychelles', 'africa'],
  SN: ['Senegal', 'africa'],
  SZ: ['Eswatini', 'africa'],
  TG: ['Togo', 'africa'],
  TN: ['Tunisia', 'africa'],
  TZ: ['Tanzania', 'africa'],
  UG: ['Uganda', 'africa'],
  YT: ['Mayotte', 'africa'],
  ZA: ['South Africa', 'africa'],
  ZM: ['Zambia', 'africa'],
  ZW: ['Zimbabwe', 'africa'],

  // Asia
  BD: ['Bangladesh', 'asia'],
  BN: ['Brunei', 'asia'],
  BT: ['Bhutan', 'asia'],
  CN: ['China', 'asia'],
  HK: ['Hong Kong', 'asia'],
  ID: ['Indonesia', 'asia'],
  IN: ['India', 'asia'],
  JP: ['Japan', 'asia'],
  KG: ['Kyrgyzstan', 'asia'],
  KH: ['Cambodia', 'asia'],
  KR: ['South Korea', 'asia'],
  KZ: ['Kazakhstan', 'asia'],
  LA: ['Laos', 'asia'],
  LK: ['Sri Lanka', 'asia'],
  MM: ['Myanmar', 'asia'],
  MN: ['Mongolia', 'asia'],
  MO: ['Macao', 'asia'],
  MV: ['Maldives', 'asia'],
  MY: ['Malaysia', 'asia'],
  NP: ['Nepal', 'asia'],
  PH: ['Philippines', 'asia'],
  PK: ['Pakistan', 'asia'],
  SG: ['Singapore', 'asia'],
  TH: ['Thailand', 'asia'],
  TJ: ['Tajikistan', 'asia'],
  TL: ['Timor-Leste', 'asia'],
  TM: ['Turkmenistan', 'asia'],
  TW: ['Taiwan', 'asia'],
  UZ: ['Uzbekistan', 'asia'],
  VN: ['Vietnam', 'asia'],

  // Oceania
  AU: ['Australia', 'oceania'],
  CK: ['Cook Islands', 'oceania'],
  FJ: ['Fiji', 'oceania'],
  FM: ['Micronesia', 'oceania'],
  GU: ['Guam', 'oceania'],
  MP: ['Northern Mariana Islands', 'oceania'],
  NC: ['New Caledonia', 'oceania'],
  NZ: ['New Zealand', 'oceania'],
  PF: ['French Polynesia', 'oceania'],
  PG: ['Papua New Guinea', 'oceania'],
  PW: ['Palau', 'oceania'],
  SB: ['Solomon Islands', 'oceania'],
  TO: ['Tonga', 'oceania'],
  VU: ['Vanuatu', 'oceania'],
  WS: ['Samoa', 'oceania'],
};

export interface CountryInfo {
  code: string;
  name: string;
  region: RegionId;
  flag: string;
}

/** Regional-indicator flag emoji for an ISO alpha-2 code ("DE" → 🇩🇪). */
export function flagEmoji(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export const COUNTRIES: Readonly<Record<string, CountryInfo>> = Object.freeze(
  Object.fromEntries(
    Object.entries(COUNTRY_TABLE).map(([code, [name, region]]) => [
      code,
      { code, name, region, flag: flagEmoji(code) },
    ]),
  ),
);

export function isKnownCountry(code: string): boolean {
  return Object.hasOwn(COUNTRIES, code);
}

export function getCountry(code: string): CountryInfo | undefined {
  return Object.hasOwn(COUNTRIES, code) ? COUNTRIES[code] : undefined;
}

export function isRegionId(value: string): value is RegionId {
  return (REGION_IDS as readonly string[]).includes(value);
}

/** True when the point lies inside one of the region's coarse boxes. */
export function isInRegionBox(region: RegionId, lat: number, lng: number): boolean {
  return REGION_BOXES[region].some(
    ([west, south, east, north]) => lng >= west && lng <= east && lat >= south && lat <= north,
  );
}
