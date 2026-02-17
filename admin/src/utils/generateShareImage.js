/**
 * Generates a Spotify-style share card (1080 x 1080) on a hidden canvas.
 *
 * Layout: vibrant gradient background → floating rounded card → circle-framed
 * logo → title / subtitle → stat pills or badge tags → quote → footer branding.
 *
 * @param {object} opts
 * @param {'workout'|'badge'} opts.type
 * @param {string}  opts.title
 * @param {string}  [opts.subtitle]
 * @param {Array<{value:string|number, label:string}>} [opts.stats]
 * @param {string}  [opts.quote]
 * @param {string}  [opts.userName]
 * @param {string[]} [opts.badges]
 * @returns {Promise<Blob>} PNG blob
 */
export default async function generateShareImage(opts) {
  const {
    type = 'workout',
    title = 'Workout Complete!',
    subtitle,
    stats = [],
    quote,
    userName,
    badges = [],
  } = opts;

  const W = 1080;
  const H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const isWorkout = type !== 'badge';
  const accent = isWorkout ? '#A12F3A' : '#D4A017';
  const accentLight = isWorkout ? '#c9485b' : '#ffc107';

  // ── Full-bleed gradient background ──
  const bg = ctx.createLinearGradient(0, 0, W, H);
  if (isWorkout) {
    bg.addColorStop(0, '#2d0a10');
    bg.addColorStop(0.4, '#1a0608');
    bg.addColorStop(1, '#0d0304');
  } else {
    bg.addColorStop(0, '#2a1f00');
    bg.addColorStop(0.4, '#1a1400');
    bg.addColorStop(1, '#0d0a00');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Ambient glow behind the card
  const glow = ctx.createRadialGradient(W / 2, H * 0.38, 60, W / 2, H * 0.38, W * 0.55);
  glow.addColorStop(0, isWorkout ? 'rgba(161, 47, 58, 0.25)' : 'rgba(212, 160, 23, 0.2)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ── Floating card ──
  const cardX = 60;
  const cardY = 70;
  const cardW = W - 120;
  const cardH = H - 140;
  const cardR = 40;

  // Card shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, cardX, cardY, cardW, cardH, cardR);
  ctx.fillStyle = 'rgba(20, 20, 22, 0.92)';
  ctx.fill();
  ctx.restore();

  // Card border (subtle)
  ctx.save();
  roundRect(ctx, cardX, cardY, cardW, cardH, cardR);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Accent bar at top of card
  ctx.save();
  roundRect(ctx, cardX, cardY, cardW, 5, { tl: cardR, tr: cardR, bl: 0, br: 0 });
  const barGrad = ctx.createLinearGradient(cardX, 0, cardX + cardW, 0);
  barGrad.addColorStop(0, accent);
  barGrad.addColorStop(0.5, accentLight);
  barGrad.addColorStop(1, accent);
  ctx.fillStyle = barGrad;
  ctx.fill();
  ctx.restore();

  // ── Circle-framed logo ──
  const logoRadius = 72;
  const logoCX = W / 2;
  const logoCY = cardY + 130;

  // Circle glow
  const logoGlow = ctx.createRadialGradient(logoCX, logoCY, logoRadius * 0.8, logoCX, logoCY, logoRadius * 1.8);
  logoGlow.addColorStop(0, isWorkout ? 'rgba(161, 47, 58, 0.15)' : 'rgba(212, 160, 23, 0.12)');
  logoGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = logoGlow;
  ctx.fillRect(logoCX - logoRadius * 2, logoCY - logoRadius * 2, logoRadius * 4, logoRadius * 4);

  // Circle background
  ctx.beginPath();
  ctx.arc(logoCX, logoCY, logoRadius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.fill();

  // Circle border ring
  ctx.beginPath();
  ctx.arc(logoCX, logoCY, logoRadius, 0, Math.PI * 2);
  ctx.strokeStyle = accentLight;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Outer thin ring
  ctx.beginPath();
  ctx.arc(logoCX, logoCY, logoRadius + 6, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw logo clipped to circle
  try {
    const logo = await loadImage('/Logo.webp');
    ctx.save();
    ctx.beginPath();
    ctx.arc(logoCX, logoCY, logoRadius - 4, 0, Math.PI * 2);
    ctx.clip();
    const logoDrawSize = (logoRadius - 4) * 2;
    ctx.drawImage(logo, logoCX - logoRadius + 4, logoCY - logoRadius + 4, logoDrawSize, logoDrawSize);
    ctx.restore();
  } catch {
    // Fallback: draw "MCF" text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accentLight;
    ctx.font = "bold 44px 'Montserrat', sans-serif";
    ctx.fillText('MCF', logoCX, logoCY);
  }

  // ── Title ──
  let curY = logoCY + logoRadius + 50;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = "bold 50px 'Montserrat', sans-serif";
  ctx.fillText(title.toUpperCase(), W / 2, curY);

  // ── Subtitle ──
  if (subtitle) {
    curY += 46;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = "500 28px 'Montserrat', sans-serif";
    ctx.fillText(subtitle, W / 2, curY);
  }

  // ── Stats row (pill cards) or Badge tags ──
  curY += 50;

  if (type === 'badge' && badges.length > 0) {
    // Badge tags — centered row of pills
    ctx.font = "bold 26px 'Montserrat', sans-serif";
    const tagH = 52;
    const tagPadX = 32;
    const tagGap = 14;
    // Measure total width
    const tagWidths = badges.map(b => ctx.measureText(b).width + tagPadX * 2);
    const totalTagW = tagWidths.reduce((a, w) => a + w, 0) + tagGap * (badges.length - 1);
    let tagX = (W - totalTagW) / 2;

    for (let i = 0; i < badges.length; i++) {
      const tw = tagWidths[i];
      // Pill background
      roundRect(ctx, tagX, curY, tw, tagH, tagH / 2);
      ctx.fillStyle = isWorkout ? 'rgba(161, 47, 58, 0.2)' : 'rgba(212, 160, 23, 0.15)';
      ctx.fill();
      // Pill border
      roundRect(ctx, tagX, curY, tw, tagH, tagH / 2);
      ctx.strokeStyle = isWorkout ? 'rgba(161, 47, 58, 0.5)' : 'rgba(255, 193, 7, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Text
      ctx.fillStyle = accentLight;
      ctx.font = "bold 26px 'Montserrat', sans-serif";
      ctx.fillText(badges[i], tagX + tw / 2, curY + tagH / 2 + 9);
      tagX += tw + tagGap;
    }
    curY += tagH + 20;
  } else if (stats.length > 0) {
    // Stat pills — evenly spaced
    const pillH = 90;
    const pillGap = 16;
    const pillW = Math.min(220, (cardW - 80 - pillGap * (stats.length - 1)) / stats.length);
    const totalPillW = pillW * stats.length + pillGap * (stats.length - 1);
    let pillX = (W - totalPillW) / 2;

    for (let i = 0; i < stats.length; i++) {
      // Pill background
      roundRect(ctx, pillX, curY, pillW, pillH, 18);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fill();
      // Pill border
      roundRect(ctx, pillX, curY, pillW, pillH, 18);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Value
      ctx.fillStyle = '#ffffff';
      ctx.font = "bold 44px 'Montserrat', sans-serif";
      ctx.fillText(String(stats[i].value), pillX + pillW / 2, curY + 42);

      // Label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = "600 18px 'Montserrat', sans-serif";
      ctx.fillText(stats[i].label.toUpperCase(), pillX + pillW / 2, curY + 72);

      pillX += pillW + pillGap;
    }
    curY += pillH + 10;
  }

  // ── Quote ──
  if (quote) {
    curY += 30;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.font = "italic 24px 'Montserrat', sans-serif";
    ctx.fillText(`\u201C${quote}\u201D`, W / 2, curY);
  }

  // ── Footer (bottom of card) ──
  const footY = cardY + cardH - 40;

  // Thin separator
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 60, footY - 24);
  ctx.lineTo(cardX + cardW - 60, footY - 24);
  ctx.stroke();

  // User name + brand
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.font = "600 20px 'Montserrat', sans-serif";
  const footerParts = [userName, 'Mind Core Fitness'].filter(Boolean);
  ctx.fillText(footerParts.join('  \u00B7  '), W / 2, footY);

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/png');
  });
}

/**
 * Draws a rounded rectangle path. `r` can be a number (all corners)
 * or { tl, tr, br, bl } for per-corner radii.
 */
function roundRect(ctx, x, y, w, h, r) {
  const radii = typeof r === 'number'
    ? { tl: r, tr: r, br: r, bl: r }
    : { tl: 0, tr: 0, br: 0, bl: 0, ...r };
  ctx.beginPath();
  ctx.moveTo(x + radii.tl, y);
  ctx.lineTo(x + w - radii.tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radii.tr);
  ctx.lineTo(x + w, y + h - radii.br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radii.br, y + h);
  ctx.lineTo(x + radii.bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radii.bl);
  ctx.lineTo(x, y + radii.tl);
  ctx.quadraticCurveTo(x, y, x + radii.tl, y);
  ctx.closePath();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
