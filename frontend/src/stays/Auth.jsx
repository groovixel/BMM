import { nativeWordPress } from "../wordpress";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api, useAuth } from "./store";

const GoogleMark = () => <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>;

export function AuthPanel({ onDone, returnTo }) {
  const { setUser } = useAuth();
  const [tab, setTab] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [status, setStatus] = useState({ busy: false, error: "" });
  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const google = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = returnTo ? window.location.origin + returnTo : window.location.origin + window.location.pathname + window.location.search;
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!form.email.trim() || !form.password || (tab === "register" && !form.name.trim())) { setStatus({ busy: false, error: "Please fill in every field." }); return; }
    if (tab === "register" && form.password.length < 8) { setStatus({ busy: false, error: "Password must be at least 8 characters." }); return; }
    setStatus({ busy: true, error: "" });
    try {
      const body = tab === "login" ? { email: form.email.trim(), password: form.password } : { name: form.name.trim(), email: form.email.trim(), password: form.password };
      const user = await api(`/auth/${tab}`, { method: "POST", body });
      setUser(user);
      onDone?.(user);
    } catch (err) { setStatus({ busy: false, error: err.message }); }
  };
  return <div className="sx-auth" data-testid="auth-panel">
    <div className="sx-tabs" role="tablist">
      {[["login", "Log in"], ["register", "Sign up"]].map(([k, l]) => <button type="button" role="tab" key={k} aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => { setTab(k); setStatus({ busy: false, error: "" }); }} data-testid={`auth-tab-${k}`}>{l}</button>)}
    </div>
    <form onSubmit={submit} noValidate className="sx-form">
      {tab === "register" && <label className="sx-field"><span>Full name</span><input value={form.name} onChange={update("name")} autoComplete="name" data-testid="auth-name-input" /></label>}
      <label className="sx-field"><span>Email</span><input type="email" value={form.email} onChange={update("email")} autoComplete="email" data-testid="auth-email-input" /></label>
      <label className="sx-field"><span>Password</span><input type="password" value={form.password} onChange={update("password")} autoComplete={tab === "login" ? "current-password" : "new-password"} data-testid="auth-password-input" /></label>
      {status.error && <p className="sx-error" role="alert" data-testid="auth-error">{status.error}</p>}
      <button type="submit" className="sx-btn sx-btn--primary sx-btn--block" disabled={status.busy} data-testid="auth-submit">{status.busy ? <Loader2 size={16} className="sx-spin" /> : null}{tab === "login" ? "Continue" : "Create account"}</button>
    </form>
    {nativeWordPress && <a className="sx-link" href={window.BDS_WORDPRESS.passwordResetUrl}>Forgot your password?</a>}
    {!nativeWordPress && <div className="sx-or"><span>or</span></div>}
    {!nativeWordPress && <button type="button" className="sx-btn sx-btn--outline sx-btn--block" onClick={google} data-testid="auth-google"><GoogleMark /> Continue with Google</button>}
    <p className="sx-note">Your trip details are saved — you'll come straight back to this step.</p>
  </div>;
}

export function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const done = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const sessionId = new URLSearchParams(location.hash.slice(1)).get("session_id");
    api("/auth/session", { method: "POST", body: { session_id: sessionId } })
      .then((user) => { setUser(user); navigate(`${location.pathname}${location.search}`, { replace: true }); })
      .catch((e) => { setError(e.message); setUser(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <main className="sx-page sx-center" data-testid="auth-callback">{error ? <div className="sx-empty"><h2>Sign-in didn't complete</h2><p>{error}</p><button className="sx-btn sx-btn--primary" onClick={() => navigate(`${location.pathname}${location.search}`, { replace: true })} data-testid="auth-callback-back">Back to booking</button></div> : <Loader2 className="sx-spin" size={28} />}</main>;
}
