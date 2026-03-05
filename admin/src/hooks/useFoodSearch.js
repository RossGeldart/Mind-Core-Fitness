import { useState, useRef, useCallback, useEffect } from 'react';
import { parseProduct } from '../utils/productParser';

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

// ==================== RELEVANCE SCORING ====================
const scoreRelevance = (name, brand, term) => {
  const n = name.toLowerCase().trim();
  const b = brand.toLowerCase().trim();
  const t = term.toLowerCase().trim();
  let score = 0;
  if (n === t || n === t + 's' || n + 's' === t) score += 100;
  if (n.endsWith(' ' + t) || n.endsWith(' ' + t + 's')) score += 40;
  if (n.startsWith(t + ' ') || n.startsWith(t + 's ')) score += 15;
  const words = t.split(/\s+/);
  if (words.some(w => b === w || b.startsWith(w))) score += 30;
  score += Math.max(0, 30 - n.length);
  return score;
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
      const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encoded}&search_simple=1&action=process&json=1&page_size=10&lc=en&sort_by=unique_scans_n&fields=product_name,product_name_en,brands,image_small_url,image_url,serving_size,quantity,nutriments`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const results = (data.products || [])
        .map(p => parseProduct(p))
        .filter(p => p.name !== 'Unknown Product' && (p.calories > 0 || p.protein > 0))
        .filter(p => {
          const combined = (p.name + ' ' + p.brand).toLowerCase();
          return searchWords.every(w => combined.includes(w));
        })
        .sort((a, b) => scoreRelevance(b.name, b.brand, term) - scoreRelevance(a.name, a.brand, term))
        .slice(0, 10);
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
    }, 700);
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
