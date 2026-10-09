import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Bath, BedDouble, Car, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Flag, Flame, Grid3x3, KeyRound, Library, MapPin, MessageSquareHeart, Share, ShieldCheck, Sofa, Star, Tag, Trees, Users, UtensilsCrossed, Waves, Wifi } from "lucide-react";
import { POLICIES, fmtRange, fromISO, getStay, getStays, guestCount, guestLabel, img, inr, nightsBetween, rangeFree } from "./data";
import { smoothScrollTo } from "@/lib/smoothScroll";
import { SearchBar } from "./SearchBar";
import { useAvailability, useIsMobile, useStays, useAuth } from "./store";
import { GuestCounters, Modal, RangeCalendar, Rating, Skeleton } from "./ui";
import { HeartButton } from "./Listing";
import { AuthPanel } from "./Auth";
import { StaysMap } from "./StaysMap";
import { usePageTitle } from "./usePageTitle";

function Gallery({ stay, open, start, onClose }) {
  const [i, setI] = useState(start);
  useEffect(() => { if (open) setI(start); }, [open, start]);
  const n = stay.gallery.length;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "ArrowRight") setI((v) => (v + 1) % n); if (e.key === "ArrowLeft") setI((v) => (v - 1 + n) % n); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, n]);
  return <Modal open={open} onClose={onClose} title={`${i + 1} / ${n}`} full testId="gallery-modal">
    <div className="sx-gallery">
      <button type="button" className="sx-icon-btn sx-gallery__nav" onClick={() => setI((v) => (v - 1 + n) % n)} aria-label="Previous photo" data-testid="gallery-prev"><ChevronLeft size={18} /></button>
      <AnimatePresence mode="wait"><motion.img key={i} src={img(stay.gallery[i], 1800)} alt={`${stay.name} photo ${i + 1}`} initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} data-testid="gallery-image" /></AnimatePresence>
      <button type="button" className="sx-icon-btn sx-gallery__nav" onClick={() => setI((v) => (v + 1) % n)} aria-label="Next photo" data-testid="gallery-next"><ChevronRight size={18} /></button>
    </div>
    <div className="sx-thumbs">{stay.gallery.map((id, k) => <button type="button" key={k} className={k === i ? "is-on" : ""} onClick={() => setI(k)} aria-label={`Photo ${k + 1}`}><img src={img(id, 240)} alt="" /></button>)}</div>
  </Modal>;
}

const AMENITY_TYPES = [
  [/suite|bed|bedroom|room/i, BedDouble, "Bedroom and bathroom"], [/bath|shower|basin/i, Bath, "Bedroom and bathroom"],
  [/kitchen|breakfast|chef|dining|chai|butler|cafe|pantry/i, UtensilsCrossed, "Kitchen and dining"], [/wifi|fibre|work/i, Wifi, "Internet and office"],
  [/pool|plunge|water/i, Waves, "Outdoor"], [/garden|terrace|courtyard|verandah|balcony|rooftop/i, Trees, "Outdoor"], [/sauna|bonfire|fire/i, Flame, "Outdoor"],
  [/transfer|driver|valet|scooter|parking/i, Car, "Services"], [/check-in/i, KeyRound, "Services"], [/walkthrough|library|consult|demo|workshop|design/i, Library, "Services"],
  [/lounge|screening|sofa/i, Sofa, "Features"], [/min|walk|ghats|metro|city|location|lake|compound/i, MapPin, "Location"],
];
const amenityMeta = (a) => { const hit = AMENITY_TYPES.find(([re]) => re.test(a)); return hit ? { Icon: hit[1], group: hit[2] } : { Icon: Check, group: "Features" }; };

function AmenitiesModal({ stay, open, onClose }) {
  const groups = stay.amenities.reduce((acc, a) => { const { group } = amenityMeta(a); (acc[group] = acc[group] || []).push(a); return acc; }, {});
  return <Modal open={open} onClose={onClose} title="What this place offers" size="lg" testId="amenities-modal">
    {Object.entries(groups).map(([group, items]) => <section className="sx-amgroup" key={group}><h3>{group}</h3>
      {items.map((a) => { const { Icon } = amenityMeta(a); return <div className="sx-amgroup__item" key={a}><Icon size={24} strokeWidth={1.4} /><span>{a}</span></div>; })}</section>)}
  </Modal>;
}

const SECTIONS = [["photos", "Photos"], ["amenities", "Amenities"], ["reviews", "Reviews"], ["location", "Location"]];
function SectionNav({ visible, stay, nights }) {
  const go = (id) => { const el = document.getElementById(`sx-${id}`); if (el) smoothScrollTo(el, { offset: -90 }); };
  return <AnimatePresence>{visible && <motion.nav className="sx-secnav" initial={{ y: -64 }} animate={{ y: 0 }} exit={{ y: -64 }} transition={{ duration: 0.22 }} data-testid="detail-section-nav">
    <div className="sx-secnav__in">{SECTIONS.map(([id, label]) => <button type="button" key={id} onClick={() => go(id)} data-testid={`secnav-${id}`}>{label}</button>)}
      <span className="sx-secnav__price"><b>{inr(nights ? stay.nightly * nights : stay.nightly)}</b> {nights ? `for ${nights} night${nights > 1 ? "s" : ""}` : "night"}</span></div>
  </motion.nav>}</AnimatePresence>;
}

const numDate = (s) => fromISO(s).toLocaleDateString("en-IN");

// Shared booking widget: sticky card on desktop, sheet content on mobile
export function BookingPanel({ stay, booked, onGo }) {
  const { search, setSearch } = useStays();
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  const nights = nightsBetween(search.checkIn, search.checkOut);
  const free = nights > 0 && rangeFree(search.checkIn, search.checkOut, booked);
  const go = (mode) => {
    if (!nights) { setError("Add your check-in and check-out dates."); setOpen("dates"); return; }
    if (!free) { setError("Those nights are already booked. Please choose different dates."); setOpen("dates"); return; }
    if (!search.adults) { setError("Add at least one adult."); setOpen("guests"); return; }
    if (guestCount(search) > stay.guests) { setError(`This stay sleeps up to ${stay.guests} guests.`); setOpen("guests"); return; }
    onGo(mode);
  };
  return <div className="sx-bookwrap"><div className="sx-feepill" data-testid="booking-fee-note"><Tag size={18} /> No added fees — price as listed</div><div className="sx-book" data-testid="booking-panel">
    <div className="sx-book__price"><span><b className="sx-u" data-testid="booking-panel-price">{nights ? inr(stay.nightly * nights) : inr(stay.nightly)}</b> {nights ? `for ${nights} night${nights > 1 ? "s" : ""}` : "night"}</span></div>
    <div className="sx-book__box">
      <button type="button" className="sx-book__cell" onClick={() => setOpen(open === "dates" ? null : "dates")} data-testid="booking-panel-checkin"><span>CHECK-IN</span><strong>{search.checkIn ? numDate(search.checkIn) : "Add date"}</strong></button>
      <button type="button" className="sx-book__cell" onClick={() => setOpen(open === "dates" ? null : "dates")} data-testid="booking-panel-checkout"><span>CHECKOUT</span><strong>{search.checkOut ? numDate(search.checkOut) : "Add date"}</strong></button>
      <button type="button" className="sx-book__cell sx-book__cell--wide" onClick={() => setOpen(open === "guests" ? null : "guests")} aria-expanded={open === "guests"} data-testid="booking-panel-guests"><span>GUESTS</span><strong>{guestLabel(search) || "Add guests"}</strong><ChevronDown size={20} className={`sx-book__chev ${open === "guests" ? "is-up" : ""}`} /></button>
    </div>
    <AnimatePresence>{open && <motion.div className="sx-book__drop" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
      {open === "dates" ? <RangeCalendar checkIn={search.checkIn} checkOut={search.checkOut} booked={booked} months={1} minNights={stay.minNights} onChange={(r) => { setSearch(r); setError(""); if (r.checkOut) setOpen(null); }} testId="panel-calendar" />
        : <GuestCounters value={search} capacity={stay.guests} onChange={(v) => { setSearch(v); setError(""); }} testId="panel-guests" />}
      <div className="sx-panel-actions"><button type="button" className="sx-link" onClick={() => setOpen(null)} data-testid="booking-panel-close-drop">Close</button></div>
    </motion.div>}</AnimatePresence>
    {error && <p className="sx-error" role="alert" data-testid="booking-panel-error">{error}</p>}
    <button type="button" className="sx-btn sx-btn--primary sx-btn--block sx-btn--reserve" onClick={() => go("instant")} data-testid="book-this-stay">Book this stay</button>
    <p className="sx-center-text sx-book__charge">You won't be charged yet</p>
    <button type="button" className="sx-btn sx-btn--outline sx-btn--block" onClick={() => go("request")} data-testid="request-a-night">Request a night</button>
    <p className="sx-note sx-center-text">Book confirms instantly when dates are free · Request waits for host approval. Pay at the property.</p>
    {nights > 0 && <div className="sx-lines"><div><span className="sx-u">{inr(stay.nightly)} × {nights} night{nights > 1 ? "s" : ""}</span><span>{inr(stay.nightly * nights)}</span></div><div className="sx-lines__total"><span>Total</span><span>{inr(stay.nightly * nights)}</span></div></div>}
  </div><a className="sx-report" href={`mailto:info@bdsmarvel.com?subject=${encodeURIComponent(`Report listing: ${stay.name}`)}`} data-testid="report-listing"><Flag size={15} /> Report this listing</a></div>;
}

export default function StayDetail() {
  const { slug } = useParams();
  const stay = getStay(slug);
  const navigate = useNavigate();
  const mobile = useIsMobile("(max-width: 900px)");
  const { search, setSearch } = useStays();
  const { user } = useAuth();
  const avail = useAvailability(stay?.name);
  const [gallery, setGallery] = useState({ open: false, start: 0 });
  const [sheet, setSheet] = useState(false);
  const [authFor, setAuthFor] = useState(null);
  const [shared, setShared] = useState("");
  const [amenOpen, setAmenOpen] = useState(false);
  const [navOn, setNavOn] = useState(false);
  const photosRef = useRef(null);
  useEffect(() => {
    if (!photosRef.current) return undefined;
    const io = new IntersectionObserver(([e]) => setNavOn(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(photosRef.current);
    return () => io.disconnect();
  }, [slug]);
  usePageTitle(stay ? `${stay.name} · ${stay.location} | BDSM Stays` : "Stay not found");
  const similar = useMemo(() => (stay ? getStays().filter((s) => s.tierSlug === stay.tierSlug && s.slug !== stay.slug).slice(0, 3) : []), [stay]);
  if (!stay) return <main className="sx-page sx-center"><div className="sx-empty" data-testid="stay-not-found"><h2>We couldn't find that stay</h2><Link className="sx-btn sx-btn--primary" to="/stays/search">Browse all stays</Link></div></main>;
  const nights = nightsBetween(search.checkIn, search.checkOut);
  const checkoutPath = (mode) => {
    const p = new URLSearchParams({ mode, checkin: search.checkIn, checkout: search.checkOut, adults: search.adults, children: search.children, infants: search.infants, pets: search.pets });
    return `/stays/book/${stay.slug}?${p}`;
  };
  const goCheckout = (mode) => {
    if (user === false) { setAuthFor(mode); return; }
    navigate(checkoutPath(mode));
  };
  const share = async () => {
    const url = window.location.href;
    try { if (navigator.share) { await navigator.share({ title: stay.name, url }); return; } await navigator.clipboard.writeText(url); setShared("Link copied"); }
    catch { setShared(""); }
    window.setTimeout(() => setShared(""), 2200);
  };
  const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
  const facts = [plural(stay.guests, "guest"), plural(stay.bedrooms, "bedroom"), plural(stay.beds, "bed"), plural(stay.baths, "bathroom")].join(" · ");
  const highlights = [
    [Library, "Designed and built by BDS Marvel", "Our own stone, flooring, finishes and furniture throughout."],
    ...(stay.amenities.some((a) => /self check-in/i.test(a)) ? [[KeyRound, "Self check-in", "Check yourself in on arrival — details shared after booking."]] : []),
    [MessageSquareHeart, "Responsive hosting", "The BDS Marvel team replies within one working day."],
  ];
  return <main className="sx-page sx-page--detail" data-testid="stay-detail">
    <section className="sx-top sx-top--compact"><SearchBar compact /></section>
    <SectionNav visible={navOn && !mobile} stay={stay} nights={nights} />
    <div className="sx-wrap sx-wrap--detail">
      <div className="sx-detail__bar"><h1 className="sx-detail__title" data-testid="detail-title">{stay.name}</h1>
        <div className="sx-detail__acts"><button type="button" className="sx-link" onClick={share} data-testid="detail-share"><Share size={16} /> {shared || "Share"}</button><span className="sx-detail__save"><HeartButton slug={stay.slug} className="sx-heart--inline" /> Save</span></div></div>
      <div className="sx-photos" id="sx-photos" ref={photosRef} data-testid="detail-photos">
        {stay.gallery.slice(0, 5).map((id, k) => <button type="button" key={k} className={`sx-photos__cell sx-photos__cell--${k}`} onClick={() => setGallery({ open: true, start: k })} aria-label={`Open photo ${k + 1}`} data-testid={`detail-photo-${k}`}><img src={img(id, k === 0 ? 1400 : 700)} alt={k === 0 ? stay.name : ""} /></button>)}
        <button type="button" className="sx-btn sx-btn--light sx-photos__all" onClick={() => setGallery({ open: true, start: 0 })} data-testid="detail-show-all-photos"><Grid3x3 size={15} /> Show all photos</button>
      </div>
      <div className="sx-detail__grid">
        <div className="sx-detail__main">
          <section className="sx-dsec sx-dsec--intro"><h2 className="sx-detail__kind">Entire {stay.type.toLowerCase()} in {stay.location}, India</h2><p className="sx-detail__facts" data-testid="detail-facts">{facts}</p>
            <p className="sx-detail__sub"><span className="sx-pilltag">{stay.tier}</span></p></section>
          <section className="sx-dsec sx-host" data-testid="detail-host"><span className="sx-avatar">BDSM</span><div><strong>Hosted by BDS Marvel</strong><span>{stay.tier} stay · {stay.location}</span></div></section>
          <section className="sx-dsec sx-highlights" data-testid="detail-highlights">{highlights.map(([Icon, t, d]) => <div key={t} className="sx-highlight"><Icon size={26} strokeWidth={1.4} /><div><strong>{t}</strong><span>{d}</span></div></div>)}</section>
          <section className="sx-dsec"><p className="sx-lead">{stay.blurb}</p><p>{stay.description}</p></section>
          <section className="sx-dsec"><h2>Where you'll sleep</h2><div className="sx-sleep">{Array.from({ length: stay.bedrooms }, (_, k) => <div key={k} className="sx-sleep__card"><BedDouble size={22} /><strong>Bedroom {k + 1}</strong><span>1 double bed</span></div>)}</div></section>
          <section className="sx-dsec" id="sx-amenities" data-testid="detail-amenities"><h2>What this place offers</h2><ul className="sx-amen">{stay.amenities.map((a) => { const { Icon } = amenityMeta(a); return <li key={a}><Icon size={24} strokeWidth={1.4} /> {a}</li>; })}</ul>
            <button type="button" className="sx-btn sx-btn--soft" onClick={() => setAmenOpen(true)} data-testid="detail-show-all-amenities">Show all {stay.amenities.length} amenities</button></section>
          <section className="sx-dsec" data-testid="detail-availability"><h2>{nights ? `${nights} night${nights > 1 ? "s" : ""} in ${stay.city}` : "Select check-in date"}</h2><p className="sx-muted">{nights ? fmtRange(search.checkIn, search.checkOut) : "Add your travel dates for exact pricing"}{avail.booked.length > 0 && " · struck-through dates are already booked"}</p>
            {avail.loading ? <Skeleton className="sx-skel--cal" /> : <RangeCalendar checkIn={search.checkIn} checkOut={search.checkOut} booked={avail.booked} months={mobile ? 1 : 2} minNights={stay.minNights} onChange={setSearch} testId="detail-calendar" />}
            {avail.error && <p className="sx-banner">{avail.error}</p>}
            <button type="button" className="sx-link" onClick={() => setSearch({ checkIn: "", checkOut: "" })} data-testid="detail-clear-dates">Clear dates</button></section>
          <section className="sx-dsec" id="sx-location" data-testid="detail-location"><h2>Where you'll be</h2><p className="sx-muted"><MapPin size={14} /> {stay.location} · exact address shared after booking</p>
            <div className="sx-dmap"><StaysMap items={[stay]} single selected={stay.slug} labelFor={() => stay.city} testId="detail-map" /></div>
            <p>{stay.blurb}</p><a className="sx-u" href={`https://www.google.com/maps/search/?api=1&query=${stay.lat},${stay.lng}`} target="_blank" rel="noreferrer" data-testid="detail-open-google-maps">Open in Google Maps</a></section>
          <section className="sx-dsec" data-testid="detail-policies"><h2>Things to know {POLICIES.draft && <span className="sx-pilltag sx-pilltag--muted">Host to confirm</span>}</h2>
            <div className="sx-know">
              <div><h3>House rules</h3><p><Clock size={14} /> Check-in after {POLICIES.checkIn}</p><p><Clock size={14} /> Checkout before {POLICIES.checkOut}</p><p><Users size={14} /> {stay.guests} guests maximum</p>{POLICIES.rules.map((r) => <p key={r}>{r}</p>)}</div>
              <div><h3>Safety & property</h3>{POLICIES.safety.map((r) => <p key={r}><ShieldCheck size={14} /> {r}</p>)}</div>
              <div><h3>Cancellation policy</h3><p>{POLICIES.cancellation}</p></div>
            </div></section>
          {similar.length > 0 && <section className="sx-dsec"><h2>More {stay.tier.toLowerCase()} stays</h2><div className="sx-similar">{similar.map((s) => <Link key={s.slug} to={`/stays/home/${s.slug}`} className="sx-similar__card" data-testid={`similar-${s.slug}`}><img src={img(s.hero, 500)} alt={s.name} /><strong>{s.name}</strong><span className="sx-muted">{s.location} · {inr(s.nightly)} night</span></Link>)}</div></section>}
        </div>
        {!mobile && <aside className="sx-detail__aside"><BookingPanel stay={stay} booked={avail.booked} onGo={goCheckout} /></aside>}
      </div>
    </div>
    {mobile && <div className="sx-mbar" data-testid="mobile-booking-bar"><div><b>{nights ? inr(stay.nightly * nights) : inr(stay.nightly)}</b> {nights ? `for ${nights} night${nights > 1 ? "s" : ""}` : "night"}<span className="sx-u">{nights ? fmtRange(search.checkIn, search.checkOut) : "Add dates"}</span></div><button type="button" className="sx-btn sx-btn--primary" onClick={() => setSheet(true)} data-testid="mobile-reserve">Reserve</button></div>}
    <Modal open={sheet} onClose={() => setSheet(false)} title="Your trip" testId="mobile-booking-sheet"><BookingPanel stay={stay} booked={avail.booked} onGo={(m) => { setSheet(false); goCheckout(m); }} /></Modal>
    <Modal open={!!authFor} onClose={() => setAuthFor(null)} title="Sign in to book" testId="reserve-auth-modal">
      <p className="sx-note" data-testid="reserve-auth-note">Sign in to confirm your booking — your dates and guests are saved.</p>
      <AuthPanel returnTo={authFor ? checkoutPath(authFor) : undefined} onDone={() => { const m = authFor; setAuthFor(null); navigate(checkoutPath(m)); }} />
    </Modal>
    <Gallery stay={stay} open={gallery.open} start={gallery.start} onClose={() => setGallery((g) => ({ ...g, open: false }))} />
    <AmenitiesModal stay={stay} open={amenOpen} onClose={() => setAmenOpen(false)} />
  </main>;
}
