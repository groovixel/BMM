import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getStays, getTiers } from "./data";
import { useStays } from "./store";
import { SearchBar } from "./SearchBar";
import { ListingCard } from "./Listing";
import { usePageTitle } from "./usePageTitle";

function Row({ title, sub, items, search, testId, more }) {
  const track = useRef(null);
  const scroll = (d) => track.current?.scrollBy({ left: d * track.current.clientWidth * 0.8, behavior: "smooth" });
  return <section className="sx-row" data-testid={testId}>
    <div className="sx-row__head">
      <div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
      {more && <Link to={more} className="sx-row__more" aria-label={`Show all: ${title}`} data-testid={`${testId}-more`}><ChevronRight size={18} /></Link>}
      <div className="sx-row__nav"><button type="button" className="sx-icon-btn" onClick={() => scroll(-1)} aria-label="Scroll left" data-testid={`${testId}-left`}><ChevronLeft size={16} /></button><button type="button" className="sx-icon-btn" onClick={() => scroll(1)} aria-label="Scroll right" data-testid={`${testId}-right`}><ChevronRight size={16} /></button></div>
    </div>
    <div className="sx-row__track" ref={track} data-hscroll>
      {items.map((s, i) => <motion.div key={s.slug} className="sx-row__item" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.25, delay: i * 0.03 }}><ListingCard stay={s} search={search} variant="row" /></motion.div>)}
    </div>
  </section>;
}

export default function StaysHome({ initialTier = "all" }) {
  usePageTitle("Stays & BnBs | BDSM · BDS Marvel");
  const [params] = useSearchParams();
  const { search, favs } = useStays();
  const [tier, setTier] = useState(initialTier);
  const all = useMemo(() => getStays(), []);
  const stayTiers = getTiers();
  const tiers = tier === "all" ? stayTiers : stayTiers.filter((t) => t.slug === tier);
  const saved = all.filter((s) => favs.includes(s.slug));
  return <main className="sx-page" data-testid="stays-home">
    <section className="sx-top">
      <nav className="sx-cats" aria-label="Stay categories">
        {[{ slug: "all", name: "All" }, ...stayTiers].map((t) => <button type="button" key={t.slug} className={`sx-cat ${tier === t.slug ? "is-on" : ""}`} onClick={() => setTier(t.slug)} aria-pressed={tier === t.slug} data-testid={`stays-cat-${t.slug}`}><span>{t.name}</span></button>)}
      </nav>
      <SearchBar autoOpen={params.get("start") === "where" ? "where" : null} />
    </section>
    <div className="sx-wrap">
      {saved.length > 0 && <Row title="Your saved stays" sub="Kept on this device" items={saved} search={search} testId="row-saved" />}
      {tiers.map((t) => <Row key={t.slug} title={`${t.name} stays`} sub={t.headline} items={all.filter((s) => s.tierSlug === t.slug)} search={search} testId={`row-${t.slug}`} more={`/stays/${t.slug}`} />)}
    </div>
  </main>;
}
