import { COLORS } from './domain';

/** A short burst of confetti from a point on screen. Skipped when the viewer prefers less motion. */
export function confetti(x: number, y: number) {
  try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch { /* old webview */ }
  const c = document.createElement('canvas');
  c.className = 'confetti';
  document.body.appendChild(c);
  const dpr = window.devicePixelRatio || 1, W = innerWidth, H = innerHeight;
  c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d');
  if (!g) { c.remove(); return; }
  g.scale(dpr, dpr);
  const cs = getComputedStyle(document.documentElement);
  const cols = COLORS.map(k => cs.getPropertyValue(`--c-${k}-fg`).trim() || '#ff6a45');
  const P = Array.from({ length: 80 }, () => ({
    x, y, vx: (Math.random() - 0.5) * 11, vy: -Math.random() * 10 - 4, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    w: 6 + Math.random() * 7, h: 4 + Math.random() * 4, c: cols[(Math.random() * cols.length) | 0], round: Math.random() < 0.35,
  }));
  const t0 = performance.now();
  const frame = (t: number) => {
    const k = (t - t0) / 1500;
    g.clearRect(0, 0, W, H);
    for (const p of P) {
      p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.globalAlpha = Math.max(0, 1 - k * k); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
      if (p.round) { g.beginPath(); g.arc(0, 0, p.h * 0.7, 0, 7); g.fill(); } else g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      g.restore();
    }
    if (k < 1) requestAnimationFrame(frame); else c.remove();
  };
  requestAnimationFrame(frame);
}
