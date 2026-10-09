import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, LogOut, RefreshCw } from "lucide-react";
import { api, useAuth } from "../stays/store";
import "./owner.css";

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
const fmtStamp = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
const inr = (n) => (typeof n === "number" ? `₹${n.toLocaleString("en-IN")}` : null);

function OwnerLogin() {
  const { setUser } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [status, setStatus] = useState({ busy: false, error: "" });
  const submit = async (e) => {
    e.preventDefault();
    if (!form.email.trim() || !form.password) { setStatus({ busy: false, error: "Please enter your email and password." }); return; }
    setStatus({ busy: true, error: "" });
    try {
      setUser(await api("/auth/login", { method: "POST", body: { email: form.email.trim(), password: form.password } }));
    } catch (err) { setStatus({ busy: false, error: err.message }); }
  };
  return <div className="od-auth" data-testid="owner-login">
    <p className="od-kicker">BDS Marvel · Owner</p>
    <h1>Owner sign in</h1>
    <p>This area is private. Sign in with the owner account to manage bookings and enquiries.</p>
    <form onSubmit={submit} noValidate data-testid="owner-login-form">
      <label className="od-field"><span>Email</span><input type="email" value={form.email} autoComplete="email" onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} data-testid="owner-email-input" /></label>
      <label className="od-field"><span>Password</span><input type="password" value={form.password} autoComplete="current-password" onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} data-testid="owner-password-input" /></label>
      {status.error && <p className="od-form-error" role="alert" data-testid="owner-login-error">{status.error}</p>}
      <button type="submit" className="od-btn od-btn--primary" disabled={status.busy} data-testid="owner-login-submit">{status.busy && <Loader2 size={15} className="od-spin" />}Sign in</button>
    </form>
  </div>;
}

function BookingCard({ booking, onAction, busyId, actionError }) {
  const b = booking;
  const busy = busyId === b.id;
  const total = inr(b.total);
  return <article className="od-card" data-testid={`booking-card-${b.id}`}>
    <div className="od-card__top">
      <div>
        {b.reference && <span className="od-ref">{b.reference}{b.mode ? ` · ${b.mode === "instant" ? "Instant book" : "Request"}` : ""}</span>}
        <h3 className="od-card__stay">{b.stay}</h3>
        <p className="od-card__meta">
          <span>{fmtDate(b.check_in)} → {fmtDate(b.check_out)}{b.nights ? ` · ${b.nights} night${b.nights === 1 ? "" : "s"}` : ""}</span>
          <span>{b.guests} guest{b.guests === 1 ? "" : "s"}</span>
          {total && <span>{total}</span>}
          <span>Booked {fmtStamp(b.created_at)}</span>
        </p>
      </div>
      <span className={`od-pill od-pill--${b.status}`} data-testid={`booking-status-${b.id}`}>{b.status}</span>
    </div>
    <p className="od-card__guest" data-testid={`booking-guest-${b.id}`}>
      <strong>{b.name}</strong>
      <a href={`mailto:${b.email}`}>{b.email}</a>
      {b.phone && <a href={`tel:${b.phone}`}>{b.phone}</a>}
    </p>
    {b.message && <p className="od-card__msg">“{b.message}”</p>}
    {actionError?.id === b.id && <p className="od-form-error" role="alert" data-testid={`booking-error-${b.id}`}>{actionError.message}</p>}
    <div className="od-card__actions">
      {b.status === "requested" && <>
        <button type="button" className="od-btn od-btn--approve" disabled={busy} onClick={() => onAction(b, "confirmed")} data-testid={`approve-btn-${b.id}`}>{busy ? <Loader2 size={14} className="od-spin" /> : null}Approve</button>
        <button type="button" className="od-btn od-btn--decline" disabled={busy} onClick={() => onAction(b, "declined")} data-testid={`decline-btn-${b.id}`}>Decline</button>
      </>}
      {b.status === "confirmed" && <button type="button" className="od-btn od-btn--decline" disabled={busy} onClick={() => onAction(b, "cancelled")} data-testid={`cancel-btn-${b.id}`}>{busy ? <Loader2 size={14} className="od-spin" /> : null}Cancel booking</button>}
    </div>
  </article>;
}

function EnquiryCard({ item }) {
  const summary = item.message || item.requirements || item.notes || [item.product, item.brand].filter(Boolean).join(" · ");
  return <article className="od-card" data-testid={`enquiry-card-${item.id}`}>
    <div className="od-card__top">
      <div>
        <span className="od-enq__type">{item.type}</span>
        <h3 className="od-card__stay">{item.name}</h3>
        <p className="od-card__meta">
          {item.service && <span>{item.service}</span>}
          {item.product && <span>{item.product}</span>}
          {item.brand && !item.service && <span>{item.brand}</span>}
          <span>{fmtStamp(item.created_at)}</span>
        </p>
      </div>
    </div>
    <p className="od-card__guest">
      <a href={`mailto:${item.email}`}>{item.email}</a>
      {item.phone && <a href={`tel:${item.phone}`}>{item.phone}</a>}
      {item.city && <span>{item.city}</span>}
      {item.budget && <span>Budget: {item.budget}</span>}
    </p>
    {summary && <p className="od-card__msg">{summary}</p>}
  </article>;
}

function QuoteCard({ item }) {
  const specs = [["Collection", item.collection], ["Brand", item.brand], ["Material", item.material], ["Finish", item.finish], ["Best for", item.use], ["Quantity", item.quantity], ["Needed by", item.timeline]].filter(([, v]) => v);
  return <article className="od-card od-quote" data-testid={`quote-card-${item.id}`}>
    {item.image && <img className="od-quote__img" src={item.image} alt={item.product} data-testid={`quote-image-${item.id}`} />}
    <div className="od-quote__body">
      <div className="od-card__top">
        <div>
          <span className="od-enq__type">{item.type}{item.want_sample ? " · Sample wanted" : ""}</span>
          <h3 className="od-card__stay" data-testid={`quote-product-${item.id}`}>{item.product_url ? <a href={item.product_url} target="_blank" rel="noreferrer">{item.product}</a> : item.product}</h3>
          <p className="od-card__meta"><span>{fmtStamp(item.created_at)}</span></p>
        </div>
      </div>
      <dl className="od-quote__specs">{specs.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <p className="od-card__guest">
        <strong>{item.name}</strong>
        <a href={`mailto:${item.email}`}>{item.email}</a>
        {item.phone && <a href={`tel:${item.phone}`}>{item.phone}</a>}
        {item.city && <span>{item.city}</span>}
      </p>
      {item.message && <p className="od-card__msg">{item.message}</p>}
    </div>
  </article>;
}

const ENQUIRY_TYPES = ["All", "Quote request", "Contact", "Consultation", "Sample request", "Product inquiry"];

function Dashboard() {
  const { user, logout } = useAuth();
  const [data, setData] = useState({ overview: null, bookings: [], enquiries: [] });
  const [state, setState] = useState({ loading: true, error: "" });
  const [tab, setTab] = useState("requests");
  const [filter, setFilter] = useState("All");
  const [busyId, setBusyId] = useState("");
  const [actionError, setActionError] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const [overview, bookings, enquiries] = await Promise.all([
        api("/admin/overview"), api("/admin/bookings"), api("/admin/enquiries"),
      ]);
      setData({ overview, bookings, enquiries });
      setState({ loading: false, error: "" });
    } catch (err) { setState({ loading: false, error: err.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const requests = useMemo(() => data.bookings.filter((b) => b.status === "requested"), [data.bookings]);
  const enquiries = useMemo(() => filter === "All" ? data.enquiries : data.enquiries.filter((e) => e.type === filter), [data.enquiries, filter]);

  const act = async (booking, status) => {
    setBusyId(booking.id);
    setActionError(null);
    try {
      const updated = await api(`/admin/bookings/${booking.id}/status`, { method: "POST", body: { status } });
      setData((d) => ({ ...d, bookings: d.bookings.map((b) => (b.id === booking.id ? { ...b, ...updated } : b)) }));
      api("/admin/overview").then((overview) => setData((d) => ({ ...d, overview }))).catch(() => {});
    } catch (err) { setActionError({ id: booking.id, message: err.message }); }
    finally { setBusyId(""); }
  };

  const ov = data.overview;
  return <div className="od-wrap" data-testid="owner-dashboard">
    <div className="od-head">
      <div>
        <p className="od-kicker">BDS Marvel · Owner</p>
        <h1 className="od-title">Owner dashboard</h1>
        <p className="od-sub">Signed in as {user.name} · {user.email}</p>
      </div>
      <div className="od-head__actions">
        <button type="button" className="od-btn" onClick={load} data-testid="owner-refresh"><RefreshCw size={14} />Refresh</button>
        <button type="button" className="od-btn" onClick={logout} data-testid="owner-logout"><LogOut size={14} />Sign out</button>
      </div>
    </div>

    {state.error && <p className="od-error" role="alert" data-testid="owner-error">{state.error}</p>}
    {state.loading && !ov ? <div className="od-center"><Loader2 size={26} className="od-spin" /></div> : <>
      {ov && <div className="od-stats" data-testid="owner-stats">
        <div className={`od-stat ${ov.pending_requests ? "od-stat--alert" : ""}`} data-testid="owner-stat-pending"><b>{ov.pending_requests}</b><span>Pending requests</span></div>
        <div className="od-stat" data-testid="owner-stat-upcoming"><b>{ov.upcoming_stays}</b><span>Upcoming stays</span></div>
        <div className="od-stat" data-testid="owner-stat-bookings"><b>{ov.total_bookings}</b><span>Total bookings</span></div>
        <div className="od-stat" data-testid="owner-stat-enquiries"><b>{ov.total_enquiries}</b><span>Enquiries</span></div>
      </div>}

      <div className="od-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "requests"} className={`od-tab ${tab === "requests" ? "is-on" : ""}`} onClick={() => setTab("requests")} data-testid="owner-tab-requests">Night requests{requests.length > 0 && <span className="od-tab__count">{requests.length}</span>}</button>
        <button type="button" role="tab" aria-selected={tab === "bookings"} className={`od-tab ${tab === "bookings" ? "is-on" : ""}`} onClick={() => setTab("bookings")} data-testid="owner-tab-bookings">All bookings</button>
        <button type="button" role="tab" aria-selected={tab === "enquiries"} className={`od-tab ${tab === "enquiries" ? "is-on" : ""}`} onClick={() => setTab("enquiries")} data-testid="owner-tab-enquiries">Enquiries</button>
      </div>

      {tab === "requests" && <section data-testid="owner-requests">
        {requests.length === 0
          ? <div className="od-empty" data-testid="owner-requests-empty">No pending night requests. New “Request a night” bookings will appear here.</div>
          : requests.map((b) => <BookingCard key={b.id} booking={b} onAction={act} busyId={busyId} actionError={actionError} />)}
      </section>}

      {tab === "bookings" && <section data-testid="owner-bookings">
        {data.bookings.length === 0
          ? <div className="od-empty" data-testid="owner-bookings-empty">No bookings yet.</div>
          : data.bookings.map((b) => <BookingCard key={b.id} booking={b} onAction={act} busyId={busyId} actionError={actionError} />)}
      </section>}

      {tab === "enquiries" && <section data-testid="owner-enquiries">
        <div className="od-filters">
          {ENQUIRY_TYPES.map((t) => <button key={t} type="button" className={`od-chip ${filter === t ? "is-on" : ""}`} onClick={() => setFilter(t)} data-testid={`enquiry-filter-${t.toLowerCase().replace(/\s+/g, "-")}`}>{t}</button>)}
        </div>
        {enquiries.length === 0
          ? <div className="od-empty" data-testid="owner-enquiries-empty">No enquiries yet.</div>
          : enquiries.map((e) => e.type === "Quote request" ? <QuoteCard key={`${e.type}-${e.id}`} item={e} /> : <EnquiryCard key={`${e.type}-${e.id}`} item={e} />)}
      </section>}
    </>}
  </div>;
}

export default function OwnerDashboard() {
  const { user } = useAuth();
  useEffect(() => { document.title = "Owner dashboard · BDS Marvel"; }, []);
  let body;
  if (user === null) body = <div className="od-center" data-testid="owner-loading"><Loader2 size={26} className="od-spin" /></div>;
  else if (!user) body = <OwnerLogin />;
  else if (user.role !== "admin") body = <AccessDenied name={user.name} />;
  else body = <Dashboard />;
  return <main className="od-page" data-testid="owner-page">{body}</main>;
}

function AccessDenied({ name }) {
  const { logout } = useAuth();
  return <div className="od-auth" data-testid="owner-denied">
    <p className="od-kicker">BDS Marvel · Owner</p>
    <h1>Owner access only</h1>
    <p>You're signed in as {name}, but this account doesn't have owner permissions.</p>
    <button type="button" className="od-btn od-btn--primary" onClick={logout} data-testid="owner-denied-logout">Sign out</button>
  </div>;
}
