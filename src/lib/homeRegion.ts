/**
 * The viewer's region, guessed from the browser's time zone (no location prompt), so a
 * phone-sized map can open on nearby races instead of a clipped world.
 */
import type { RegionId } from '../data/regions.ts';

const LATIN_AMERICA =
  /^America\/(Argentina\/.*|Buenos_Aires|Sao_Paulo|Santiago|Lima|Bogota|Caracas|Montevideo|Asuncion|La_Paz|Guayaquil|Mexico_City|Cancun|Monterrey|Merida|Chihuahua|Mazatlan|Hermosillo|Tijuana|Bahia_Banderas|Costa_Rica|Panama|Guatemala|El_Salvador|Tegucigalpa|Managua|Belize|Santo_Domingo|Puerto_Rico|Havana|Jamaica|Port_of_Spain|Barbados|Martinique|Guadeloupe|Aruba|Curacao|Recife|Fortaleza|Belem|Manaus|Cuiaba|Campo_Grande|Porto_Velho|Maceio|Araguaina|Bahia|Noronha|Punta_Arenas|Paramaribo|Cayenne|Guyana)$/;
const MIDDLE_EAST = /^Asia\/(Dubai|Qatar|Riyadh|Bahrain|Muscat|Kuwait|Jerusalem|Tel_Aviv|Amman|Beirut|Baghdad|Aden)$/;

export function regionFromTimeZone(tz: string): RegionId | null {
  if (/^Europe\//.test(tz) || /^Atlantic\/(Reykjavik|Canary|Madeira|Azores|Faroe)$/.test(tz)) return 'europe';
  if (LATIN_AMERICA.test(tz)) return 'latin-america';
  if (/^America\//.test(tz) || tz === 'Pacific/Honolulu' || /^US\/|^Canada\//.test(tz)) return 'north-america';
  if (MIDDLE_EAST.test(tz)) return 'middle-east';
  if (/^Asia\//.test(tz)) return 'asia';
  if (/^Australia\//.test(tz) || /^Pacific\/(Auckland|Fiji|Noumea|Guam|Chatham)$/.test(tz)) return 'oceania';
  if (/^Africa\//.test(tz) || /^Indian\/(Mauritius|Reunion|Mahe)$/.test(tz)) return 'africa';
  return null;
}

export function viewerRegion(): RegionId | null {
  try {
    return regionFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? '');
  } catch {
    return null;
  }
}
