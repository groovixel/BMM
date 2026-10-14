import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Minus, Plus, Star, X } from "lucide-react";
import { startSmoothScroll, stopSmoothScroll } from "@/lib/smoothScroll";
import { fromISO, isNightBlocked, toISO, todayISO } from "./data";

export function useLockScroll(active) {
  useEffect(() => {
    if (!active) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    stopSmoothScroll();
    return () => { document.body.style.overflow = prev; startSmoothScroll(); };
  }, [active]);
}

export function useOutside(ref, onOutside, active) {
  useEffect(() => {
    if (!active) return undefined;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onOutside(); };
    const onKey = (e) => { if (e.key === "Escape") onOutside(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", onKey); };
  }, [ref, onOutside, active]);
}

// Modal: centred dialog on desktop, bottom sheet / full screen on mobile
export function Modal({ open, onClose, title, children, footer, testId, size = "md", full = false }) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useLockScroll(open);
  useEffect(() => {
    if (!open) return undefined;
    const last = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key === "Tab" && panelRef.current) {
        const nodes = panelRef.current.querySelectorAll("button:not([disabled]),a[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex='-1'])");
        if (!nodes.length) return;
        const first = nodes[0], end = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
        else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    window.setTimeout(() => panelRef.current?.querySelector("[data-autofocus],button,input")?.focus(), 60);
    return () => { window.removeEventListener("keydown", onKey); last?.focus?.(); };
  }, [open]);
  return createPortal(<AnimatePresence>{open && <motion.div className="sx-modal" role="dialog" aria-modal="true" aria-label={title} data-testid={testId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
    <button className="sx-modal__scrim" aria-label="Close" onClick={onClose} tabIndex={-1} />
    <motion.div ref={panelRef} className={`sx-modal__panel sx-modal__panel--${size} ${full ? "sx-modal__panel--full" : ""}`} initial={{ y: 40, opacity: 0.6 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}>
      <div className="sx-modal__head"><button type="button" className="sx-icon-btn" onClick={onClose} aria-label="Close" data-testid={`${testId}-close`}><X size={18} /></button><h2>{title}</h2><span /></div>
      <div className="sx-modal__body" data-lenis-prevent>{children}</div>
      {footer && <div className="sx-modal__foot">{footer}</div>}
    </motion.div>
  </motion.div>}</AnimatePresence>, document.body);
}

const WEEK = ["S", "M", "T", "W", "T", "F", "S"];
function monthDays(year, month) {
  const first = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  return [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => toISO(new Date(year, month, i + 1)))];
}

// Range calendar: booked = confirmed ranges [{check_in, check_out}] (check-out day stays free)
export function RangeCalendar({ checkIn, checkOut, onChange, booked = [], months = 2, minNights = 1, availabilityReady = true, testId = "calendar" }) {
  const today = todayISO();
  const start = fromISO(checkIn || today);
  const [cursor, setCursor] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const nowMonth = new Date();
  const canPrev = cursor.y > nowMonth.getFullYear() || cursor.m > nowMonth.getMonth();
  const maxEnd = useMemo(() => {
    if (!checkIn || checkOut) return null;
    const next = booked.map((b) => b.check_in).filter((d) => d > checkIn).sort()[0];
    return next || null;
  }, [checkIn, checkOut, booked]);
  const pick = (day) => {
    if (!checkIn || checkOut || day <= checkIn) { onChange({ checkIn: day, checkOut: "" }); return; }
    onChange({ checkIn, checkOut: day });
  };
  const disabled = (day) => {
    if (day < today) return true;
    // Don't show unknown availability as bookable or let booked nights be selected.
    if (!availabilityReady || isNightBlocked(day, booked)) return true;
    const choosingEnd = checkIn && !checkOut;
    if (choosingEnd && day > checkIn) {
      if (maxEnd && day > maxEnd) return true;
      const nights = Math.round((fromISO(day) - fromISO(checkIn)) / 86400000);
      return nights < minNights;
    }
    return false;
  };
  const shift = (n) => setCursor(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  return <div className="sx-cal" data-testid={testId}>
    <div className="sx-cal__months" style={{ gridTemplateColumns: `repeat(${months}, 1fr)` }}>
      {Array.from({ length: months }, (_, k) => {
        const d = new Date(cursor.y, cursor.m + k, 1);
        return <div className="sx-cal__month" key={k}>
          <div className="sx-cal__month-head">
            {k === 0 && <button type="button" className="sx-icon-btn" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Previous month" data-testid={`${testId}-prev`}><ChevronLeft size={16} /></button>}
            <h4>{d.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h4>
            {k === months - 1 && <button type="button" className="sx-icon-btn" onClick={() => shift(1)} aria-label="Next month" data-testid={`${testId}-next`}><ChevronRight size={16} /></button>}
          </div>
          <div className="sx-cal__grid" role="grid">
            {WEEK.map((w, i) => <span className="sx-cal__wd" key={i}>{w}</span>)}
            {monthDays(d.getFullYear(), d.getMonth()).map((day, i) => {
              if (!day) return <span key={`e${i}`} />;
              const off = disabled(day);
              const blocked = isNightBlocked(day, booked) && day >= today;
              const unavailable = day < today || blocked || !availabilityReady;
              const edge = day === checkIn || day === checkOut;
              const inRange = checkIn && checkOut && day > checkIn && day < checkOut;
              return <button type="button" key={day} disabled={off} onClick={() => pick(day)} aria-pressed={edge} aria-label={`${fromISO(day).toDateString()}${unavailable ? " unavailable" : " available"}`}
                className={`sx-cal__day ${edge ? "is-edge" : ""} ${inRange ? "is-range" : ""} ${day === checkIn && checkOut ? "is-start" : ""} ${day === checkOut ? "is-end" : ""} ${blocked ? "is-blocked" : ""} ${unavailable ? "is-unavailable" : "is-available"}`} data-testid={`${testId}-day-${day}`}>
                <span>{Number(day.slice(8))}</span>
              </button>;
            })}
          </div>
        </div>;
      })}
    </div>
  </div>;
}

const GUEST_ROWS = [["adults", "Adults", "Ages 13 or above"], ["children", "Children", "Ages 2–12"], ["infants", "Infants", "Under 2"], ["pets", "Pets", "Host confirms on request"]];
export function GuestCounters({ value, onChange, capacity = 16, testId = "guests" }) {
  const total = (value.adults || 0) + (value.children || 0);
  const limit = { adults: capacity, children: capacity, infants: 5, pets: 2 };
  const set = (key, n) => {
    const next = { ...value, [key]: n };
    if ((key === "children" || key === "infants" || key === "pets") && n > 0 && !next.adults) next.adults = 1;
    onChange(next);
  };
  return <div className="sx-guests" data-testid={testId}>
    {GUEST_ROWS.map(([key, label, hint]) => {
      const n = value[key] || 0;
      const capped = (key === "adults" || key === "children") ? total >= capacity : n >= limit[key];
      const minimum = key === "adults" && (value.children || value.infants || value.pets) ? 1 : 0;
      return <div className="sx-guests__row" key={key}>
        <div><strong>{label}</strong><span>{hint}</span></div>
        <div className="sx-stepper">
          <button type="button" onClick={() => set(key, n - 1)} disabled={n <= minimum} aria-label={`Decrease ${label}`} data-testid={`${testId}-${key}-minus`}><Minus size={14} /></button>
          <output aria-live="polite" data-testid={`${testId}-${key}-count`}>{n}</output>
          <button type="button" onClick={() => set(key, n + 1)} disabled={capped} aria-label={`Increase ${label}`} data-testid={`${testId}-${key}-plus`}><Plus size={14} /></button>
        </div>
      </div>;
    })}
    {capacity < 16 && <p className="sx-note">This place has a maximum of {capacity} guests, not including infants.</p>}
  </div>;
}

export const Rating = () => null;

export const Skeleton = ({ className = "" }) => <div className={`sx-skel ${className}`} aria-hidden="true" />;
