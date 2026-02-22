import './BadgeCelebration.css';

export default function BadgeCelebration({ badge, onDismiss }) {
  if (!badge) return null;

  const confetti = Array.from({ length: 60 }).map((_, i) => ({
    x: 5 + Math.random() * 90,
    delay: Math.random() * 0.5,
    color: ['#A12F3A', '#ffffff', '#000000'][i % 3],
    drift: (Math.random() - 0.5) * 120,
    spin: Math.random() * 720 - 360,
    duration: 1.6 + Math.random() * 1.8,
    width: 4 + Math.random() * 6,
    height: 4 + Math.random() * 8,
    shape: i % 3,
  }));

  return (
    <div className="bc-overlay" onClick={onDismiss}>
      {/* Confetti */}
      <div className="bc-confetti" aria-hidden="true">
        {confetti.map((c, i) => (
          <span
            key={i}
            className={`bc-confetti-piece bc-shape-${c.shape}`}
            style={{
              '--x': `${c.x}%`,
              '--delay': `${c.delay}s`,
              '--color': c.color,
              '--drift': `${c.drift}px`,
              '--spin': `${c.spin}deg`,
              '--duration': `${c.duration}s`,
              width: `${c.width}px`,
              height: `${c.height}px`,
            }}
          />
        ))}
      </div>

      <div className="bc-content" onClick={e => e.stopPropagation()}>
        <div className="bc-glow" />
        {badge.img && (
          <img src={badge.img} alt={badge.name} className="bc-badge-img" />
        )}
        <h2 className="bc-title">Badge Unlocked!</h2>
        <p className="bc-name">{badge.name}</p>
        <p className="bc-desc">{badge.desc}</p>
        <button className="bc-dismiss" onClick={onDismiss}>Tap to dismiss</button>
      </div>
    </div>
  );
}
