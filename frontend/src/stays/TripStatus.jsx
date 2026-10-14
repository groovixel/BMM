import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CalendarCheck, Clock, Loader2 } from "lucide-react";
import { POLICIES, fmtLong, getStay, img, inr } from "./data";
import { api, useAuth } from "./store";
import { AuthPanel } from "./Auth";
import { usePageTitle } from "./usePageTitle";

export default function TripStatus() {
  const { id } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const [state, setState] = useState({ booking: location.state?.booking || null, loading: !location.state?.booking, error: "" });
  usePageTitle("Your trip | BDSM Stays");
  useEffect(() => {
    if (user === null || state.booking) return;
    if (user === false) { setState((s) => ({ ...s, loading: false })); return; }
    api(`/stays/bookings/${id}`).then((booking) => setState({ booking, loading: false, error: "" })).catch((e) => setState({ booking: null, loading: false, error: e.message }));
  }, [id, user, state.booking]);

  if (state.loading || user === null) return <main className="sx-page sx-center"><Loader2 size={28} className="sx-spin" /></main>;
  if (!state.booking) return <main className="sx-page sx-center"><div className="sx-empty" data-testid="trip-unavailable">{user === false ? <><h2>Log in to view this trip</h2><AuthPanel /></> : <><h2>Trip not found</h2><p>{state.error}</p><Link className="sx-btn sx-btn--primary" to="/stays">Back to stays</Link></>}</div></main>;
  const b = state.booking;
  const stay = getStay(b.stay_slug);
  const confirmed = b.status === "confirmed";
  const paymentConflict = b.status === "payment_conflict";
  const declined = b.status === "declined";
  const paid = ["paid", "paid_conflict", "refund_pending", "refund_failed"].includes(b.payment_status);
  const unpaidRequest = b.status === "requested" && !paid;
  const steps = paymentConflict
    ? ["Your payment was received, but another reservation overlaps these dates.", "Please contact BDS Marvel with your booking reference so we can arrange a refund."]
    : declined
      ? [b.payment_status === "refund_pending" ? "The host declined this request and a refund has been requested from Razorpay." : b.payment_status === "refund_failed" ? "The host declined this request. Please contact BDS Marvel to arrange your refund." : "The host declined this request.", "Refund timing depends on your bank or payment method."]
    : confirmed
      ? ["Your payment is verified and the host has your reservation details.", `Check in from ${POLICIES.checkIn} on ${fmtLong(b.check_in)} — the exact address and arrival notes follow by email.`, "Your stay is paid in full online."]
      : unpaidRequest
      ? ["Your booking request was sent to the host for review.", "No payment was collected. The host will contact you within one working day.", "Your stay is not confirmed until the host approves it."]
      : ["Your payment is verified and the host reviews your request within one working day.", "This paid request is not confirmed yet; the host will contact you with the decision.", "If the host cannot accept your dates, BDS Marvel will contact you about the refund."];
  return <main className="sx-page sx-page--trip" data-testid="trip-status">
    <motion.div className="sx-wrap sx-trip-wrap" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className={`sx-status sx-status--${confirmed ? "ok" : "pending"}`} data-testid={`trip-status-${b.status}`}>
        {confirmed ? <CalendarCheck size={28} /> : <Clock size={28} />}
        <div><h1>{paymentConflict ? "Payment needs attention" : declined ? "Request declined" : confirmed ? "You're booked!" : unpaidRequest ? "Booking request sent" : "Paid request — pending host approval"}</h1><p>Booking reference <strong data-testid="trip-reference">{b.reference}</strong></p></div>
      </div>
      <div className="sx-trip-card">
        {stay && <img src={img(stay.hero, 900)} alt={stay.name} />}
        <div className="sx-trip-card__body">
          <h2>{b.stay}</h2><span className="sx-muted">{stay?.location}</span>
          <dl>
            <div><dt>Check-in</dt><dd data-testid="trip-checkin">{fmtLong(b.check_in)}</dd></div>
            <div><dt>Checkout</dt><dd data-testid="trip-checkout">{fmtLong(b.check_out)}</dd></div>
            <div><dt>Guests</dt><dd>{b.guests} guest{b.guests > 1 ? "s" : ""}{b.infants ? `, ${b.infants} infant${b.infants > 1 ? "s" : ""}` : ""}{b.pets ? `, ${b.pets} pet${b.pets > 1 ? "s" : ""}` : ""}</dd></div>
            <div><dt>Total</dt><dd data-testid="trip-total">{inr(b.total)} · {b.nights} night{b.nights > 1 ? "s" : ""}</dd></div>
            <div><dt>Payment</dt><dd><span className={`sx-pilltag ${paid ? "" : "sx-pilltag--muted"}`}>{paymentConflict ? "Paid · contact us" : b.payment_status === "refund_pending" ? "Refund requested" : b.payment_status === "refund_failed" ? "Refund needs attention" : paid ? "Paid online" : b.payment_status === "not_required" ? "No payment collected" : b.payment_status || "Unpaid"}</span></dd></div>
            <div><dt>Status</dt><dd><span className={`sx-pilltag ${confirmed ? "" : "sx-pilltag--muted"}`}>{paymentConflict ? "Needs review" : declined ? "Declined" : confirmed ? "Confirmed" : "Awaiting host"}</span></dd></div>
          </dl>
        </div>
      </div>
      <section className="sx-dsec"><h2>What happens next</h2><ol className="sx-next">{steps.map((s) => <li key={s}>{s}</li>)}</ol></section>
      <div className="sx-trip-actions"><Link className="sx-btn sx-btn--dark" to="/stays" data-testid="trip-back-stays">Explore more stays</Link><Link className="sx-btn sx-btn--outline" to="/stays/trips" data-testid="trip-all-trips">All your trips</Link>{stay && <Link className="sx-btn sx-btn--outline" to={`/stays/home/${stay.slug}`} data-testid="trip-view-stay">View the stay</Link>}</div>
    </motion.div>
  </main>;
}
