// ==================== LIQUID & UNIT DETECTION ====================

const LIQUID_KEYWORDS = /\b(milk|semi.skimmed|skimmed|whole milk|oat milk|almond milk|soy milk|juice|smoothie|water|squash|cordial|cola|pepsi|fanta|lemonade|soda|beer|wine|cider|lager|spirit|whisky|vodka|rum|gin|brandy|cream|yoghurt drink|milkshake|coffee|tea|broth|stock|soup|sauce|ketchup|vinegar|oil|syrup|honey|custard|coconut water|kombucha|energy drink|protein shake)\b/i;

const hasLiquidSignal = (str) => /ml|cl|\dl(?!b)|litre|liter|fl\s?oz/i.test((str || '').replace(/\s/g, ''));

export const parseServingValue = (raw) => {
  if (!raw) return { value: 100, unit: 'g' };
  const str = raw.toLowerCase().replace(/\s/g, '');
  const numMatch = str.match(/([\d.]+)/);
  const value = numMatch ? parseFloat(numMatch[1]) : 100;
  if (hasLiquidSignal(raw)) {
    if (/cl/.test(str)) return { value: value * 10, unit: 'ml' };
    if (/(?:^|\d)l(?!i)/.test(str) && !/ml/.test(str)) return { value: value * 1000, unit: 'ml' };
    return { value, unit: 'ml' };
  }
  return { value, unit: 'g' };
};

export const detectUnit = (p) => {
  if (hasLiquidSignal(p.serving_size)) return 'ml';
  if (hasLiquidSignal(p.quantity)) return 'ml';
  const name = (p.product_name || p.product_name_en || '');
  if (LIQUID_KEYWORDS.test(name)) return 'ml';
  return 'g';
};

// ==================== PORTION PARSING ====================

const COMMON_PORTIONS = [
  { pattern: /\b(toast|bread|loaf|brioche|bagel|pitta|wrap|tortilla|crumpet|muffin|waffle|pancake)\b/i, label: 'slice', weight: 36 },
  { pattern: /\begg\b/i, label: 'egg', weight: 60 },
  { pattern: /\b(biscuit|cookie|digestive|hobnob|rich tea|oreo)\b/i, label: 'biscuit', weight: 13 },
  { pattern: /\b(sausage|banger)\b/i, label: 'sausage', weight: 57 },
  { pattern: /\b(rasher|bacon)\b/i, label: 'rasher', weight: 25 },
  { pattern: /\b(rice cake)\b/i, label: 'cake', weight: 9 },
  { pattern: /\b(cracker|ryvita)\b/i, label: 'cracker', weight: 10 },
];

export const parsePortion = (servingSize, productName) => {
  const raw = servingSize || '';
  const parenMatch = raw.match(/\((\d+\.?\d*)\s*g\)/i);
  const labelMatch = raw.match(/(?:^|per\s+)(\d*\s*[a-z][a-z\s]*?)(?:\s*\(|\s*-\s*|\s*$)/i);
  if (parenMatch && labelMatch) {
    const weight = parseFloat(parenMatch[1]);
    let label = labelMatch[1].replace(/^\d+\s*/, '').trim();
    if (label && weight > 0) return { label, weight };
  }
  const altMatch = raw.match(/(\d+\.?\d*)\s*g\s*[\/=]\s*(\d*\s*[a-z][a-z\s]*)/i);
  if (altMatch) {
    const weight = parseFloat(altMatch[1]);
    let label = altMatch[2].replace(/^\d+\s*/, '').trim();
    if (label && weight > 0) return { label, weight };
  }
  const name = productName || '';
  for (const { pattern, label, weight } of COMMON_PORTIONS) {
    if (pattern.test(name)) return { label, weight };
  }
  return null;
};

// ==================== PRODUCT PARSING ====================

export const parseProduct = (p) => {
  const n = p.nutriments || {};
  const unit = detectUnit(p);
  const serving = parseServingValue(p.serving_size);
  const servingValue = unit === 'ml' ? (serving.unit === 'ml' ? serving.value : 100) : serving.value;
  const name = p.product_name || p.product_name_en || 'Unknown Product';
  const portion = parsePortion(p.serving_size, name);
  return {
    name,
    brand: p.brands || '',
    image: p.image_small_url || p.image_url || null,
    servingSize: p.serving_size || '100g',
    servingValue,
    servingUnit: unit,
    portion,
    protein: Math.round(n.proteins_100g || n.proteins || 0),
    calories: Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || (n['energy_100g'] ? n['energy_100g'] / 4.184 : 0)),
    per100g: true
  };
};
