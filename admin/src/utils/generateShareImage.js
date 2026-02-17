/**
 * Generates a premium Instagram Story share card (1080 x 1920, 9:16).
 *
 * Matches Spotify's clean, minimal, achievement-forward aesthetic:
 * rich gradient background with color bleeding from the hero →
 * large hero image (rounded-rect for workouts, circular for badges) →
 * bold white title → stats/description line → subtle noise texture.
 *
 * Safe zone: 250 px margin top & bottom to avoid Instagram UI overlays.
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
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const isWorkout = type !== 'badge';
  const accent = isWorkout ? [161, 47, 58] : [212, 160, 23];

  // ── Rich vertical gradient (dark top → subtly lighter bottom) ──
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  if (isWorkout) {
    bg.addColorStop(0, '#1a060a');
    bg.addColorStop(0.3, '#2d0a10');
    bg.addColorStop(0.6, '#1a0608');
    bg.addColorStop(1, '#120408');
  } else {
    bg.addColorStop(0, '#141000');
    bg.addColorStop(0.3, '#2a1f00');
    bg.addColorStop(0.6, '#1a1400');
    bg.addColorStop(1, '#110d00');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Color bleeding from hero position ──
  const heroCenter = H * 0.38;
  const glow = ctx.createRadialGradient(W / 2, heroCenter, 80, W / 2, heroCenter, W * 0.75);
  glow.addColorStop(0, `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0.30)`);
  glow.addColorStop(0.4, `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0.10)`);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ── Noise / grain texture (3% opacity for depth) ──
  addNoiseTexture(ctx, W, H, 0.03);

  // ── Core Buddy branding (upper-left, inside safe zone) ──
  const safeTop = 260;
  const brandLogoSize = 44;

  try {
    const logo = await loadImage('/Logo.webp');
    ctx.save();
    ctx.beginPath();
    ctx.arc(72 + brandLogoSize / 2, safeTop + brandLogoSize / 2, brandLogoSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, 72, safeTop, brandLogoSize, brandLogoSize);
    ctx.restore();
  } catch {
    // Skip brand icon on failure
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = "600 28px 'Montserrat', sans-serif";
  ctx.fillText('Core Buddy', 72 + brandLogoSize + 12, safeTop + brandLogoSize / 2);

  // ── Hero image ──
  // Workout → large rounded rectangle (8px radius)
  // Badge   → circular frame
  const heroSize = 680;
  const heroX = (W - heroSize) / 2;
  const heroY = heroCenter - heroSize / 2;

  // Subtle glow behind hero to float it
  const heroGlow = ctx.createRadialGradient(
    W / 2, heroCenter, heroSize * 0.25,
    W / 2, heroCenter, heroSize * 0.72,
  );
  heroGlow.addColorStop(0, `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0.22)`);
  heroGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = heroGlow;
  ctx.fillRect(0, heroY - heroSize * 0.2, W, heroSize * 1.4);

  try {
    const heroImg = await loadImage('/Logo.webp');
    ctx.save();
    if (isWorkout) {
      // Rounded-rectangle clip (8px radius per spec)
      roundRect(ctx, heroX, heroY, heroSize, heroSize, 8);
    } else {
      // Circular clip for badge hero
      ctx.beginPath();
      ctx.arc(W / 2, heroCenter, heroSize / 2, 0, Math.PI * 2);
    }
    ctx.clip();
    ctx.drawImage(heroImg, heroX, heroY, heroSize, heroSize);
    ctx.restore();
  } catch {
    // Fallback: accent-tinted shape with text
    ctx.save();
    if (isWorkout) {
      roundRect(ctx, heroX, heroY, heroSize, heroSize, 8);
    } else {
      ctx.beginPath();
      ctx.arc(W / 2, heroCenter, heroSize / 2, 0, Math.PI * 2);
    }
    ctx.fillStyle = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0.12)`;
    ctx.fill();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 120px 'Montserrat', sans-serif";
    ctx.fillText('MCF', W / 2, heroCenter);
  }

  // ── Title (bold white, centered below hero) ──
  const titleY = heroY + heroSize + 56;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = "bold 52px 'Montserrat', sans-serif";

  // Wrap title if too wide
  const titleLines = wrapText(ctx, title, W - 160);
  let curY = titleY;
  for (const line of titleLines) {
    ctx.fillText(line, W / 2, curY);
    curY += 64;
  }
  if (titleLines.length > 1) curY -= 10; // tighten after multi-line

  // ── Stats line or badge description (lighter, 70-80% opacity) ──
  curY += 10;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.font = "400 40px 'Montserrat', sans-serif";

  if (type === 'badge' && badges.length > 0) {
    const badgeLine = badges.join('  \u00B7  ');
    const badgeLines = wrapText(ctx, badgeLine, W - 140);
    for (const line of badgeLines) {
      ctx.fillText(line, W / 2, curY);
      curY += 52;
    }
  } else if (stats.length > 0) {
    const statsLine = stats.map(s => `${s.value} ${s.label}`).join('  \u00B7  ');
    ctx.fillText(statsLine, W / 2, curY);
    curY += 52;
  } else if (subtitle) {
    const subLines = wrapText(ctx, subtitle, W - 140);
    for (const line of subLines) {
      ctx.fillText(line, W / 2, curY);
      curY += 52;
    }
  }

  // ── Quote (optional) ──
  if (quote) {
    curY += 20;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
    ctx.font = "italic 30px 'Montserrat', sans-serif";
    const quoteLines = wrapText(ctx, `\u201C${quote}\u201D`, W - 180);
    for (const line of quoteLines) {
      ctx.fillText(line, W / 2, curY);
      curY += 40;
    }
  }

  // ── User name (bottom area, subtle) ──
  if (userName) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.font = "500 26px 'Montserrat', sans-serif";
    ctx.fillText(userName, W / 2, H - 310);
  }

  // ── Bottom CTA (unobtrusive) ──
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.font = "500 24px 'Montserrat', sans-serif";
  ctx.fillText('mindcorefitness.co.uk', W / 2, H - 265);

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/png');
  });
}

/**
 * Draws a rounded rectangle path.
 * `r` can be a number (all corners) or { tl, tr, br, bl }.
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

/**
 * Overlays a subtle noise/grain texture for depth.
 * Uses a half-res temp canvas drawn at the target opacity.
 */
function addNoiseTexture(ctx, w, h, opacity) {
  const scale = 2;
  const nw = Math.ceil(w / scale);
  const nh = Math.ceil(h / scale);
  const nc = document.createElement('canvas');
  nc.width = nw;
  nc.height = nh;
  const nCtx = nc.getContext('2d');
  const imageData = nCtx.createImageData(nw, nh);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.random() * 255;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  nCtx.putImageData(imageData, 0, 0);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(nc, 0, 0, nw, nh, 0, 0, w, h);
  ctx.restore();
}
