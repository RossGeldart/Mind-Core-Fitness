import { useState, useRef, useCallback, useEffect } from 'react';
import { parseProduct } from '../utils/productParser';
import { getCountryFilterParams } from '../utils/countryDetect';

// ==================== LRU CACHE ====================
const MAX_CACHE_SIZE = 50;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const searchCache = new Map();

function cacheGet(key) {
  if (!searchCache.has(key)) return undefined;
  const entry = searchCache.get(key);
  // Expire stale entries
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    searchCache.delete(key);
    return undefined;
  }
  // Move to end (most recently used)
  searchCache.delete(key);
  searchCache.set(key, entry);
  return entry.value;
}

function cacheSet(key, value) {
  if (searchCache.has(key)) searchCache.delete(key);
  searchCache.set(key, { value, ts: Date.now() });
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

// Words that describe quantity/quality but don't change WHAT the product is
// "5 Fairtrade Organic Bananas" is still just bananas
const DESCRIPTOR_WORDS = new Set([
  'organic', 'fairtrade', 'fair', 'trade', 'free', 'range', 'fresh', 'raw',
  'natural', 'pure', 'whole', 'loose', 'ripe', 'sweet', 'large', 'small',
  'medium', 'mini', 'big', 'premium', 'finest', 'essential', 'everyday',
  'value', 'basic', 'british', 'scottish', 'irish', 'welsh', 'english',
  'farm', 'ripen', 'home', 'ready', 'eat', 'pack', 'bag',
]);

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

  // Bonus when the product name starts with the search term
  if (n.startsWith(termCore) || n.startsWith(term)) {
    score += 30;
  }

  // Graduated extra-word penalty: descriptors penalised mildly, substantive words heavily
  const extraNameWords = nameWords.filter(nw =>
    !termWords.some(tw => wordMatches(tw, nw))
  );
  const descriptorExtras = extraNameWords.filter(w => DESCRIPTOR_WORDS.has(w)).length;
  const nonDescriptorExtras = extraNameWords.length - descriptorExtras;
  score -= descriptorExtras * 5;
  score -= nonDescriptorExtras * 20;

  // Brand matches a search word — strong boost (e.g. searching "Tesco banana")
  const brandWords = coreWords(brand);
  if (termWords.some(tw => brandWords.some(bw => wordMatches(tw, bw)) || b.startsWith(tw))) score += 100;

  // Shorter names are more specific/relevant
  score += Math.max(0, 30 - n.length);

  return score;
};

// ==================== CATEGORY MATCHING ====================
// Extract searchable words from OFF categories_tags (e.g. "en:coffees" → "coffee")
const categoryWords = (tags) => {
  if (!tags || !Array.isArray(tags)) return [];
  return tags
    .filter(t => t.startsWith('en:'))
    .flatMap(t => t.slice(3).split('-'))
    .filter(Boolean);
};

// ==================== FILTER & SCORE PRODUCTS ====================
const filterAndScore = (products, searchWords, term) => {
  const termWords = coreWords(term);

  return products
    .map(p => ({ parsed: parseProduct(p), categories: categoryWords(p.categories_tags) }))
    .filter(({ parsed: p }) => p.name !== 'Unknown Product' && (p.calories > 0 || p.protein > 0))
    .filter(({ parsed: p, categories }) => {
      const nameWords = coreWords(p.name);
      const brandWords = coreWords(p.brand);

      // Each search word must match in the name, brand, OR category
      // e.g. "coffee" matches a product categorised as "en:coffees" even if name is "Nescafé Gold Blend"
      const allMatch = termWords.every(tw =>
        nameWords.some(nw => wordMatches(tw, nw)) ||
        brandWords.some(bw => wordMatches(tw, bw)) ||
        categories.some(cw => wordMatches(tw, cw))
      );
      if (!allMatch) return false;

      // At least one search word must match the product name OR category
      // (prevents matching random products that just happen to be by a searched brand)
      const anyNameOrCatMatch = termWords.some(tw =>
        nameWords.some(nw => wordMatches(tw, nw)) ||
        categories.some(cw => wordMatches(tw, cw))
      );
      if (!anyNameOrCatMatch) return false;

      // Soft cap: reject only products with excessively long names (compound/unrelated)
      const extraNameWords = nameWords.filter(nw =>
        !termWords.some(tw => wordMatches(tw, nw))
      );
      if (extraNameWords.length > 6) return false;

      return true;
    })
    .map(({ parsed }) => parsed)
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
      const baseFields = 'product_name,product_name_en,brands,image_small_url,image_url,serving_size,quantity,nutriments,categories_tags';
      const countryFilter = getCountryFilterParams();
      const baseUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encoded}&search_simple=1&action=process&json=1&page_size=100&lc=en&sort_by=unique_scans_n&fields=${baseFields}`;

      // Helper to merge global results into existing results
      const mergeResults = (existing, globalData) => {
        const globalResults = filterAndScore(globalData.products || [], searchWords, term);
        const seen = new Set(existing.map(r => (r.name + '|' + r.brand).toLowerCase()));
        for (const item of globalResults) {
          const key = (item.name + '|' + item.brand).toLowerCase();
          if (!seen.has(key)) {
            existing.push(item);
            seen.add(key);
          }
        }
        return existing;
      };

      // Fire both searches in parallel, collect raw API responses, merge at the end
      const localPromise = countryFilter
        ? fetch(baseUrl + countryFilter, { signal: controller.signal })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        : Promise.resolve(null);

      const globalPromise = fetch(baseUrl, { signal: controller.signal })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null);

      // Wait for both, then merge local-first and dedupe
      const [localData, globalData] = await Promise.all([localPromise, globalPromise]);

      if (!controller.signal.aborted) {
        // Start with local results (higher priority), then merge global
        let results = filterAndScore(localData?.products || [], searchWords, term);
        results = mergeResults(results, { products: globalData?.products || [] });
        results = results.slice(0, 15);
        cacheSet(term, results);
        setSearchResults(results);
        if (results.length === 0) {
          onError?.('No results found. Try a different search.', 'info');
        }
        setSearchLoading(false);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Search error:', err);
      onError?.('Search failed. Check your connection.', 'error');
      setSearchLoading(false);
    }
  }, [onError]);

  // Debounced search-as-you-type
  const startDebounceSearch = useCallback((query, enabled) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!query?.trim() || !enabled) return;
    debounceTimer.current = setTimeout(() => {
      searchFood(query);
    }, 250);
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
