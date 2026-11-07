import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { cx } from '../../lib/utils';
import { TOUR_STEPS, type TourTab } from './tourSteps';

const DONE_KEY = 'jampod.tourDone.v1';

export const hasSeenTour = (): boolean => {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
};

const markTourSeen = () => {
  try {
    localStorage.setItem(DONE_KEY, '1');
  } catch {
    /* storage unavailable: the tour simply shows again next time */
  }
};

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface OnboardingTourProps {
  open: boolean;
  currentTab: TourTab;
  onTab: (tab: TourTab) => void;
  onClose: () => void;
}

const PAD = 8;
const GAP = 14;
const EDGE = 16;

/**
 * First-run spotlight walkthrough. Each step switches to the right module,
 * scrolls its target into view, cuts a lit "hole" in a dimmed overlay around
 * it, and anchors an explainer card beside it.
 */
export function OnboardingTour({ open, currentTab, onTab, onClose }: OnboardingTourProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(240);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const step = TOUR_STEPS[index];
  const isFirst = index === 0;
  const isLast = index === TOUR_STEPS.length - 1;

  const finish = useCallback(() => {
    markTourSeen();
    setIndex(0);
    onClose();
  }, [onClose]);

  const go = useCallback((dir: 1 | -1) => setIndex((i) => Math.min(TOUR_STEPS.length - 1, Math.max(0, i + dir))), []);

  /* switch to the step's module tab */
  useEffect(() => {
    if (open && step.tab && step.tab !== currentTab) onTab(step.tab);
  }, [open, step, currentTab, onTab]);

  /* find target (it may mount a frame or two after a tab switch), scroll it in, then track it */
  useEffect(() => {
    if (!open) return;
    if (!step.target) {
      setRect(null);
      return;
    }
    let raf = 0;
    let tries = 0;
    let scrolled = false;
    let last = '';

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = document.querySelector<HTMLElement | SVGElement>(`[data-tour="${step.target}"]`);
      if (!el) {
        if (++tries > 90) setRect(null); // give up after ~1.5s: fall back to a centered card
        return;
      }
      if (!scrolled) {
        scrolled = true;
        const r = el.getBoundingClientRect();
        el.scrollIntoView({ block: r.height > window.innerHeight * 0.55 ? 'start' : 'center', behavior: 'smooth' });
      }
      const r = el.getBoundingClientRect();
      const key = `${Math.round(r.top)}|${Math.round(r.left)}|${Math.round(r.width)}|${Math.round(r.height)}`;
      if (key !== last) {
        last = key;
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, step]);

  /* viewport + card size for placement */
  useEffect(() => {
    if (!open) return;
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [index, open, viewport.w]);

  /* keyboard: ← → Esc, and keep focus on the primary button */
  useEffect(() => {
    if (!open) return;
    nextRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight') isLast ? finish() : go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, index, isLast, go, finish]);

  if (!open) return null;

  /* ---------- placement ---------- */
  const cardW = Math.min(400, viewport.w - EDGE * 2);
  let cardStyle: CSSProperties;
  const spot = rect
    ? {
        top: Math.max(4, rect.top - PAD),
        left: Math.max(4, rect.left - PAD),
        width: Math.min(viewport.w - 8, rect.width + PAD * 2),
        height: Math.min(viewport.h - Math.max(4, rect.top - PAD) - 4, rect.height + PAD * 2),
      }
    : null;

  if (spot) {
    const below = viewport.h - (spot.top + spot.height);
    const above = spot.top;
    const right = viewport.w - (spot.left + spot.width);
    const left = Math.min(Math.max(EDGE, spot.left + spot.width / 2 - cardW / 2), viewport.w - cardW - EDGE);
    if (below >= cardH + GAP + EDGE) cardStyle = { top: spot.top + spot.height + GAP, left };
    else if (above >= cardH + GAP + EDGE) cardStyle = { top: spot.top - GAP - cardH, left };
    else if (right >= cardW + GAP + EDGE)
      cardStyle = { top: Math.min(Math.max(EDGE, spot.top), viewport.h - cardH - EDGE), left: spot.left + spot.width + GAP };
    else if (spot.left >= cardW + GAP + EDGE)
      cardStyle = { top: Math.min(Math.max(EDGE, spot.top), viewport.h - cardH - EDGE), left: spot.left - GAP - cardW };
    else cardStyle = { top: viewport.h - cardH - EDGE, left }; // big target: dock to the bottom, over it
  } else {
    cardStyle = { top: Math.max(EDGE, (viewport.h - cardH) / 2), left: (viewport.w - cardW) / 2 };
  }

  const progress = ((index + 1) / TOUR_STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
      {/* click-catcher keeps the app inert during the tour */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {spot ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-2xl ring-2 ring-accent transition-all duration-300 ease-out"
          style={{ ...spot, boxShadow: '0 0 0 9999px rgba(10, 8, 14, 0.66), 0 0 28px 4px var(--jp-accent-soft)' }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-[rgba(10,8,14,0.66)] backdrop-blur-[2px]" />
      )}

      <div
        ref={cardRef}
        key={step.id}
        className="jp-card jp-fade-up absolute flex flex-col p-5 transition-[top,left] duration-300 ease-out"
        style={{ ...cardStyle, width: cardW }}
      >
        {step.id === 'welcome' && <img src="/jampod-logo.webp" alt="" className="mb-3 size-16 rounded-2xl shadow-studio" />}

        <p className="jp-label">{step.chapter}</p>
        <h2 id="tour-title" className="mt-1 font-display text-xl font-bold">
          {step.title}
        </h2>
        <div id="tour-body" className="mt-2 space-y-1.5 text-sm leading-relaxed">
          {step.body.split('\n').map((line, i) => (line.trim() ? <p key={i}>{line}</p> : <div key={i} className="h-1" />))}
        </div>
        {step.tryIt && (
          <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-xs leading-relaxed">
            <span className="font-extrabold text-accent">Tip · </span>
            {step.tryIt}
          </p>
        )}

        <div className="mt-4 h-1 overflow-hidden rounded-full bg-panel" aria-hidden>
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="font-mono text-[11px] text-muted" aria-live="polite">
            {index + 1} / {TOUR_STEPS.length}
          </span>
          {!isLast && (
            <button onClick={finish} className="ml-1 text-xs font-bold text-muted hover:text-ink">
              Skip tour
            </button>
          )}
          <div className="ml-auto flex gap-2">
            {!isFirst && (
              <button onClick={() => go(-1)} className="jp-btn">
                ← Back
              </button>
            )}
            <button ref={nextRef} onClick={() => (isLast ? finish() : go(1))} className={cx('jp-btn-accent', isFirst && 'px-4')}>
              {isFirst ? 'Show me around →' : isLast ? 'Start jamming 🎸' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
