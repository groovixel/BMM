import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CalendarCheck, Clock, Loader2, Luggage, MapPin } from "lucide-react";
import { fmtRange, getStay, img, inr, todayISO } from "./data";
import { api, useAuth } from "./store";
import { AuthPanel } from "./Auth";
import { usePageTitle } from "./usePageTitle";

const STATUS_LABEL = { confirmed: "Confirmed", requested: "Awaiting host", declined: "Declined", cancelled: "Cancelled" };

function TripCard({ b }) {
  const stay = getStay(b.stay_slug);
  const confirmed = b.status === "confirmed";
  return (
    <Link to={`/stays/trips/${b.id}`} state={{ booking: b }} className="sx-tripcard" data-testid={`trip-card-${b.id}`}>
      {stay && <img src={img(stay.hero, 600)} alt={b.stay} className="sx-tripcard__media" />}
      <div className="sx-tripcard__body">
        <div className="sx-tripcard__top">
          <h3>{b.stay}</h3>
          <span className={`sx-pilltag ${confirmed ? "" : "sx-pilltag--muted"}`} data-testid={`trip-card-status-${b.id}`}>{STATUS_LABEL[b.status] || b.status}</span>
        </div>
        {stay?.location && <span className="sx-muted sx-tripcard__loc"><MapPin size={13} /> {stay.location}</span>}
        <div className="sx-tripcard__meta">
          <span>{fmtRange(b.check_in, b.check_out)}</span>
          <span>·</span>
          <span>{b.nights} night{b.nights > 1 ? "s" : ""}</span>
          <span>·</span>
          <span>{b.guests} guest{b.guests > 1 ? "s" : ""}</span>
        </div>
        <div className="sx-tripcard__foot">
          <span className="sx-tripcard__total">{inr(b.total)}</span>
          <span className="sx-muted sx-tripcard__ref">Ref {b.reference}</span>
        </div>
      </div>
    </Link>
  );
}

export default function MyTrips() {
  usePageTitle("Your trips | BDSM Stays");
  const { user } = useAuth();
  const [state, setState] = useState({ trips: [], loading: true, error: "" });

  useEffect(() => {
    if (user === null) return;
    if (user === false) { setState({ trips: [], loading: false, error: "" }); return; }
    let live = true;
    api("/stays/bookings/mine")
      .then((trips) => live && setState({ trips: Array.isArray(trips) ? trips : [], loading: false, error: "" }))
      .catch((e) => live && setState({ trips: [], loading: false, error: e.message }));
    return () => { live = false; };
  }, [user]);

  if (user === null || state.loading) return <main className="sx-page sx-center"><Loader2 size={28} className="sx-spin" /></main>;

  if (user === false) return (
    <main className="sx-page sx-center">
      <div className="sx-empty" data-testid="trips-login">
        <h2>Log in to see your trips</h2>
        <p>Your upcoming and past stays appear here once you're signed in.</p>
        <AuthPanel />
      </div>
    </main>
  );

  const today = todayISO();
  const upcoming = state.trips.filter((b) => b.check_out >= today && b.status !== "cancelled" && b.status !== "declined");
  const past = state.trips.filter((b) => !(b.check_out >= today && b.status !== "cancelled" && b.status !== "declined"));

  return (
    <main className="sx-page sx-page--trips" data-testid="my-trips">
      <motion.div className="sx-wrap" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <header className="sx-trips-head">
          <h1><Luggage size={26} strokeWidth={1.5} /> Your trips</h1>
          <p className="sx-muted">Welcome back, {user.name?.split(" ")[0] || "traveller"}.</p>
        </header>

        {state.error && <p className="sx-error" role="alert" data-testid="trips-error">{state.error}</p>}

        {state.trips.length === 0 && !state.error ? (
          <div className="sx-empty" data-testid="trips-empty">
            <h2>No trips yet</h2>
            <p>When you request or book a stay, it'll show up here.</p>
            <Link className="sx-btn sx-btn--primary" to="/stays" data-testid="trips-explore">Explore stays</Link>
          </div>
        ) : (
          <>
            <section className="sx-dsec" data-testid="trips-upcoming">
              <h2><CalendarCheck size={18} /> Upcoming</h2>
              {upcoming.length ? <div className="sx-trips-grid">{upcoming.map((b) => <TripCard key={b.id} b={b} />)}</div>
                : <p className="sx-muted sx-trips-none">No upcoming stays. <Link to="/stays" data-testid="trips-upcoming-explore">Find your next one →</Link></p>}
            </section>
            <section className="sx-dsec" data-testid="trips-past">
              <h2><Clock size={18} /> Past &amp; cancelled</h2>
              {past.length ? <div className="sx-trips-grid">{past.map((b) => <TripCard key={b.id} b={b} />)}</div>
                : <p className="sx-muted sx-trips-none">Nothing here yet.</p>}
            </section>
          </>
        )}
      </motion.div>
    </main>
  );
}
