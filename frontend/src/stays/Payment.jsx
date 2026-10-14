import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, LockKeyhole, Loader2, ShieldCheck } from "lucide-react";
import { fmtRange, getStay, guestLabel, img, inr, nightsBetween } from "./data";
import { api, useAuth, useStays } from "./store";
import { AuthPanel } from "./Auth";
import { usePageTitle } from "./usePageTitle";

const DRAFT_KEY = "bds_checkout_draft";
const getDraft = () => { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY)) || {}; } catch { return {}; } };

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Secure payment could not be loaded. Check your connection and try again."));
    document.body.appendChild(script);
  });
}

export default function Payment() {
  const { slug } = useParams();
  const stay = getStay(slug);
  const navigate = useNavigate();
  const { user } = useAuth();
  const paymentsEnabled = window.BDS_WORDPRESS?.paymentsEnabled === true;
  const { search } = useStays();
  const [draft] = useState(getDraft);
  const [state, setState] = useState({ busy: false, error: "" });
  const nights = nightsBetween(search.checkIn, search.checkOut);
  const total = stay && nights > 0 ? stay.nightly * nights : 0;
  usePageTitle(`${paymentsEnabled ? "Payment" : "Booking request"} · ${stay?.name || "Stay"}`);

  const pay = async () => {
    if (!stay || !nights || !draft.name || !draft.email || !draft.phone) {
      setState({ busy: false, error: "Your trip details are incomplete. Return to payment details and review them." });
      return;
    }
    setState({ busy: true, error: "" });
    try {
      const orderData = await api("/stays/payments/orders", { method: "POST", body: {
        stay_slug: stay.slug, check_in: search.checkIn, check_out: search.checkOut,
        adults: search.adults, children: search.children, infants: search.infants, pets: search.pets,
        name: draft.name.trim(), email: draft.email.trim(), phone: draft.phone.trim(), message: draft.message?.trim() || null,
      } });
      if (orderData.payment_required === false) {
        sessionStorage.removeItem(DRAFT_KEY);
        navigate(`/stays/trips/${orderData.booking.id}`, { replace: true, state: { booking: orderData.booking } });
        return;
      }
      await loadRazorpay();
      const checkout = new window.Razorpay({
        key: orderData.key_id,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "BDS Marvel",
        description: `${stay.name} · ${nights} night${nights === 1 ? "" : "s"}`,
        order_id: orderData.order_id,
        prefill: { name: draft.name, email: draft.email, contact: draft.phone },
        notes: { booking_reference: orderData.booking.reference },
        theme: { color: "#b99355" },
        handler: async (response) => {
          try {
            const booking = await api("/stays/payments/verify", { method: "POST", body: {
              booking_id: orderData.booking.id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            } });
            sessionStorage.removeItem(DRAFT_KEY);
            navigate(`/stays/trips/${booking.id}`, { replace: true, state: { booking } });
          } catch (error) {
            setState({ busy: false, error: error.message || "Payment was received but needs verification. Please contact BDS Marvel." });
          }
        },
        modal: { ondismiss: () => setState({ busy: false, error: "Payment was not completed. Your dates are held briefly while you retry." }) },
      });
      checkout.on("payment.failed", (response) => setState({ busy: false, error: response.error?.description || "Payment failed. Please try again." }));
      checkout.open();
      setState({ busy: false, error: "" });
    } catch (error) {
      setState({ busy: false, error: error.message || "Could not start secure payment." });
    }
  };

  if (!stay) return <main className="sx-page sx-center"><div className="sx-empty"><h2>Stay not found</h2><Link className="sx-btn sx-btn--primary" to="/stays">Browse stays</Link></div></main>;
  if (user === null) return <main className="sx-page sx-center" role="status">Loading your account…</main>;
  if (user === false) return <main className="sx-page sx-page--checkout"><div className="sx-wrap sx-co"><div className="sx-co__head"><button className="sx-icon-btn" onClick={() => navigate(-1)} aria-label="Back"><ArrowLeft size={18} /></button><h1>Sign in to continue</h1></div><p className="sx-note">Your stay details are saved while you sign in.</p><AuthPanel /></div></main>;
  if (!nights || total <= 0) return <main className="sx-page sx-center"><div className="sx-empty"><h2>Choose your dates first</h2><Link className="sx-btn sx-btn--primary" to={`/stays/book/${stay.slug}`}>Return to payment details</Link></div></main>;

  return <main className="sx-page sx-page--checkout sx-page--payment" data-testid="stay-payment-page">
    <div className="sx-wrap sx-co">
      <div className="sx-co__head"><button type="button" className="sx-icon-btn" onClick={() => navigate(`/stays/book/${stay.slug}`)} aria-label="Back to payment details"><ArrowLeft size={18} /></button><h1>{paymentsEnabled ? "Complete your payment" : "Send booking request"}</h1></div>
      <p className="sx-note">{paymentsEnabled ? "Secure Razorpay payment will open. Your reservation is confirmed only after payment is verified." : "No payment will be collected now. Your booking request will go to the host for review."}</p>
      <div className="sx-co__grid">
        <section className="sx-pay-card">
          <div className="sx-pay-card__brand"><span className="sx-pay-card__mark">B</span><div><span className="sx-kicker">BDS MARVEL · STAYS</span><h2>Payment summary</h2></div></div>
          <div className="sx-co__stay"><img src={img(stay.hero, 400)} alt={stay.name} /><div><strong>{stay.name}</strong><span className="sx-muted">{stay.type} in {stay.location}</span></div></div>
          <dl className="sx-pay-details"><div><dt>Dates</dt><dd>{fmtRange(search.checkIn, search.checkOut)}</dd></div><div><dt>Guests</dt><dd>{guestLabel(search)}</dd></div><div><dt>Price</dt><dd>{inr(stay.nightly)} × {nights} nights</dd></div><div className="sx-pay-total"><dt>{paymentsEnabled ? "Total due" : "Estimated total"}</dt><dd>{inr(total)}</dd></div></dl>
          {paymentsEnabled && <div className="sx-pay-secure"><ShieldCheck size={18} /><span>Secure payment processing by Razorpay</span><LockKeyhole size={15} /></div>}
          {state.error && <p className="sx-error" role="alert" data-testid="payment-error">{state.error}</p>}
          <button type="button" className="sx-btn sx-btn--primary sx-btn--lg sx-pay-button" onClick={pay} disabled={state.busy} data-testid="payment-start">{state.busy ? <><Loader2 size={17} className="sx-spin" /> {paymentsEnabled ? "Preparing secure payment…" : "Sending request…"}</> : paymentsEnabled ? <>Pay {inr(total)} securely <ArrowLeft size={16} className="sx-pay-arrow" /></> : <>Send booking request <ArrowLeft size={16} className="sx-pay-arrow" /></>}</button>
          <p className="sx-pay-foot"><Check size={14} /> {paymentsEnabled ? "You’ll receive a booking reference after payment verification." : "You’ll receive a booking reference. No payment is collected until online payments are configured."}</p>
        </section>
        <aside className="sx-co__summary sx-pay-aside"><span className="sx-kicker">YOUR HOST</span><h2>BDS Marvel</h2><p>For help with your booking{paymentsEnabled ? " or payment" : " request"}, contact our team and quote your stay dates.</p><Link to="/contact" className="sx-btn sx-btn--outline">Contact us</Link></aside>
      </div>
    </div>
  </main>;
}
