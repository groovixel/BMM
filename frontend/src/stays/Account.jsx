import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CalendarCheck, Heart, Loader2, LogOut, MapPin, User, X } from "lucide-react";
import { fmtRange, getStay, getStays, img, inr } from "./data";
import { api, useAuth, useStays } from "./store";
import { AuthPanel } from "./Auth";
import { ListingCard } from "./Listing";
import { usePageTitle } from "./usePageTitle";

const STATUS_LABEL = { confirmed: "Confirmed", requested: "Awaiting host", declined: "Declined", cancelled: "Cancelled" };

function BookedCard({ b }) {
  const stay = getStay(b.stay_slug);
  const confirmed = b.status === "confirmed";
  return (
    <Link to={`/stays/trips/${b.id}`} state={{ booking: b }} className="sx-tripcard" data-testid={`account-booking-${b.id}`}>
      {stay && <img src={img(stay.hero, 600)} alt={b.stay} className="sx-tripcard__media" />}
      <div className="sx-tripcard__body">
        <div className="sx-tripcard__top">
          <h3>{b.stay}</h3>
          <span className={`sx-pilltag ${confirmed ? "" : "sx-pilltag--muted"}`}>{STATUS_LABEL[b.status] || b.status}</span>
        </div>
        <div className="sx-tripcard__meta"><span>{fmtRange(b.check_in, b.check_out)}</span><span>·</span><span>{b.nights} night{b.nights > 1 ? "s" : ""}</span></div>
        <div className="sx-tripcard__foot"><span className="sx-tripcard__total">{inr(b.total)}</span><span className="sx-muted sx-tripcard__ref">Ref {b.reference}</span></div>
      </div>
    </Link>
  );
}

export default function Account() {
  usePageTitle("My account | BDSM Stays");
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.from || "/stays";
  const { user, logout } = useAuth();
  const { favs, search } = useStays();
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

  if (user === null) return <main className="sx-page sx-center"><Loader2 size={28} className="sx-spin" /></main>;

  if (user === false) return (
    <main className="sx-page sx-center">
      <button type="button" className="sx-auth-close" onClick={() => navigate(returnTo)} aria-label="Close" data-testid="account-login-close"><X size={22} /></button>
      <div className="sx-empty" data-testid="account-login">
        <h2>Sign in to BDSM Stays</h2>
        <p>Log in to see your profile, saved places and booked stays.</p>
        <AuthPanel returnTo={returnTo} onDone={() => navigate(returnTo)} />
      </div>
    </main>
  );

  const saved = getStays().filter((s) => favs.includes(s.slug));
  const memberSince = user.created_at ? new Date(user.created_at).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : null;

  return (
    <main className="sx-page sx-page--account" data-testid="account-page">
      <motion.div className="sx-wrap" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <header className="sx-acct-head">
          <div className="sx-acct-ava" aria-hidden="true">{user.picture ? <img src={user.picture} alt="" /> : (user.name || user.email || "G").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</div>
          <div>
            <h1>My account</h1>
            <p className="sx-muted">Welcome back, {user.name?.split(" ")[0] || "traveller"}.</p>
          </div>
          <button type="button" className="sx-btn sx-btn--outline sx-acct-logout" onClick={async () => { await logout(); }} data-testid="account-logout"><LogOut size={15} /> Log out</button>
        </header>

        <section className="sx-dsec" data-testid="account-profile">
          <h2><User size={18} /> Profile details</h2>
          <div className="sx-acct-grid">
            <div className="sx-acct-field"><dt>Name</dt><dd data-testid="account-name">{user.name || "—"}</dd></div>
            <div className="sx-acct-field"><dt>Email</dt><dd data-testid="account-email">{user.email}</dd></div>
            {memberSince && <div className="sx-acct-field"><dt>Member since</dt><dd>{memberSince}</dd></div>}
            <div className="sx-acct-field"><dt>Account type</dt><dd style={{ textTransform: "capitalize" }}>{user.role || "guest"}</dd></div>
          </div>
        </section>

        <section className="sx-dsec" data-testid="account-saved">
          <h2><Heart size={18} /> Saved places <span className="sx-muted">({saved.length})</span></h2>
          {saved.length
            ? <div className="sx-trips-grid">{saved.map((s) => <ListingCard key={s.slug} stay={s} search={search} variant="grid" />)}</div>
            : <p className="sx-muted sx-trips-none">No saved places yet. Tap the <Heart size={13} style={{ verticalAlign: "-2px" }} /> on any stay to save it. <Link to="/stays" data-testid="account-saved-explore">Browse stays →</Link></p>}
        </section>

        <section className="sx-dsec" data-testid="account-booked">
          <h2><CalendarCheck size={18} /> Booked places</h2>
          {state.loading ? <p className="sx-muted sx-trips-none"><Loader2 size={15} className="sx-spin" style={{ verticalAlign: "-2px" }} /> Loading your bookings…</p>
            : state.error ? <p className="sx-error" role="alert">{state.error}</p>
              : state.trips.length ? <div className="sx-trips-grid">{state.trips.map((b) => <BookedCard key={b.id} b={b} />)}</div>
                : <p className="sx-muted sx-trips-none">No bookings yet. <Link to="/stays" data-testid="account-booked-explore">Find a stay →</Link></p>}
          {state.trips.length > 0 && <div style={{ marginTop: 14 }}><Link className="sx-btn sx-btn--outline" to="/stays/trips" data-testid="account-all-trips"><MapPin size={14} /> View all trips</Link></div>}
        </section>
      </motion.div>
    </main>
  );
}
