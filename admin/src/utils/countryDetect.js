// Auto-detect the user's country from browser locale/timezone for food search filtering.
// Maps to Open Food Facts country tag format (e.g. "united-kingdom", "united-states").

const TIMEZONE_TO_COUNTRY = {
  'Europe/London': 'united-kingdom',
  'Europe/Belfast': 'united-kingdom',
  'Europe/Dublin': 'ireland',
  'America/New_York': 'united-states',
  'America/Chicago': 'united-states',
  'America/Denver': 'united-states',
  'America/Los_Angeles': 'united-states',
  'America/Anchorage': 'united-states',
  'Pacific/Honolulu': 'united-states',
  'America/Phoenix': 'united-states',
  'America/Toronto': 'canada',
  'America/Vancouver': 'canada',
  'America/Halifax': 'canada',
  'America/Winnipeg': 'canada',
  'America/Edmonton': 'canada',
  'Australia/Sydney': 'australia',
  'Australia/Melbourne': 'australia',
  'Australia/Brisbane': 'australia',
  'Australia/Perth': 'australia',
  'Australia/Adelaide': 'australia',
  'Australia/Hobart': 'australia',
  'Pacific/Auckland': 'new-zealand',
  'Europe/Paris': 'france',
  'Europe/Berlin': 'germany',
  'Europe/Madrid': 'spain',
  'Europe/Rome': 'italy',
  'Europe/Amsterdam': 'netherlands',
  'Europe/Brussels': 'belgium',
  'Europe/Zurich': 'switzerland',
  'Europe/Vienna': 'austria',
  'Europe/Stockholm': 'sweden',
  'Europe/Oslo': 'norway',
  'Europe/Copenhagen': 'denmark',
  'Europe/Helsinki': 'finland',
  'Europe/Lisbon': 'portugal',
  'Europe/Warsaw': 'poland',
  'Europe/Prague': 'czech-republic',
  'Europe/Budapest': 'hungary',
  'Europe/Bucharest': 'romania',
  'Europe/Athens': 'greece',
  'Asia/Tokyo': 'japan',
  'Asia/Singapore': 'singapore',
  'Asia/Hong_Kong': 'hong-kong',
  'Asia/Dubai': 'united-arab-emirates',
  'Asia/Kolkata': 'india',
  'Africa/Johannesburg': 'south-africa',
};

const LOCALE_TO_COUNTRY = {
  'en-gb': 'united-kingdom',
  'en-us': 'united-states',
  'en-au': 'australia',
  'en-nz': 'new-zealand',
  'en-ca': 'canada',
  'en-ie': 'ireland',
  'en-za': 'south-africa',
  'en-sg': 'singapore',
  'en-in': 'india',
  'fr-fr': 'france',
  'fr-be': 'belgium',
  'fr-ca': 'canada',
  'fr-ch': 'switzerland',
  'de-de': 'germany',
  'de-at': 'austria',
  'de-ch': 'switzerland',
  'es-es': 'spain',
  'it-it': 'italy',
  'nl-nl': 'netherlands',
  'nl-be': 'belgium',
  'pt-pt': 'portugal',
  'pt-br': 'brazil',
  'sv-se': 'sweden',
  'nb-no': 'norway',
  'da-dk': 'denmark',
  'fi-fi': 'finland',
  'pl-pl': 'poland',
  'ja-jp': 'japan',
};

let detectedCountry = null;

export function detectCountry() {
  if (detectedCountry !== null) return detectedCountry;

  // 1. Try timezone (most reliable — not spoofable by language settings)
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TIMEZONE_TO_COUNTRY[tz]) {
      detectedCountry = TIMEZONE_TO_COUNTRY[tz];
      return detectedCountry;
    }
  } catch (e) { /* ignore */ }

  // 2. Fall back to browser locale
  try {
    const locale = (navigator.language || navigator.userLanguage || '').toLowerCase();
    if (locale && LOCALE_TO_COUNTRY[locale]) {
      detectedCountry = LOCALE_TO_COUNTRY[locale];
      return detectedCountry;
    }
    // Try just the language-region part
    const parts = locale.split('-');
    if (parts.length >= 2) {
      const key = parts[0] + '-' + parts[1];
      if (LOCALE_TO_COUNTRY[key]) {
        detectedCountry = LOCALE_TO_COUNTRY[key];
        return detectedCountry;
      }
    }
  } catch (e) { /* ignore */ }

  // 3. No match — return null (will search globally)
  detectedCountry = '';
  return detectedCountry;
}

// Build the OFF country filter query params
export function getCountryFilterParams() {
  const country = detectCountry();
  if (!country) return '';
  return `&tagtype_0=countries&tag_contains_0=contains&tag_0=${encodeURIComponent(country)}`;
}

// Get a human-readable country label for UI display
const COUNTRY_LABELS = {
  'united-kingdom': 'UK',
  'united-states': 'US',
  'canada': 'Canada',
  'australia': 'Australia',
  'new-zealand': 'New Zealand',
  'ireland': 'Ireland',
  'france': 'France',
  'germany': 'Germany',
  'spain': 'Spain',
  'italy': 'Italy',
  'netherlands': 'Netherlands',
  'belgium': 'Belgium',
  'switzerland': 'Switzerland',
  'austria': 'Austria',
  'sweden': 'Sweden',
  'norway': 'Norway',
  'denmark': 'Denmark',
  'finland': 'Finland',
  'portugal': 'Portugal',
  'poland': 'Poland',
  'japan': 'Japan',
  'singapore': 'Singapore',
  'india': 'India',
  'south-africa': 'South Africa',
  'brazil': 'Brazil',
};

export function getCountryLabel() {
  const country = detectCountry();
  return country ? (COUNTRY_LABELS[country] || country) : null;
}
