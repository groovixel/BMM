import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, History, LocateFixed, Loader2, MapPin, Search, X } from "lucide-react";
import { distanceKm, fmtRange, getDestinations, getStays, getTiers, guestLabel } from "./data";
import { useIsMobile, useStays } from "./store";
import { GuestCounters, Modal, RangeCalendar, useOutside } from "./ui";

export function buildSearchQuery(s) {
  const p = new URLSearchParams();
  if (s.where) p.set("where", s.where);
  if (s.checkIn) p.set("checkin", s.checkIn);
  if (s.checkOut) p.set("checkout", s.checkOut);
  if (s.tier) p.set("tier", s.tier);
  return p.toString();
}

function WherePanel({ value, onPick }) {
  const [geo, setGeo] = useState({ state: "idle", msg: "" });
  const all = useMemo(() => getDestinations(), []);
  const q = value.trim().toLowerCase();
  const list = (q ? all.filter((d) => d.label.toLowerCase().includes(q)) : all.filter((d) => !d.region).slice(0, 7));
  const nearby = () => {
    if (!navigator.geolocation) { setGeo({ state: "error", msg: "Location isn't supported here — search by city instead." }); return; }
    setGeo({ state: "loading", msg: "" });
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGeo({ state: "idle", msg: "" }); onPick({ where: "Nearby", nearby: true, lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      () => setGeo({ state: "error", msg: "Location permission was denied. Type a city or state to search instead." }),
      { timeout: 10000 },
    );
  };
  return <div className="sx-where" data-testid="where-panel">
    <p className="sx-panel-label">{q ? "Matching destinations" : "Suggested destinations"}</p>
    <button type="button" className="sx-dest" onClick={nearby} data-testid="where-nearby"><span className="sx-dest__icon sx-dest__icon--blue">{geo.state === "loading" ? <Loader2 size={20} className="sx-spin" /> : <LocateFixed size={20} />}</span><span><strong>Nearby</strong><em>Use my current location</em></span></button>
    {geo.state === "error" && <p className="sx-error" role="alert" data-testid="where-geo-error">{geo.msg}</p>}
    {list.map((d) => <button type="button" className="sx-dest" key={d.label} onClick={() => onPick({ where: d.label, nearby: false, lat: d.lat ?? null, lng: d.lng ?? null })} data-testid={`where-option-${d.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}>
      <span className="sx-dest__icon">{d.region ? <MapPin size={20} /> : <Building2 size={20} />}</span>
      <span><strong>{d.label}</strong><em>{d.count} BDS Marvel stay{d.count > 1 ? "s" : ""}{d.region ? " across the state" : ""}</em></span>
    </button>)}
    {q && !list.length && <p className="sx-note" data-testid="where-no-match">No stays in “{value}” yet. Try Rajasthan, Maharashtra, Goa or Delhi.</p>}
  </div>;
}

// Full search pill (home + results). compact = small summary pill in result headers
export function SearchBar({ compact = false, autoOpen = null, onSearched }) {
  const { search, setSearch } = useStays();
  const navigate = useNavigate();
  const mobile = useIsMobile();
  const [panel, setPanel] = useState(autoOpen);
  const [expanded, setExpanded] = useState(!compact);
  const [recents, setRecents] = useState(() => { try { return JSON.parse(localStorage.getItem("bds_recent_searches")) || []; } catch { return []; } });
  const sheetTiers = useMemo(() => [{ slug: "", name: "All" }, ...getTiers().map((t) => ({ slug: t.slug, name: t.name }))], []);
  const ref = useRef(null);
  const close = useCallback(() => { setPanel(null); if (compact) setExpanded(false); }, [compact]);
  useOutside(ref, close, Boolean(panel) && !mobile);

  const remember = (s) => {
    if (!s.where.trim()) return;
    const entry = { where: s.where, checkIn: s.checkIn, checkOut: s.checkOut, guests: (s.adults || 0) + (s.children || 0) };
    const next = [entry, ...recents.filter((r) => r.where !== s.where)].slice(0, 4);
    setRecents(next);
    try { localStorage.setItem("bds_recent_searches", JSON.stringify(next)); } catch { /* storage full */ }
  };

  const submit = () => {
    remember(search);
    setPanel(null);
    if (compact) setExpanded(false);
    onSearched?.();
    navigate(`/stays/search?${buildSearchQuery(search)}`);
  };
  const pickWhere = (patch) => { setSearch(patch); setPanel("when"); };
  const onDates = (r) => { setSearch(r); if (r.checkIn && r.checkOut) setPanel("who"); };
  const sortedHint = search.nearby && search.lat ? `${getStays().filter((s) => distanceKm(search, s) < 400).length} stays within 400 km` : "";

  const whereBody = <><input className="sx-where-input" value={search.where} onChange={(e) => setSearch({ where: e.target.value, nearby: false, lat: null, lng: null })} placeholder="Search destinations" aria-label="Where" data-testid="search-where-input" data-autofocus />
    <WherePanel value={search.nearby ? "" : search.where} onPick={pickWhere} /></>;
  const whenBody = <><RangeCalendar checkIn={search.checkIn} checkOut={search.checkOut} onChange={onDates} months={mobile ? 1 : 2} testId="search-calendar" />
    <div className="sx-panel-actions"><button type="button" className="sx-link" onClick={() => setSearch({ checkIn: "", checkOut: "" })} data-testid="search-dates-clear">Clear dates</button></div></>;
  const whoBody = <GuestCounters value={search} onChange={(v) => setSearch(v)} testId="search-guests" />;

  if (mobile) {
    const whereBodyM = <>
      <input className="sx-where-input" value={search.where} onChange={(e) => setSearch({ where: e.target.value, nearby: false, lat: null, lng: null })} placeholder="Search destinations" aria-label="Where" data-testid="search-where-input" data-autofocus />
      {recents.length > 0 && !search.where.trim() && <div className="sx-recent" data-testid="recent-searches">
        <p className="sx-panel-label">Recent searches</p>
        {recents.map((r) => <button type="button" className="sx-dest" key={`${r.where}-${r.checkIn}`} onClick={() => { setSearch({ where: r.where, nearby: false, lat: null, lng: null, checkIn: r.checkIn, checkOut: r.checkOut }); setPanel("who"); }} data-testid={`recent-${r.where.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}>
          <span className="sx-dest__icon"><History size={20} /></span>
          <span><strong>{r.where}</strong><em>{[fmtRange(r.checkIn, r.checkOut) || "Any dates", r.guests ? `${r.guests} guest${r.guests > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ")}</em></span>
        </button>)}
      </div>}
      <WherePanel value={search.nearby ? "" : search.where} onPick={pickWhere} />
    </>;
    const whenBodyM = <>
      <RangeCalendar checkIn={search.checkIn} checkOut={search.checkOut} onChange={onDates} months={1} testId="search-calendar" />
      <div className="sx-flexchips">{[[0, "Exact dates"], [1, "± 1 day"], [2, "± 2 days"]].map(([v, l]) => <button type="button" key={v} className={`sx-chip ${search.flex === v ? "is-on" : ""}`} onClick={() => setSearch({ flex: v })} data-testid={`flex-${v}`}>{l}</button>)}</div>
    </>;
    const steps = [["where", "Where", search.where || "I'm flexible", "Where to?", whereBodyM], ["when", "When", fmtRange(search.checkIn, search.checkOut) || "Add dates", "When's your trip?", whenBodyM], ["who", "Who", guestLabel(search) || "Add guests", "Who's coming?", whoBody]];
    return <>
      <button type="button" className="sx-mpill" onClick={() => setPanel("where")} data-testid="search-mobile-pill">
        <Search size={18} /><span><strong>{search.where || "Start your search"}</strong><em>{search.where || search.checkIn || guestLabel(search) ? [fmtRange(search.checkIn, search.checkOut) || "Any week", guestLabel(search) || "Add guests"].join(" · ") : ""}</em></span>
      </button>
      <Modal open={Boolean(panel)} onClose={() => setPanel(null)} title="Find a stay" full testId="search-sheet" footer={panel === "when"
        ? <><button type="button" className="sx-link" onClick={() => setSearch({ checkIn: "", checkOut: "", flex: 0 })} data-testid="search-sheet-clear">Reset</button><button type="button" className="sx-btn sx-btn--dark" onClick={() => setPanel("who")} data-testid="search-sheet-next">Next</button></>
        : <><button type="button" className="sx-link" onClick={() => setSearch({ where: "", nearby: false, lat: null, lng: null, checkIn: "", checkOut: "", adults: 0, children: 0, infants: 0, pets: 0, flex: 0, tier: "" })} data-testid="search-sheet-clear">Clear all</button><button type="button" className="sx-btn sx-btn--dark" onClick={submit} data-testid="search-sheet-submit"><Search size={16} /> Search</button></>}>
        <div className="sx-sheetcats" aria-label="Stay type">
          {sheetTiers.map(({ slug, name }) => <button type="button" key={slug || "all"} className={`sx-sheetcat ${search.tier === slug ? "is-on" : ""}`} onClick={() => setSearch({ tier: slug })} aria-pressed={search.tier === slug} data-testid={`sheet-cat-${slug || "all"}`}><span>{name}</span></button>)}
        </div>
        {steps.map(([key, label, summary, title, body]) =>
          <section className={`sx-acc ${panel === key ? "is-open" : ""}`} key={key}>
            <button type="button" className="sx-acc__head" onClick={() => setPanel(key)} aria-expanded={panel === key} data-testid={`search-sheet-${key}`}><span>{label}</span><strong>{summary}</strong></button>
            <AnimatePresence initial={false}>{panel === key && <motion.div className="sx-acc__body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}><h3 className="sx-acc__title">{title}</h3>{body}</motion.div>}</AnimatePresence>
          </section>)}
      </Modal>
    </>;
  }

  if (compact && !expanded) {
    return <button type="button" className="sx-cpill" onClick={() => { setExpanded(true); setPanel("where"); }} data-testid="search-compact-pill">
      <span>{search.where || "Anywhere"}</span><i /><span>{fmtRange(search.checkIn, search.checkOut) || "Any week"}</span><i /><span className="sx-muted">{guestLabel(search) || "Add guests"}</span><b><Search size={14} /></b>
    </button>;
  }

  const seg = (key, label, val, placeholder) => <button type="button" className={`sx-seg ${panel === key ? "is-active" : ""}`} onClick={() => setPanel(key)} aria-expanded={panel === key} data-testid={`search-seg-${key}`}>
    <span className="sx-seg__label">{label}</span><span className={`sx-seg__val ${val ? "" : "sx-muted"}`}>{val || placeholder}</span>
  </button>;
  return <div className={`sx-search ${panel ? "has-panel" : ""}`} ref={ref} data-testid="search-bar">
    <div className="sx-search__pill">
      {panel === "where" ? <label className="sx-seg is-active sx-seg--input"><span className="sx-seg__label">Where</span><input value={search.where} onChange={(e) => setSearch({ where: e.target.value, nearby: false, lat: null, lng: null })} placeholder="Search destinations" autoFocus data-testid="search-where-input" onKeyDown={(e) => e.key === "Enter" && submit()} />{search.where && <button type="button" className="sx-clear" onClick={() => setSearch({ where: "", nearby: false, lat: null, lng: null })} aria-label="Clear destination"><X size={12} /></button>}</label> : seg("where", "Where", search.where, "Search destinations")}
      <i className="sx-search__div" />
      {seg("when", "When", fmtRange(search.checkIn, search.checkOut), "Add dates")}
      <i className="sx-search__div" />
      {seg("who", "Who", guestLabel(search), "Add guests")}
      <button type="button" className={`sx-search__go ${panel ? "is-wide" : ""}`} onClick={submit} aria-label="Search" data-testid="search-submit"><Search size={18} />{panel && <span>Search</span>}</button>
    </div>
    <AnimatePresence>{panel && <motion.div key={panel} className={`sx-pop sx-pop--${panel}`} initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} data-lenis-prevent>
      {panel === "where" && <WherePanel value={search.nearby ? "" : search.where} onPick={pickWhere} />}
      {panel === "when" && whenBody}
      {panel === "who" && whoBody}
      {sortedHint && panel === "where" && <p className="sx-note">{sortedHint}</p>}
    </motion.div>}</AnimatePresence>
  </div>;
}
