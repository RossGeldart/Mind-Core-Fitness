/**
 * Generates a clean share card for Instagram Stories (1080 x 1920).
 *
 * Design: dark theme background → white portrait card with red accent
 * border + drop shadow → circle-framed logo → bold Orbitron title →
 * Montserrat stats line → slogan at bottom.
 *
 * @param {object} opts
 * @param {'workout'|'badge'} opts.type
 * @param {string}  opts.title
 * @param {string}  [opts.subtitle]
 * @param {Array<{value:string|number, label:string}>} [opts.stats]
 * @param {string}  [opts.quote]
 * @param {string[]} [opts.badges]
 * @returns {Promise<Blob>} PNG blob
 */
export default async function generateShareImage(opts) {
  const {
    type = 'workout',
    title = 'Workout Complete!',
    stats = [],
    badges = [],
  } = opts;

  const W = 1080;
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const DARK_BG = '#2a2a28';
  const CARD_WHITE = '#ffffff';
  const ACCENT_RED = '#A12F3A';
  const TEXT_BLACK = '#1a1a1a';
  const TEXT_MUTED = '#555555';

  // ── Dark theme background (full bleed) ──
  ctx.fillStyle = DARK_BG;
  ctx.fillRect(0, 0, W, H);

  // ── White portrait card (~82% width, ~75% height, centered) ──
  const cardW = Math.round(W * 0.82);
  const cardH = Math.round(H * 0.75);
  const cardX = Math.round((W - cardW) / 2);
  const cardY = Math.round((H - cardH) / 2);
  const cardR = 28;
  const borderWidth = 5;

  // Drop shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, cardX, cardY, cardW, cardH, cardR);
  ctx.fillStyle = CARD_WHITE;
  ctx.fill();
  ctx.restore();

  // Red accent border
  ctx.save();
  roundRect(ctx, cardX, cardY, cardW, cardH, cardR);
  ctx.strokeStyle = ACCENT_RED;
  ctx.lineWidth = borderWidth;
  ctx.stroke();
  ctx.restore();

  // ── Measure content to vertically center everything ──
  const logoRadius = 220;
  const logoDiameter = logoRadius * 2;
  const gapLogoTitle = 50;
  const titleFontSize = 52;
  const titleLineHeight = 68;
  const gapTitleStats = 10;
  const statsFontSize = 36;
  const statsLineHeight = 48;
  const gapStatsCta = 30;
  const ctaFontSize = 34;
  const ctaLineHeight = 46;
  const gapCtaSlogan = 30;
  const sloganFontSize = 28;

  // Pre-measure title lines
  ctx.font = `bold ${titleFontSize}px 'Orbitron', sans-serif`;
  const titleLines = wrapText(ctx, title.toUpperCase(), cardW - 100);

  // Pre-measure stats/badges lines
  ctx.font = `500 ${statsFontSize}px 'Montserrat', sans-serif`;
  let contentLines = [];
  if (type === 'badge' && badges.length > 0) {
    contentLines = wrapText(ctx, badges.join('  \u00B7  '), cardW - 120);
  } else if (stats.length > 0) {
    contentLines = wrapText(ctx, stats.map(s => `${s.value} ${s.label}`).join('  \u00B7  '), cardW - 120);
  }

  // Pre-measure CTA line
  const ctaText = 'I just completed a workout using Core Buddy \uD83D\uDCAA\uD83C\uDFFB';
  ctx.font = `bold ${ctaFontSize}px 'Montserrat', sans-serif`;
  const ctaLines = wrapText(ctx, ctaText, cardW - 80);

  // Calculate total content height
  let totalH = logoDiameter;
  totalH += gapLogoTitle;
  totalH += titleLines.length * titleLineHeight;
  if (contentLines.length > 0) {
    totalH += gapTitleStats + contentLines.length * statsLineHeight;
  }
  totalH += gapStatsCta + ctaLines.length * ctaLineHeight;
  totalH += gapCtaSlogan + sloganFontSize;

  // Start Y so everything is vertically centered in the card
  const cardCenterY = cardY + cardH / 2;
  let curY = cardCenterY - totalH / 2;

  // ── Hero logo (big, centered, dominates the card) ──
  const logoCX = W / 2;
  const logoCY = curY + logoRadius;

  // Subtle red glow behind the circle
  ctx.save();
  const glow = ctx.createRadialGradient(logoCX, logoCY, logoRadius * 0.6, logoCX, logoCY, logoRadius * 1.5);
  glow.addColorStop(0, 'rgba(161, 47, 58, 0.12)');
  glow.addColorStop(1, 'rgba(161, 47, 58, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(logoCX - logoRadius * 1.5, logoCY - logoRadius * 1.5, logoRadius * 3, logoRadius * 3);
  ctx.restore();

  // White circle background
  ctx.beginPath();
  ctx.arc(logoCX, logoCY, logoRadius + 6, 0, Math.PI * 2);
  ctx.fillStyle = CARD_WHITE;
  ctx.fill();

  // Red circle border (thicker to match scale)
  ctx.beginPath();
  ctx.arc(logoCX, logoCY, logoRadius, 0, Math.PI * 2);
  ctx.strokeStyle = ACCENT_RED;
  ctx.lineWidth = 5;
  ctx.stroke();

  // Draw logo clipped to circle
  try {
    const logo = await loadImage('/Logo.webp');
    ctx.save();
    ctx.beginPath();
    ctx.arc(logoCX, logoCY, logoRadius - 6, 0, Math.PI * 2);
    ctx.clip();
    const d = (logoRadius - 6) * 2;
    ctx.drawImage(logo, logoCX - logoRadius + 6, logoCY - logoRadius + 6, d, d);
    ctx.restore();
  } catch {
    // Fallback text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ACCENT_RED;
    ctx.font = "bold 80px 'Orbitron', sans-serif";
    ctx.fillText('MCF', logoCX, logoCY);
  }

  // ── Title (Orbitron, bold, black, punchy) ──
  curY = logoCY + logoRadius + gapLogoTitle;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = TEXT_BLACK;
  ctx.font = `bold ${titleFontSize}px 'Orbitron', sans-serif`;

  for (const line of titleLines) {
    ctx.fillText(line, W / 2, curY);
    curY += titleLineHeight;
  }

  // ── Stats line or badge description (Montserrat, muted) ──
  if (contentLines.length > 0) {
    curY += gapTitleStats;
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = `500 ${statsFontSize}px 'Montserrat', sans-serif`;
    for (const line of contentLines) {
      ctx.fillText(line, W / 2, curY);
      curY += statsLineHeight;
    }
  }

  // ── Bold CTA line ──
  curY += gapStatsCta;
  ctx.fillStyle = TEXT_BLACK;
  ctx.font = `bold ${ctaFontSize}px 'Montserrat', sans-serif`;
  for (const line of ctaLines) {
    ctx.fillText(line, W / 2, curY);
    curY += ctaLineHeight;
  }

  // ── Slogan ──
  curY += gapCtaSlogan;
  ctx.fillStyle = ACCENT_RED;
  ctx.font = `600 ${sloganFontSize}px 'Montserrat', sans-serif`;
  ctx.fillText('Make It Count with Core Buddy', W / 2, curY);

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/png');
  });
}

/**
 * Draws a rounded rectangle path.
 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Loads an image with CORS support. */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Wraps text to fit within maxWidth, returning an array of lines. */
function wrapText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}
