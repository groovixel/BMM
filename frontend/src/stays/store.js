import { createContext, createElement, useCallback, useContext, useEffect, useState } from "react";

const API = process.env.REACT_APP_BACKEND_URL;

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => (e && typeof e.msg === "string" ? e.msg.replace(/^Value error, /, "") : JSON.stringify(e))).join(" ");
  if (typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API}/api${path}`, { method, credentials: "include", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(formatApiError(data.detail)); err.status = res.status; throw err; }
  return data;
}

const read = (storage, key, fallback) => { try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; } };

export const EMPTY_SEARCH = { where: "", lat: null, lng: null, nearby: false, checkIn: "", checkOut: "", adults: 0, children: 0, infants: 0, pets: 0, flex: 0, tier: "" };

const StaysCtx = createContext(null);
export function StaysProvider({ children }) {
  const [search, setSearchState] = useState(() => ({ ...EMPTY_SEARCH, ...read(sessionStorage, "bds_stay_search", {}) }));
  const [favs, setFavs] = useState(() => read(localStorage, "bds_stay_favs", []));
  useEffect(() => { sessionStorage.setItem("bds_stay_search", JSON.stringify(search)); }, [search]);
  useEffect(() => { localStorage.setItem("bds_stay_favs", JSON.stringify(favs)); }, [favs]);
  const setSearch = useCallback((patch) => setSearchState((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) })), []);
  const toggleFav = useCallback((slug) => setFavs((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug])), []);
  return createElement(StaysCtx.Provider, { value: { search, setSearch, favs, toggleFav } }, children);
}
export const useStays = () => useContext(StaysCtx);

const AuthCtx = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const check = useCallback(async () => {
    try { const data = await api("/auth/status"); setUser(data.user || false); }
    catch { setUser(false); }
  }, []);
  useEffect(() => {
    // Returning from Google: AuthCallback exchanges the session first
    if (window.location.hash?.includes("session_id=")) { setUser(false); return; }
    check();
  }, [check]);
  const logout = useCallback(async () => { await api("/auth/logout", { method: "POST" }).catch(() => {}); setUser(false); }, []);
  return createElement(AuthCtx.Provider, { value: { user, setUser, logout, check } }, children);
}
export const useAuth = () => useContext(AuthCtx);

export function useAvailability(stayName) {
  const [state, setState] = useState({ booked: [], requested: [], loading: true, error: "" });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    api(`/stays/availability${stayName ? `?stay=${encodeURIComponent(stayName)}` : ""}`)
      .then((d) => live && setState({ booked: d.booked || [], requested: d.requested || [], loading: false, error: "" }))
      .catch(() => live && setState({ booked: [], requested: [], loading: false, error: "Couldn't load live availability. Dates will be re-checked when you book." }));
    return () => { live = false; };
  }, [stayName]);
  return state;
}

export function useIsMobile(query = "(max-width: 768px)") {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => { const mq = window.matchMedia(query); const on = () => setMatch(mq.matches); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, [query]);
  return match;
}
