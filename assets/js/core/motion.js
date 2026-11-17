/**
 * TutorAI — motion helpers (Web Animations API, no libraries)
 * ------------------------------------------------------------------
 * Small, reusable animations. Every helper respects reduced motion
 * (the device setting or Settings → Appearance → Reduce motion): it
 * jumps straight to the end state and resolves immediately.
 *
 *   TutorAI.motion.reduced()                       → boolean
 *   TutorAI.motion.countUp(el, 92, { suffix: '%' }) → Promise (ease-out)
 *   TutorAI.motion.ring(circleEl, 92)              → Promise
 *       circle needs pathLength="100" and stroke-dasharray="100"
 *   TutorAI.motion.confetti(originEl, { count })   → Promise (pieces removed)
 *   TutorAI.motion.pop(el)                         → Promise (scale-in)
 *   TutorAI.motion.fadeIn(elements, { stagger })   → Promise
 *
 * Confetti is drawn in a fixed, pointer-events:none layer, so it never
 * scrolls the page, shifts the layout or blocks clicks.
 */
(function (T) {
  'use strict';

  const EASE_OUT = 'cubic-bezier(0.33, 1, 0.68, 1)';        // easeOutCubic
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  /** TutorAI pastels + ink black. */
  const PALETTE = ['#E9E3FA', '#FFF1B8', '#D8F0E3', '#FBE1E4', '#DCEBFB', '#18181B'];

  const reduced = () => (T.utils && T.utils.reducedMotion ? T.utils.reducedMotion() : window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const canAnimate = () => typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
  const done = (anim) => (anim && anim.finished ? anim.finished.catch(() => {}) : Promise.resolve());

  /** Count a number up from 0 (requestAnimationFrame, same easing as ring()). */
  function countUp(el, to, { duration = 1300, suffix = '', prefix = '', decimals = 0 } = {}) {
    const fmt = (v) => `${prefix}${v.toFixed(decimals)}${suffix}`;
    if (!el) return Promise.resolve();
    if (reduced()) { el.textContent = fmt(to); return Promise.resolve(); }
    return new Promise((resolve) => {
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min((now - start) / duration, 1);
        el.textContent = fmt(to * easeOut(p));
        if (p < 1) requestAnimationFrame(tick); else resolve();
      };
      el.textContent = fmt(0);
      requestAnimationFrame(tick);
    });
  }

  /** Fill an SVG progress ring (pathLength 100) from empty to `percent`. */
  function ring(circle, percent, { duration = 1300 } = {}) {
    if (!circle) return Promise.resolve();
    const end = String(100 - Math.max(0, Math.min(100, percent)));
    if (reduced() || !canAnimate()) { circle.style.strokeDashoffset = end; return Promise.resolve(); }
    circle.style.strokeDashoffset = end;                     // final state stays after the animation
    return done(circle.animate([{ strokeDashoffset: '100' }, { strokeDashoffset: end }], { duration, easing: EASE_OUT }));
  }

  /** Scale-and-fade an element in (it should already take up its space, e.g. opacity: 0). */
  function pop(el, { duration = 420, delay = 0 } = {}) {
    if (!el) return Promise.resolve();
    el.style.opacity = '1';
    if (reduced() || !canAnimate()) return Promise.resolve();
    return done(el.animate([
      { opacity: 0, transform: 'scale(0.6)' },
      { opacity: 1, transform: 'scale(1.08)', offset: 0.65 },
      { opacity: 1, transform: 'scale(1)' }
    ], { duration, delay, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'backwards' }));
  }

  /** Gentle fade-and-rise for a list of elements. */
  function fadeIn(elements, { duration = 420, stagger = 70, rise = 8 } = {}) {
    const list = Array.from(elements || []).filter(Boolean);
    if (reduced() || !canAnimate()) return Promise.resolve();
    return Promise.all(list.map((el, i) => done(el.animate(
      [{ opacity: 0, transform: `translateY(${rise}px)` }, { opacity: 1, transform: 'none' }],
      { duration, delay: i * stagger, easing: EASE_OUT, fill: 'backwards' }
    ))));
  }

  /**
   * A burst of confetti from behind `origin` (pieces start at its edge and fly
   * outwards, then fall and fade). Resolves once every piece is removed.
   *   count     number of pieces (~35)
   *   power     spread multiplier (1 = normal, 1.3 = bigger)
   *   duration  longest piece, ms (~1.6s including stagger)
   */
  function confetti(origin, { count = 35, power = 1, duration = 1450, colors = PALETTE } = {}) {
    if (!origin || reduced() || !canAnimate()) return Promise.resolve();
    const box = origin.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const startR = Math.min(box.width, box.height) * 0.35;  // from just inside the edge: "behind" the ring

    const layer = document.createElement('div');
    layer.className = 'tai-confetti';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);

    const rand = (a, b) => a + Math.random() * (b - a);
    const anims = [];
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('span');
      const w = rand(6, 10), h = Math.random() < 0.35 ? w : rand(10, 15);
      piece.className = 'tai-confetti__piece';
      piece.style.width = `${w}px`;
      piece.style.height = `${h}px`;
      piece.style.background = colors[i % colors.length];
      if (h === w) piece.style.borderRadius = '50%';
      // Light pieces need an outline to show on pale tiles
      if (colors[i % colors.length] !== '#18181B') piece.style.boxShadow = 'inset 0 0 0 1px rgba(24, 24, 27, 0.18)';
      layer.appendChild(piece);

      const angle = (i / count) * Math.PI * 2 + rand(-0.25, 0.25);
      const dist = rand(90, 190) * power;
      const x0 = cx + Math.cos(angle) * startR - w / 2;
      const y0 = cy + Math.sin(angle) * startR - h / 2;
      const x1 = x0 + Math.cos(angle) * dist;
      const y1 = y0 + Math.sin(angle) * dist - rand(20, 60) * power;   // a little lift
      const x2 = x1 + rand(-30, 30);
      const y2 = y1 + rand(70, 140);                                     // gravity
      const spin = rand(-540, 540);
      const life = rand(duration * 0.75, duration);
      anims.push(done(piece.animate([
        { transform: `translate(${x0}px, ${y0}px) rotate(0deg) scale(0.4)`, opacity: 0 },
        { transform: `translate(${x0}px, ${y0}px) rotate(0deg) scale(1)`, opacity: 1, offset: 0.05 },
        { transform: `translate(${x1}px, ${y1}px) rotate(${spin * 0.6}deg) scale(1)`, opacity: 1, offset: 0.55, easing: 'cubic-bezier(0.4, 0, 0.8, 0.6)' },
        { transform: `translate(${x2}px, ${y2}px) rotate(${spin}deg) scale(0.9)`, opacity: 0 }
      ], { duration: life, delay: rand(0, 150), easing: 'cubic-bezier(0.15, 0.7, 0.35, 1)', fill: 'both' })));
    }
    const cleanup = () => { if (layer.isConnected) layer.remove(); };
    const safety = setTimeout(cleanup, duration + 600);         // e.g. the tab was hidden mid-burst
    return Promise.all(anims).then(() => { clearTimeout(safety); cleanup(); });
  }

  T.motion = { reduced, countUp, ring, pop, fadeIn, confetti, PALETTE };
})(window.TutorAI);
