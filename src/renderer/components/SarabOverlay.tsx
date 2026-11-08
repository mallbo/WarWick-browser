import { useEffect, useState } from 'react';
import type { CSSProperties, FC } from 'react';

/**
 * Red Sarab (mirage) click feedback.
 *
 * The animation is an imperative one-shot effect: the caller passes the
 * origin element (the WarWick character portrait) and the destination
 * element (the AI control). A slim band of refracted haze plus an ember
 * streak travels between them, then a soft red ring lands on the target.
 * No neon, no glassy blue glow â€” only warm ember red blended with Wolf Gold.
 */

const SARAB_EVENT = 'warwick:sarab';
const SARAB_LIFETIME = 1000;

export interface SarabPoint {
  x: number;
  y: number;
}

interface SarabPayload {
  from: SarabPoint;
  to: SarabPoint;
}

interface SarabRun {
  id: number;
  from: SarabPoint;
  to: SarabPoint;
  distance: number;
  angle: number;
}

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const centerOf = (el: Element): SarabPoint => {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

/**
 * Starts the mirage if both anchors are reachable and motion is allowed.
 * Returns true when the animation actually runs, so the caller can hold the
 * resulting UI change until the streak has landed on the button.
 */
export const playSarab = (fromEl: Element | null, toEl: Element | null): boolean => {
  if (!fromEl || !toEl || prefersReducedMotion()) return false;

  const payload: SarabPayload = { from: centerOf(fromEl), to: centerOf(toEl) };
  window.dispatchEvent(new CustomEvent<SarabPayload>(SARAB_EVENT, { detail: payload }));

  toEl.classList.add('sarab-hit');
  window.setTimeout(() => toEl.classList.remove('sarab-hit'), 620);

  return true;
};

export const SarabOverlay: FC = () => {
  const [run, setRun] = useState<SarabRun | null>(null);

  useEffect(() => {
    let timer = 0;

    const handleSarab = (event: Event) => {
      const detail = (event as CustomEvent<SarabPayload>).detail;
      if (!detail) return;

      const dx = detail.to.x - detail.from.x;
      const dy = detail.to.y - detail.from.y;

      setRun({
        id: Date.now(),
        from: detail.from,
        to: detail.to,
        distance: Math.max(1, Math.hypot(dx, dy)),
        angle: (Math.atan2(dy, dx) * 180) / Math.PI
      });

      window.clearTimeout(timer);
      timer = window.setTimeout(() => setRun(null), SARAB_LIFETIME);
    };

    window.addEventListener(SARAB_EVENT, handleSarab);
    return () => {
      window.removeEventListener(SARAB_EVENT, handleSarab);
      window.clearTimeout(timer);
    };
  }, []);

  if (!run) return null;

  const { from, to, distance, angle } = run;
  const lineStyle = {
    left: from.x,
    top: from.y,
    width: distance,
    '--sarab-angle': `${angle}deg`
  } as CSSProperties;

  return (
    <div key={run.id} className="pointer-events-none fixed inset-0 z-[120] overflow-hidden" aria-hidden="true">
      {/* Refracted heat band: a genuine shimmer over the chrome. */}
      <div
        className="sarab-band"
        style={{ ...lineStyle, marginTop: -10, height: 20 }}
      />

      {/* Two smoke plumes give the streak its mirage body. */}
      <div
        className="sarab-smoke"
        style={{ ...lineStyle, marginTop: -22, height: 44 }}
      />
      <div
        className="sarab-smoke sarab-smoke--slow"
        style={{ ...lineStyle, marginTop: -33, height: 66 }}
      />

      {/* The mirage ignites on the portrait before it travels. */}
      <div className="sarab-origin" style={{ left: from.x, top: from.y }} />

      {/* Ember core and its echo. */}
      <div
        className="sarab-core"
        style={{ ...lineStyle, marginTop: -1.5, height: 3 }}
      />
      <div
        className="sarab-core sarab-core--echo"
        style={{ ...lineStyle, marginTop: -3.5, height: 7 }}
      />

      {/* Travelling sparks. */}
      <div
        className="sarab-ember"
        style={{
          left: to.x,
          top: to.y,
          '--sarab-dx': `${to.x - from.x}px`,
          '--sarab-dy': `${to.y - from.y}px`
        } as CSSProperties}
      />
      <div
        className="sarab-ember sarab-ember--late"
        style={{
          left: to.x,
          top: to.y,
          '--sarab-dx': `${to.x - from.x}px`,
          '--sarab-dy': `${to.y - from.y}px`
        } as CSSProperties}
      />

      {/* Landing ring and warm flare on the control. */}
      <div className="sarab-impact" style={{ left: to.x, top: to.y }} />
      <div className="sarab-flare" style={{ left: to.x, top: to.y }} />
    </div>
  );
};

export default SarabOverlay;
