import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import { img, inr, nightsBetween } from "./data";
import { useStays } from "./store";
import { Rating } from "./ui";

export function HeartButton({ slug, className = "" }) {
  const { favs, toggleFav } = useStays();
  const on = favs.includes(slug);
  return <button type="button" className={`sx-heart ${on ? "is-on" : ""} ${className}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFav(slug); }} aria-pressed={on} aria-label={on ? "Remove from saved" : "Save"} data-testid={`fav-${slug}`}>
    <Heart size={22} />
  </button>;
}

export function PhotoCarousel({ stay, width = 720 }) {
  const [i, setI] = useState(0);
  const n = stay.gallery.length;
  const go = (e, d) => { e.preventDefault(); e.stopPropagation(); setI((v) => (v + d + n) % n); };
  const touch = useRef(null);
  const onTouchStart = (e) => { touch.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touch.current == null) return;
    const dx = e.changedTouches[0].clientX - touch.current;
    touch.current = null;
    if (Math.abs(dx) < 40) return;
    e.stopPropagation();
    setI((v) => (v + (dx < 0 ? 1 : -1) + n) % n);
  };
  return <div className="sx-carousel" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
    <div className="sx-carousel__track" style={{ transform: `translateX(-${i * 100}%)` }}>
      {stay.gallery.map((id, k) => <img key={k} src={img(id, width)} alt={k === 0 ? stay.name : ""} loading="lazy" draggable={false} />)}
    </div>
    <button type="button" className="sx-carousel__btn sx-carousel__btn--l" onClick={(e) => go(e, -1)} aria-label="Previous photo" data-testid={`carousel-prev-${stay.slug}`}><ChevronLeft size={16} /></button>
    <button type="button" className="sx-carousel__btn sx-carousel__btn--r" onClick={(e) => go(e, 1)} aria-label="Next photo" data-testid={`carousel-next-${stay.slug}`}><ChevronRight size={16} /></button>
    <div className="sx-carousel__dots">{stay.gallery.map((_, k) => <span key={k} className={k === i ? "is-on" : ""} />)}</div>
  </div>;
}

export function priceLine(stay, search) {
  const nights = nightsBetween(search.checkIn, search.checkOut);
  return nights > 0 ? { amount: inr(stay.nightly * nights), unit: `for ${nights} night${nights > 1 ? "s" : ""}` } : { amount: inr(stay.nightly), unit: "night" };
}

export function ListingCard({ stay, search, active, onHover, unavailable, variant = "grid" }) {
  const p = priceLine(stay, search);
  return <Link to={`/stays/home/${stay.slug}`} className={`sx-card sx-card--${variant} ${active ? "is-active" : ""}`} onMouseEnter={() => onHover?.(stay.slug)} onMouseLeave={() => onHover?.(null)} onFocus={() => onHover?.(stay.slug)} data-testid={`listing-card-${stay.slug}`}>
    <div className="sx-card__media">
      <PhotoCarousel stay={stay} width={variant === "row" ? 560 : 760} />
      <HeartButton slug={stay.slug} />
    </div>
    <div className="sx-card__body">
      <div className="sx-card__top"><strong>{stay.type} in {stay.city}</strong><Rating stay={stay} count={variant !== "row"} /></div>
      {variant !== "row" && <span className="sx-muted">{stay.name}</span>}
      {variant !== "row" && <span className="sx-muted">{stay.bedrooms} bedroom{stay.bedrooms > 1 ? "s" : ""} · {stay.beds} bed{stay.beds > 1 ? "s" : ""} · sleeps {stay.guests}</span>}
      <span className="sx-card__price" data-testid={`listing-price-${stay.slug}`}><b>{p.amount}</b> {p.unit}</span>
      {variant === "row" && <span className="sx-card__fees">Prices include all fees</span>}
      {unavailable && <span className="sx-unavail" data-testid={`listing-unavailable-${stay.slug}`}>Booked for your dates</span>}
    </div>
  </Link>;
}
