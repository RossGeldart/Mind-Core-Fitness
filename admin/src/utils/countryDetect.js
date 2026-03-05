// Auto-detect the user's country from browser timezone/locale for food search filtering.
// Uses Open Food Facts `cc` parameter (2-letter ISO country code).

const TIMEZONE_TO_CC = {
  'Europe/London': 'uk',
  'Europe/Belfast': 'uk',
  'Europe/Dublin': 'ie',
  'America/New_York': 'us',
  'America/Chicago': 'us',
  'America/Denver': 'us',
  'America/Los_Angeles': 'us',
  'America/Anchorage': 'us',
  'Pacific/Honolulu': 'us',
  'America/Phoenix': 'us',
  'America/Toronto': 'ca',
  'America/Vancouver': 'ca',
  'America/Halifax': 'ca',
  'America/Winnipeg': 'ca',
  'America/Edmonton': 'ca',
  'Australia/Sydney': 'au',
  'Australia/Melbourne': 'au',
  'Australia/Brisbane': 'au',
  'Australia/Perth': 'au',
  'Australia/Adelaide': 'au',
  'Australia/Hobart': 'au',
  'Pacific/Auckland': 'nz',
  'Europe/Paris': 'fr',
  'Europe/Berlin': 'de',
  'Europe/Madrid': 'es',
  'Europe/Rome': 'it',
  'Europe/Amsterdam': 'nl',
  'Europe/Brussels': 'be',
  'Europe/Zurich': 'ch',
  'Europe/Vienna': 'at',
  'Europe/Stockholm': 'se',
  'Europe/Oslo': 'no',
  'Europe/Copenhagen': 'dk',
  'Europe/Helsinki': 'fi',
  'Europe/Lisbon': 'pt',
  'Europe/Warsaw': 'pl',
  'Europe/Prague': 'cz',
  'Europe/Budapest': 'hu',
  'Europe/Bucharest': 'ro',
  'Europe/Athens': 'gr',
  'Asia/Tokyo': 'jp',
  'Asia/Singapore': 'sg',
  'Asia/Hong_Kong': 'hk',
  'Asia/Dubai': 'ae',
  'Asia/Kolkata': 'in',
  'Africa/Johannesburg': 'za',
};

const LOCALE_TO_CC = {
  'en-gb': 'uk',
  'en-us': 'us',
  'en-au': 'au',
  'en-nz': 'nz',
  'en-ca': 'ca',
  'en-ie': 'ie',
  'en-za': 'za',
  'en-sg': 'sg',
  'en-in': 'in',
  'fr-fr': 'fr',
  'fr-be': 'be',
  'fr-ca': 'ca',
  'fr-ch': 'ch',
  'de-de': 'de',
  'de-at': 'at',
  'de-ch': 'ch',
  'es-es': 'es',
  'it-it': 'it',
  'nl-nl': 'nl',
  'nl-be': 'be',
  'pt-pt': 'pt',
  'pt-br': 'br',
  'sv-se': 'se',
  'nb-no': 'no',
  'da-dk': 'dk',
  'fi-fi': 'fi',
  'pl-pl': 'pl',
  'ja-jp': 'jp',
};

let detectedCC = null;

export function detectCountryCode() {
  if (detectedCC !== null) return detectedCC;

  // 1. Try timezone (most reliable — not spoofable by language settings)
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TIMEZONE_TO_CC[tz]) {
      detectedCC = TIMEZONE_TO_CC[tz];
      return detectedCC;
    }
  } catch (e) { /* ignore */ }

  // 2. Fall back to browser locale
  try {
    const locale = (navigator.language || navigator.userLanguage || '').toLowerCase();
    if (locale && LOCALE_TO_CC[locale]) {
      detectedCC = LOCALE_TO_CC[locale];
      return detectedCC;
    }
    const parts = locale.split('-');
    if (parts.length >= 2) {
      const key = parts[0] + '-' + parts[1];
      if (LOCALE_TO_CC[key]) {
        detectedCC = LOCALE_TO_CC[key];
        return detectedCC;
      }
    }
  } catch (e) { /* ignore */ }

  // 3. No match — will search globally
  detectedCC = '';
  return detectedCC;
}

// Build the OFF country filter query param (recommended `cc` parameter)
export function getCountryFilterParams() {
  const cc = detectCountryCode();
  if (!cc) return '';
  return `&cc=${cc}`;
}

// Human-readable country label for UI display
const CC_LABELS = {
  uk: 'UK', us: 'US', ca: 'Canada', au: 'Australia', nz: 'New Zealand',
  ie: 'Ireland', fr: 'France', de: 'Germany', es: 'Spain', it: 'Italy',
  nl: 'Netherlands', be: 'Belgium', ch: 'Switzerland', at: 'Austria',
  se: 'Sweden', no: 'Norway', dk: 'Denmark', fi: 'Finland', pt: 'Portugal',
  pl: 'Poland', cz: 'Czech Republic', hu: 'Hungary', ro: 'Romania',
  gr: 'Greece', jp: 'Japan', sg: 'Singapore', hk: 'Hong Kong',
  ae: 'UAE', in: 'India', za: 'South Africa', br: 'Brazil',
};

export function getCountryLabel() {
  const cc = detectCountryCode();
  return cc ? (CC_LABELS[cc] || cc.toUpperCase()) : null;
}
