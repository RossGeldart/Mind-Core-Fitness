export default function ProductResult({
  product,
  servingMode,
  setServingMode,
  servingInput,
  setServingInput,
  portionCount,
  setPortionCount,
  isFavourite,
  onToggleFavourite,
  onAdd,
  onBack,
  backLabel,
}) {
  const u = product.servingUnit || 'g';
  const por = product.portion;
  const effectiveWeight = servingMode === 'portion' && por ? portionCount * por.weight : (parseFloat(servingInput) || 0);
  const mult = effectiveWeight / 100;
  const quickAmounts = u === 'ml' ? [100, 200, 250, 500] : [50, 100, 150, 200];
  const servingLabel = servingMode === 'portion' && por
    ? `${portionCount} ${por.label}${portionCount !== 1 ? 's' : ''} (${Math.round(effectiveWeight)}${u})`
    : `${Math.round(effectiveWeight)}${u}`;

  return (
    <div className="nut-product-result">
      {product.image && <img src={product.image} alt={product.name || 'Product'} className="nut-product-img" loading="lazy" />}
      <div className="nut-product-name-row">
        <h4>{product.name}</h4>
        <button className={`nut-fav-star confirm${isFavourite ? ' active' : ''}`}
          onClick={() => onToggleFavourite({
            name: product.name,
            protein: product.protein,
            calories: product.calories,
            serving: product.servingSize,
            per100g: { protein: product.protein, calories: product.calories },
            servingUnit: product.servingUnit || 'g',
            portion: product.portion || null,
          })}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill={isFavourite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </button>
      </div>
      {product.brand && <p className="nut-product-brand">{product.brand}</p>}
      <p className="nut-product-per">Per 100{u}:</p>
      <div className="nut-product-macros">
        <span className="nut-macro-p">{product.protein}g P</span>
        <span className="nut-macro-cal">{product.calories} cal</span>
      </div>
      {por && (
        <div className="nut-mode-toggle">
          <button className={servingMode === 'portion' ? 'active' : ''} onClick={() => { setServingMode('portion'); if (portionCount < 1) setPortionCount(1); }}>Portions</button>
          <button className={servingMode === 'weight' ? 'active' : ''} onClick={() => { setServingMode('weight'); setServingInput(String(Math.round(effectiveWeight) || 100)); }}>Custom ({u})</button>
        </div>
      )}
      {servingMode === 'portion' && por ? (
        <div className="nut-portion-stepper">
          <button className="nut-stepper-btn" onClick={() => setPortionCount(Math.max(1, portionCount - 1))}>-</button>
          <div className="nut-stepper-display">
            <span className="nut-stepper-count">{portionCount}</span>
            <span className="nut-stepper-label">{por.label}{portionCount !== 1 ? 's' : ''}</span>
            <span className="nut-stepper-weight">{Math.round(effectiveWeight)}{u}</span>
          </div>
          <button className="nut-stepper-btn" onClick={() => setPortionCount(portionCount + 1)}>+</button>
        </div>
      ) : (
        <>
          <div className="nut-serving-adjust">
            <label>Serving ({u})</label>
            <input type="number" inputMode="numeric" value={servingInput} onChange={e => setServingInput(e.target.value)} onFocus={e => e.target.select()} min="0" />
          </div>
          <div className="nut-quick-amounts">
            {quickAmounts.map(amt => (
              <button key={amt} className={`nut-quick-btn${servingInput === String(amt) ? ' active' : ''}`} onClick={() => setServingInput(String(amt))}>{amt}{u}</button>
            ))}
          </div>
        </>
      )}
      <div className="nut-product-total">
        <span>Total: {Math.round(product.protein * mult)}p / {Math.round(product.calories * mult)} cal</span>
      </div>
      <div className="nut-product-actions">
        <button className="nut-btn-secondary" onClick={onBack}>{backLabel}</button>
        <button className="nut-btn-primary" onClick={() => onAdd({
          name: product.name,
          protein: Math.round(product.protein * mult),
          calories: Math.round(product.calories * mult),
          serving: servingLabel,
          per100g: { protein: product.protein, calories: product.calories },
          servingUnit: product.servingUnit || 'g',
          portion: product.portion || null,
          brand: product.brand || '',
          image: product.image || null,
        })}>{product._editEntryId ? 'Save' : 'Add'}</button>
      </div>
    </div>
  );
}
