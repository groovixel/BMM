// Site data (stays, tiers, image helper) is registered by App.js to avoid a circular import
const source = { stays: [], stayTiers: [], img: (id) => id };
export function registerStaysData(data) { Object.assign(source, data); cache = null; }
export const img = (...args) => source.img(...args);
export const getTiers = () => source.stayTiers;

// Approximate city-level coordinates and listing facts per stay (beds/baths are placeholders to confirm)
const META = {
  "living-studio": { lat: 18.6414, lng: 72.8722, type: "Villa", beds: 3, baths: 3 },
  "stone-pavilion": { lat: 18.7546, lng: 73.4062, type: "Pavilion", beds: 4, baths: 4 },
  "marble-house": { lat: 24.5854, lng: 73.7125, type: "Villa", beds: 3, baths: 3 },
  "verandah-suite": { lat: 15.5966, lng: 73.7675, type: "Villa", beds: 2, baths: 2 },
  "atelier-penthouse": { lat: 19.0596, lng: 72.8295, type: "Penthouse", beds: 3, baths: 3 },
  "material-loft": { lat: 26.9124, lng: 75.7873, type: "Loft", beds: 2, baths: 2 },
  "oak-apartment": { lat: 18.5204, lng: 73.8567, type: "Apartment", beds: 2, baths: 1 },
  "kota-flat": { lat: 28.6139, lng: 77.209, type: "Apartment", beds: 1, baths: 1 },
  "terrace-rooms": { lat: 12.9716, lng: 77.5946, type: "Apartment", beds: 2, baths: 1 },
  "weavers-stay": { lat: 23.0225, lng: 72.5714, type: "Apartment", beds: 1, baths: 1 },
  "courtyard-room": { lat: 26.59, lng: 74.854, type: "Room", beds: 1, baths: 1 },
  "studio-nook": { lat: 26.4499, lng: 74.6399, type: "Room", beds: 1, baths: 1 },
  "workshop-room": { lat: 26.575, lng: 74.87, type: "Room", beds: 1, baths: 1 },
  "sunroom": { lat: 26.4897, lng: 74.5511, type: "Room", beds: 1, baths: 1 },
  "lime-wash-room": { lat: 26.9239, lng: 75.8267, type: "Room", beds: 1, baths: 1 },
};

// SAMPLE reviews (requested by the owner as placeholders) — replace with real guest reviews
const REVIEW_POOL = [
  ["Aarav", "Every surface felt considered. The stone in the bath alone was worth the trip.", 5],
  ["Meera", "Calm, spotless and beautifully finished. Check-in was effortless.", 5],
  ["Kabir", "We came to see the materials and left with a full spec for our own home.", 5],
  ["Ananya", "Lovely light through the day and a very comfortable bed.", 4],
  ["Rohan", "Quiet, well located and the hosts replied within minutes.", 5],
  ["Isha", "Felt like staying in a design magazine, but warm and lived-in.", 5],
  ["Vikram", "Great value. Small touches like the morning chai made it special.", 4],
  ["Sana", "The floors, the joinery, the textiles — you can tell who built it.", 5],
];
const REVIEW_MONTHS = ["January 2026", "February 2026", "March 2026", "April 2026", "May 2026"];

export const POLICIES = {
  checkIn: "2:00 PM",
  checkOut: "11:00 AM",
  cancellation: "Free cancellation up to 7 days before check-in. Within 7 days of arrival the first night is non-refundable.",
  rules: ["No parties or events", "No smoking indoors", "Pets on request — host confirms", "Quiet hours 10 PM – 7 AM"],
  safety: ["Smoke alarm", "First-aid kit", "Host on call during your stay"],
  draft: true,
};

export const priceNum = (text) => Number(String(text).replace(/[^\d]/g, ""));
export const inr = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;

let cache = null;
export function getStays() {
  if (cache) return cache;
  const baseStays = source.stays, stayTiers = source.stayTiers;
  const heroes = baseStays.map((s) => s.hero);
  cache = baseStays.map((stay, i) => {
    const meta = META[stay.slug] || { lat: 22.5, lng: 78.9, type: "Home", beds: stay.bedrooms, baths: stay.bedrooms };
    const gallery = [stay.hero, ...[1, 4, 7, 10].map((k) => heroes[(i + k) % heroes.length])];
    const reviews = [0, 1, 2, 3].map((k) => {
      const [name, text, rating] = REVIEW_POOL[(i * 3 + k) % REVIEW_POOL.length];
      return { name, text, rating, date: REVIEW_MONTHS[(i + k) % REVIEW_MONTHS.length] };
    });
    const rating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    const [city, state] = stay.location.split(",").map((part) => part.trim());
    return { ...stay, ...meta, city, state: state || city, nightly: priceNum(stay.price), gallery, reviews, rating: Math.round(rating * 100) / 100, minNights: 1, tierSlug: stayTiers.find((t) => t.name === stay.tier)?.slug };
  });
  return cache;
}
export const getStay = (slug) => getStays().find((s) => s.slug === slug);

export function getDestinations() {
  const seen = new Map();
  getStays().forEach((s) => {
    const key = s.location;
    if (!seen.has(key)) seen.set(key, { label: s.location, city: s.city, state: s.state, lat: s.lat, lng: s.lng, count: 0 });
    seen.get(key).count += 1;
  });
  const states = new Map();
  getStays().forEach((s) => states.set(s.state, (states.get(s.state) || 0) + 1));
  return [...[...states].map(([state, count]) => ({ label: state, city: state, state, count, region: true })), ...seen.values()];
}

export function distanceKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Dates are ISO "YYYY-MM-DD" strings in local time
export const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const fromISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = fromISO(s); d.setDate(d.getDate() + n); return toISO(d); };
export const todayISO = () => toISO(new Date());
export const nightsBetween = (a, b) => (a && b ? Math.round((fromISO(b) - fromISO(a)) / 86400000) : 0);
export const fmtDay = (s) => fromISO(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
export const fmtLong = (s) => fromISO(s).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
export const fmtRange = (a, b) => (a && b ? `${fmtDay(a)} – ${fmtDay(b)}` : a ? `${fmtDay(a)} – Add checkout` : "");
export const isNightBlocked = (day, booked) => booked.some((b) => day >= b.check_in && day < b.check_out);
export const rangeFree = (a, b, booked) => booked.every((x) => !(a < x.check_out && b > x.check_in));

export const guestCount = (s) => (s.adults || 0) + (s.children || 0);
export function guestLabel(s) {
  const g = guestCount(s);
  if (!g) return "";
  const parts = [`${g} guest${g > 1 ? "s" : ""}`];
  if (s.infants) parts.push(`${s.infants} infant${s.infants > 1 ? "s" : ""}`);
  if (s.pets) parts.push(`${s.pets} pet${s.pets > 1 ? "s" : ""}`);
  return parts.join(", ");
}
