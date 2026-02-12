/**
 * Pre-computed tick mark geometry for SVG rings.
 * Each entry holds { x1, y1, x2, y2, thick } for a single tick.
 * Computed once at module load — never recalculated on render.
 */
function buildTicks(count, cx, cy, innerR, outerR) {
  const ticks = [];
  for (let i = 0; i < count; i++) {
    const angle = (i * (360 / count) - 90) * (Math.PI / 180);
    ticks.push({
      x1: cx + innerR * Math.cos(angle),
      y1: cy + innerR * Math.sin(angle),
      x2: cx + outerR * Math.cos(angle),
      y2: cy + outerR * Math.sin(angle),
      thick: i % 5 === 0,
    });
  }
  return ticks;
}

// Large rings (viewBox 200x200)
export const TICKS_85_96  = buildTicks(60, 100, 100, 85, 96);
export const TICKS_78_94  = buildTicks(60, 100, 100, 78, 94);
export const TICKS_82_94  = buildTicks(60, 100, 100, 82, 94);

// Small rings (viewBox 100x100)
export const TICKS_MINI   = buildTicks(60, 50, 50, 38, 46);

// Tiny rings (viewBox 80x80)
export const TICKS_TINY   = buildTicks(60, 40, 40, 30, 37);
