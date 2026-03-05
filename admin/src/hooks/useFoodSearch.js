import { useState, useRef, useCallback, useEffect } from 'react';
import { parseProduct } from '../utils/productParser';
import { getCountryFilterParams } from '../utils/countryDetect';

// ==================== LRU CACHE ====================
const MAX_CACHE_SIZE = 50;
const searchCache = new Map();

function cacheGet(key) {
  if (!searchCache.has(key)) return undefined;
  const value = searchCache.get(key);
  // Move to end (most recently used)
  searchCache.delete(key);
  searchCache.set(key, value);
  return value;
}

function cacheSet(key, value) {
  if (searchCache.has(key)) searchCache.delete(key);
  searchCache.set(key, value);
  // Evict oldest if over limit
  if (searchCache.size > MAX_CACHE_SIZE) {
    const oldest = searchCache.keys().next().value;
    searchCache.delete(oldest);
  }
}

// ==================== HELPERS ====================
// Strip common prefixes/suffixes that don't change what the product IS
// e.g. "5 Fairtrade Bananas" → core words are ["fairtrade", "bananas"]
// e.g. "Banana Chocolate Flakes deliciously creamy" → core words are ["banana", "chocolate", "flakes", "deliciously", "creamy"]
const FILLER_WORDS = new Set(['the', 'a', 'an', 'by', 'of', 'and', '&', 'with', 'from', 'in', 'for', 'per', 'x']);

const coreWords = (str) =>
  str.toLowerCase().split(/[\s,\-/()]+/)
    .filter(w => w && !FILLER_WORDS.has(w) && !/^\d+\.?\d*[gml%]*$/.test(w));

// Does plural-aware word matching: "banana" matches "bananas" and vice versa
const wordMatches = (word, target) =>
  word === target || word + 's' === target || word === target + 's' ||
  word + 'es' === target || word === target + 'es';

// ==================== RELEVANCE SCORING ====================
const scoreRelevance = (name, brand, term) => {
  const nameWords = coreWords(name);
  const termWords = coreWords(term);
  const n = name.toLowerCase().trim();
  const b = brand.toLowerCase().trim();

  let score = 0;

  // Count how many search words appear as whole words in the name
  const matchedTermWords = termWords.filter(tw =>
    nameWords.some(nw => wordMatches(tw, nw))
  );
  const allTermsMatch = matchedTermWords.length === termWords.length;

  // Exact match: name IS the search term (e.g. "Bananas" for "banana")
  const nameCore = nameWords.join(' ');
  const termCore = termWords.join(' ');
  if (nameCore === termCore || nameCore === termCore + 's' || nameCore + 's' === termCore) {
    score += 200;
  }
  // Name is just the term + a number/quantity prefix (e.g. "5 Fairtrade Bananas")
  else if (allTermsMatch && nameWords.length <= termWords.length + 2) {
    score += 150;
  }
  // All search words match as whole words — close match
  else if (allTermsMatch) {
    score += 80;
  }

  // Penalise extra words heavily — each extra word beyond the search = less relevant
  const extraWords = Math.max(0, nameWords.length - termWords.length);
  score -= extraWords * 15;

  // Brand matches a search word — boost (e.g. searching "Tesco banana")
  if (termWords.some(w => b === w || b.startsWith(w))) score += 25;

  // Shorter names are more specific/relevant
  score += Math.max(0, 20 - n.length);

  return score;
};

// ==================== FILTER & SCORE PRODUCTS ====================
const filterAndScore = (products, searchWords, term) => {
  const termWords = coreWords(term);

  return products
    .map(p => parseProduct(p))
    .filter(p => p.name !== 'Unknown Product' && (p.calories > 0 || p.protein > 0))
    .filter(p => {
      // All search words must appear as whole words in the product name
      // (not just as substrings — "banana" should NOT match "banana chocolate flakes"
      // unless the user typed those extra words too)
      const nameWords = coreWords(p.name);
      const allMatch = termWords.every(tw =>
        nameWords.some(nw => wordMatches(tw, nw))
      );
      if (!allMatch) return false;

      // If the user typed a simple 1-2 word search, reject products with too many
      // extra unrelated words. "banana" should show "Bananas", "5 Fairtrade Bananas",
      // but NOT "Banana Chocolate Flakes deliciously creamy"
      if (termWords.length <= 2) {
        // Allow up to 3 extra words beyond what was searched
        // (covers things like "5 Fairtrade Bananas" or "Organic Free Range Eggs")
        const extraWords = nameWords.length - termWords.length;
        if (extraWords > 3) return false;
      }

      return true;
    })
    .sort((a, b) => scoreRelevance(b.name, b.brand, term) - scoreRelevance(a.name, a.brand, term));
};

// ==================== HOOK ====================
export default function useFoodSearch({ onError }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const searchAbort = useRef(null);
  const debounceTimer = useRef(null);
  const searchInputRef = useRef(null);

  const searchFood = useCallback(async (query) => {
    const q = (query ?? '').trim();
    if (!q) return;

    if (searchAbort.current) searchAbort.current.abort();
    const controller = new AbortController();
    searchAbort.current = controller;

    const term = q.toLowerCase();
    const searchWords = term.split(/\s+/).filter(Boolean);

    const cached = cacheGet(term);
    if (cached) {
      setSearchResults(cached);
      return;
    }

    setSearchLoading(true);
    try {
      const encoded = encodeURIComponent(q);
      const baseFields = 'product_name,product_name_en,brands,image_small_url,image_url,serving_size,quantity,nutriments';
      const countryFilter = getCountryFilterParams();
      const baseUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encoded}&search_simple=1&action=process&json=1&page_size=15&lc=en&sort_by=unique_scans_n&fields=${baseFields}`;

      // Fire both country-filtered and global searches in parallel
      const localFetch = countryFilter
        ? fetch(baseUrl + countryFilter, { signal: controller.signal }).then(r => r.ok ? r.json() : null)
        : Promise.resolve(null);
      const globalFetch = fetch(baseUrl, { signal: controller.signal }).then(r => r.ok ? r.json() : null);

      const [localData, globalData] = await Promise.all([localFetch, globalFetch]);

      let results = [];
      if (localData) {
        results = filterAndScore(localData.products || [], searchWords, term);
      }

      // Merge global results if local didn't return enough
      if (results.length < 3 && globalData) {
        const globalResults = filterAndScore(globalData.products || [], searchWords, term);
        const seen = new Set(results.map(r => (r.name + '|' + r.brand).toLowerCase()));
        for (const item of globalResults) {
          const key = (item.name + '|' + item.brand).toLowerCase();
          if (!seen.has(key)) {
            results.push(item);
            seen.add(key);
          }
        }
      }

      results = results.slice(0, 10);
      cacheSet(term, results);
      setSearchResults(results);
      if (results.length === 0) {
        onError?.('No results found. Try a different search.', 'info');
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Search error:', err);
      onError?.('Search failed. Check your connection.', 'error');
    }
    setSearchLoading(false);
  }, [onError]);

  // Debounced search-as-you-type
  const startDebounceSearch = useCallback((query, enabled) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!query?.trim() || !enabled) return;
    debounceTimer.current = setTimeout(() => {
      searchFood(query);
    }, 350);
  }, [searchFood]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (searchAbort.current) searchAbort.current.abort();
    };
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    setSearchResults,
    searchLoading,
    searchFood,
    startDebounceSearch,
    searchInputRef,
  };
}
