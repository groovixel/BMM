import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { POLICIES, fmtLong, fmtRange, getStay, guestCount, guestLabel, img, inr, nightsBetween, rangeFree } from "./data";
import { api, useAuth, useAvailability, useStays } from "./store";
import { GuestCounters, Modal, RangeCalendar, Rating } from "./ui";
import { AuthPanel } from "./Auth";
import { usePageTitle } from "./usePageTitle";

const DRAFT_KEY = "bds_checkout_draft";
const readDraft = () => { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY)) || {}; } catch { return {}; } };

function Summary({ stay, search, nights, paymentsEnabled }) {
  return <aside className="sx-co__summary" data-testid="checkout-summary">
    <div className="sx-co__stay"><img src={img(stay.hero, 400)} alt={stay.name} /><div><strong>{stay.name}</strong><span className="sx-muted">{stay.type} in {stay.location}</span><Rating stay={stay} /></div></div>
    <div className="sx-co__trip"><div><span>Dates</span><strong data-testid="summary-dates">{fmtRange(search.checkIn, search.checkOut) || "Add dates"}</strong></div><div><span>Guests</span><strong data-testid="summary-guests">{guestLabel(search) || "Add guests"}</strong></div></div>
    <div className="sx-lines" data-testid="price-breakdown"><h3>Price details</h3>
      <div><span>{inr(stay.nightly)} × {nights} night{nights === 1 ? "" : "s"}</span><span>{inr(stay.nightly * nights)}</span></div>
      <div className="sx-muted"><span>Service or cleaning fees</span><span>None listed</span></div>
      <div className="sx-muted"><span>Taxes</span><span>As applicable, at property</span></div>
      <div className="sx-lines__total"><span>Total (INR)</span><span data-testid="summary-total">{inr(stay.nightly * nights)}</span></div>
    </div>
    <p className="sx-note">{paymentsEnabled ? "Pay securely online with Razorpay. We’ll confirm your reservation after payment is verified." : "No payment is collected now. Send your request and the host will review it within one working day."}</p>
  </aside>;
}

export default function Checkout() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const stay = getStay(slug);
  const mode = stay?.bookingMode === "instant" ? "instant" : "request";
  const paymentsEnabled = window.BDS_WORDPRESS?.paymentsEnabled === true;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { search, setSearch } = useStays();
  const avail = useAvailability(stay?.name);
  const [draft, setDraft] = useState(() => ({ step: "trip", name: "", email: "", phone: "", message: "", agree: false, ...readDraft() }));
  const [edit, setEdit] = useState(null);
  const [status, setStatus] = useState({ busy: false, error: "" });
  usePageTitle(`${mode === "request" ? "Request to book" : "Confirm and book"} · ${stay?.name || "Stay"}`);
  useEffect(() => { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); }, [draft]);
  useEffect(() => {
    const ci = params.get("checkin"), co = params.get("checkout");
    const patch = ci && co && co > ci ? { checkIn: ci, checkOut: co } : {};
    ["adults", "children", "infants", "pets"].forEach((k) => { const v = params.get(k); if (v !== null && /^\d+$/.test(v)) patch[k] = Number(v); });
    if (Object.keys(patch).length) setSearch(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (user) setDraft((d) => ({ ...d, name: d.name || user.name || "", email: d.email || user.email || "", step: d.step === "account" ? "details" : d.step })); }, [user]);
  if (!stay) return <main className="sx-page sx-center"><div className="sx-empty"><h2>Stay not found</h2><Link className="sx-btn sx-btn--primary" to="/stays/search">Browse stays</Link></div></main>;

  const nights = nightsBetween(search.checkIn, search.checkOut);
  const steps = ["trip", ...(user ? [] : ["account"]), "details", "review"];
  const stepIndex = Math.max(0, steps.indexOf(draft.step));
  const setStep = (step) => { setStatus({ busy: false, error: "" }); setDraft((d) => ({ ...d, step })); };
  const tripError = !nights ? "Choose your check-in and checkout dates." : !rangeFree(search.checkIn, search.checkOut, avail.booked) ? "Those nights are already booked. Pick different dates." : !search.adults ? "Add at least one adult." : guestCount(search) > stay.guests ? `This stay sleeps up to ${stay.guests} guests.` : "";
  const detailsError = !draft.name.trim() ? "Enter your full name." : !/^\S+@\S+\.\S+$/.test(draft.email.trim()) ? "Enter a valid email address." : draft.phone.replace(/\D/g, "").length < 7 ? "Enter a phone number the host can reach you on." : "";
  const next = () => {
    const err = draft.step === "trip" ? tripError : draft.step === "details" ? detailsError : "";
    if (err) { setStatus({ busy: false, error: err }); return; }
    setStep(steps[stepIndex + 1]);
  };
  const submit = async () => {
    if (tripError || detailsError) { setStatus({ busy: false, error: tripError || detailsError }); return; }
    if (!draft.agree) { setStatus({ busy: false, error: "Please accept the house rules and cancellation policy." }); return; }
    setStatus({ busy: true, error: "" });
    try {
      navigate(`/stays/payment/${stay.slug}`);
    } catch (e) {
      if (e.status === 401) { setDraft((d) => ({ ...d, step: "account" })); setStatus({ busy: false, error: "Please sign in again to finish your booking." }); return; }
      setStatus({ busy: false, error: e.message });
    }
  };
  const labels = { trip: "Your trip", account: "Log in or sign up", details: "Your details", review: mode === "request" ? "Review and send request" : "Review and book" };

  return <main className="sx-page sx-page--checkout" data-testid="checkout-page">
    <div className="sx-wrap sx-co">
      <div className="sx-co__head"><button type="button" className="sx-icon-btn" onClick={() => navigate(`/stays/home/${stay.slug}`)} aria-label="Back to stay" data-testid="checkout-back"><ArrowLeft size={18} /></button><h1>{mode === "request" ? "Request to book" : "Confirm and book"}</h1></div>
      <p className="sx-note" data-testid="checkout-booking-policy">{mode === "instant" ? "This stay confirms instantly when your dates are available." : "This stay requires host approval. We’ll reply within one working day."}</p>
      <div className="sx-co__grid">
        <div className="sx-co__steps">
          {steps.map((s, k) => {
            const open = s === draft.step, done = k < stepIndex;
            return <section key={s} className={`sx-step ${open ? "is-open" : ""} ${done ? "is-done" : ""}`} data-testid={`checkout-step-${s}`}>
              <header><h2><span>{done ? <Check size={14} /> : k + 1}</span>{labels[s]}</h2>{done && <button type="button" className="sx-u sx-link" onClick={() => setStep(s)} data-testid={`checkout-edit-${s}`}>Edit</button>}</header>
              <AnimatePresence initial={false}>{open && <motion.div className="sx-step__body" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }}>
                {s === "trip" && <div className="sx-trip">
                  <div className="sx-trip__row"><div><strong>Dates</strong><span>{nights ? `${fmtLong(search.checkIn)} → ${fmtLong(search.checkOut)}` : "Not selected"}</span></div><button type="button" className="sx-u sx-link" onClick={() => setEdit("dates")} data-testid="checkout-edit-dates">Edit</button></div>
                  <div className="sx-trip__row"><div><strong>Guests</strong><span>{guestLabel(search) || "Not selected"}</span></div><button type="button" className="sx-u sx-link" onClick={() => setEdit("guests")} data-testid="checkout-edit-guests">Edit</button></div>
                </div>}
                {s === "account" && <AuthPanel />}
                {s === "details" && <div className="sx-form">
                  {user && <p className="sx-note" data-testid="checkout-signed-in">Signed in as {user.email}</p>}
                  <div className="sx-frow"><label className="sx-field"><span>Full name</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoComplete="name" data-testid="checkout-name" /></label><label className="sx-field"><span>Phone</span><input type="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} autoComplete="tel" placeholder="+91" data-testid="checkout-phone" /></label></div>
                  <label className="sx-field"><span>Email</span><input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} autoComplete="email" data-testid="checkout-email" /></label>
                  <label className="sx-field"><span>Message to the host (optional)</span><textarea rows={3} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} placeholder="Arrival time, occasion, materials walkthrough…" data-testid="checkout-message" /></label>
                </div>}
                {s === "review" && <div className="sx-review-step">
                  <h3>Cancellation policy {POLICIES.draft && <span className="sx-pilltag sx-pilltag--muted">Host to confirm</span>}</h3><p>{POLICIES.cancellation}</p>
                  <h3>Ground rules</h3><p>Check-in after {POLICIES.checkIn} · checkout before {POLICIES.checkOut}. {POLICIES.rules.join(" · ")}.</p>
                  <h3>Payment</h3><p>{paymentsEnabled ? <>Pay securely in Indian rupees using Razorpay. {mode === "instant" ? "Your reservation is confirmed after payment is verified." : "Your paid request is sent to the host for approval; we’ll contact you within one working day."}</> : "Online payment is not configured yet. No payment will be collected; this will be sent to the host as a booking request for approval."}</p>
                  <label className="sx-toggle"><input type="checkbox" checked={draft.agree} onChange={(e) => setDraft({ ...draft, agree: e.target.checked })} data-testid="checkout-agree" /><span>I agree to the house rules, cancellation policy and BDS Marvel's booking terms.</span></label>
                </div>}
                {status.error && <p className="sx-error" role="alert" data-testid="checkout-error">{status.error}</p>}
                {s !== "account" && (s === "review"
                  ? <button type="button" className="sx-btn sx-btn--primary sx-btn--lg" onClick={submit} disabled={status.busy} data-testid="checkout-submit">{status.busy ? <><Loader2 size={16} className="sx-spin" /> {paymentsEnabled ? "Preparing secure payment…" : "Sending request…"}</> : paymentsEnabled ? <>Continue to payment · {inr(stay.nightly * nights)}</> : <>Send booking request</>}</button>
                  : <button type="button" className="sx-btn sx-btn--dark" onClick={next} data-testid={`checkout-next-${s}`}>Continue</button>)}
              </motion.div>}</AnimatePresence>
            </section>;
          })}
        </div>
        <Summary stay={stay} search={search} nights={nights} paymentsEnabled={paymentsEnabled} />
      </div>
    </div>
    <Modal open={edit === "dates"} onClose={() => setEdit(null)} title="Change dates" size="lg" testId="edit-dates-modal" footer={<><button type="button" className="sx-link" onClick={() => setSearch({ checkIn: "", checkOut: "" })}>Clear dates</button><button type="button" className="sx-btn sx-btn--dark" onClick={() => setEdit(null)} data-testid="edit-dates-save">Save</button></>}>
      <RangeCalendar checkIn={search.checkIn} checkOut={search.checkOut} booked={avail.booked} availabilityReady={!avail.loading && !avail.error} months={window.innerWidth < 768 ? 1 : 2} minNights={stay.minNights} onChange={setSearch} testId="checkout-calendar" />
    </Modal>
    <Modal open={edit === "guests"} onClose={() => setEdit(null)} title="Guests" testId="edit-guests-modal" footer={<button type="button" className="sx-btn sx-btn--dark" onClick={() => setEdit(null)} data-testid="edit-guests-save">Save</button>}>
      <GuestCounters value={search} capacity={stay.guests} onChange={setSearch} testId="checkout-guests" />
    </Modal>
  </main>;
}
