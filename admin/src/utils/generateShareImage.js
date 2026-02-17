/**
 * Generates a share card for Instagram Stories (1080 x 1920).
 *
 * Workout: dark bg → white card → big MCF logo → title → stats → CTA → slogan
 * Badge:   dark bg → white card → big badge PNG → badge name → description → CTA → slogan
 *
 * @param {object} opts
 * @param {'workout'|'badge'} opts.type
 * @param {string}  opts.title
 * @param {string}  [opts.subtitle]
 * @param {Array<{value:string|number, label:string}>} [opts.stats]
 * @param {string[]} [opts.badges]        - badge label strings
 * @param {string}   [opts.badgeImage]    - URL/path to badge PNG (used as hero for badge type)
 * @param {string}   [opts.badgeDesc]     - description of badge (why it was earned)
 * @returns {Promise<Blob>} PNG blob
 */
export default async function generateShareImage(opts) {
  const {
    type = 'workout',
    title = 'Workout Complete!',
    stats = [],
    badges = [],
    badgeImage,
    badgeDesc,
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

  // ── Layout constants ──
  const heroRadius = 220;
  const heroDiameter = heroRadius * 2;
  const gapHeroTitle = 50;
  const titleFontSize = 52;
  const titleLineHeight = 68;
  const gapTitleContent = 10;
  const contentFontSize = 36;
  const contentLineHeight = 48;
  const gapContentCta = 30;
  const ctaFontSize = 34;
  const ctaLineHeight = 46;
  const gapCtaSlogan = 30;
  const sloganFontSize = 28;

  // ── Pre-measure title ──
  ctx.font = `bold ${titleFontSize}px 'Orbitron', sans-serif`;
  const titleLines = wrapText(ctx, title.toUpperCase(), cardW - 100);

  // ── Pre-measure content (stats for workout, description for badge) ──
  ctx.font = `500 ${contentFontSize}px 'Montserrat', sans-serif`;
  let contentLines = [];
  if (type === 'badge' && badgeDesc) {
    contentLines = wrapText(ctx, badgeDesc, cardW - 120);
  } else if (type === 'badge' && badges.length > 0) {
    contentLines = wrapText(ctx, badges.join('  \u00B7  '), cardW - 120);
  } else if (stats.length > 0) {
    contentLines = wrapText(ctx, stats.map(s => `${s.value} ${s.label}`).join('  \u00B7  '), cardW - 120);
  }

  // ── Pre-measure CTA ──
  const ctaText = type === 'badge'
    ? 'I just earned a badge on Core Buddy \uD83C\uDFC6'
    : 'I just completed a workout using Core Buddy \uD83D\uDCAA\uD83C\uDFFB';
  ctx.font = `bold ${ctaFontSize}px 'Montserrat', sans-serif`;
  const ctaLines = wrapText(ctx, ctaText, cardW - 80);

  // ── Calculate text block height (everything below the logo) ──
  let textH = titleLines.length * titleLineHeight;
  if (contentLines.length > 0) {
    textH += gapTitleContent + contentLines.length * contentLineHeight;
  }
  textH += gapContentCta + ctaLines.length * ctaLineHeight;
  textH += gapCtaSlogan + sloganFontSize;

  // Place text block in lower portion of card with bottom padding
  const cardPadBottom = 60;
  const textBlockTop = cardY + cardH - cardPadBottom - textH;

  // Centre logo between top of card interior and top of text block
  const cardPadTop = 40;
  const logoZoneTop = cardY + cardPadTop;
  const logoZoneBottom = textBlockTop - gapHeroTitle;
  const heroCX = W / 2;
  const heroCY = (logoZoneTop + logoZoneBottom) / 2;

  // Determine which image to draw as hero
  const heroSrc = (type === 'badge' && badgeImage) ? badgeImage : '/Logo.webp';

  // Subtle glow behind the circle
  ctx.save();
  const glowColor = type === 'badge' ? 'rgba(255, 193, 7, 0.15)' : 'rgba(161, 47, 58, 0.12)';
  const glow = ctx.createRadialGradient(heroCX, heroCY, heroRadius * 0.6, heroCX, heroCY, heroRadius * 1.5);
  glow.addColorStop(0, glowColor);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(heroCX - heroRadius * 1.5, heroCY - heroRadius * 1.5, heroRadius * 3, heroRadius * 3);
  ctx.restore();

  // White circle background
  ctx.beginPath();
  ctx.arc(heroCX, heroCY, heroRadius + 6, 0, Math.PI * 2);
  ctx.fillStyle = CARD_WHITE;
  ctx.fill();

  // Border ring
  const ringColor = type === 'badge' ? '#ffc107' : ACCENT_RED;
  ctx.beginPath();
  ctx.arc(heroCX, heroCY, heroRadius, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 5;
  ctx.stroke();

  // Draw hero image clipped to circle
  try {
    const heroImg = await loadImage(heroSrc);
    ctx.save();
    ctx.beginPath();
    ctx.arc(heroCX, heroCY, heroRadius - 6, 0, Math.PI * 2);
    ctx.clip();
    const d = (heroRadius - 6) * 2;
    ctx.drawImage(heroImg, heroCX - heroRadius + 6, heroCY - heroRadius + 6, d, d);
    ctx.restore();
  } catch {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ACCENT_RED;
    ctx.font = "bold 80px 'Orbitron', sans-serif";
    ctx.fillText(type === 'badge' ? '\uD83C\uDFC6' : 'MCF', heroCX, heroCY);
  }

  // ── Title (Orbitron, bold, black) ──
  let curY = textBlockTop;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = TEXT_BLACK;
  ctx.font = `bold ${titleFontSize}px 'Orbitron', sans-serif`;

  for (const line of titleLines) {
    ctx.fillText(line, W / 2, curY);
    curY += titleLineHeight;
  }

  // ── Content line (stats or badge description) ──
  if (contentLines.length > 0) {
    curY += gapTitleContent;
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = `500 ${contentFontSize}px 'Montserrat', sans-serif`;
    for (const line of contentLines) {
      ctx.fillText(line, W / 2, curY);
      curY += contentLineHeight;
    }
  }

  // ── Bold CTA line ──
  curY += gapContentCta;
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
