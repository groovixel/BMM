import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { inr } from "./data";

// Google Maps tiles (no API key) rendered through Leaflet so price markers stay interactive
const GOOGLE_TILES = "https://{s}.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}";
const OSM_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const pinIcon = (label, state) => L.divIcon({ className: "sx-pin-wrap", html: `<span class="sx-pin ${state}">${label}</span>`, iconSize: null, iconAnchor: [0, 0] });

export function StaysMap({ items, selected, hovered, onSelect, labelFor = (s) => inr(s.nightly), single = false, testId = "stays-map" }) {
  const box = useRef(null);
  const map = useRef(null);
  const markers = useRef({});

  useEffect(() => {
    map.current = L.map(box.current, { zoomControl: false, scrollWheelZoom: !single, attributionControl: true });
    const google = L.tileLayer(GOOGLE_TILES, { subdomains: ["mt0", "mt1", "mt2", "mt3"], maxZoom: 19, attribution: "Map data ©Google" }).addTo(map.current);
    let failures = 0;
    google.on("tileerror", () => {
      failures += 1;
      if (failures !== 4 || !map.current) return;
      map.current.removeLayer(google);
      L.tileLayer(OSM_TILES, { subdomains: ["a", "b", "c"], maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map.current);
    });
    L.control.zoom({ position: "topright" }).addTo(map.current);
    map.current.on("click", () => onSelect?.(null));
    return () => { map.current.remove(); map.current = null; markers.current = {}; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    Object.values(markers.current).forEach((mk) => mk.remove());
    markers.current = {};
    items.forEach((s) => {
      const mk = L.marker([s.lat, s.lng], { icon: pinIcon(labelFor(s), ""), keyboard: true, title: s.name, riseOnHover: true }).addTo(m);
      mk.on("click", (e) => { L.DomEvent.stopPropagation(e); onSelect?.(s.slug); });
      markers.current[s.slug] = mk;
    });
    if (items.length === 1) m.setView([items[0].lat, items[0].lng], single ? 12 : 10);
    else if (items.length) m.fitBounds(L.latLngBounds(items.map((s) => [s.lat, s.lng])).pad(0.25), { maxZoom: 9 });
    else m.setView([22.5, 78.9], 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((s) => s.slug).join(","), items.map(labelFor).join(",")]);

  useEffect(() => {
    items.forEach((s) => {
      const mk = markers.current[s.slug];
      if (!mk) return;
      const state = s.slug === selected ? "is-selected" : s.slug === hovered ? "is-hover" : "";
      mk.setIcon(pinIcon(labelFor(s), state));
      mk.setZIndexOffset(state ? 1000 : 0);
    });
    if (selected && markers.current[selected]) map.current.panTo(markers.current[selected].getLatLng(), { animate: true, duration: 0.3 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, hovered, items]);

  useEffect(() => { const t = setTimeout(() => map.current?.invalidateSize(), 120); return () => clearTimeout(t); });

  return <div ref={box} className="sx-map" data-lenis-prevent data-testid={testId} />;
}
