import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { SlidersHorizontal, X } from "lucide-react";
import { distanceKm, fromISO, getStays, getTiers, img, inr, nightsBetween, rangeFree, toISO } from "./data";
import { useAvailability, useIsMobile, useStays } from "./store";
import { SearchBar } from "./SearchBar";
import { ListingCard, priceLine } from "./Listing";
import { StaysMap } from "./StaysMap";
import { Modal, Rating, Skeleton } from "./ui";
import { usePageTitle } from "./usePageTitle";

const AMENITY_CHIPS = ["Self check-in", "Breakfast", "Kitchen", "Pool", "Chef", "Walkthrough"];
const TYPES = ["Villa", "Pavilion", "Penthouse", "Loft", "Apartment", "Room"];
const EMPTY_FILTERS = { min: "", max: "", types: [], bedrooms: 0, amenities: [], tier: "", available: false };

function FiltersModal({ open, onClose, filters, setFilters, countFor, hasDates }) {
  const [draft, setDraft] = useState(filters);
  useEffect(() => { if (open) setDraft(filters); }, [open, filters]);
  const toggle = (key, v) => setDraft((d) => ({ ...d, [key]: d[key].includes(v) ? d[key].filter((x) => x !== v) : [...d[key], v] }));
  return <Modal open={open} onClose={onClose} title="Filters" size="lg" testId="filters-modal" footer={<><button type="button" className="sx-link" onClick={() => setDraft(EMPTY_FILTERS)} data-testid="filters-clear">Clear all</button><button type="button" className="sx-btn sx-btn--dark" onClick={() => { setFilters(draft); onClose(); }} data-testid="filters-apply">Show {countFor(draft)} stays</button></>}>
    <section className="sx-fsec"><h3>Price range <span className="sx-muted">per night</span></h3>
      <div className="sx-frow"><label className="sx-field"><span>Minimum (₹)</span><input inputMode="numeric" value={draft.min} onChange={(e) => setDraft({ ...draft, min: e.target.value.replace(/\D/g, "") })} data-testid="filter-min" /></label><label className="sx-field"><span>Maximum (₹)</span><input inputMode="numeric" value={draft.max} onChange={(e) => setDraft({ ...draft, max: e.target.value.replace(/\D/g, "") })} data-testid="filter-max" /></label></div></section>
    <section className="sx-fsec"><h3>Category</h3><div className="sx-chips">{[{ slug: "", name: "Any" }, ...getTiers()].map((t) => <button type="button" key={t.slug} className={`sx-chip ${draft.tier === t.slug ? "is-on" : ""}`} onClick={() => setDraft({ ...draft, tier: t.slug })} data-testid={`filter-tier-${t.slug || "any"}`}>{t.name}</button>)}</div></section>
    <section className="sx-fsec"><h3>Property type</h3><div className="sx-chips">{TYPES.map((t) => <button type="button" key={t} className={`sx-chip ${draft.types.includes(t) ? "is-on" : ""}`} onClick={() => toggle("types", t)} aria-pressed={draft.types.includes(t)} data-testid={`filter-type-${t.toLowerCase()}`}>{t}</button>)}</div></section>
    <section className="sx-fsec"><h3>Bedrooms</h3><div className="sx-chips">{[0, 1, 2, 3, 4].map((n) => <button type="button" key={n} className={`sx-chip ${draft.bedrooms === n ? "is-on" : ""}`} onClick={() => setDraft({ ...draft, bedrooms: n })} data-testid={`filter-bedrooms-${n}`}>{n === 0 ? "Any" : `${n}+`}</button>)}</div></section>
    <section className="sx-fsec"><h3>Amenities</h3><div className="sx-chips">{AMENITY_CHIPS.map((a) => <button type="button" key={a} className={`sx-chip ${draft.amenities.includes(a) ? "is-on" : ""}`} onClick={() => toggle("amenities", a)} aria-pressed={draft.amenities.includes(a)} data-testid={`filter-amenity-${a.toLowerCase().replace(/\s+/g, "-")}`}>{a}</button>)}</div></section>
    <section className="sx-fsec"><h3>Booking availability</h3><label className="sx-toggle"><input type="checkbox" checked={draft.available} disabled={!hasDates} onChange={(e) => setDraft({ ...draft, available: e.target.checked })} data-testid="filter-available" /><span>Only stays free for my dates</span></label>{!hasDates && <p className="sx-note">Add dates to filter by availability.</p>}</section>
  </Modal>;
}

const shiftDay = (iso, d) => { const t = fromISO(iso); t.setDate(t.getDate() + d); return toISO(t); };
function flexFree(search, bookedList) {
  const f = search.flex || 0;
  for (let o = -f; o <= f; o += 1) { if (rangeFree(shiftDay(search.checkIn, o), shiftDay(search.checkOut, o), bookedList)) return true; }
  return false;
}

function applyFilters(list, f, search, booked) {
  return list.filter((s) => {
    if (f.min && s.nightly < Number(f.min)) return false;
    if (f.max && s.nightly > Number(f.max)) return false;
    if (f.tier && s.tierSlug !== f.tier) return false;
    if (f.types.length && !f.types.includes(s.type)) return false;
    if (f.bedrooms && s.bedrooms < f.bedrooms) return false;
    if (f.amenities.some((a) => !s.amenities.join(" ").toLowerCase().includes(a.toLowerCase()))) return false;
    if ((search.adults || 0) + (search.children || 0) > s.guests) return false;
    if (f.available && search.checkIn && search.checkOut && !flexFree(search, booked.filter((b) => b.stay === s.name))) return false;
    return true;
  });
}

function MapPreview({ stay, search, onClose }) {
  const p = priceLine(stay, search);
  return <motion.div className="sx-preview" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: 0.2 }} data-testid="map-preview">
    <Link to={`/stays/home/${stay.slug}`} data-testid="map-preview-link"><img src={img(stay.hero, 600)} alt={stay.name} /><div><div className="sx-card__top"><strong>{stay.type} in {stay.city}</strong><Rating stay={stay} /></div><span className="sx-muted">{stay.name}</span><span className="sx-card__price"><b>{p.amount}</b> {p.unit}</span></div></Link>
    <button type="button" className="sx-icon-btn sx-preview__x" onClick={onClose} aria-label="Close preview" data-testid="map-preview-close"><X size={14} /></button>
  </motion.div>;
}

export default function StaysSearch() {
  const { search, setSearch } = useStays();
  const [params] = useSearchParams();
  const mobile = useIsMobile();
  const avail = useAvailability(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  usePageTitle(`${search.where || "All stays"} · Stays | BDSM · BDS Marvel`);

  useEffect(() => {
    const where = params.get("where"), ci = params.get("checkin"), co = params.get("checkout"), tierP = params.get("tier");
    if (where !== null && where !== search.where && !search.nearby) setSearch({ where });
    if (ci && co && (ci !== search.checkIn || co !== search.checkOut)) setSearch({ checkIn: ci, checkOut: co });
    if (tierP) setFilters((f) => (f.tier === tierP ? f : { ...f, tier: tierP }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const base = useMemo(() => {
    const all = getStays();
    if (search.nearby && search.lat != null) return [...all].sort((a, b) => distanceKm(search, a) - distanceKm(search, b));
    const q = search.where.trim().toLowerCase();
    return q ? all.filter((s) => s.location.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)) : all;
  }, [search]);
  const results = useMemo(() => applyFilters(base, filters, search, avail.booked), [base, filters, search, avail.booked]);
  const nights = nightsBetween(search.checkIn, search.checkOut);
  const quick = (a) => setFilters((f) => ({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter((x) => x !== a) : [...f.amenities, a] }));
  const activeCount = [filters.min, filters.max, filters.tier, filters.bedrooms, filters.available].filter(Boolean).length + filters.types.length + filters.amenities.length;
  const isBooked = (s) => nights > 0 && !flexFree(search, avail.booked.filter((b) => b.stay === s.name));
  const selectedStay = results.find((s) => s.slug === selected);

  const list = <div className="sx-results" data-testid="results-list">
    <div className="sx-results__head"><h1 data-testid="results-count">{avail.loading ? "Finding stays…" : `${results.length} stay${results.length === 1 ? "" : "s"}${search.where ? ` ${search.nearby ? "near you" : `in ${search.where}`}` : " across India"}`}</h1>{nights > 0 && <span className="sx-muted">Prices for {nights} night{nights > 1 ? "s" : ""}, as listed by BDS Marvel</span>}</div>
    {avail.error && <p className="sx-banner" role="status" data-testid="results-error">{avail.error}</p>}
    {avail.loading ? <div className="sx-grid">{[0, 1, 2, 3].map((k) => <div key={k}><Skeleton className="sx-skel--card" /><Skeleton className="sx-skel--line" /><Skeleton className="sx-skel--line sx-skel--short" /></div>)}</div>
      : results.length ? <div className="sx-grid">{results.map((s) => <ListingCard key={s.slug} stay={s} search={search} active={s.slug === selected || s.slug === hovered} onHover={setHovered} unavailable={isBooked(s)} />)}</div>
        : <div className="sx-empty" data-testid="results-empty"><h2>No exact matches</h2><p>Try changing or removing some filters, or search a different destination.</p><button type="button" className="sx-btn sx-btn--outline" onClick={() => { setFilters(EMPTY_FILTERS); setSearch({ where: "", nearby: false, lat: null, lng: null }); }} data-testid="results-reset">Clear search & filters</button></div>}
  </div>;
  const map = <div className="sx-mapcol"><StaysMap items={results} selected={selected} hovered={hovered} onSelect={setSelected} labelFor={(s) => inr(nights > 0 ? s.nightly * nights : s.nightly)} />
    <AnimatePresence>{selectedStay && <MapPreview stay={selectedStay} search={search} onClose={() => setSelected(null)} />}</AnimatePresence></div>;

  return <main className="sx-page sx-page--search" data-testid="stays-search">
    <section className="sx-top sx-top--compact"><SearchBar compact /></section>
    <div className="sx-filterbar" data-hscroll>
      <button type="button" className="sx-chip sx-chip--icon" onClick={() => setFiltersOpen(true)} data-testid="open-filters"><SlidersHorizontal size={15} /> Filters{activeCount > 0 && <b className="sx-count">{activeCount}</b>}</button>
      <i className="sx-vr" />
      {AMENITY_CHIPS.slice(0, 4).map((a) => <button type="button" key={a} className={`sx-chip ${filters.amenities.includes(a) ? "is-on" : ""}`} onClick={() => quick(a)} aria-pressed={filters.amenities.includes(a)} data-testid={`quick-${a.toLowerCase().replace(/\s+/g, "-")}`}>{a}</button>)}
      <button type="button" className={`sx-chip ${filters.available ? "is-on" : ""}`} disabled={!nights} onClick={() => setFilters((f) => ({ ...f, available: !f.available }))} data-testid="quick-available">Available for my dates</button>
    </div>
    {mobile ? <div className="sx-mresults sx-mresults--list" data-testid="results-mobile">{list}</div>
      : <div className="sx-split">{list}{map}</div>}
    <FiltersModal open={filtersOpen} onClose={() => setFiltersOpen(false)} filters={filters} setFilters={setFilters} countFor={(f) => applyFilters(base, f, search, avail.booked).length} hasDates={nights > 0} />
  </main>;
}
