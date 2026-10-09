import Lenis from "lenis";
import Snap from "lenis/snap";

let lenis = null;
let snap = null;

// Idempotent — safe to call from any component effect; child effects run before parent ones
export function initSmoothScroll() {
  if (lenis) return { lenis, snap };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Mobile/small viewports: plain native scrolling — no smooth-scroll loop, no panel
  // snap (the "sticky" card behaviour is a desktop-only experience). This also removes
  // the per-frame Lenis work that made mobile scroll feel laggy.
  if (reduced || window.matchMedia("(max-width: 900px)").matches) return { lenis: null, snap: null };
  // Clearly-sideways gestures over [data-hscroll] rows scroll the row natively; everything else scrolls the page.
  const virtualScroll = ({ deltaX, deltaY, event }) => !(Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && event.target?.closest?.("[data-hscroll]"));
  lenis = new Lenis({ lerp: 0.1, smoothWheel: true, virtualScroll });
  snap = new Snap(lenis, { type: "proximity", duration: 1, debounce: 250 });
  const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  window.__smoothScroll = { lenis, snap };
  return { lenis, snap };
}

export function stopSmoothScroll() { if (lenis) lenis.stop(); }
export function startSmoothScroll() { if (lenis) lenis.start(); }

export function smoothScrollTo(target, options = {}) {
  if (lenis) {
    const { onComplete, ...rest } = options;
    // Stop snap during programmatic glides: a queued proximity snap (from the last
    // wheel/touch flick) would otherwise hijack the animation and land on the
    // nearest panel instead of the requested target (e.g. "To the Top" -> footer).
    if (snap) snap.stop();
    lenis.scrollTo(target == null ? 0 : target, {
      duration: 1.2,
      lock: true,
      ...rest,
      onComplete: (...args) => {
        if (snap) snap.start();
        if (onComplete) onComplete(...args);
      },
    });
    return;
  }
  if (target == null) return;
  const behavior = options.immediate ? "instant" : "smooth";
  if (typeof target === "number") window.scrollTo({ top: target, left: 0, behavior });
  else target.scrollIntoView({ behavior, block: "start" });
}
