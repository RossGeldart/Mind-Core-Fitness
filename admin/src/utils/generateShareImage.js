/**
 * Generates a share-ready image (1080 x 1080) on a hidden canvas.
 *
 * @param {object} opts
 * @param {'workout'|'badge'} opts.type
 * @param {string}  opts.title        — e.g. "Arms Complete!"
 * @param {string}  [opts.subtitle]   — e.g. "Session 2 — Push Focus"
 * @param {Array<{value:string|number, label:string}>} [opts.stats]
 * @param {string}  [opts.quote]      — motivational line
 * @param {string}  [opts.userName]   — e.g. "Ross G."
 * @param {string[]} [opts.badges]    — badge label strings (for badge type)
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

  // ── Background ──
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1a1a1a');
  bg.addColorStop(0.5, '#111111');
  bg.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle radial glow
  const glow = ctx.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.35, W * 0.5);
  glow.addColorStop(0, type === 'badge' ? 'rgba(255, 193, 7, 0.08)' : 'rgba(161, 47, 58, 0.1)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ── Load logo ──
  let logoY = 100;
  try {
    const logo = await loadImage('/Logo.webp');
    const logoSize = 140;
    ctx.drawImage(logo, (W - logoSize) / 2, logoY, logoSize, logoSize);
    logoY += logoSize + 40;
  } catch {
    logoY += 60;
  }

  // ── Title ──
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = "bold 56px 'Montserrat', sans-serif";
  ctx.fillText(title.toUpperCase(), W / 2, logoY + 20);

  // ── Subtitle ──
  let curY = logoY + 20;
  if (subtitle) {
    curY += 54;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = "500 30px 'Montserrat', sans-serif";
    ctx.fillText(subtitle, W / 2, curY);
  }

  // ── Divider ──
  curY += 50;
  const divW = 60;
  ctx.strokeStyle = type === 'badge' ? '#ffc107' : '#A12F3A';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2 - divW, curY);
  ctx.lineTo(W / 2 + divW, curY);
  ctx.stroke();

  // ── Stats or Badges ──
  curY += 55;
  if (type === 'badge' && badges.length > 0) {
    // Badge list
    ctx.font = "bold 34px 'Montserrat', sans-serif";
    ctx.fillStyle = '#ffc107';
    for (const badge of badges) {
      ctx.fillText(badge, W / 2, curY);
      curY += 50;
    }
  } else if (stats.length > 0) {
    // Stats row
    const statW = Math.min(240, (W - 120) / stats.length);
    const totalW = statW * stats.length;
    const startX = (W - totalW) / 2 + statW / 2;

    for (let i = 0; i < stats.length; i++) {
      const sx = startX + i * statW;
      // Value
      ctx.fillStyle = '#ffffff';
      ctx.font = "bold 64px 'Montserrat', sans-serif";
      ctx.fillText(String(stats[i].value), sx, curY);
      // Label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = "600 22px 'Montserrat', sans-serif";
      ctx.fillText(stats[i].label, sx, curY + 34);
    }
    curY += 80;
  }

  // ── Quote ──
  if (quote) {
    curY += 40;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.font = "italic 26px 'Montserrat', sans-serif";
    ctx.fillText(`"${quote}"`, W / 2, curY);
  }

  // ── Footer ──
  const footY = H - 60;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.font = "600 22px 'Montserrat', sans-serif";
  const footerParts = [userName, 'Mind Core Fitness'].filter(Boolean);
  ctx.fillText(footerParts.join('  ·  '), W / 2, footY);

  // ── Border accent line at top ──
  ctx.fillStyle = type === 'badge' ? '#ffc107' : '#A12F3A';
  ctx.fillRect(0, 0, W, 4);

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/png');
  });
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
