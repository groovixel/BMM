import { wordpressContent, DynamicFields, formSettings } from "./wordpress-content";
import { apiFetch, apiPath, publicAsset } from "./wordpress";
import { lazy, Suspense, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, createContext } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, Facebook, Instagram, Linkedin, Loader2, Search, Twitter, User, X, Youtube } from "lucide-react";
import { BrowserRouter, HashRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useNavigationType, useParams } from "react-router-dom";
import OwnerDashboard from "./owner/OwnerDashboard";
import { motion, useScroll, useTransform } from "framer-motion";
import "@/App.css";
import { initSmoothScroll, smoothScrollTo, startSmoothScroll, stopSmoothScroll } from "@/lib/smoothScroll";
import { AuthProvider, StaysProvider, useAuth } from "./stays/store";
import { registerStaysData } from "./stays/data";
import "@/stays/stays.css";
import { buildMaterialGallery } from "@/catalogueGallery";

const AuthCallback = lazy(() => import("./stays/Auth").then((module) => ({ default: module.AuthCallback })));
const StaysHome = lazy(() => import("./stays/StaysHome"));
const StaysSearch = lazy(() => import("./stays/StaysSearch"));
const StayDetail = lazy(() => import("./stays/StayDetail"));
const Checkout = lazy(() => import("./stays/Checkout"));
const StayPayment = lazy(() => import("./stays/Payment"));
const TripStatus = lazy(() => import("./stays/TripStatus"));
const MyTrips = lazy(() => import("./stays/MyTrips"));
const Account = lazy(() => import("./stays/Account"));

const IMG = "https://images.unsplash.com/";
const img = (id, w = 1600) => id.startsWith("http") ? id : `${IMG}${id}?auto=format&fit=crop&w=${w}&q=80`;
const Router = (window.BDS_WORDPRESS?.routerMode || (process.env.REACT_APP_WORDPRESS_MODE === "true" ? "hash" : "browser")) === "hash" ? HashRouter : BrowserRouter;

// Scroll position per history entry (for back/forward scroll restoration)
const scrollPositions = new Map();
// Scroll position per pathname (for in-app "back" links that push a new entry)
const scrollByPath = new Map();

const segments = wordpressContent("segments", [
  { slug: "interior-designing", name: "INTERIOR DESIGNING", parent: "BDS Marvel", kicker: "Concept to detail", tone: "sage", tagline: "Design that decides before the build begins.", body: "Concept, spatial planning, material palettes and detailing — resolved with our own stone, flooring and construction teams before a single wall is touched.", hero: "photo-1631679706909-1844bbd07221", services: ["Concept & Moodboards", "Space Planning", "Material Palettes", "3D Visualisation"], team: ["Principal designers", "Visualisation studio", "Procurement desk"] },
  { slug: "construction", name: "CONSTRUCTION", parent: "Formwork", kicker: "Turnkey execution", tone: "charcoal", tagline: "Buildings built the way the material wants to be used.", body: "Foundation, structure, finishes and site management for residential, hospitality and commercial builds — with a material-first sensibility.", hero: "photo-1503387762-592deb58ef4e", services: ["Civil Structure", "Finishing", "MEP Coordination", "Site Management"], team: ["Project directors", "Site engineers", "MEP consultants"] },
  { slug: "marble-and-stone", name: "MARBLE & STONE", parent: "Drawstones", kicker: "Interior stone", tone: "sand", tagline: "Stone that carries the building's silhouette.", body: "Facade and face stone for structures that need to age well. Interior stone — tables, fountains, decorative work — cut and finished in our own workshops.", hero: "photo-1618221195710-dd6b41faaea6", services: ["Facade Stone", "Face Stone", "Marble Slabs", "Decorative Stone"], team: ["Sourcing — Western India quarries", "Fabrication — Kishangarh workshop", "Installation — In-house crew"] },
  { slug: "flooring", name: "FLOORING", parent: "Renest", kicker: "Distribution + Proprietary", tone: "bronze", tagline: "Flooring, specified for how a space is actually lived in.", body: "Residential, hospitality and commercial projects — a distributed range and a proprietary line built for high-traffic floors.", hero: "photo-1616486338812-3dadae4b4ace", services: ["Wooden Plank", "Vinyl / SPC", "Stone Composite", "Sports & Contract"], team: ["Specification support", "Warehousing — Delhi NCR", "Installation partners"] },
  { slug: "furniture", name: "FURNITURE", parent: "Grain", kicker: "Bespoke & crafted", tone: "pink", tagline: "Furniture built the way architecture is.", body: "Tables, seating, storage and joinery in solid wood, stone and metal — designed and built in our own workshops to outlast daily use.", hero: "photo-1631396326646-c06a935ff3a6", services: ["Bespoke Furniture", "Tables & Desks", "Seating", "Storage & Joinery"], team: ["Furniture designers", "Master carpenters", "Finishing studio"] },
  { slug: "interiors", name: "INTERIOR DECOR", parent: "Vignette", kicker: "Design + Build", tone: "terracotta", tagline: "Interiors that don't stop at the finishes.", body: "Spatial planning, custom furniture, materials, lighting and installation — designed and executed for residential and commercial spaces.", hero: "photo-1600585154340-be6161a56a0c", services: ["Residential", "Hospitality", "Retail", "Bespoke Furniture"], team: ["Design leads", "Project executioners", "Craft partners"] },
]);

const livingStudio = wordpressContent("livingStudio", {
  name: "Air BnB Living Studio",
  kicker: "Stayable showroom",
  tagline: "Not a showroom — a home we built ourselves.",
  body: "A guesthouse we built ourselves — our own stone, flooring, finishes and furniture throughout. Stay the night, live with every surface and plan your project from inside a working home.",
  hero: "photo-1600607687939-ce8a6c25118c",
  details: ["Three suites", "Material library", "Hosted walkthroughs"],
});

const stays = wordpressContent("stays", [
  // Premium — experience our work first-hand
  { slug: "living-studio", tier: "Premium", name: "The Living Studio", location: "Alibaug, Maharashtra", price: "₹28,000", guests: 6, bedrooms: 3, hero: "photo-1600607687939-ce8a6c25118c", blurb: "Our flagship stayable showroom — every surface is our own work.", description: "The premium way to experience BDS Marvel: a full guesthouse built end-to-end with our own stone, flooring, finishes and furniture. Stay the night, host your architect over breakfast, walk the materials library with our consultant and specify your project from inside a working reference.", amenities: ["Three ensuite suites", "Hosted materials walkthrough", "Private garden + sunken lounge", "Full breakfast & chef on request", "Sample library access", "Airport transfer on request"] },
  { slug: "stone-pavilion", tier: "Premium", name: "The Stone Pavilion", location: "Lonavala, Maharashtra", price: "₹32,000", guests: 8, bedrooms: 4, hero: "photo-1747258818911-dfde27ecabba", blurb: "A pavilion of glass and our own basalt, wrapped around a reflecting pool.", description: "Four suites arranged around a still reflecting pool, every wall in basalt we cut ourselves. Evenings on the water court, mornings in the sauna — the full BDS Marvel material palette at its most resolved.", amenities: ["Four pool-facing suites", "Private sauna & plunge", "Chef-led dinners", "Materials walkthrough", "Bonfire court", "Driver on call"] },
  { slug: "marble-house", tier: "Premium", name: "The Marble House", location: "Udaipur, Rajasthan", price: "₹30,000", guests: 6, bedrooms: 3, hero: "photo-1729605412224-147d072d3667", blurb: "Lake-facing suites in book-matched marble, ten minutes from the old city.", description: "A lake-facing residence where every bathroom is book-matched marble from our Kishangarh workshop. Sunset terraces, a butler pantry and quiet, cool rooms that show what stone does to light.", amenities: ["Three lake-view suites", "Book-matched marble baths", "Sunset terrace", "Butler pantry", "City walkthroughs on request"] },
  { slug: "verandah-suite", tier: "Premium", name: "The Verandah Suite", location: "Assagao, Goa", price: "₹24,000", guests: 4, bedrooms: 2, hero: "photo-1663811396672-83dd3f32f312", blurb: "A shaded laterite verandah, a plunge pool and nothing to prove.", description: "Our Goan outpost: laterite walls, a deep shaded verandah and a plunge pool under the trees. Two suites, an outdoor kitchen and the quietest version of our material palette.", amenities: ["Two garden suites", "Laterite verandah", "Plunge pool", "Outdoor kitchen", "Scooter on request"] },
  { slug: "atelier-penthouse", tier: "Premium", name: "The BDS Penthouse", location: "Bandra, Mumbai", price: "₹36,000", guests: 6, bedrooms: 3, hero: "photo-1756906838752-0b514ab37479", blurb: "Our city showcase — a split-level penthouse over the sea link skyline.", description: "The city flagship: a split-level penthouse with a double-height stone wall, terrazzo stair and a screening lounge. Host your project team, walk the flat with our designers and leave with a spec sheet.", amenities: ["Three skyline suites", "Double-height stone wall", "Screening lounge", "Design consult included", "Valet & chef on request"] },
  // Mid — design comfort, city ease
  { slug: "material-loft", tier: "Mid", name: "The Material Loft", location: "Jaipur, Rajasthan", price: "₹12,500", guests: 4, bedrooms: 2, hero: "photo-1737467030068-88ad20e617ca", blurb: "A warm city loft finished in our stone and oak — design comfort without the ceremony.", description: "A two-bedroom city loft for travellers who want to live with good material without the full showroom programme. Oak plank floors, honed stone counters and hand-finished lime walls — the same spec we install for clients, at an easy nightly rate.", amenities: ["Two queen bedrooms", "Full kitchen in honed stone", "Work nook with fibre wifi", "Self check-in", "Breakfast basket on request"] },
  { slug: "oak-apartment", tier: "Mid", name: "The Oak Apartment", location: "Pune, Maharashtra", price: "₹10,500", guests: 4, bedrooms: 2, hero: "photo-1789381500057-2a288d79e9e6", blurb: "Wall-to-wall oak, soft light and a proper work table.", description: "A calm two-bedroom apartment panelled in our engineered oak, with a long work table for travelling teams and a kitchen that invites slow mornings.", amenities: ["Two bedrooms", "Engineered oak throughout", "Dedicated work table", "Full kitchen", "Self check-in"] },
  { slug: "kota-flat", tier: "Mid", name: "The Kota Flat", location: "New Delhi", price: "₹9,800", guests: 3, bedrooms: 1, hero: "photo-1661796428175-55423b19409f", blurb: "A sunlit one-bed on Kota stone floors, minutes from the metro.", description: "A bright one-bedroom flat that shows off what humble Kota stone can do — cool floors, warm textiles, a reading corner and an easy commute to anywhere in the city.", amenities: ["One sunny bedroom", "Kota stone floors", "Reading corner", "Kitchenette", "Metro 5 min walk"] },
  { slug: "terrace-rooms", tier: "Mid", name: "The Terrace Rooms", location: "Bengaluru, Karnataka", price: "₹11,200", guests: 4, bedrooms: 2, hero: "photo-1781249144129-4ba0869707f5", blurb: "Two rooms, one big planted terrace, evening breeze included.", description: "A two-bedroom stay built around its planted terrace — outdoor dining for six, warm wood interiors and blackout shutters for proper sleep after long site days.", amenities: ["Two bedrooms", "Planted dining terrace", "Outdoor seating for six", "Blackout shutters", "Self check-in"] },
  { slug: "weavers-stay", tier: "Mid", name: "The Weaver's Stay", location: "Ahmedabad, Gujarat", price: "₹9,500", guests: 3, bedrooms: 1, hero: "photo-1781249144056-ec397e444dfa", blurb: "Textiles, lime plaster and a courtyard cafe downstairs.", description: "A one-bedroom stay above a courtyard cafe in the old textile district — lime plaster walls, handloom throws and our stone in the bath. Quiet, central, easy.", amenities: ["One bedroom + daybed", "Lime plaster & handloom", "Courtyard cafe below", "Stone-clad bath", "Self check-in"] },
  // Budget-friendly — honest rooms, honest prices
  { slug: "courtyard-room", tier: "Budget-friendly", name: "The Courtyard Room", location: "Kishangarh, Rajasthan", price: "₹5,800", guests: 2, bedrooms: 1, hero: "photo-1576354302919-96748cb8299e", blurb: "A simple, honest room beside our workshop — stone underfoot, sun in the courtyard.", description: "Our budget-friendly stay: a quiet, light-filled room next to the Kishangarh workshop. Honest materials, a proper bed, a shaded courtyard and chai from the studio kitchen. Perfect for a night between site visits — or your first look at what we make.", amenities: ["Queen bed, ensuite bath", "Shaded shared courtyard", "Studio chai & breakfast", "Workshop viewing on request", "Self check-in"] },
  { slug: "studio-nook", tier: "Budget-friendly", name: "The Studio Nook", location: "Ajmer, Rajasthan", price: "₹3,900", guests: 2, bedrooms: 1, hero: "photo-1759264244726-adde4e4318fc", blurb: "A neat little room five minutes from the dargah road.", description: "The simplest stay we make: a crisp bed, a writing desk, a hot shower and morning sun. Everything you need between trains, site visits and long drives.", amenities: ["Queen bed", "Writing desk", "Hot rain shower", "Morning chai", "Self check-in"] },
  { slug: "workshop-room", tier: "Budget-friendly", name: "The Workshop Room", location: "Kishangarh, Rajasthan", price: "₹4,200", guests: 2, bedrooms: 1, hero: "photo-1759264244746-140bbbc54e1b", blurb: "Fall asleep to the smell of cut stone — a room inside our workshop compound.", description: "A snug room inside the workshop compound for people who want to wake up where the material is made. Early morning cutting demos if you ask nicely.", amenities: ["Queen bed, ensuite", "Inside the workshop compound", "Cutting demos on request", "Studio breakfast", "Self check-in"] },
  { slug: "sunroom", tier: "Budget-friendly", name: "The Sunroom", location: "Pushkar, Rajasthan", price: "₹4,600", guests: 2, bedrooms: 1, hero: "photo-1781004667187-d1f862f8fa0b", blurb: "A glass-cornered room that catches the desert morning.", description: "A corner room wrapped in glass on two sides, five minutes from the lake ghats. Sunrise does the decorating; we did the stone floor and the very good mattress.", amenities: ["Glass corner room", "Stone floor", "Lake ghats 5 min", "Rooftop chai", "Self check-in"] },
  { slug: "lime-wash-room", tier: "Budget-friendly", name: "The Lime Wash Room", location: "Jaipur, Rajasthan", price: "₹4,900", guests: 2, bedrooms: 1, hero: "photo-1780399334790-64af9ffb45fc", blurb: "Hand-trowelled lime walls and a deep, dark night's sleep.", description: "A cocoon of hand-trowelled lime plaster in the old city — cool in summer, warm at night, with a tiny balcony for evening chai. Our cheapest night, and many guests' favourite.", amenities: ["Queen bed", "Hand-trowelled lime walls", "Chai balcony", "Old-city location", "Self check-in"] },
]);

const stayTiers = wordpressContent("stayTiers", [
  { slug: "premium", name: "Premium", headline: "Experience our work, first-hand.", copy: "Full homes built end-to-end with our own stone, floors and furniture — hosted walkthroughs, chef breakfasts and the materials library. Live in the reference before you specify it." },
  { slug: "mid", name: "Mid", headline: "Design comfort, city ease.", copy: "Finished apartments wearing our oak, stone and lime — work tables, good kitchens, self check-in and easy nightly rates." },
  { slug: "budget-friendly", name: "Budget-friendly", headline: "Honest rooms, honest prices.", copy: "Simple, light-filled rooms near our workshops and the old cities — the essentials done properly, from ₹3,900 a night." },
]);

registerStaysData({ stays, stayTiers, img });

const tierSlugOf = (tierName) => stayTiers.find((tier) => tier.name === tierName)?.slug || "premium";

const approach = wordpressContent("approach", [
  { number: "01", title: "MATERIAL FIRST", image: "photo-1618221195710-dd6b41faaea6", text: "Every project begins with the stone or the surface. Specification precedes drawings so the material never has to bend to fit the design." },
  { number: "02", title: "ONE TEAM", image: "photo-1600585154340-be6161a56a0c", text: "Materials, flooring, construction and interiors under one roof. One accountable team from the spec sheet to the snag list." },
  { number: "03", title: "EDITORIAL DETAIL", image: "photo-1616486338812-3dadae4b4ace", text: "Architectural minimalism, hospitality warmth. Joints, thresholds and reveals resolved with the same care as the elevation." },
  { number: "04", title: "HERITAGE + CRAFT", image: "photo-1503387762-592deb58ef4e", text: "Traditional cutting and finishing techniques paired with modern engineering. Craftspeople we have worked with for two decades." },
  { number: "05", title: "EXPERIENCE-LED", image: "photo-1600607687939-ce8a6c25118c", text: "Don't just see the materials — live in them. The BDSM Living Studio is our showroom you can actually stay in." },
]);

// Four stone tones shared with the network segments — purposes rotate through them
const purposeTones = ["sand", "bronze", "charcoal", "terracotta"];

const clients = wordpressContent("clients", [
  { name: "L&T — LNT Pvt Ltd", logo: publicAsset("/clients/lnt.webp") },
  { name: "Mangalam Organics", logo: publicAsset("/clients/mangalam.webp") },
  { name: "The Lalit", logo: publicAsset("/clients/lalit.webp") },
  { name: "ITC Hotels", logo: publicAsset("/clients/itc.webp") },
  { name: "Boutique Hotels", logo: publicAsset("/clients/boutique.webp") },
  { name: "Clarks Amer", logo: publicAsset("/clients/clarks-amer.webp") },
  { name: "NHAI", logo: publicAsset("/clients/nhai.webp") },
  { name: "Kshetrapal Hospital Ajmer", logo: publicAsset("/clients/kshetrapal.webp") },
  { name: "Mewar Estate Ajmer", logo: publicAsset("/clients/mewar-estate.webp") },
  { name: "JLN Hospital Ajmer", logo: publicAsset("/clients/jln.webp") },
  { name: "MPS School Ajmer", logo: publicAsset("/clients/mps.webp") },
  { name: "DWPS Ajmer", logo: publicAsset("/clients/dwps.webp") },
  { name: "Mayo College Ajmer", logo: publicAsset("/clients/mayo.webp") },
  { name: "Taj Pratap Mahal Ajmer", logo: publicAsset("/clients/taj.webp") },
  { name: "JSB Kishangarh", logo: publicAsset("/clients/jsb.webp") },
  { name: "AKV Kishangarh", logo: publicAsset("/clients/akv.webp") },
  { name: "Bhutra Marble Kishangarh", logo: publicAsset("/clients/bhutra.webp") },
  { name: "CBSE Ajmer", logo: publicAsset("/clients/cbse.webp") },
  { name: "RBSE Ajmer", logo: publicAsset("/clients/rbse.webp") },
  { name: "Income Tax Department Ajmer", logo: publicAsset("/clients/income-tax.webp") },
  { name: "Army Cantt", logo: publicAsset("/clients/army-cantt.webp") },
  { name: "Ramada Ajmer", logo: publicAsset("/clients/ramada.webp") },
  { name: "Satguru Group Ajmer", logo: publicAsset("/clients/satguru.webp") },
  { name: "Marriott", logo: publicAsset("/clients/marriott.webp") },
]);

const projects = wordpressContent("projects", [
  { slug: "meridian-residences", title: "Meridian Residences", segment: "MARBLE & STONE", category: "Residential", image: "photo-1600585154340-be6161a56a0c", gallery: ["photo-1600585154340-be6161a56a0c", "photo-1618221195710-dd6b41faaea6", "photo-1616486338812-3dadae4b4ace"], year: "2024", location: "Alibaug, Maharashtra", description: "Twelve seafront villas clad in a custom facade stone quarried, cut and installed end-to-end.", challenge: "The facade needed to weather the salt air without turning grey.", approach: "We specified a dense sandstone with a low porosity and honed it to bring the warm undertones forward.", outcomes: [["12", "villas delivered"], ["18 mo", "site to handover"], ["100%", "material in-house"]], credits: ["Drawstones — Facade & Interior Stone", "Formwork — Civil & Finishing", "Architect — External partner"] },
  { slug: "kabbon-lounge", title: "Kabbon Lounge", segment: "INTERIOR DECOR", category: "Hospitality", image: "photo-1600607687939-ce8a6c25118c", gallery: ["photo-1600607687939-ce8a6c25118c", "photo-1600566753190-17f0baa2a6c3", "photo-1616486338812-3dadae4b4ace"], year: "2024", location: "Bengaluru, Karnataka", description: "A 90-cover restaurant designed around a single travertine bar block.", challenge: "The client wanted the room to feel monolithic without becoming cold.", approach: "One stone, three finishes — a polished bar top, honed cladding, split-face walls. Warm oak floors soften everything else.", outcomes: [["1", "material palette"], ["4 mo", "design to open"], ["120 sqm", "of stone specified"]], credits: ["Vignette — Concept & Execution", "Drawstones — Travertine sourcing", "Formwork — Fit-out"] },
  { slug: "veda-clubhouse", title: "Veda Clubhouse", segment: "CONSTRUCTION", category: "Amenity", image: "photo-1600566753190-17f0baa2a6c3", gallery: ["photo-1600566753190-17f0baa2a6c3", "photo-1618221195710-dd6b41faaea6", "photo-1600585154340-be6161a56a0c"], year: "2023", location: "Pune, Maharashtra", description: "A residential clubhouse — pool, gym, event spaces — built as one continuous stone ribbon.", challenge: "Every wall inside and out had to read as the same material.", approach: "We wrapped the volume in a Kota-limestone rain screen and continued the same stone through the pool coping and lobby floor.", outcomes: [["2,400 sqm", "built-up"], ["3", "levels"], ["14 mo", "structure to soft launch"]], credits: ["Formwork — Structure & Finishing", "Drawstones — Kota supply", "Renest — Pool decking"] },
  { slug: "annex-workspace", title: "Annex Workspace", segment: "FLOORING", category: "Commercial", image: "photo-1616486338812-3dadae4b4ace", gallery: ["photo-1616486338812-3dadae4b4ace", "photo-1600607687939-ce8a6c25118c", "photo-1503387762-592deb58ef4e"], year: "2023", location: "Gurugram, Haryana", description: "40,000 sqft of workspace flooring across three floors, delivered in a six-week window.", challenge: "A hospitality-grade floor that could take a corporate footfall.", approach: "Contract-grade SPC in two warm tones, pre-cut off-site so installation ran cleanly.", outcomes: [["40,000 sqft", "installed"], ["6 wk", "on site"], ["0", "post-handover claims"]], credits: ["Renest — Specification & Installation", "Formwork — Sub-structure"] },
  { slug: "atrium-mall", title: "Atrium Mall", segment: "MARBLE & STONE", category: "Commercial", image: "photo-1503387762-592deb58ef4e", gallery: ["photo-1503387762-592deb58ef4e", "photo-1600585154340-be6161a56a0c", "photo-1618221195710-dd6b41faaea6"], year: "2022", location: "Jaipur, Rajasthan", description: "Retail atrium with a book-matched onyx feature wall and a full-marble concourse.", challenge: "Matching stone across 45 running metres of feature wall.", approach: "We sourced two adjacent onyx blocks, cut them ourselves, and book-matched every panel before shipping.", outcomes: [["45 m", "book-matched wall"], ["3,600 sqm", "concourse marble"], ["1", "onyx block, split"]], credits: ["Drawstones — Sourcing, cutting, installation", "Formwork — Substrate & wall build"] },
  { slug: "shore-villa", title: "Shore Villa", segment: "INTERIOR DECOR", category: "Residential", image: "photo-1618221195710-dd6b41faaea6", gallery: ["photo-1618221195710-dd6b41faaea6", "photo-1600585154340-be6161a56a0c", "photo-1616486338812-3dadae4b4ace"], year: "2024", location: "Goa", description: "A four-bedroom villa where every fixed surface is stone.", challenge: "Keep a heavy-material palette from feeling like a museum.", approach: "Three warm marbles, natural lime plaster, oak floors and light linen textiles. Nothing else.", outcomes: [["4", "bedrooms"], ["3", "stones"], ["9 mo", "design to move-in"]], credits: ["Vignette — Full scope", "Drawstones — Kitchen, bath, feature wall", "Renest — Oak plank"] },
  { slug: "civic-facade", title: "Civic Facade", segment: "MARBLE & STONE", category: "Institutional", image: "photo-1580587771525-78b9dba3b914", gallery: ["photo-1580587771525-78b9dba3b914", "photo-1600585154340-be6161a56a0c", "photo-1618221195710-dd6b41faaea6"], year: "2022", location: "Ahmedabad, Gujarat", description: "A civic building facade in flame-finished granite installed as a dry-cladding system.", challenge: "A facade that would read cleanly at scale and stay clean over the years.", approach: "Self-cleaning flame finish, a 4mm shadow gap and a sub-frame built to hold thermal movement.", outcomes: [["1,850 sqm", "facade"], ["4mm", "reveal, everywhere"], ["7", "elevations resolved"]], credits: ["Drawstones — Supply & installation", "Formwork — Sub-frame & envelope"] },
  { slug: "kiln-restaurant", title: "Kiln Restaurant", segment: "CONSTRUCTION", category: "Hospitality", image: "photo-1600566753190-17f0baa2a6c3", gallery: ["photo-1600566753190-17f0baa2a6c3", "photo-1600607687939-ce8a6c25118c", "photo-1503387762-592deb58ef4e"], year: "2023", location: "Mumbai, Maharashtra", description: "A 3,200 sqft restaurant built around an exposed brick and stone kiln.", challenge: "Structural rework to expose the kiln without losing the load path.", approach: "We ran a new steel transfer above the kiln and let the original masonry become the room.", outcomes: [["1", "kiln, exposed"], ["3,200 sqft", "fit-out"], ["5 mo", "shell to open"]], credits: ["Formwork — Structural, shell & core", "Vignette — Design & Fit-out", "Drawstones — Bar & floor stone"] },
  { slug: "lumen-apartment", title: "Lumen Apartment", segment: "INTERIOR DESIGNING", category: "Residential", image: "photo-1631679706909-1844bbd07221", gallery: ["photo-1631679706909-1844bbd07221", "photo-1618220179428-22790b461013", "photo-1600585154340-be6161a56a0c"], year: "2024", location: "Bengaluru, Karnataka", description: "A full interior-designing brief for a light-first city apartment, resolved end-to-end before a single wall moved.", challenge: "A dark, compartmentalised flat that needed to feel open without losing storage.", approach: "We redrew the plan around a single daylight axis, set a warm neutral palette and detailed every joinery run in 3D before build.", outcomes: [["1,650 sqft", "reimagined"], ["3D", "sign-off before build"], ["6 wk", "concept to drawings"]], credits: ["BDS Marvel — Concept, planning & detailing", "Renest — Oak flooring", "Formwork — Fit-out"] },
  { slug: "sable-studio-office", title: "Sable Studio Office", segment: "INTERIOR DESIGNING", category: "Commercial", image: "photo-1618220179428-22790b461013", gallery: ["photo-1618220179428-22790b461013", "photo-1631679706909-1844bbd07221", "photo-1616486338812-3dadae4b4ace"], year: "2023", location: "Jaipur, Rajasthan", description: "Interior designing for a creative studio — spatial planning, material palette and lighting concept delivered as one scheme.", challenge: "Give a 20-person studio focus zones and social zones inside one open floor.", approach: "Zoning by material and light: honed stone at the core, warm oak at the edges, layered task and ambient lighting throughout.", outcomes: [["20", "person studio"], ["4", "material palette"], ["5 mo", "design to move-in"]], credits: ["BDS Marvel — Full interior-design scope", "Drawstones — Core stone", "Renest — Oak & contract flooring"] },
]);

const catalogueContent = wordpressContent("catalogueItems", [
  // DrawStones — the signature product range
  { slug: "center-end-tables", name: "Centre & End Tables", brand: "DrawStones", material: "Marble", product: "Tables", application: "Living", image: "photo-1692262089751-7e26b69ad8d1", origin: "Black & white marble" },
  { slug: "marble-inlay-tops", name: "Marble Inlay Table Tops", brand: "DrawStones", material: "Marble", product: "Tables", application: "Living", image: "photo-1506463108611-88834e9f6169", origin: "Pietra dura inlay" },
  { slug: "marble-stone-fireplace", name: "Marble & Stone Fireplace", brand: "DrawStones", material: "Marble", product: "Fireplaces", application: "Interior", image: "photo-1603039531759-1a1bbe4f9f94", origin: "Carved surround" },
  { slug: "marble-home-temple", name: "Marble Home Temple", brand: "DrawStones", material: "Marble", product: "Temples", application: "Interior", image: "photo-1678593628844-6ea49dee8ce3", origin: "Vietnam white marble" },
  { slug: "stone-basins-bathtubs", name: "Stone Basins & Bathtubs", brand: "DrawStones", material: "Stone", product: "Basins", application: "Bathroom", image: "photo-1576698483491-8c43f0862543", origin: "Carved from block" },
  // DrawStones — stone & marble carving portfolio
  { slug: "deity-figure-statues", name: "Deity & Figure Statues", brand: "DrawStones", material: "Marble", product: "Sculptures", application: "Interior", image: "photo-1660140889200-59994b203546", origin: "Hand-carved" },
  { slug: "abstract-sculpture", name: "Spheres & Abstract Sculpture", brand: "DrawStones", material: "Marble", product: "Sculptures", application: "Garden", image: "photo-1662808141421-54240cbfd45f", origin: "Contemporary forms" },
  { slug: "fountains-water-features", name: "Fountains & Water Features", brand: "DrawStones", material: "Sandstone", product: "Fountains", application: "Garden", image: "photo-1761024300156-aff4bec70b6a", origin: "Tiered & wall" },
  { slug: "garden-benches-seating", name: "Garden Benches & Seating", brand: "DrawStones", material: "Sandstone", product: "Garden", application: "Garden", image: "photo-1768700519431-5297f11808a3", origin: "Carved & contemporary" },
  { slug: "planters-urns", name: "Planters & Urns", brand: "DrawStones", material: "Sandstone", product: "Garden", application: "Garden", image: "photo-1787497017406-9f54de5921df", origin: "Carved vases" },
  { slug: "stone-lanterns", name: "Stone Lanterns & Lamp Posts", brand: "DrawStones", material: "Sandstone", product: "Garden", application: "Garden", image: "photo-1786467642735-1342f43034ae", origin: "Garden lighting" },
  { slug: "jali-screens-railings", name: "Jali Screens & Railings", brand: "DrawStones", material: "Sandstone", product: "Screens", application: "Architectural", image: "photo-1763295492544-7850fa8671cf", origin: "Pierced panels" },
  { slug: "jharokhas-windows", name: "Jharokhas & Windows", brand: "DrawStones", material: "Sandstone", product: "Screens", application: "Architectural", image: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/02/Jaisalmer_-_Patwa_Haveli_26.jpg/1280px-Jaisalmer_-_Patwa_Haveli_26.jpg", origin: "Traditional carved" },
  { slug: "pillars-columns", name: "Pillars & Columns", brand: "DrawStones", material: "Sandstone", product: "Pillars", application: "Architectural", image: "photo-1672215053161-5778b0fbb9ea", origin: "Carved capitals" },
  { slug: "temple-carving", name: "Temple Carving", brand: "DrawStones", material: "Marble", product: "Temples", application: "Architectural", image: "photo-1665003725647-3ae0f01140b1", origin: "Architectural carving" },
  { slug: "gazebos-chhatris", name: "Gazebos & Chhatris", brand: "DrawStones", material: "Sandstone", product: "Temples", application: "Architectural", image: "photo-1672215055915-e6143dc70e6a", origin: "Pavilions & domes" },
  { slug: "marble-flooring-inlay", name: "Marble Flooring, Inlay & Mosaic", brand: "DrawStones", material: "Marble", product: "Flooring", application: "Interior", image: "photo-1790501028719-1c18dc4a895d", origin: "Water-jet & pietra dura" },
  { slug: "monuments-projects", name: "Monuments & Projects", brand: "DrawStones", material: "Sandstone", product: "Monuments", application: "Architectural", image: "photo-1586618754080-135516049958", origin: "Large-scale" },
  // Renest — flooring range
  { slug: "spc-flooring", name: "SPC Rigid Flooring", brand: "Renest", category: "Flooring", material: "SPC", product: "Planks", application: "Interior", image: "photo-1548268364-3acee266b695", origin: "Stone-polymer core" },
  { slug: "laminate-wooden-flooring", name: "Laminate & Wooden Flooring", brand: "Renest", category: "Flooring", material: "Engineered wood", product: "Planks", application: "Interior", image: "photo-1519393890420-f28727375fa5", origin: "Oak & walnut tones" },
  { slug: "lvt-flooring", name: "Luxury Vinyl Tile", brand: "Renest", category: "Flooring", material: "Vinyl", product: "Vinyl", application: "Interior", image: "photo-1598718544285-7180f670198b", origin: "Wood & stone looks" },
  { slug: "carpet-tiles", name: "Modular Carpet Tiles", brand: "Renest", category: "Flooring", material: "Carpet", product: "Carpet", application: "Interior", image: "photo-1523350165414-082d792c4bcc", origin: "50 × 50 cm tiles" },
  { slug: "commercial-flooring", name: "Commercial Flooring", brand: "Renest", category: "Flooring", material: "Vinyl", product: "Commercial", application: "Interior", image: "photo-1560185008-b033106af5c3", origin: "Heavy-traffic rated" },
  { slug: "deck-flooring", name: "WPC Deck Flooring", brand: "Renest", category: "Flooring", material: "WPC", product: "Decking", application: "Garden", image: "photo-1656646549633-80ad4bd2ab40", origin: "Outdoor rated" },
  // Grain — furniture range
  { slug: "sofas", name: "Sofas & Lounge Seating", brand: "Grain", category: "Furniture", material: "Hardwood", product: "Seating", application: "Living", image: "photo-1600607687939-ce8a6c25118c", origin: "Solid hardwood frames" },
  { slug: "chairs", name: "Dining & Accent Chairs", brand: "Grain", category: "Furniture", material: "Hardwood", product: "Seating", application: "Living", image: "photo-1631396326646-c06a935ff3a6", origin: "Made to order" },
  { slug: "tables", name: "Tables & Desks", brand: "Grain", category: "Furniture", material: "Stone & timber", product: "Tables", application: "Living", image: "photo-1600585154340-be6161a56a0c", origin: "Stone · timber · cast" },
  { slug: "custom-furniture", name: "Bespoke Joinery", brand: "Grain", category: "Furniture", material: "Mixed", product: "Bespoke", application: "Interior", image: "photo-1737467030068-88ad20e617ca", origin: "Built to brief" },
  // BDS Marvel — interior designing
  { slug: "concept-moodboards", name: "Concept & Moodboards", brand: "BDS Marvel", category: "Interior Designing", material: "Design", product: "Concept", application: "Interior", image: "photo-1631679706909-1844bbd07221", origin: "Direction & references" },
  { slug: "space-planning", name: "Space Planning", brand: "BDS Marvel", category: "Interior Designing", material: "Design", product: "Planning", application: "Interior", image: "photo-1618220179428-22790b461013", origin: "Layouts & flow" },
  { slug: "material-palettes", name: "Material Palettes", brand: "BDS Marvel", category: "Interior Designing", material: "Design", product: "Palettes", application: "Interior", image: "photo-1600585154340-be6161a56a0c", origin: "Samples & combinations" },
  { slug: "3d-visualisation", name: "3D Visualisation", brand: "BDS Marvel", category: "Interior Designing", material: "Design", product: "Visualisation", application: "Interior", image: "photo-1631396326646-c06a935ff3a6", origin: "Photoreal renders" },
  // Formwork — construction
  { slug: "tensile-structures", name: "Tensile Structures", brand: "Formwork", category: "Construction", material: "Membrane", product: "Structures", application: "Architectural", image: "photo-1784637663357-cfbf73b09c0d", origin: "Fabric shade canopies" },
  // Vignette — interior decor
  { slug: "decor-lighting", name: "Lighting", brand: "Vignette", category: "Interior Decor", material: "Lighting", product: "Lighting", application: "Interior", image: "photo-1747258818911-dfde27ecabba", origin: "Ambient · task · feature" },
  { slug: "decor-pieces", name: "Décor Pieces", brand: "Vignette", category: "Interior Decor", material: "Object", product: "Objects", application: "Living", image: "photo-1600585154340-be6161a56a0c", origin: "Sculptural objects" },
  { slug: "decor-accessories", name: "Accessories", brand: "Vignette", category: "Interior Decor", material: "Accent", product: "Accessories", application: "Living", image: "photo-1618221195710-dd6b41faaea6", origin: "Trays · textiles · hardware" },
  { slug: "decor-textures", name: "Textures", brand: "Vignette", category: "Interior Decor", material: "Surface", product: "Textures", application: "Interior", image: "photo-1780399334790-64af9ffb45fc", origin: "Plaster · linen · stone · wood" },
  { slug: "decor-finishing", name: "Finishing Elements", brand: "Vignette", category: "Interior Decor", material: "Trim", product: "Finishing", application: "Interior", image: "photo-1600566753190-17f0baa2a6c3", origin: "Hardware · trims · edges" },
  { slug: "artificial-plants-green-walls", name: "Artificial Plants & Green Walls", brand: "Vignette", category: "Interior Decor", material: "Greenery", product: "Greenery", application: "Interior", image: "photo-1585506774639-5e2f8fda6352", origin: "Vertical gardens" },
  { slug: "decorative-planters", name: "Planters", brand: "Vignette", category: "Interior Decor", material: "Ceramic & stone", product: "Planters", application: "Interior", image: "photo-1588440691140-09155c1be58a", origin: "Pots & urns" },
  { slug: "garden-umbrella-gazebo", name: "Garden Umbrella & Gazebo", brand: "Vignette", category: "Interior Decor", material: "Outdoor", product: "Outdoor", application: "Garden", image: "photo-1784454793008-3d6e632db3d7", origin: "Shade & outdoor living" },
]);
// WordPress records can be created or edited with optional catalogue fields left
// blank. Normalize those fields once so filters and cards remain safe to render.
const catalogueItems = (Array.isArray(catalogueContent) ? catalogueContent : [])
  .filter((item) => item && typeof item === "object" && !Array.isArray(item))
  .map((item, index) => {
    const category = typeof item.category === "string" && item.category.trim() ? item.category.trim() : "Marble & Stone";
    return {
      ...item,
      slug: typeof item.slug === "string" && item.slug.trim() ? item.slug.trim() : "catalogue-item-" + (index + 1),
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Untitled material",
      brand: typeof item.brand === "string" && item.brand.trim() ? item.brand.trim() : "BDS Marvel",
      material: typeof item.material === "string" && item.material.trim() ? item.material.trim() : category,
      product: typeof item.product === "string" && item.product.trim() ? item.product.trim() : "Materials",
      category,
      image: typeof item.image === "string" && item.image.trim() ? item.image : "photo-1618221195710-dd6b41faaea6",
      origin: typeof item.origin === "string" ? item.origin : "",
    };
  });

// Extended detail content for catalogue items and per-service catalogue cards, keyed by slug.
const catalogueDetails = wordpressContent("catalogueDetails", {
  "center-end-tables": { brand: "DrawStones", consult: "Marble & Stone Consulting", desc: "A collection of marble centre and end tables that redefine sophistication in living spaces — each top showing the timeless allure of carefully chosen black and white marble and its natural patterns.", specs: [["Material", "Black & white marble"], ["Build", "Solid top, crafted base"], ["Lead time", "4 – 6 weeks"]], gallery: ["photo-1692262089751-7e26b69ad8d1", "photo-1649011327045-624a1bd2c3e7", "photo-1614348531934-c338408a46bb"] },
  "marble-inlay-tops": { brand: "DrawStones", consult: "Marble & Stone Consulting", desc: "A captivating collection of marble inlay table tops where the timeless art of pietra dura meets luxury — florals and geometries cut from coloured stone and set by hand, with full customisation.", specs: [["Craft", "Pietra dura inlay"], ["Customisation", "Pattern & stone"], ["Lead time", "6 – 8 weeks"]], gallery: ["photo-1506463108611-88834e9f6169", "photo-1531165424588-80b93de6f807", "photo-1784937275795-685af009b219"] },
  "marble-stone-fireplace": { brand: "DrawStones", consult: "Marble & Stone Consulting", desc: "Fireplaces that make a statement — elevating a living space with the warmth and natural elegance of marble and stone, hand-finished and built to order.", specs: [["Material", "Marble & stone"], ["Finish", "Natural, hand-finished"], ["Lead time", "6 – 8 weeks"]], gallery: ["photo-1603039531759-1a1bbe4f9f94", "photo-1612031737124-28aeae3f2863", "photo-1648303098204-258fc88bc69f"] },
  "marble-home-temple": { brand: "DrawStones", consult: "Marble & Stone Consulting", desc: "Exquisite works of art that infuse spirituality into your home — carved and detailed temples in Vietnam white marble that create a sacred haven in any living space.", specs: [["Material", "Vietnam white marble"], ["Work", "Carved & detailed"], ["Lead time", "8 – 10 weeks"]], gallery: ["photo-1678593628844-6ea49dee8ce3", "photo-1593739594181-dcd2709bc51d", "photo-1664851451771-2a78ed2b20fe"] },
  "stone-basins-bathtubs": { brand: "DrawStones", consult: "Marble & Stone Consulting", desc: "A collection of stone basins and bathtubs in a range of styles and finishes — transforming a bathroom into a sanctuary where luxury meets durability, each piece carved from solid block.", specs: [["Build", "Solid block"], ["Range", "Basins & bathtubs"], ["Sample size", "e.g. 70 × 46 × 12 cm"]], gallery: ["photo-1576698483491-8c43f0862543", "photo-1610178167104-488495443e01", "photo-1756079664354-34944e001f6d"] },
  "deity-figure-statues": { brand: "DrawStones", consult: "Marble & Stone Consulting", desc: "Hand-carved statues of deities and figures in sandstone and white marble — devotional and decorative pieces finished by our master carvers.", specs: [["Material", "Marble / sandstone"], ["Work", "Hand-carved"], ["Lead time", "On selection"]], gallery: ["photo-1660140889200-59994b203546", "photo-1662808141421-54240cbfd45f", "photo-1621422747516-240c0f5f987a"] },
  "abstract-sculpture": { brand: "DrawStones", consult: "Marble & Stone Consulting", desc: "Garden spheres and contemporary stone forms — sculptural pieces that anchor a courtyard or lawn without crowding it.", specs: [["Forms", "Spheres & abstract"], ["Setting", "Indoor / garden"], ["Lead time", "On selection"]], gallery: ["photo-1662808141421-54240cbfd45f", "photo-1621422747516-240c0f5f987a", "photo-1660140889200-59994b203546"] },
  "fountains-water-features": { brand: "DrawStones", consult: "Marble & Stone Consulting", desc: "Tiered fountains, wall fountains and sculptural water features hand-carved in sandstone and marble — the sound of water worked over honed and rough-hewn faces.", specs: [["Types", "Tiered · wall · sculptural"], ["Setting", "Garden, outdoor rated"], ["Lead time", "6 – 8 weeks"]], gallery: ["photo-1761024300156-aff4bec70b6a", "photo-1761024300151-eed15857ea31", "photo-1783933676729-de12e55f5546"] },
  "garden-benches-seating": { brand: "DrawStones", consult: "Marble & Stone Consulting", desc: "Carved and contemporary benches in marble and sandstone — seating that weathers gracefully in gardens and courtyards.", specs: [["Material", "Marble & sandstone"], ["Style", "Carved / contemporary"], ["Setting", "Outdoor rated"]], gallery: ["photo-1768700519431-5297f11808a3", "photo-1764444218648-75a52322c489", "photo-1786467642735-1342f43034ae"] },
  "planters-urns": { brand: "DrawStones", consult: "Marble & Stone Consulting", desc: "Carved planters, urns and vases for gardens and entrances — hand-worked sandstone in a range of profiles and scales.", specs: [["Pieces", "Planters · urns · vases"], ["Material", "Carved sandstone"], ["Setting", "Garden & entrance"]], gallery: ["photo-1787497017406-9f54de5921df", "photo-1786467642735-1342f43034ae", "photo-1768700519431-5297f11808a3"] },
  "stone-lanterns": { brand: "DrawStones", consult: "Marble & Stone Consulting", desc: "Garden lanterns and carved lamp posts in sandstone — soft, grounded lighting for paths, courts and entrances.", specs: [["Pieces", "Lanterns & lamp posts"], ["Material", "Carved sandstone"], ["Use", "Garden lighting"]], gallery: ["photo-1786467642735-1342f43034ae", "photo-1787497017406-9f54de5921df", "photo-1764444218648-75a52322c489"] },
  "jali-screens-railings": { brand: "DrawStones", consult: "Marble & Stone Consulting", desc: "Intricately pierced jali panels, railings and balustrades — traditional lattice screens cut from a single stone for light, air and privacy.", specs: [["Work", "Pierced jali"], ["Pieces", "Panels · railings · balustrades"], ["Lead time", "Per project"]], gallery: ["photo-1763295492544-7850fa8671cf", "photo-1763295492872-a4ec4141de92", "photo-1763295492547-53c6c64833e1"] },
  "jharokhas-windows": { brand: "DrawStones", consult: "Marble & Stone Consulting", desc: "Traditional carved jharokhas, balconies and window frames in sandstone — Rajasthani architectural detail made to measure.", specs: [["Pieces", "Jharokhas · balconies · frames"], ["Material", "Carved sandstone"], ["Lead time", "Per project"]], gallery: ["https://thumb.wikimedia.org/wikipedia/commons/thumb/0/02/Jaisalmer_-_Patwa_Haveli_26.jpg/1280px-Jaisalmer_-_Patwa_Haveli_26.jpg", "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/59/Jodhpur_Mehrangarh_-_Palast_4a_Jharokha.jpg/1280px-Jodhpur_Mehrangarh_-_Palast_4a_Jharokha.jpg", "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/59/Jharokhas_in_Meherangarh_Fort_08.jpg/1280px-Jharokhas_in_Meherangarh_Fort_08.jpg"] },
  "pillars-columns": { brand: "DrawStones", consult: "Marble & Stone Consulting", desc: "Carved pillars, columns and capitals for facades, verandahs and temple structures — load-bearing stone detailed by hand.", specs: [["Pieces", "Pillars · columns · capitals"], ["Material", "Sandstone / marble"], ["Lead time", "Per project"]], gallery: ["photo-1672215053161-5778b0fbb9ea", "photo-1665003725647-3ae0f01140b1", "photo-1672215055915-e6143dc70e6a"] },
  "temple-carving": { brand: "DrawStones", consult: "Marble & Stone Consulting", desc: "Detailed architectural carving for temples — shikhara, mandapa and figure work executed in marble and sandstone by our carving teams.", specs: [["Scope", "Architectural temple carving"], ["Material", "Marble & sandstone"], ["Lead time", "Per project"]], gallery: ["photo-1665003725647-3ae0f01140b1", "photo-1672215053161-5778b0fbb9ea", "photo-1763295492872-a4ec4141de92"] },
  "gazebos-chhatris": { brand: "DrawStones", consult: "Marble & Stone Consulting", desc: "Stone pavilions, domes and chhatris in carved sandstone — garden and rooftop structures in a traditional idiom.", specs: [["Pieces", "Gazebos · domes · chhatris"], ["Material", "Carved sandstone"], ["Lead time", "Per project"]], gallery: ["photo-1672215055915-e6143dc70e6a", "photo-1593739594181-dcd2709bc51d", "photo-1664851451771-2a78ed2b20fe"] },
  "marble-flooring-inlay": { brand: "DrawStones", consult: "Marble & Stone Consulting", desc: "Water-jet flooring, pietra dura and mother-of-pearl inlay and mosaic — decorative stone floors cut to your pattern.", specs: [["Techniques", "Water-jet · pietra dura · mosaic"], ["Material", "Marble & coloured stone"], ["Lead time", "Per project"]], gallery: ["photo-1790501028719-1c18dc4a895d", "photo-1506463108611-88834e9f6169", "photo-1531165424588-80b93de6f807"] },
  "monuments-projects": { brand: "DrawStones", consult: "Marble & Stone Consulting", desc: "Large-scale stone projects and public monuments — including the sandstone monuments on the Eastern Peripheral Expressway and the Ambedkar Smarak, Lucknow.", specs: [["Scope", "Monuments & infrastructure"], ["Material", "Sandstone & stone"], ["Notable", "EPE · Ambedkar Smarak"]], gallery: ["photo-1586618754080-135516049958", "photo-1665003725647-3ae0f01140b1", "photo-1672215055915-e6143dc70e6a"] },
  "flooring-materials": { consult: "Flooring Consulting", desc: "SPC, engineered oak and stone composite — a distributed range plus our own proprietary line.", specs: [["Range", "40+ SKUs"], ["Core", "SPC / engineered"], ["Lead time", "Ex-stock to 4 weeks"]], gallery: ["photo-1616486338812-3dadae4b4ace", "photo-1789381500057-2a288d79e9e6", "photo-1618220179428-22790b461013"] },
  "flooring-finishes": { consult: "Flooring Consulting", desc: "Matte, brushed and natural-oil finishes — sampled on the exact plank batch you'll receive.", specs: [["Range", "3 finish families"], ["Samples", "Batch-matched"], ["Lead time", "1 week"]], gallery: ["photo-1600607687939-ce8a6c25118c", "photo-1789381500057-2a288d79e9e6", "photo-1780399334790-64af9ffb45fc"] },
  "flooring-patterns": { consult: "Flooring Consulting", desc: "Herringbone, chevron and straight plank layouts — dry-laid and numbered before installation begins.", specs: [["Patterns", "Herringbone · chevron · plank"], ["Layout", "Dry-laid first"], ["Lead time", "Per project"]], gallery: ["photo-1618220179428-22790b461013", "photo-1616486338812-3dadae4b4ace", "photo-1600566753190-17f0baa2a6c3"] },
  "flooring-applications": { consult: "Flooring Consulting", desc: "Residential, hospitality and contract floors — specified for traffic, acoustics and cleaning cycles.", specs: [["Rating", "Residential to contract"], ["Spec support", "In-house"], ["Lead time", "Per project"]], gallery: ["photo-1600607687939-ce8a6c25118c", "photo-1616486338812-3dadae4b4ace", "photo-1600585154340-be6161a56a0c"] },
  "decor-lighting": { consult: "Interior Décor Consulting", desc: "Ambient, task and feature lighting — from backlit stone panels to a considered picture light.", specs: [["Range", "Ambient · task · feature"], ["Colour temp", "2200 – 3000K"], ["Lead time", "2 – 5 weeks"]], gallery: ["photo-1747258818911-dfde27ecabba", "photo-1618221195710-dd6b41faaea6", "photo-1600566753190-17f0baa2a6c3"] },
  "decor-pieces": { consult: "Interior Décor Consulting", desc: "Sculptural objects and statement pieces that anchor a room without crowding it.", specs: [["Range", "Curated objects"], ["Sourcing", "In-house + studios"], ["Lead time", "Varies"]], gallery: ["photo-1600585154340-be6161a56a0c", "photo-1600607687939-ce8a6c25118c", "photo-1631396326646-c06a935ff3a6"] },
  "decor-accessories": { consult: "Interior Décor Consulting", desc: "Considered accents that finish a room — trays, textiles, hardware and small objects.", specs: [["Range", "Accents & hardware"], ["Styling", "With our designers"], ["Lead time", "Varies"]], gallery: ["photo-1618221195710-dd6b41faaea6", "photo-1747258818911-dfde27ecabba", "photo-1780399334790-64af9ffb45fc"] },
  "decor-textures": { consult: "Interior Décor Consulting", desc: "Lime plaster, linen, stone and wood — a texture palette sampled together before we commit.", specs: [["Samples", "Physical boards"], ["Range", "Plaster · textile · stone · wood"], ["Lead time", "1 – 2 weeks"]], gallery: ["photo-1780399334790-64af9ffb45fc", "photo-1600566753190-17f0baa2a6c3", "photo-1618220179428-22790b461013"] },
  "decor-finishing": { consult: "Interior Décor Consulting", desc: "Hardware, trims and final touches — the last five percent that makes a room feel done.", specs: [["Range", "Hardware · trims · edges"], ["Matching", "To interior palette"], ["Lead time", "Per project"]], gallery: ["photo-1600566753190-17f0baa2a6c3", "photo-1600607687939-ce8a6c25118c", "photo-1747258818911-dfde27ecabba"] },
  sofas: { consult: "Furniture Consulting", desc: "Deep, tailored seating in soft upholstery — hardwood frames built in our own workshop.", specs: [["Frames", "Solid hardwood"], ["Upholstery", "COM or curated"], ["Lead time", "6 – 8 weeks"]], gallery: ["photo-1600607687939-ce8a6c25118c", "photo-1631396326646-c06a935ff3a6", "photo-1600566753190-17f0baa2a6c3"] },
  tables: { consult: "Furniture Consulting", desc: "Stone, timber and cast tops on considered bases — dining, coffee and side tables.", specs: [["Tops", "Stone · timber · cast"], ["Bases", "Steel · wood · stone"], ["Lead time", "5 – 7 weeks"]], gallery: ["photo-1600585154340-be6161a56a0c", "photo-1618221195710-dd6b41faaea6", "photo-1631396326646-c06a935ff3a6"] },
  chairs: { consult: "Furniture Consulting", desc: "Dining, lounge and accent chairs — prototyped, sat in, adjusted, then made to order.", specs: [["Range", "Dining · lounge · accent"], ["Build", "Made to order"], ["Lead time", "5 – 7 weeks"]], gallery: ["photo-1631396326646-c06a935ff3a6", "photo-1737467030068-88ad20e617ca", "photo-1600607687939-ce8a6c25118c"] },
  "custom-furniture": { consult: "Furniture Consulting", desc: "Bespoke joinery built to your brief — from a single headboard to a full suite of casegoods.", specs: [["Scope", "One-off to full suites"], ["Process", "Brief → prototype → build"], ["Lead time", "6 – 10 weeks"]], gallery: ["photo-1737467030068-88ad20e617ca", "photo-1631396326646-c06a935ff3a6", "photo-1600585154340-be6161a56a0c"] },
  "furniture-materials": { consult: "Furniture Consulting", desc: "Solid wood, stone, metal and lacquer — finished samples approved before production begins.", specs: [["Range", "Wood · stone · metal · lacquer"], ["Approval", "Physical samples"], ["Lead time", "1 – 2 weeks"]], gallery: ["photo-1618221195710-dd6b41faaea6", "photo-1737467030068-88ad20e617ca", "photo-1780399334790-64af9ffb45fc"] },
  "broadloom-carpets": { brand: "Renest", consult: "Flooring Consulting", desc: "Wall-to-wall broadloom carpet in wool and synthetic blends — soft underfoot, acoustic, and available in wide rolls for seamless floors.", specs: [["Type", "Broadloom roll"], ["Width", "Up to 4 m"], ["Use", "Residential & contract"]], gallery: ["photo-1660394585016-508f949df960", "photo-1572123979839-3749e9973aba", "photo-1523350165414-082d792c4bcc"] },
  "carpet-tiles": { brand: "Renest", consult: "Flooring Consulting", desc: "Modular carpet tiles for offices, hospitality and contract floors — easy to install, replace and mix into patterns.", specs: [["Format", "Modular tile"], ["Size", "50 × 50 cm"], ["Use", "Office & contract"]], gallery: ["photo-1523350165414-082d792c4bcc", "photo-1613124152913-c180d8c1d740", "photo-1660394585016-508f949df960"] },
  "carpets-rugs": { brand: "Renest", consult: "Flooring Consulting", desc: "Hand-knotted and machine-made carpets and area rugs — a curated range of textures, pile heights and patterns.", specs: [["Make", "Hand-knotted / machine"], ["Range", "Rugs & carpets"], ["Custom", "Size & colour"]], gallery: ["photo-1572123979839-3749e9973aba", "photo-1660394585016-508f949df960", "photo-1613124152913-c180d8c1d740"] },
  "commercial-flooring": { brand: "Renest", consult: "Flooring Consulting", desc: "Hard-wearing commercial flooring for offices, retail and hospitality — specified for traffic, acoustics and cleaning cycles.", specs: [["Rating", "Heavy commercial"], ["Range", "Vinyl · wood · carpet"], ["Spec", "In-house support"]], gallery: ["photo-1560185008-b033106af5c3", "photo-1598718544285-7180f670198b", "photo-1548268364-3acee266b695"] },
  "deck-flooring": { brand: "Renest", consult: "Flooring Consulting", desc: "WPC and timber decking for balconies, terraces and poolsides — weather-resistant boards with a natural grain.", specs: [["Material", "WPC / timber"], ["Use", "Outdoor rated"], ["Finish", "Natural grain"]], gallery: ["photo-1656646549633-80ad4bd2ab40", "photo-1574120583586-de8847ae992c", "photo-1560185008-b033106af5c3"] },
  "gym-flooring": { brand: "Renest", consult: "Flooring Consulting", desc: "Shock-absorbing rubber flooring for gyms and fitness areas — tiles and rolls that protect floors and reduce noise.", specs: [["Material", "Rubber"], ["Format", "Tile & roll"], ["Thickness", "6 – 20 mm"]], gallery: ["photo-1603665409265-bdc00027c217", "photo-1768554630751-6448593749eb", "photo-1610684082661-5d4763eecb39"] },
  "heavy-duty-doormats": { brand: "Renest", consult: "Flooring Consulting", desc: "Entrance and dirt-barrier mats for high-traffic doorways — trap dirt and moisture before it reaches the floor.", specs: [["Type", "Dirt barrier"], ["Use", "Entrance, high traffic"], ["Custom", "Size & logo"]], gallery: ["photo-1574120583586-de8847ae992c", "photo-1656646549633-80ad4bd2ab40", "photo-1603665409265-bdc00027c217"] },
  "hospital-flooring": { brand: "Renest", consult: "Flooring Consulting", desc: "Antibacterial homogeneous vinyl for hospitals and clinics — hygienic, seamless and easy to sanitise.", specs: [["Material", "Homogeneous vinyl"], ["Finish", "Antibacterial, seamless"], ["Use", "Healthcare"]], gallery: ["photo-1581858726788-75bc0f6a952d", "photo-1598718544285-7180f670198b", "photo-1560185008-b033106af5c3"] },
  "laminate-wooden-flooring": { brand: "Renest", consult: "Flooring Consulting", desc: "Laminate and engineered wood plank floors — warm wood looks with a tough, scratch-resistant wear layer.", specs: [["Core", "HDF / engineered"], ["Install", "Click-lock"], ["Range", "Oak & walnut tones"]], gallery: ["photo-1519393890420-f28727375fa5", "photo-1548268364-3acee266b695", "photo-1560185008-b033106af5c3"] },
  "lvt-flooring": { brand: "Renest", consult: "Flooring Consulting", desc: "Luxury vinyl tile in wood and stone looks — resilient, water-resistant and quiet underfoot.", specs: [["Material", "LVT"], ["Finish", "Wood & stone looks"], ["Use", "Residential & contract"]], gallery: ["photo-1598718544285-7180f670198b", "photo-1581858726788-75bc0f6a952d", "photo-1519393890420-f28727375fa5"] },
  "school-flooring": { brand: "Renest", consult: "Flooring Consulting", desc: "Durable, safe flooring for schools, play areas and activity rooms — bright, cleanable and slip-resistant.", specs: [["Finish", "Slip-resistant"], ["Range", "Vinyl & rubber"], ["Use", "Education"]], gallery: ["photo-1613124152913-c180d8c1d740", "photo-1523350165414-082d792c4bcc", "photo-1654605305001-8ec64a69c07c"] },
  "spc-flooring": { brand: "Renest", consult: "Flooring Consulting", desc: "Rigid stone-polymer core flooring — dimensionally stable click-lock planks that handle moisture and temperature swings.", specs: [["Core", "Stone-polymer (SPC)"], ["Install", "Click-lock"], ["Finish", "Wood & stone looks"]], gallery: ["photo-1548268364-3acee266b695", "photo-1519393890420-f28727375fa5", "photo-1598718544285-7180f670198b"] },
  "sports-flooring": { brand: "Renest", consult: "Flooring Consulting", desc: "Indoor court and multi-sport surfaces — cushioned, line-marked systems for badminton, basketball and multipurpose halls.", specs: [["Material", "PVC / vinyl sports"], ["Use", "Indoor courts"], ["System", "Cushioned"]], gallery: ["photo-1610684082661-5d4763eecb39", "photo-1654605305001-8ec64a69c07c", "photo-1603665409265-bdc00027c217"] },
  "transport-flooring": { brand: "Renest", consult: "Flooring Consulting", desc: "Anti-slip flooring for buses, trains and transit interiors — lightweight, fire-rated and hard-wearing.", specs: [["Finish", "Anti-slip"], ["Rating", "Fire-rated"], ["Use", "Transport interiors"]], gallery: ["photo-1768554630751-6448593749eb", "photo-1603665409265-bdc00027c217", "photo-1610684082661-5d4763eecb39"] },
  "vibrant-flooring": { brand: "Renest", consult: "Flooring Consulting", desc: "Colourful, patterned flooring for creative, retail and children's spaces — bold tones and graphic layouts.", specs: [["Range", "Colour & pattern"], ["Material", "Vinyl & carpet"], ["Use", "Creative spaces"]], gallery: ["photo-1654605305001-8ec64a69c07c", "photo-1613124152913-c180d8c1d740", "photo-1523350165414-082d792c4bcc"] },
  "artificial-plants-green-walls": { brand: "Vignette", consult: "Interior Décor Consulting", desc: "Artificial plants and green living walls — low-maintenance vertical gardens and foliage that bring greenery indoors.", specs: [["Type", "Green wall & foliage"], ["Maintenance", "Low / none"], ["Custom", "Panel size"]], gallery: ["photo-1585506774639-5e2f8fda6352", "photo-1656500545940-8e37294b69a5", "photo-1588440691140-09155c1be58a"] },
  "decorative-planters": { brand: "Vignette", consult: "Interior Décor Consulting", desc: "Decorative ceramic and stone planters and urns — sculptural pots for interiors, lobbies and entrances.", specs: [["Material", "Ceramic & stone"], ["Range", "Pots & urns"], ["Setting", "Indoor & entrance"]], gallery: ["photo-1588440691140-09155c1be58a", "photo-1585445490582-9872899757b7", "photo-1585506774639-5e2f8fda6352"] },
  "garden-umbrella-gazebo": { brand: "Vignette", consult: "Interior Décor Consulting", desc: "Garden umbrellas and outdoor gazebos — shade and outdoor living structures for gardens, terraces and poolsides.", specs: [["Range", "Umbrellas & gazebos"], ["Use", "Outdoor living"], ["Custom", "Size & finish"]], gallery: ["photo-1784454793008-3d6e632db3d7", "photo-1772093978429-2a553d56face", "photo-1585445490582-9872899757b7"] },
  "tensile-structures": { brand: "Formwork", consult: "Construction Consulting", desc: "Tensile fabric shade structures and canopies — engineered membrane roofs for entrances, courtyards and parking.", specs: [["System", "Tensile membrane"], ["Use", "Canopy & shade"], ["Scope", "Design & install"]], gallery: ["photo-1784637663357-cfbf73b09c0d", "photo-1774579892773-8a21fb9200c9", "photo-1656646549633-80ad4bd2ab40"] },
  "concept-moodboards": { brand: "BDS Marvel", consult: "Interior Design Consulting", desc: "Concept direction and moodboards that set the tone before a single wall moves — references, palettes and the feeling of the finished space, agreed early.", specs: [["Deliverable", "Concept & moodboards"], ["Stage", "Pre-drawings"], ["Lead time", "1 – 2 weeks"]], gallery: ["photo-1631679706909-1844bbd07221", "photo-1618220179428-22790b461013", "photo-1600585154340-be6161a56a0c"] },
  "space-planning": { brand: "BDS Marvel", consult: "Interior Design Consulting", desc: "Spatial planning that resolves flow, storage and daylight — plans drawn around how the space is actually lived in, before build.", specs: [["Deliverable", "Space plans"], ["Focus", "Flow · storage · light"], ["Lead time", "2 – 3 weeks"]], gallery: ["photo-1618220179428-22790b461013", "photo-1631679706909-1844bbd07221", "photo-1616486338812-3dadae4b4ace"] },
  "material-palettes": { brand: "BDS Marvel", consult: "Interior Design Consulting", desc: "Material palettes sampled together — stone, flooring, plaster and timber approved as a set so the finished room reads as one.", specs: [["Deliverable", "Physical palette"], ["Range", "Stone · floor · plaster · wood"], ["Lead time", "1 – 2 weeks"]], gallery: ["photo-1600585154340-be6161a56a0c", "photo-1618221195710-dd6b41faaea6", "photo-1780399334790-64af9ffb45fc"] },
  "3d-visualisation": { brand: "BDS Marvel", consult: "Interior Design Consulting", desc: "Photoreal 3D visualisation so you sign off the space before it is built — every material, light and detail resolved on screen first.", specs: [["Deliverable", "3D renders"], ["Sign-off", "Before build"], ["Lead time", "2 – 4 weeks"]], gallery: ["photo-1631396326646-c06a935ff3a6", "photo-1631679706909-1844bbd07221", "photo-1618220179428-22790b461013"] },
});

const categoriesFilter = ["All", ...new Set(catalogueItems.map(i => i.category || "Marble & Stone"))];
const categoryOf = (item) => item.category || "Marble & Stone";

function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { node.classList.add("is-visible"); observer.disconnect(); } }, { threshold: 0.12 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function Reveal({ children, className = "" }) { return <div ref={useReveal()} className={`reveal ${className}`}>{children}</div>; }

function usePageMeta(title, description) {
  useEffect(() => {
    document.title = title;
    const set = (selector, value) => { const tag = document.querySelector(selector); if (tag) tag.setAttribute("content", value); };
    set('meta[name="description"]', description);
    set('meta[property="og:title"]', title);
    set('meta[property="og:description"]', description);
  }, [title, description]);
}

const SEGMENT_SEO = wordpressContent("SEGMENT_SEO", {
  "interior-designing": ["Interior Designing — BDS Marvel | BDSM · BDS Marvel", "BDS Marvel, the interior designing team at BDSM: concept, spatial planning, material palettes and detailing for residential and commercial spaces."],
  "marble-and-stone": ["Marble & Stone Supplier in India — Drawstones | BDSM · BDS Marvel", "Drawstones, the stone team at BDSM · BDS Marvel: marble, granite, kota and travertine sourcing, cutting and installation for facades and interiors."],
  flooring: ["SPC & Wood Flooring — Renest | BDSM · BDS Marvel", "Renest, the flooring team at BDSM · BDS Marvel: SPC, engineered oak and hospitality-grade flooring, specified and installed by one in-house team."],
  construction: ["Turnkey Construction — Formwork | BDSM · BDS Marvel", "Formwork, the construction team at BDSM · BDS Marvel: turnkey structures, fitouts and site execution under one contract."],
  interiors: ["Interior Design & Build — Vignette | BDSM · BDS Marvel", "Vignette, the interior design team at BDSM · BDS Marvel: residential and commercial interiors, bespoke furniture and full execution."],
  furniture: ["Bespoke Furniture — Grain | BDSM · BDS Marvel", "Grain, the furniture studio at BDSM · BDS Marvel: bespoke tables, seating, storage and joinery designed and built in-house."],
});

// Per-service consulting coverage + optional visual catalogue, keyed by segment slug.
const serviceExtras = wordpressContent("serviceExtras", {
  "interior-designing": {
    consultService: "Interior Design Consulting",
    consultLine: "Professional interior design consulting — from first concept to resolved detail.",
    consultCover: ["Concept & moodboards", "Space planning", "Material selection", "Finishes", "3D visualization", "Design detailing"],
  },
  construction: {
    consultService: "Construction Consulting",
    consultLine: "Construction consulting across planning, materials and on-site execution.",
    consultCover: ["Construction planning", "Material decisions", "Execution guidance", "Coordination", "Finishes", "Build-related decisions"],
    catalogue: [
      { slug: "tensile-structures", brand: "Formwork", name: "Tensile Structures", image: "photo-1784637663357-cfbf73b09c0d", desc: "Fabric shade canopies and membrane roofs.", meta: "Formwork · Shade" },
    ],
  },
  "marble-and-stone": {
    consultService: "Marble & Stone Consulting",
    consultLine: "Guidance on material selection, finishes, applications, combinations and suitability for your project.",
    consultCover: ["Material selection", "Finishes", "Applications", "Combinations", "Project suitability"],
    // Full DrawStones range — derived from the main catalogue so both pages stay in sync.
    catalogue: catalogueItems.filter((item) => item.brand === "DrawStones").map((item) => ({
      slug: item.slug,
      brand: item.brand,
      name: item.name,
      image: item.image,
      desc: (catalogueDetails[item.slug]?.desc || "").split(" — ")[0] || item.origin,
      meta: `${item.brand} · ${item.product}`,
    })),
  },
  flooring: {
    consultService: "Flooring Consulting",
    consultLine: "Flooring selection, finish, durability, application and coordination with the overall interior.",
    consultCover: ["Flooring selection", "Finish", "Durability", "Application", "Interior coordination"],
    catalogue: [
      { slug: "broadloom-carpets", brand: "Renest", name: "Broadloom Carpets", image: "photo-1660394585016-508f949df960", desc: "Wall-to-wall broadloom in wool and synthetic blends.", meta: "Renest · Carpet" },
      { slug: "carpet-tiles", brand: "Renest", name: "Carpet Tiles", image: "photo-1523350165414-082d792c4bcc", desc: "Modular carpet tiles for offices and contract floors.", meta: "Renest · Modular" },
      { slug: "carpets-rugs", brand: "Renest", name: "Carpets & Rugs", image: "photo-1572123979839-3749e9973aba", desc: "Hand-knotted and machine-made carpets and area rugs.", meta: "Renest · Rugs" },
      { slug: "commercial-flooring", brand: "Renest", name: "Commercial Flooring", image: "photo-1560185008-b033106af5c3", desc: "Hard-wearing floors for offices and retail.", meta: "Renest · Contract" },
      { slug: "deck-flooring", brand: "Renest", name: "Deck Flooring", image: "photo-1656646549633-80ad4bd2ab40", desc: "WPC and timber decking for outdoor areas.", meta: "Renest · Outdoor" },
      { slug: "gym-flooring", brand: "Renest", name: "Gym Flooring", image: "photo-1603665409265-bdc00027c217", desc: "Shock-absorbing rubber flooring for gyms.", meta: "Renest · Rubber" },
      { slug: "heavy-duty-doormats", brand: "Renest", name: "Heavy Duty Doormats", image: "photo-1574120583586-de8847ae992c", desc: "Entrance and dirt-barrier mats for high traffic.", meta: "Renest · Entrance" },
      { slug: "hospital-flooring", brand: "Renest", name: "Hospital Flooring", image: "photo-1581858726788-75bc0f6a952d", desc: "Antibacterial homogeneous vinyl for healthcare.", meta: "Renest · Healthcare" },
      { slug: "laminate-wooden-flooring", brand: "Renest", name: "Laminate / Wooden Flooring", image: "photo-1519393890420-f28727375fa5", desc: "Laminate and engineered wood plank floors.", meta: "Renest · Plank" },
      { slug: "lvt-flooring", brand: "Renest", name: "LVT Flooring", image: "photo-1598718544285-7180f670198b", desc: "Luxury vinyl tile in wood and stone looks.", meta: "Renest · Vinyl" },
      { slug: "school-flooring", brand: "Renest", name: "School Flooring", image: "photo-1613124152913-c180d8c1d740", desc: "Durable, safe flooring for schools and play areas.", meta: "Renest · Education" },
      { slug: "spc-flooring", brand: "Renest", name: "SPC Flooring", image: "photo-1548268364-3acee266b695", desc: "Rigid stone-polymer core click-lock floors.", meta: "Renest · Rigid" },
      { slug: "sports-flooring", brand: "Renest", name: "Sports Flooring", image: "photo-1610684082661-5d4763eecb39", desc: "Indoor court and multi-sport surfaces.", meta: "Renest · Sports" },
      { slug: "transport-flooring", brand: "Renest", name: "Transport Flooring", image: "photo-1768554630751-6448593749eb", desc: "Anti-slip flooring for buses, trains and transit.", meta: "Renest · Transit" },
      { slug: "vibrant-flooring", brand: "Renest", name: "Vibrant", image: "photo-1654605305001-8ec64a69c07c", desc: "Colourful, patterned flooring for creative spaces.", meta: "Renest · Colour" },
    ],
  },
  interiors: {
    consultService: "Interior Décor Consulting",
    consultLine: "Décor selection, lighting, accessories, textures, colours and finishing details.",
    consultCover: ["Décor selection", "Lighting", "Accessories", "Textures", "Colours", "Finishing details"],
    catalogue: [
      { slug: "decor-lighting", name: "Lighting", image: "photo-1747258818911-dfde27ecabba", desc: "Ambient, task and feature lighting.", meta: "Lighting · Mood" },
      { slug: "decor-pieces", name: "Décor Pieces", image: "photo-1600585154340-be6161a56a0c", desc: "Sculptural objects and statement pieces.", meta: "Décor · Object" },
      { slug: "decor-accessories", name: "Accessories", image: "photo-1618221195710-dd6b41faaea6", desc: "Considered accents that finish a room.", meta: "Accessory · Detail" },
      { slug: "decor-textures", name: "Textures", image: "photo-1780399334790-64af9ffb45fc", desc: "Lime plaster, linen, stone and wood.", meta: "Texture · Surface" },
      { slug: "decor-finishing", name: "Finishing Elements", image: "photo-1600566753190-17f0baa2a6c3", desc: "Hardware, trims and final touches.", meta: "Finish · Trim" },
      { slug: "artificial-plants-green-walls", brand: "Vignette", name: "Artificial Plants & Green Walls", image: "photo-1585506774639-5e2f8fda6352", desc: "Low-maintenance greenery and vertical gardens.", meta: "Vignette · Greenery" },
      { slug: "decorative-planters", brand: "Vignette", name: "Planters", image: "photo-1588440691140-09155c1be58a", desc: "Ceramic and stone planters and urns.", meta: "Vignette · Planters" },
      { slug: "garden-umbrella-gazebo", brand: "Vignette", name: "Garden Umbrella & Gazebo", image: "photo-1784454793008-3d6e632db3d7", desc: "Shade and outdoor living structures.", meta: "Vignette · Outdoor" },
    ],
  },
  furniture: {
    consultService: "Furniture Consulting",
    consultLine: "Furniture selection, sizing, materials, finishes, placement and custom furniture guidance.",
    consultCover: ["Furniture selection", "Sizing", "Materials & finishes", "Placement", "Custom furniture"],
    catalogue: [
      { slug: "sofas", name: "Sofas", image: "photo-1600607687939-ce8a6c25118c", desc: "Deep, tailored seating in soft upholstery.", meta: "Seating · Upholstery" },
      { slug: "tables", name: "Tables", image: "photo-1600585154340-be6161a56a0c", desc: "Stone, timber and cast tops.", meta: "Table · Surface" },
      { slug: "chairs", name: "Chairs", image: "photo-1631396326646-c06a935ff3a6", desc: "Dining, lounge and accent chairs.", meta: "Chair · Craft" },
      { slug: "custom-furniture", name: "Custom Furniture", image: "photo-1737467030068-88ad20e617ca", desc: "Bespoke joinery built to your brief.", meta: "Bespoke · Joinery" },
      { slug: "furniture-materials", name: "Materials & Finishes", image: "photo-1618221195710-dd6b41faaea6", desc: "Solid wood, stone, metal and lacquer.", meta: "Material · Finish" },
    ],
  },
});

const consultServices = Object.values(serviceExtras).map((extra) => extra.consultService);


function useOrbitScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let raf;
    let current = 0;
    const loop = () => {
      // Scroll-linked rotation only — no continuous drift; lerped per frame for smoothness
      const target = window.scrollY * 0.08;
      current += (target - current) * 0.12;
      document.documentElement.style.setProperty("--orbit-rot", `${current.toFixed(2)}deg`);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}

function highlightSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("section-arrived");
  void el.offsetWidth;
  el.classList.add("section-arrived");
  window.setTimeout(() => el.classList.remove("section-arrived"), 1600);
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { const onScroll = () => setScrolled(window.scrollY > 40); window.addEventListener("scroll", onScroll); return () => window.removeEventListener("scroll", onScroll); }, []);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    const onKeyDown = (event) => { if (event.key === "Escape") setMenuOpen(false); };
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);
  const goHomeSection = (id) => { setMenuOpen(false); navigate("/"); window.setTimeout(() => smoothScrollTo(document.getElementById(id)), 80); };
  const location = useLocation();
  const onStays = location.pathname.startsWith("/stays") || location.pathname === "/experience";
  const accountName = user && user.name ? user.name : user && user.email ? user.email : "";
  const accountInitials = accountName.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return <>
    <header className={`site-header ${scrolled ? "site-header--scrolled" : ""} ${menuOpen ? "site-header--menu-open" : ""}`} data-testid="site-header">
      <button type="button" className="wordmark" onClick={() => goHomeSection("top")} data-testid="home-logo-button" aria-label="Go to top">BDSM</button>
      <div className="header-right">
        <Link className="header-work-link" to="/projects" data-testid="header-work-link">PROJECTS</Link>
        <Link className="header-work-link" to="/catalogue" data-testid="header-catalogue-link">CATALOGUE</Link>
        <Link className="header-work-link" to="/contact" data-testid="header-contact-link">CONTACT</Link>
        {onStays && <Link className="header-profile" to="/stays/account" aria-label={user && user !== false ? "My account" : "Sign in"} data-testid="header-profile">
          {user && user !== false ? (user.picture ? <img src={user.picture} alt="" /> : <span className="header-profile__initials">{accountInitials}</span>) : <User size={18} strokeWidth={1.75} />}
        </Link>}
        <button type="button" className={`menu-button ${menuOpen ? "menu-button--open" : ""}`} onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="site-navigation-drawer" aria-label={menuOpen ? "Close menu" : "Open menu"} data-testid="open-menu-button"><span className="menu-icon" aria-hidden="true"><span></span><span></span></span></button>
      </div>
    </header>
    <div id="site-navigation-drawer" className={`menu-drawer ${menuOpen ? "menu-drawer--open" : ""}`} role="dialog" aria-modal="true" aria-label="Site navigation" data-testid="navigation-drawer" aria-hidden={!menuOpen}>
      <button type="button" className="drawer-close" onClick={() => setMenuOpen(false)} data-testid="close-menu-button" aria-label="Close menu"><X size={28} /></button>
      <div className="drawer-copy"><span className="eyebrow">BDSM · BDS MARVEL</span><h2>Materials, structures<br /><em>and the space between.</em></h2></div>
      <nav className="drawer-nav" data-testid="navigation-menu">
        <button onClick={() => goHomeSection("top")} data-testid="nav-home-link">HOME</button>
        <Link to="/about" onClick={() => setMenuOpen(false)} data-testid="nav-about-link">ABOUT</Link>
        <button onClick={() => goHomeSection("network")} data-testid="nav-network-link">WHAT WE DO</button>
        <Link to="/projects" onClick={() => setMenuOpen(false)} data-testid="nav-work-link">PROJECTS</Link>
        <Link to="/catalogue" onClick={() => setMenuOpen(false)} data-testid="nav-catalogue-link">CATALOGUE</Link>
        <Link to="/stays" onClick={() => setMenuOpen(false)} data-testid="nav-experience-link">AIR BNB</Link>
        <Link to="/contact" onClick={() => setMenuOpen(false)} data-testid="nav-contact-link">CONTACT</Link>
      </nav>
      {(onStays || user === false) && <div className="drawer-account" data-testid="drawer-account">
        {user === false && <>
          <Link to="/stays/account" state={(location.pathname.startsWith("/stays/home") || location.pathname.startsWith("/stays/book")) ? { from: location.pathname + location.search } : undefined} onClick={() => setMenuOpen(false)} data-testid="drawer-signin-link">BnB SIGN IN</Link>
          {onStays && <>
            <span className="drawer-account__dot">·</span>
            <Link to="/stays" onClick={() => setMenuOpen(false)} data-testid="drawer-stays-link">STAYS</Link>
          </>}
        </>}
        {onStays && user && user !== false && <>
          <span className="drawer-account__who" data-testid="drawer-account-name">{accountName}</span>
          <Link to="/stays/trips" onClick={() => setMenuOpen(false)} data-testid="drawer-trips-link">YOUR TRIPS</Link>
          <span className="drawer-account__dot">·</span>
          <button type="button" onClick={async () => { setMenuOpen(false); await logout(); navigate("/"); }} data-testid="drawer-logout">LOG OUT</button>
        </>}
      </div>}
      <div className="drawer-footer" data-testid="navigation-drawer-footer">INFO@BDSMARVEL.COM <span>© BDSM · BDS MARVEL</span></div>
    </div>
  </>;
}

function Home() {
  usePageMeta("BDSM · BDS Marvel | Marble & Stone, Flooring, Construction & Interiors", "One design and build studio for marble and stone, flooring, turnkey construction and interior design — workshops and studios across India: Kishangarh, Mumbai, Gurugram, Pune, New Delhi and Goa.");
  const [activeApproach, setActiveApproach] = useState(0);
  useOrbitScroll();
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const headlineY = useTransform(scrollYProgress, [0, 1], [0, 110]);
  const ringsY = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const ringsRotate = useTransform(scrollYProgress, [0, 1], [0, 40]);
  const ringsScale = useTransform(scrollYProgress, [0, 1], [1, 1.12]);
  const onHeroTilt = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    event.currentTarget.style.setProperty("--tilt-x", `${(-y * 6).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--tilt-y", `${(x * 8).toFixed(2)}deg`);
  };
  const resetHeroTilt = (event) => {
    event.currentTarget.style.setProperty("--tilt-x", "0deg");
    event.currentTarget.style.setProperty("--tilt-y", "0deg");
  };
  const scrollTo = (id) => smoothScrollTo(document.getElementById(id));
  return <main className="zoo-site">
    <section className="hero" id="top" data-testid="hero-section" ref={heroRef} onMouseMove={onHeroTilt} onMouseLeave={resetHeroTilt}>      <motion.div className="hero-headline-parallax" style={{ y: headlineY }}>
        <div className="hero-heading"><p className="eyebrow">BDSM · BDS MARVEL</p><h1><span className="hero-line"><span className="hero-line__inner">Architecture.</span></span><span className="hero-line"><span className="hero-line__inner"><em>Interiors.</em></span></span><span className="hero-line"><span className="hero-line__inner">Everything In Between<span className="hero-dot">.</span></span></span></h1></div>
      </motion.div>
      <div className="hero-footer"><button onClick={() => scrollTo("network")} data-testid="hero-explore-button">EXPLORE OUR WORK <ArrowDown size={16} /></button></div>
      <motion.div className="hero-rings-parallax" style={{ y: ringsY, rotate: ringsRotate, scale: ringsScale }} aria-hidden="true" data-testid="hero-rings-parallax">
        <div className="hero-rings-tilt">
          <div className="hero-rings" aria-hidden="true"><span /><span /><span /></div>
        </div>
      </motion.div>
    </section>
    <NetworkExperience />
    <ExperienceSpotlight />
    <section className="purpose-section" id="purpose" data-testid="purpose-section">
      <Reveal className="purpose-header"><span className="section-index">02 — HOW BDS MARVEL BUILDS</span><h2>Built around<br /><em>the material.</em></h2></Reveal>
      <div className="purpose-layout">
        <div className="purpose-list">{approach.map((purpose, index) => <div className={`purpose-accordion-item ${activeApproach === index ? "purpose-accordion-item--active" : ""}`} key={purpose.title} data-testid={`purpose-accordion-item-${index + 1}`}>
          <button className={`purpose-tab purpose-tab--tone-${purposeTones[index % 4]} ${activeApproach === index ? "purpose-tab--active" : ""}`} onClick={() => setActiveApproach(index)} aria-expanded={activeApproach === index} aria-controls={`purpose-mobile-panel-${index + 1}`} data-testid={`purpose-tab-${index + 1}`}><span>{purpose.number}</span><strong>{purpose.title}</strong><ChevronDown size={19} /></button>
          <div className="purpose-accordion-panel" id={`purpose-mobile-panel-${index + 1}`} aria-hidden={activeApproach !== index} data-testid={`purpose-mobile-panel-${index + 1}`}>
            <div className="purpose-accordion-panel__inner">
              <div className={`purpose-feature purpose-feature--mobile purpose-feature--tone-${purposeTones[index % 4]}`} style={{ backgroundImage: `linear-gradient(90deg, rgba(8,8,8,.82), rgba(8,8,8,.08)), url(${img(purpose.image)})` }}>
                <div><span>{purpose.number} / 05</span><h3>{purpose.title}</h3><p>{purpose.text}</p></div>
                <div className="purpose-arrows"><button onClick={() => setActiveApproach((index + approach.length - 1) % approach.length)} aria-label="Previous purpose" data-testid={`purpose-mobile-previous-${index + 1}`}><ArrowUpRight size={20} /></button><button onClick={() => setActiveApproach((index + 1) % approach.length)} aria-label="Next purpose" data-testid={`purpose-mobile-next-${index + 1}`}><ArrowUpRight size={20} /></button></div>
              </div>
            </div>
          </div>
        </div>)}</div>
        {approach.length > 0 && <div key={activeApproach} className={`purpose-feature purpose-feature--desktop purpose-feature--tone-${purposeTones[activeApproach % 4]}`} style={{ backgroundImage: `linear-gradient(90deg, rgba(8,8,8,.82), rgba(8,8,8,.08)), url(${img(approach[activeApproach].image)})` }} data-testid="active-purpose-panel">
          <div><span>{approach[activeApproach].number} / 05</span><h3>{approach[activeApproach].title}</h3><p>{approach[activeApproach].text}</p></div>
          <div className="purpose-arrows"><button onClick={() => setActiveApproach((activeApproach + approach.length - 1) % approach.length)} data-testid="purpose-previous-button"><ArrowUpRight size={20} /></button><button onClick={() => setActiveApproach((activeApproach + 1) % approach.length)} data-testid="purpose-next-button"><ArrowUpRight size={20} /></button></div>
        </div>}
      </div>
    </section>
    <ProjectsSlideshow />
    <section className="contact-section" id="contact" data-testid="contact-section">
      <div className="contact-orbit" aria-hidden="true"><span>LET'S BUILD<br />SOMETHING<br /><em>TOGETHER</em></span></div>
      <Reveal className="contact-copy"><span className="section-index">04 — START A PROJECT</span><h2>One Dream.<br /><em>One studio.</em></h2><ContactTrigger className="contact-cta-btn" testId="contact-section-cta">START A PROJECT</ContactTrigger></Reveal>
      <Clientele />
    </section>
  </main>;
}

function ProjectsSlideshow() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef(null);
  useEffect(() => {
    if (paused || !projects.length) return undefined;
    const id = setInterval(() => setActive((index) => (index + 1) % projects.length), 5000);
    return () => clearInterval(id);
  }, [paused]);
  const project = projects[active % projects.length];
  const showNext = () => setActive((index) => (index + 1) % projects.length);
  const showPrev = () => setActive((index) => (index + projects.length - 1) % projects.length);
  const onTouchStart = (event) => { touchStartX.current = event.touches[0].clientX; };
  const onTouchEnd = (event) => {
    if (touchStartX.current == null) return;
    const delta = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 40) return;
    if (delta < 0) showNext(); else showPrev();
  };
  if (!project) return null;
  return <section className="work-slideshow" id="work" data-testid="work-slideshow" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
    <Reveal className="work-slideshow__head">
      <span className="section-index">03 — PROJECT CATALOGUE</span>
      <h2>Selected work,<br /><em>frame by frame.</em></h2>
      <Link to="/projects" className="work-slideshow__all" data-testid="work-slideshow-all">ALL PROJECTS <ArrowUpRight size={15} /></Link>
    </Reveal>
    <div className="work-slideshow__stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} data-testid="work-slideshow-stage">
      <Link to={`/projects/${project.slug}`} key={project.slug} className="work-slideshow__frame" data-testid="work-slideshow-frame">
        <img src={img(project.image, 1600)} alt={project.title} />
        <span className="work-slideshow__meta">{project.category} · {project.location}</span>
      </Link>
      <div className="work-slideshow__bar">
        <div className="work-slideshow__info" key={project.slug}>
          <span className="work-slideshow__count">{String(active + 1).padStart(2, "0")} / {String(projects.length).padStart(2, "0")}</span>
          <h3>{project.title}</h3>
          <span className="work-slideshow__segment">{project.segment}</span>
        </div>
        <div className="work-slideshow__arrows">
          <button type="button" onClick={showPrev} aria-label="Previous project" data-testid="work-slideshow-prev"><ChevronLeft size={20} /></button>
          <button type="button" onClick={showNext} aria-label="Next project" data-testid="work-slideshow-next"><ChevronRight size={20} /></button>
        </div>
      </div>
      <div className="work-slideshow__dots">{projects.map((item, index) => <button type="button" key={item.slug} className={index === active ? "is-active" : ""} onClick={() => setActive(index)} aria-label={`Show ${item.title}`} data-testid={`work-slideshow-dot-${index + 1}`} />)}</div>
    </div>
  </section>;
}

function CountUp({ value }) {
  const ref = useRef(null);
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const node = ref.current;
    const match = value.match(/^(\d[\d,]*)(.*)$/);
    if (!node || !match) return undefined;
    const target = parseInt(match[1].replace(/,/g, ""), 10);
    const suffix = match[2];
    const grouped = match[1].includes(",");
    const pad = grouped ? 0 : match[1].length;
    const fmt = (n) => (grouped ? n.toLocaleString("en-IN") : String(n).padStart(pad, "0")) + suffix;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = null;
    const animate = () => {
      if (reduced) { setDisplay(fmt(target)); return; }
      const start = performance.now();
      const duration = 1400;
      const tick = (now) => {
        const t = Math.min((now - start) / duration, 1);
        setDisplay(fmt(Math.round((1 - Math.pow(1 - t, 3)) * target)));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (raf) cancelAnimationFrame(raf);
      if (entry.isIntersecting) { setDisplay(fmt(0)); animate(); } else setDisplay(fmt(0));
    }, { threshold: 0.4 });
    observer.observe(node);
    return () => { observer.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [value]);
  return <strong ref={ref}>{display}</strong>;
}

function BdsmMark() {
  const tiles = ["tl","d","tr","tl","d","tr","tl","d","tr","tl","d","tr","tl","d","tr","tl","d","tr","tl","d","tr","tl","d","tr"];
  return <div className="zm-mark" aria-hidden="true">{tiles.map((t, i) => <span key={i} className={`zm-tile zm-tile--${t}`} />)}</div>;
}

function ScrollUpButton() {
  return <button className="footer-top" onClick={() => smoothScrollTo(0)} aria-label="Scroll to top" data-testid="footer-scroll-top"><span className="footer-top__label">To the Top</span><ArrowUp size={15.75} /></button>;
}

function NetworkExperience() {
  const { setOpen } = useContact();
  const [active, setActive] = useState(0);
  const [revealed, setRevealed] = useState(() => segments.map(() => false));
  const [visible, setVisible] = useState(false);
  const sectionRef = useRef(null);
  const panelRefs = useRef([]);
  const copyRefs = useRef([]);
  const total = segments.length;

  useEffect(() => {
    // One geometric pass per scroll frame — cannot miss fast smooth-scroll glides:
    // rail follows the panel nearest the viewport centre, and each panel's copy reveals
    // the moment the copy block itself enters the viewport band (works in both scroll directions)
    let ticking = false;
    const run = () => {
      ticking = false;
      const vh = window.innerHeight;
      const mid = vh / 2;
      let best = 0;
      let bestDist = Infinity;
      panelRefs.current.forEach((node, i) => {
        if (!node) return;
        const rect = node.getBoundingClientRect();
        if (rect.bottom <= 0 || rect.top >= vh) return;
        const dist = Math.abs(rect.top + rect.height / 2 - mid);
        if (dist < bestDist) { bestDist = dist; best = i; }
      });
      setActive(best);
      setRevealed((prev) => {
        let changed = false;
        const next = prev.map((was, i) => {
          const node = copyRefs.current[i];
          if (!node) return was;
          const rect = node.getBoundingClientRect();
          const now = rect.top < vh * 0.92 && rect.bottom > vh * 0.02;
          if (now !== was) changed = true;
          return now;
        });
        return changed ? next : prev;
      });
    };
    // rAF-throttle: multiple scroll events can fire within one frame during a
    // Lenis glide — run the geometric pass at most once per frame (mobile jank fix)
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(run);
    };
    run();
    const settle = window.setTimeout(run, 900); // re-check once images/layout settle (catches copy already in view on load)
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    const onScroll = () => {
      const rect = section.getBoundingClientRect();
      const insideTop = rect.top <= 0;
      const insideBottom = rect.bottom >= window.innerHeight;
      setVisible(insideTop && insideBottom);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Register panels as snap points for the smooth scroller (replaces CSS scroll-snap)
  useEffect(() => {
    const { snap } = initSmoothScroll();
    const nodes = panelRefs.current.filter(Boolean);
    if (!snap || nodes.length === 0) return undefined;
    snap.addElements(nodes, { align: ["start"] });
    return () => nodes.forEach((node) => { if (typeof snap.removeElement === "function") snap.removeElement(node); });
  }, []);

  const goTo = (index) => {
    const node = panelRefs.current[index];
    if (node) smoothScrollTo(node);
  };

  return <section id="network" ref={sectionRef} className={`network-experience ${visible ? "network-experience--in-view" : ""}`} data-testid="network-section">
    <aside className="network-rail" aria-label="Segment navigation">
      <ol className="network-rail__list" data-testid="network-rail-list">
        {segments.map((segment, index) => <li key={segment.slug} className={index === active ? "network-rail__item--active" : ""}>
          <button onClick={() => goTo(index)} data-testid={`network-rail-${index + 1}`}>
            <span className="network-rail__label">{index + 1} {segment.name.toUpperCase()}</span>
            {index === active && <ChevronLeft className="network-rail__caret" size={20} aria-hidden="true" />}
          </button>
        </li>)}
      </ol>
    </aside>
    <div className="network-panels">
      {segments.map((segment, index) => <article key={segment.slug} ref={(node) => (panelRefs.current[index] = node)} data-index={index} className={`network-panel network-panel--${segment.tone} ${index === active ? "network-panel--active" : ""} ${revealed[index] ? "network-panel--revealed" : ""}`} data-testid={`network-panel-${index + 1}`}>
        <div className="network-panel__meta"><span>0{index + 1} / {String(total).padStart(2, "0")}</span><span>{segment.parent.toUpperCase()} · {segment.kicker.toUpperCase()}</span></div>
        <div className="network-panel__stage">
          <span className="network-panel__mascot-wrap"><img src={img(segment.hero)} alt={`${segment.name} sample`} className="network-panel__mascot" /></span>
        </div>
        <div className="network-panel__copy" ref={(node) => (copyRefs.current[index] = node)} data-copy-index={index}>
          <div className="network-panel__brand"><span className="np-brand-parent">{segment.parent}</span><span className="np-brand-name">{segment.name}</span></div>
          <h3>{segment.tagline}</h3>
          <p>{segment.body}</p>
          <ul className="network-panel__tags">{segment.services.map((service, tagIndex) => <li key={service} style={{ "--i": tagIndex }}>{service}</li>)}</ul>
          <div className="network-panel__actions">
            <Link to={segment.link || `/businesses/${segment.slug}`} className="np-btn np-btn--ghost" data-testid={`network-panel-${index + 1}-explore`}>EXPLORE <ArrowUpRight size={16} /></Link>
            <button type="button" onClick={() => setOpen(true)} className="np-btn np-btn--solid" data-testid={`network-panel-${index + 1}-contact`}>GET IN TOUCH <ArrowUpRight size={16} /></button>
          </div>
        </div>
      </article>)}
    </div>
  </section>;
}

function ExperienceSpotlight() {
  const { setOpen } = useContact();
  const copyRef = useRef(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const node = copyRef.current;
    if (!node) return undefined;
    // Reveal when the COPY block itself is meaningfully in view — replays in both
    // scroll directions (section-level isIntersecting fired at 1px, so scrolling up
    // the animation ran and finished before the copy ever reached the viewport).
    const observer = new IntersectionObserver(([entry]) => setRevealed(entry.intersectionRatio >= 0.25), { threshold: [0, 0.25] });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <section className={`experience-spotlight ${revealed ? "experience-spotlight--revealed" : ""}`} data-testid="experience-spotlight">
    <div className="experience-spotlight__header">
      <span className="section-index" data-testid="experience-spotlight-label">EXPERIENCE OUR CRAFT</span>
      <p data-testid="experience-spotlight-status">A stayable home by BDSM · BDS Marvel</p>
    </div>
    <div className="experience-spotlight__layout">
      <div className="experience-spotlight__visual" style={{ backgroundImage: `linear-gradient(180deg, rgba(8,8,8,.08), rgba(8,8,8,.68)), url(${img(livingStudio.hero)})` }} data-testid="experience-spotlight-image">
        <span data-testid="experience-spotlight-location">{livingStudio.kicker}</span>
        <strong data-testid="experience-spotlight-image-title">STAY INSIDE<br />WHAT WE BUILT.</strong>
      </div>
      <div className="experience-spotlight__copy" ref={copyRef}>
        <span className="experience-spotlight__badge" data-testid="experience-spotlight-badge">STAY OVER</span>
        <h2 data-testid="experience-spotlight-title">Air BnB<br /><em>Living Studio.</em></h2>
        <h3 data-testid="experience-spotlight-tagline">{livingStudio.tagline}</h3>
        <p data-testid="experience-spotlight-description">{livingStudio.body}</p>
        <ul data-testid="experience-spotlight-details">{livingStudio.details.map((detail, index) => <li key={detail} style={{ "--i": index }}>{detail}</li>)}</ul>
        <div className="experience-spotlight__actions">
          <Link to="/stays?start=where" className="np-btn np-btn--solid" data-testid="experience-spotlight-explore">EXPLORE THE STAY <ArrowUpRight size={16} /></Link>
          <Link to="/experience" className="np-btn np-btn--ghost" data-testid="experience-spotlight-request">REQUEST A NIGHT <ArrowUpRight size={16} /></Link>
        </div>
      </div>
    </div>
  </section>;
}

function Clientele() {
  const rows = [clients.slice(0, 12), clients.slice(12)];
  const tile = (client, testId) => <div className="client-logo" role="img" aria-label={`${client.name} logo`} key={client.name} data-testid={testId}>
    {client.logo ? <img src={client.logo} alt={client.name} loading="lazy" /> : <span className="client-logo__word">{client.name}</span>}
  </div>;
  return <section className="clients-section" id="clients" data-testid="clients-section">
    <Reveal className="clients-title">
      <div><span className="section-index" data-testid="clientele-label">Clientele</span><h2 data-testid="clientele-title">Trusted by leaders in hospitality, infrastructure, education and public institutions.</h2></div>
    </Reveal>
    <div className="client-marquee" data-testid="client-logo-marquee">
      {rows.map((row, rowIndex) => <div className={`client-logo-row client-logo-row--${rowIndex + 1}`} key={rowIndex} data-testid={`client-logo-row-${rowIndex + 1}`}>
        <div className="client-logo-track">
          <div className="client-logo-set">{row.map((client, index) => tile(client, `client-logo-${rowIndex * 12 + index + 1}`))}</div>
          <div className="client-logo-set" aria-hidden="true">{row.map((client, index) => tile(client, `client-logo-duplicate-${rowIndex * 12 + index + 1}`))}</div>
        </div>
      </div>)}
    </div>
  </section>;
}

function Footer() {
  const navigate = useNavigate();
  const location = useLocation();
  const jump = (id) => {
    if (id === "top") {
      if (location.pathname === "/") smoothScrollTo(0);
      else navigate("/");
      return;
    }
    if (location.pathname === "/") {
      smoothScrollTo(document.getElementById(id));
      window.setTimeout(() => highlightSection(id), 650);
    } else {
      navigate(`/#${id}`);
    }
  };
  return <footer className="site-footer" data-testid="site-footer">
    <div className="site-footer__top">
      <div className="site-footer__brand"><span className="zm-name">BDSM<sup>®</sup></span></div>
      <BdsmMark />
    </div>
    <div className="site-footer__middle">
      <nav className="site-footer__nav" aria-label="Footer navigation">
        <button onClick={() => jump("top")} data-testid="footer-link-home">home</button>
        <button onClick={() => { navigate("/about"); }} data-testid="footer-link-about">about</button>
        <button onClick={() => jump("network")} data-testid="footer-link-agencies">what we do</button>
        <button onClick={() => { navigate("/projects"); }} data-testid="footer-link-projects">projects</button>
        <button onClick={() => { navigate("/catalogue"); }} data-testid="footer-link-catalogue">catalogue</button>
        <button onClick={() => { navigate("/stays"); }} data-testid="footer-link-bnb">air bnb</button>
        <button onClick={() => { navigate("/contact"); }} data-testid="footer-link-contact">contact</button>
      </nav>
      <div className="site-footer__socials">
        <a href="https://www.instagram.com/bds.marvel" target="_blank" rel="noreferrer" aria-label="Instagram" data-testid="footer-instagram-link"><Instagram size={17} /></a>
      </div>
    </div>
    <div className="site-footer__bottom"><span data-testid="footer-copyright">© BDSM · BDS Marvel {new Date().getFullYear()}</span><ScrollUpButton /></div>
  </footer>;
}

function PageShell({ children }) {
  const location = useLocation();
  const navType = useNavigationType();
  const currentKey = useRef(location.key);
  const currentPath = useRef(location.pathname);
  const lastY = useRef(0);
  const navLock = useRef(0);
  useEffect(() => { initSmoothScroll(); }, []);
  // Persistent listener. lastY lags the synchronous scroll-clamp that happens when a
  // shorter page mounts, so it still holds the real pre-navigation position. During a
  // brief lock after each route change we ignore nav-induced reset scrolls.
  useEffect(() => {
    const onScroll = () => {
      lastY.current = window.scrollY;
      if (performance.now() - navLock.current < 1200) return;
      scrollPositions.set(currentKey.current, window.scrollY);
      scrollByPath.set(currentPath.current, window.scrollY);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // On route change: snapshot the outgoing entry (pre-clamp value), switch key, start lock
  useLayoutEffect(() => {
    if (currentKey.current !== location.key) {
      scrollPositions.set(currentKey.current, lastY.current);
      scrollByPath.set(currentPath.current, lastY.current);
      currentKey.current = location.key;
      currentPath.current = location.pathname;
      navLock.current = performance.now();
    }
  }, [location.key, location.pathname]);
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.slice(1);
      const settle = () => {
        const target = document.getElementById(id);
        if (target) {
          smoothScrollTo(target);
          window.setTimeout(() => highlightSection(id), 650);
        }
      };
      window.requestAnimationFrame(() => window.setTimeout(settle, 40));
      return;
    }
    // Restore scroll on browser back/forward (POP) or via an in-app "back" link
    // (which pushes a new entry but carries state.restore). Airbnb-style.
    const byKey = scrollPositions.get(location.key);
    const byPath = scrollByPath.get(location.pathname);
    const saved = navType === "POP" ? byKey : (location.state?.restore ? byPath : undefined);
    if (saved > 0) {
      let tries = 0;
      let cancelled = false;
      const stop = () => { cancelled = true; window.removeEventListener("wheel", stop); window.removeEventListener("touchstart", stop); };
      const restore = () => {
        if (cancelled) return;
        const maxY = document.documentElement.scrollHeight - window.innerHeight;
        if (window.__smoothScroll?.lenis) window.__smoothScroll.lenis.resize();
        smoothScrollTo(Math.min(saved, Math.max(0, maxY)), { immediate: true });
        tries += 1;
        if (maxY < saved - 4 && tries < 40) window.setTimeout(restore, 50);
        else window.setTimeout(stop, 250);
      };
      window.addEventListener("wheel", stop, { passive: true, once: true });
      window.addEventListener("touchstart", stop, { passive: true, once: true });
      window.requestAnimationFrame(() => window.requestAnimationFrame(restore));
      startSmoothScroll();
      return;
    }
    smoothScrollTo(0, { immediate: true });
    startSmoothScroll();
  }, [location.pathname, location.hash, location.key, location.state, navType]);
  return <div className="route-shell" key={location.pathname}><Header />{children}<Footer /><ContactModal /><ConsultationModal /><SampleModal /><InquiryModal /></div>;
}

const ContactCtx = createContext({ open: false, setOpen: () => {} });
function ContactProvider({ children }) {
  const [open, setOpen] = useState(false);
  return <ContactCtx.Provider value={{ open, setOpen }}>{children}</ContactCtx.Provider>;
}
function useContact() { return useContext(ContactCtx); }

const ConsultationCtx = createContext({ open: false, service: "", openConsult: () => {}, closeConsult: () => {} });
function ConsultationProvider({ children }) {
  const [state, setState] = useState({ open: false, service: "" });
  const openConsult = (service = "") => setState({ open: true, service });
  const closeConsult = () => setState((prev) => ({ ...prev, open: false }));
  return <ConsultationCtx.Provider value={{ ...state, openConsult, closeConsult }}>{children}</ConsultationCtx.Provider>;
}
function useConsultation() { return useContext(ConsultationCtx); }

const SampleCtx = createContext({ open: false, product: "", brand: "", openSample: () => {}, closeSample: () => {} });
function SampleProvider({ children }) {
  const [state, setState] = useState({ open: false, product: "", brand: "" });
  const openSample = (product = "", brand = "") => setState({ open: true, product, brand });
  const closeSample = () => setState((prev) => ({ ...prev, open: false }));
  return <SampleCtx.Provider value={{ ...state, openSample, closeSample }}>{children}</SampleCtx.Provider>;
}
function useSample() { return useContext(SampleCtx); }

const InquiryCtx = createContext({ open: false, brand: "", product: "", options: [], openInquiry: () => {}, closeInquiry: () => {} });
function InquiryProvider({ children }) {
  const [state, setState] = useState({ open: false, brand: "", product: "", options: [] });
  const openInquiry = (brand = "", product = "", options = []) => setState({ open: true, brand, product, options });
  const closeInquiry = () => setState((prev) => ({ ...prev, open: false }));
  return <InquiryCtx.Provider value={{ ...state, openInquiry, closeInquiry }}>{children}</InquiryCtx.Provider>;
}
function useInquiry() { return useContext(InquiryCtx); }

function ConsultationModal() {
  const { open, service, closeConsult } = useConsultation();
  const empty = { name: "", phone: "", email: "", city: "", projectType: "", service: "", requirements: "", projectSize: "", budget: "" };
  const [form, setForm] = useState(empty);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState({ state: "idle", error: "" });
  const firstFieldRef = useRef(null);
  const scrollResumeRef = useRef(null);

  useEffect(() => {
    window.clearTimeout(scrollResumeRef.current);
    if (open) {
      setStatus({ state: "idle", error: "" });
      setForm({ ...empty, service: service || "" });
      setFile(null);
      window.setTimeout(() => firstFieldRef.current?.focus(), 80);
      document.body.style.overflow = "hidden";
      stopSmoothScroll();
      return () => { document.body.style.overflow = ""; };
    }
    document.body.style.overflow = "";
    scrollResumeRef.current = window.setTimeout(() => startSmoothScroll(), 60);
    return () => window.clearTimeout(scrollResumeRef.current);
  }, [open, service]);
  useEffect(() => { const onKey = (event) => { if (event.key === "Escape") closeConsult(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [closeConsult]);

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setStatus({ state: "sending", error: "" });
    try {
      let fileId = null;
      let fileName = null;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const up = await apiFetch(apiPath(`/consultations/upload`), { method: "POST", body: fd });
        if (!up.ok) throw new Error("We couldn't upload that file. Try a smaller image or remove it.");
        const upData = await up.json();
        fileId = upData.id; fileName = upData.filename;
      }
      const response = await apiFetch(apiPath(`/consultations`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form,
          name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(),
          city: form.city.trim() || null, project_type: form.projectType || null,
          service: form.service, requirements: form.requirements.trim(),
          project_size: form.projectSize.trim() || null, budget: form.budget || null,
          file_id: fileId, file_name: fileName,
        }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail?.detail?.[0]?.msg || detail?.detail || detail?.message || "Please double-check your details and try again.");
      }
      setStatus({ state: "sent", error: "" });
      setForm(empty); setFile(null);
    } catch (error) {
      setStatus({ state: "error", error: error.message || "Something went wrong. Please try again." });
    }
  };

  if (!open) return null;
  return <div className="contact-modal" role="dialog" aria-modal="true" aria-label="Request a consultation" data-testid="consultation-modal">
    <button className="contact-modal__scrim" onClick={closeConsult} aria-label="Close" data-testid="consultation-modal-scrim" />
    <div className="contact-modal__panel">
      <button className="contact-modal__close" onClick={closeConsult} aria-label="Close" data-testid="consultation-modal-close"><X size={22} /></button>
      <div className="contact-modal__intro">
        <span className="section-index">REQUEST A CONSULTATION</span>
        <h2>Let's plan it<br /><em>together.</em></h2>
        <p>Tell us about your project and pick the service you need guidance on. Our specialist will reply within one working day.</p>
        <div className="contact-modal__meta"><span>info@bdsmarvel.com</span><span>Mumbai · Kishangarh · Gurugram</span></div>
      </div>
      {status.state === "sent" ? <div className="contact-modal__success" data-testid="consultation-modal-success"><Check size={40} /><h3>Thanks — we've got it.</h3><p>{formSettings("consultations")?.success_message || "Your request has been received."}</p><button onClick={closeConsult} data-testid="consultation-modal-done">CLOSE</button></div> : <form className="contact-modal__form" onSubmit={submit} data-testid="consultation-modal-form">
        <DynamicFields slug="consultations" form={form} setForm={setForm} firstFieldRef={firstFieldRef} options={{ service: [{value:"",label:"Select a service"}, ...consultServices], projectType: [] }} file={file} setFile={setFile} />
        {status.state === "error" && <div className="cm-error" data-testid="consultation-modal-error">{status.error}</div>}
        <button type="submit" className="cm-submit" disabled={status.state === "sending" || !formSettings("consultations")?.enabled} data-testid="consultation-modal-submit">{status.state === "sending" ? <><Loader2 size={16} className="cm-spin" /> Sending…</> : <>{formSettings("consultations")?.submit_label || "REQUEST CONSULTATION"} <ArrowUpRight size={16} /></>}</button>
      </form>}
    </div>
  </div>;
}


function SampleModal() {
  const { open, product, brand, closeSample } = useSample();
  const empty = { name: "", email: "", phone: "", address: "", city: "", pincode: "", notes: "" };
  const [form, setForm] = useState(empty);
  const [status, setStatus] = useState({ state: "idle", error: "" });
  const firstFieldRef = useRef(null);
  const scrollResumeRef = useRef(null);

  useEffect(() => {
    window.clearTimeout(scrollResumeRef.current);
    if (open) {
      setStatus({ state: "idle", error: "" });
      setForm(empty);
      window.setTimeout(() => firstFieldRef.current?.focus(), 80);
      document.body.style.overflow = "hidden";
      stopSmoothScroll();
      return () => { document.body.style.overflow = ""; };
    }
    document.body.style.overflow = "";
    scrollResumeRef.current = window.setTimeout(() => startSmoothScroll(), 60);
    return () => window.clearTimeout(scrollResumeRef.current);
  }, [open]);
  useEffect(() => { const onKey = (event) => { if (event.key === "Escape") closeSample(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [closeSample]);

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setStatus({ state: "sending", error: "" });
    try {
      const response = await apiFetch(apiPath(`/sample-requests`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form,
          product, brand: brand || null,
          name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(),
          address: form.address.trim(), city: form.city.trim() || null,
          pincode: form.pincode.trim() || null, notes: form.notes.trim() || null,
        }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail?.detail?.[0]?.msg || detail?.detail || detail?.message || "Please double-check your details and try again.");
      }
      setStatus({ state: "sent", error: "" });
      setForm(empty);
    } catch (error) {
      setStatus({ state: "error", error: error.message || "Something went wrong. Please try again." });
    }
  };

  if (!open) return null;
  return <div className="contact-modal" role="dialog" aria-modal="true" aria-label="Request a material sample" data-testid="sample-modal">
    <button className="contact-modal__scrim" onClick={closeSample} aria-label="Close" data-testid="sample-modal-scrim" />
    <div className="contact-modal__panel">
      <button className="contact-modal__close" onClick={closeSample} aria-label="Close" data-testid="sample-modal-close"><X size={22} /></button>
      <div className="contact-modal__intro">
        <span className="section-index">REQUEST A QUOTE</span>
        <h2>Get a price for<br /><em>your project.</em></h2>
        <p data-testid="sample-modal-product">{product}{brand ? ` · ${brand}` : ""} — tell us a little about your project and we will come back with pricing and lead times within one working day. Add a delivery or site address if you would also like physical samples.</p>
        <div className="contact-modal__meta"><span>info@bdsmarvel.com</span><span>Mumbai · Kishangarh · Gurugram</span></div>
      </div>
      {status.state === "sent" ? <div className="contact-modal__success" data-testid="sample-modal-success"><Check size={40} /><h3>Quote request received.</h3><p>{formSettings("sample-requests")?.success_message || "Your request has been received."}</p><button onClick={closeSample} data-testid="sample-modal-done">CLOSE</button></div> : <form className="contact-modal__form" onSubmit={submit} data-testid="sample-modal-form">
        <DynamicFields slug="sample-requests" form={form} setForm={setForm} firstFieldRef={firstFieldRef}  />
        {status.state === "error" && <div className="cm-error" data-testid="sample-modal-error">{status.error}</div>}
        <button type="submit" className="cm-submit" disabled={status.state === "sending" || !formSettings("sample-requests")?.enabled} data-testid="sample-modal-submit">{status.state === "sending" ? <><Loader2 size={16} className="cm-spin" /> Sending…</> : <>{formSettings("sample-requests")?.submit_label || "REQUEST QUOTE"} <ArrowUpRight size={16} /></>}</button>
      </form>}
    </div>
  </div>;
}

function InquiryModal() {
  const { open, brand, product, options, closeInquiry } = useInquiry();
  const empty = { name: "", email: "", phone: "", product: "", quantity: "", message: "" };
  const [form, setForm] = useState(empty);
  const [status, setStatus] = useState({ state: "idle", error: "" });
  const firstFieldRef = useRef(null);
  const scrollResumeRef = useRef(null);

  const derived = [...catalogueItems, ...Object.values(serviceExtras).flatMap((extra) => extra.catalogue || [])]
    .filter((entry) => (entry.brand || "").toLowerCase() === (brand || "").toLowerCase())
    .map((entry) => entry.name);
  const productOptions = options.length ? options : [...new Set(derived)];

  useEffect(() => {
    window.clearTimeout(scrollResumeRef.current);
    if (open) {
      setStatus({ state: "idle", error: "" });
      setForm({ ...empty, product: product || "" });
      window.setTimeout(() => firstFieldRef.current?.focus(), 80);
      document.body.style.overflow = "hidden";
      stopSmoothScroll();
      return () => { document.body.style.overflow = ""; };
    }
    document.body.style.overflow = "";
    scrollResumeRef.current = window.setTimeout(() => startSmoothScroll(), 60);
    return () => window.clearTimeout(scrollResumeRef.current);
  }, [open, product]);
  useEffect(() => { const onKey = (event) => { if (event.key === "Escape") closeInquiry(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [closeInquiry]);

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setStatus({ state: "sending", error: "" });
    try {
      const response = await apiFetch(apiPath(`/product-inquiries`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form,
          name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || null,
          brand, product: form.product || null,
          quantity: form.quantity.trim() || null, message: form.message.trim(),
        }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail?.detail?.[0]?.msg || detail?.detail || detail?.message || "Please double-check your details and try again.");
      }
      setStatus({ state: "sent", error: "" });
      setForm(empty);
    } catch (error) {
      setStatus({ state: "error", error: error.message || "Something went wrong. Please try again." });
    }
  };

  if (!open) return null;
  return <div className="contact-modal" role="dialog" aria-modal="true" aria-label="Make a product inquiry" data-testid="inquiry-modal">
    <button className="contact-modal__scrim" onClick={closeInquiry} aria-label="Close" data-testid="inquiry-modal-scrim" />
    <div className="contact-modal__panel">
      <button className="contact-modal__close" onClick={closeInquiry} aria-label="Close" data-testid="inquiry-modal-close"><X size={22} /></button>
      <div className="contact-modal__intro">
        <span className="section-index">MAKE AN INQUIRY</span>
        <h2>Pricing, stock<br /><em>and lead times.</em></h2>
        <p data-testid="inquiry-modal-brand">Enquiring under {brand}. Tell us what you need and roughly how much — the {brand} desk replies within one working day.</p>
        <div className="contact-modal__meta"><span>info@bdsmarvel.com</span><span>Mumbai · Kishangarh · Gurugram</span></div>
      </div>
      {status.state === "sent" ? <div className="contact-modal__success" data-testid="inquiry-modal-success"><Check size={40} /><h3>Inquiry sent.</h3><p>{formSettings("product-inquiries")?.success_message || "Your request has been received."}</p><button onClick={closeInquiry} data-testid="inquiry-modal-done">CLOSE</button></div> : <form className="contact-modal__form" onSubmit={submit} data-testid="inquiry-modal-form">
        <DynamicFields slug="product-inquiries" form={form} setForm={setForm} firstFieldRef={firstFieldRef} options={{ product: [{value:"",label:"Multiple / not sure yet"}, ...productOptions] }} />
        {status.state === "error" && <div className="cm-error" data-testid="inquiry-modal-error">{status.error}</div>}
        <button type="submit" className="cm-submit" disabled={status.state === "sending" || !formSettings("product-inquiries")?.enabled} data-testid="inquiry-modal-submit">{status.state === "sending" ? <><Loader2 size={16} className="cm-spin" /> Sending…</> : <>{formSettings("product-inquiries")?.submit_label || "SEND INQUIRY"} <ArrowUpRight size={16} /></>}</button>
      </form>}
    </div>
  </div>;
}


function ContactModal() {
  const { open, setOpen } = useContact();
  const [form, setForm] = useState({ name: "", email: "", company: "", segment: "", budget: "", message: "" });
  const [status, setStatus] = useState({ state: "idle", error: "" });
  const firstFieldRef = useRef(null);
  const scrollResumeRef = useRef(null);

  useEffect(() => {
    window.clearTimeout(scrollResumeRef.current);
    if (open) {
      setStatus({ state: "idle", error: "" });
      window.setTimeout(() => firstFieldRef.current?.focus(), 80);
      document.body.style.overflow = "hidden";
      stopSmoothScroll();
      return () => { document.body.style.overflow = ""; };
    }
    document.body.style.overflow = "";
    scrollResumeRef.current = window.setTimeout(() => startSmoothScroll(), 60);
    return () => window.clearTimeout(scrollResumeRef.current);
  }, [open]);
  useEffect(() => { const onKey = (event) => { if (event.key === "Escape") setOpen(false); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [setOpen]);

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setStatus({ state: "sending", error: "" });
    try {
      const response = await apiFetch(apiPath(`/inquiries`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form,  name: form.name.trim(), email: form.email.trim(), company: form.company.trim() || null, agency: form.segment || null, budget: form.budget || null, message: form.message.trim() }) });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail?.detail?.[0]?.msg || detail?.detail || detail?.message || "Please double-check your details and try again.");
      }
      setStatus({ state: "sent", error: "" });
      setForm({ name: "", email: "", company: "", segment: "", budget: "", message: "" });
    } catch (error) {
      setStatus({ state: "error", error: error.message || "Something went wrong. Please try again." });
    }
  };

  if (!open) return null;
  return <div className="contact-modal" role="dialog" aria-modal="true" aria-label="Start a project" data-testid="contact-modal">
    <button className="contact-modal__scrim" onClick={() => setOpen(false)} aria-label="Close" data-testid="contact-modal-scrim" />
    <div className="contact-modal__panel">
      <button className="contact-modal__close" onClick={() => setOpen(false)} aria-label="Close" data-testid="contact-modal-close"><X size={22} /></button>
      <div className="contact-modal__intro">
        <span className="section-index">START A PROJECT</span>
        <h2>Let's build<br /><em>something together.</em></h2>
        <p>Tell us about your project — stone, flooring, construction or interiors. One team handles all of it, and we reply within one working day.</p>
        <div className="contact-modal__meta"><span>info@bdsmarvel.com</span><span>Mumbai · Kishangarh · Gurugram</span></div>
      </div>
      {status.state === "sent" ? <div className="contact-modal__success" data-testid="contact-modal-success"><Check size={40} /><h3>Thanks — we've got it.</h3><p>{formSettings("inquiries")?.success_message || "Your request has been received."}</p><button onClick={() => setOpen(false)} data-testid="contact-modal-done">CLOSE</button></div> : <form className="contact-modal__form" onSubmit={submit} data-testid="contact-modal-form">
        <DynamicFields slug="inquiries" form={form} setForm={setForm} firstFieldRef={firstFieldRef} options={{ segment: [{value:"",label:"Not sure yet"}, ...segments.map(s => s.name)] }} />
        {status.state === "error" && <div className="cm-error" data-testid="contact-modal-error">{status.error}</div>}
        <button type="submit" className="cm-submit" disabled={status.state === "sending" || !formSettings("inquiries")?.enabled} data-testid="contact-modal-submit">{status.state === "sending" ? <><Loader2 size={16} className="cm-spin" /> Sending…</> : <>{formSettings("inquiries")?.submit_label || "SEND INQUIRY"} <ArrowUpRight size={16} /></>}</button>
      </form>}
    </div>
  </div>;
}

function ContactTrigger({ className = "", children = "START A PROJECT", testId = "open-contact-modal" }) {
  const { setOpen } = useContact();
  return <button type="button" className={className} onClick={() => setOpen(true)} data-testid={testId}>{children} <ArrowUpRight size={16} /></button>;
}

function SampleTrigger({ className = "", product = "", brand = "", children = "REQUEST QUOTE", testId = "open-sample-modal" }) {
  const { openSample } = useSample();
  return <button type="button" className={className} onClick={() => openSample(product, brand)} data-testid={testId}>{children} <ArrowUpRight size={16} /></button>;
}

function SegmentPage() {
  const { slug } = useParams();
  const segment = segments.find((item) => item.slug === slug) || segments[0];
  const related = projects.filter((item) => item.segment === segment.name);
  const extra = serviceExtras[segment.slug];
  const { openConsult } = useConsultation();
  const { openInquiry } = useInquiry();
  usePageMeta(...(SEGMENT_SEO[segment.slug] || SEGMENT_SEO["marble-and-stone"]));
  // BDS Marvel (interior-designing) shows Selected Projects before Consulting; all other brand pages keep Consulting first.
  const projectsFirst = segment.slug === "interior-designing";
  const workSection = <section className="detail-work">
    <div className="detail-intro"><span className="section-index">{projectsFirst ? "01" : extra?.catalogue ? "03" : "02"} — SELECTED PROJECTS</span><h2>Work in the<br /><em>material.</em></h2></div>
    <div className="mini-work-grid">{(related.length ? related : projects.slice(0, 2)).map((work) => <Link to={`/projects/${work.slug}`} className="mini-work" key={work.title} data-testid={`agency-work-${work.slug}`}><img src={img(work.image, 1200)} alt="" /><div><div className="mini-work__text"><span>{work.category} · {work.year}</span><h3>{work.title}</h3></div><ArrowUpRight size={18} /></div></Link>)}</div>
  </section>;
  return <main className={`detail-page detail-page--${segment.tone}`} data-testid="agency-detail-page">
    <section className="detail-hero" style={{ backgroundImage: `linear-gradient(160deg, rgba(10,8,6,.78), rgba(10,8,6,.42)), url(${img(segment.hero)})` }}>
      <div className="detail-kicker"><span>{segment.parent.toUpperCase()} · {String(segments.indexOf(segment) + 1).padStart(2, "0")} / {String(segments.length).padStart(2, "0")}</span><Link to="/" state={{ restore: true }} data-testid="agency-detail-back-link">BACK TO NETWORK</Link></div>
      <div className="detail-hero-grid">
        <div>
          <p className="eyebrow">{segment.parent.toUpperCase()}</p>
          <h1>{segment.name}<span className="hero-dot">.</span></h1>
          <p className="detail-lede">{segment.body}</p>
          <div className="detail-services">{segment.services.map((service) => <span key={service}>{service}</span>)}</div>
        </div>
      </div>
    </section>
    {extra?.catalogue && <section className="svc-catalogue" data-testid="service-catalogue">
      <div className="detail-intro"><span className="section-index">01 — CATALOGUE</span><h2>Browse the<br /><em>{segment.name.toLowerCase()}.</em></h2></div>
      <div className="svc-catalogue__grid">{extra.catalogue.map((item, index) => <Link className="svc-cat-card" to={`/catalogue/${item.slug}`} state={{ from: `/businesses/${segment.slug}`, fromLabel: segment.name }} key={item.name} data-testid={`catalogue-card-${index + 1}`}>
        <div className="svc-cat-card__media"><img src={img(item.image, 900)} alt={item.name} loading="lazy" /></div>
        <div className="svc-cat-card__body"><span className="svc-cat-card__meta">{item.meta}</span><h3>{item.name}</h3><p>{item.desc}</p></div>
      </Link>)}</div>
    </section>}
    {projectsFirst && workSection}
    {extra && <section className="svc-consult" data-testid="service-consulting">
      <div className="svc-consult__inner">
        <span className="section-index">{projectsFirst ? "02" : extra.catalogue ? "02" : "01"} — CONSULTING</span>
        <h2>Get expert<br /><em>guidance.</em></h2>
        <p className="svc-consult__line">{extra.consultLine}</p>
        <ul className="svc-consult__cover">{extra.consultCover.map((c) => <li key={c}>{c}</li>)}</ul>
        <div className="svc-consult__actions">
          <button type="button" className="np-btn np-btn--solid" onClick={() => openConsult(extra.consultService)} data-testid="get-consultation-btn">GET CONSULTATION <ArrowUpRight size={16} /></button>
          {extra.catalogue && <button type="button" className="np-btn np-btn--ghost" onClick={() => openInquiry(segment.parent || segment.name, "", extra.catalogue.map((entry) => entry.name))} data-testid="make-inquiry-btn">MAKE AN INQUIRY <ArrowUpRight size={16} /></button>}
        </div>
      </div>
    </section>}
    {!projectsFirst && workSection}
  </main>;
}

function ProjectPage() {
  const { slug } = useParams();
  const project = projects.find((item) => item.slug === slug);
  const segment = segments.find((item) => item.name === project?.segment);
  const nextProject = projects[(projects.indexOf(project) + 1) % projects.length];
  usePageMeta(project ? `${project.title} | BDSM · BDS Marvel Projects` : "Projects", project?.description || "Projects");
  if (!project) return <Navigate to="/projects" replace />;
  return <main className={`case-study-page case-study-page--${segment?.tone || "sand"}`} data-testid="case-study-page">
    <section className="case-study-hero"><div className="detail-kicker"><span>{project.segment.toUpperCase()} · {project.year}</span><Link to="/projects" state={{ restore: true }} data-testid="case-study-back-link">BACK TO PROJECTS</Link></div><div className="case-study-hero-copy"><span className="section-index">{project.category.toUpperCase()} · {project.location}</span><h1>{project.title}<span className="hero-dot">.</span></h1><p>{project.description}</p></div><div className="case-study-hero-image"><img src={img(project.image)} alt="" data-testid="case-study-hero-image" /></div></section>
    <section className="case-study-overview"><div className="case-study-overview-label"><span className="section-index">01 — THE BRIEF</span><Link to={`/businesses/${segment?.slug || "marble-and-stone"}`} data-testid="case-study-agency-link">VIEW {project.segment.toUpperCase()} <ArrowUpRight size={15} /></Link></div><div className="case-study-story"><div><span className="story-label">THE CHALLENGE</span><h2>{project.challenge}</h2></div><div><span className="story-label">THE APPROACH</span><p>{project.approach}</p></div></div></section>
    <section className="case-study-gallery"><div className="case-study-gallery-heading"><span className="section-index">02 — IN PLACE</span><h2>Detail in<br /><em>the material.</em></h2></div><div className="case-study-images">{project.gallery.map((image, index) => <figure className={`case-study-image case-study-image--${index + 1}`} key={image}><img src={img(image, 1200)} alt={`${project.title} view ${index + 1}`} data-testid={`case-study-gallery-image-${index + 1}`} /><figcaption>0{index + 1} / {project.category.toUpperCase()}</figcaption></figure>)}</div></section>
    <section className="case-study-results"><div><span className="section-index">03 — OUTCOMES</span><h2>Proof in<br /><em>the numbers.</em></h2></div><div className="result-grid">{project.outcomes.map(([value, label]) => <div className="result-stat" key={label}><CountUp value={value} /><span>{label}</span></div>)}</div></section>
    <section className="case-study-credits"><div><span className="section-index">04 — CREDITS</span><h2>Built by<br /><em>one team.</em></h2></div><div className="credits-list">{project.credits.map((credit, index) => <div key={credit}><span>0{index + 1}</span><p>{credit}</p></div>)}</div></section>
    <section className="case-study-next"><span className="section-index">UP NEXT</span><Link to={`/projects/${nextProject.slug}`} data-testid="next-case-study-link"><span>{nextProject.segment} · {nextProject.category}</span><h2>{nextProject.title}<ArrowUpRight size={27} /></h2></Link></section>
  </main>;
}

function ProjectsArchive() {
  usePageMeta("Projects | BDSM · BDS Marvel", "Residential, hospitality, commercial and civic projects in stone, flooring, construction and interiors — delivered across India by one in-house team.");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All work");
  const filterOptions = ["All work", ...segments.map((s) => s.name)];
  const filtered = useMemo(() => projects.filter((item) => (filter === "All work" || item.segment === filter) && `${item.title} ${item.category} ${item.segment} ${item.location}`.toLowerCase().includes(query.toLowerCase())), [filter, query]);
  return <main className="work-page" data-testid="work-archive-page">
    <section className="work-hero"><div className="detail-kicker"><span>BDSM · PROJECTS {new Date().getFullYear()}</span><Link to="/" state={{ restore: true }} data-testid="work-back-home-link">BACK HOME</Link></div><p className="eyebrow">THE WORK</p><h1>Projects across<br /><em>materials & scale.</em></h1></section>
    <section className="work-library">
      <div className="work-controls">
        <label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" aria-label="Search projects" data-testid="work-search-input" /></label>
        <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter by business" data-testid="work-agency-filter">{filterOptions.map((option) => <option key={option}>{option}</option>)}</select>
        <span className="work-count" data-testid="work-result-count">{filtered.length.toString().padStart(2, "0")} PROJECTS</span>
      </div>
      <div className="work-grid">{filtered.map((work, index) => <Link to={`/projects/${work.slug}`} className="work-card" key={work.title} data-testid={`work-card-${index + 1}`}><div className="work-image-wrap"><img src={img(work.image, 1200)} alt="" /><span>{work.year}</span></div><div className="work-card-copy"><div><span>{work.segment} · {work.category} · {work.location}</span><h2>{work.title}</h2><p>{work.description}</p></div><ArrowUpRight size={21} /></div></Link>)}{filtered.length === 0 && <div className="empty-work" data-testid="work-empty-state">No projects match. Try a different search.</div>}</div>
    </section>
  </main>;
}

function CataloguePage() {
  usePageMeta("Catalogue — BDSM · BDS Marvel", "Browse the BDSM material library — marble & stone, flooring and furniture, filterable by category and product.");
  const [category, setCategory] = useState("All");
  const [product, setProduct] = useState("All");
  const [query, setQuery] = useState("");
  const inCategory = useMemo(() => catalogueItems.filter((item) => category === "All" || categoryOf(item) === category), [category]);
  const productsFilter = useMemo(() => ["All", ...Array.from(new Set(inCategory.map((item) => item.product)))], [inCategory]);
  const chooseCategory = (option) => { setCategory(option); setProduct("All"); };
  const filtered = useMemo(() => inCategory.filter((item) => (product === "All" || item.product === product) && `${item.name} ${item.brand} ${item.material} ${item.product} ${categoryOf(item)} ${item.origin}`.toLowerCase().includes(query.toLowerCase())), [inCategory, product, query]);
  return <main className="catalogue-page" data-testid="catalogue-page">
    <section className="catalogue-hero">
      <div className="detail-kicker"><span>BDSM · CATALOGUE</span><Link to="/" state={{ restore: true }} data-testid="catalogue-back-link">BACK HOME</Link></div>
      <p className="eyebrow">BDS MARVEL · MATERIAL LIBRARY</p>
      <h1>The stone &<br /><em>marble catalogue.</em></h1>
    </section>
    <section className="catalogue-controls">
      <div className="catalogue-filter">
        <span className="filter-label">Category</span>
        <div className="filter-pills">{categoriesFilter.map((option) => <button key={option} className={`filter-pill ${category === option ? "filter-pill--active" : ""}`} onClick={() => chooseCategory(option)} data-testid={`catalogue-category-${option.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{option}</button>)}</div>
      </div>
      <div className="catalogue-filter">
        <span className="filter-label">Product</span>
        <div className="filter-pills">{productsFilter.map((option) => <button key={option} className={`filter-pill ${product === option ? "filter-pill--active" : ""}`} onClick={() => setProduct(option)} data-testid={`catalogue-product-${option.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{option}</button>)}</div>
      </div>
      <div className="catalogue-searchbox">
        <label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the library" aria-label="Search catalogue" data-testid="catalogue-search-input" /></label>
        <span className="work-count" data-testid="catalogue-result-count">{filtered.length.toString().padStart(2, "0")} ITEMS</span>
      </div>
    </section>
    <section className="catalogue-grid" data-testid="catalogue-grid">
      {filtered.map((item, index) => <article className="catalogue-card" key={item.slug} data-testid={`catalogue-card-${index + 1}`}>
        <Link to={`/catalogue/${item.slug}`} className="catalogue-card__link" data-testid={`catalogue-card-link-${index + 1}`}>
          <div className="catalogue-card__image"><img src={img(item.image, 900)} alt={item.name} /></div>
          <div className="catalogue-card__body">
            <div className="catalogue-card__meta"><span>{item.brand}</span><span>{categoryOf(item)} · {item.product}</span></div>
            <h3>{item.name}</h3>
            <p>{item.origin}</p>
          </div>
        </Link>
        <div className="catalogue-card__cta"><SampleTrigger className="contact-cta-btn" product={item.name} brand={item.brand} testId={`catalogue-request-${index + 1}`}>REQUEST QUOTE</SampleTrigger></div>
      </article>)}
      {filtered.length === 0 && <div className="empty-work">No items match those filters — try loosening one.</div>}
    </section>
  </main>;
}

const findCatalogueItem = (slug) => catalogueItems.find((entry) => entry.slug === slug)
  || Object.values(serviceExtras).flatMap((extra) => extra.catalogue || []).find((entry) => entry.slug === slug);

function ProductGallery({ images, name }) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [images]);
  const go = (step) => setActive((current) => (current + step + images.length) % images.length);
  return <div className="pdp-gallery" data-testid="product-gallery">
    <div className="pdp-thumbs">{images.map((src, index) => <button type="button" key={src} className={`pdp-thumb ${index === active ? "pdp-thumb--active" : ""}`} onClick={() => setActive(index)} data-testid={`product-thumb-${index + 1}`}><img src={src} alt={`${name} view ${index + 1}`} /></button>)}</div>
    <div className="pdp-main">
      <img key={images[active]} src={images[active]} alt={name} data-testid="product-main-image" />
      <button type="button" className="pdp-arrow pdp-arrow--prev" onClick={() => go(-1)} aria-label="Previous image" data-testid="product-image-prev"><ChevronLeft size={20} /></button>
      <button type="button" className="pdp-arrow pdp-arrow--next" onClick={() => go(1)} aria-label="Next image" data-testid="product-image-next"><ChevronRight size={20} /></button>
      <span className="pdp-counter" data-testid="product-image-counter">{active + 1} / {images.length}</span>
    </div>
  </div>;
}

function ProductAccordion({ title, children, open = false, testId }) {
  const [isOpen, setIsOpen] = useState(open);
  return <div className={`pdp-acc ${isOpen ? "pdp-acc--open" : ""}`}>
    <button type="button" className="pdp-acc__head" onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen} data-testid={testId}>{title}<ChevronDown size={18} /></button>
    {isOpen && <div className="pdp-acc__body">{children}</div>}
  </div>;
}

function ProductQuoteModal({ open, onClose, details }) {
  const empty = { name: "", email: "", phone: "", city: "", quantity: "", timeline: "", wantSample: false, message: "" };
  const [form, setForm] = useState(empty);
  const [status, setStatus] = useState({ state: "idle", error: "" });
  const firstFieldRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setStatus({ state: "idle", error: "" });
    setForm(empty);
    window.setTimeout(() => firstFieldRef.current?.focus(), 80);
    document.body.style.overflow = "hidden";
    stopSmoothScroll();
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; startSmoothScroll(); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.type === "checkbox" ? event.target.checked : event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setStatus({ state: "sending", error: "" });
    try {
      const response = await apiFetch(apiPath(`/quote-requests`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form,
          product: details.product, collection: details.collection, brand: details.brand, material: details.material,
          finish: details.finish, use: details.use, product_url: window.location.href, image: details.image,
          name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), city: form.city.trim() || null,
          quantity: form.quantity.trim() || null, timeline: form.timeline || null, want_sample: form.wantSample, message: form.message.trim() || null,
        }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail?.detail?.[0]?.msg || detail?.detail || detail?.message || "Please double-check your details and try again.");
      }
      setStatus({ state: "sent", error: "" });
    } catch (error) {
      setStatus({ state: "error", error: error.message || "Something went wrong. Please try again." });
    }
  };

  if (!open) return null;
  const specs = [["Collection", details.collection], ["Brand", details.brand], ["Material", details.material], ["Finish", details.finish], ["Best for", details.use]];
  return <div className="contact-modal" role="dialog" aria-modal="true" aria-label="Request a product quote" data-testid="product-quote-modal">
    <button className="contact-modal__scrim" onClick={onClose} aria-label="Close" data-testid="product-quote-scrim" />
    <div className="contact-modal__panel">
      <button className="contact-modal__close" onClick={onClose} aria-label="Close" data-testid="product-quote-close"><X size={22} /></button>
      <div className="contact-modal__intro pq-intro">
        <span className="section-index">REQUEST A QUOTE</span>
        <div className="pq-product" data-testid="product-quote-summary">
          <img src={details.image} alt={details.product} />
          <div><h3 data-testid="product-quote-name">{details.product}</h3><dl>{specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>
        </div>
        <p>These product details are attached to your request automatically. We reply with pricing and lead times within one working day.</p>
      </div>
      {status.state === "sent" ? <div className="contact-modal__success" data-testid="product-quote-success"><Check size={40} /><h3>Quote request received.</h3><p>{formSettings("quote-requests")?.success_message || "Your request has been received."}</p><button onClick={onClose} data-testid="product-quote-done">CLOSE</button></div> : <form className="contact-modal__form" onSubmit={submit} data-testid="product-quote-form">
        <DynamicFields slug="quote-requests" form={form} setForm={setForm} firstFieldRef={firstFieldRef}  />
        {status.state === "error" && <div className="cm-error" data-testid="product-quote-error">{status.error}</div>}
        <button type="submit" className="cm-submit" disabled={status.state === "sending" || !formSettings("quote-requests")?.enabled} data-testid="product-quote-submit">{status.state === "sending" ? <><Loader2 size={16} className="cm-spin" /> Sending…</> : <>{formSettings("quote-requests")?.submit_label || "REQUEST QUOTE"} <ArrowUpRight size={16} /></>}</button>
      </form>}
    </div>
  </div>;
}

function CatalogueProductPage() {
  const { slug, piece } = useParams();
  const location = useLocation();
  const item = findCatalogueItem(slug);
  const detail = item ? catalogueDetails[item.slug] : null;
  const gallery = useMemo(() => (item && detail ? buildMaterialGallery(item, detail, img) : []), [item, detail]);
  const index = Number(piece) - 1;
  const product = gallery[index];
  const [quoteOpen, setQuoteOpen] = useState(false);
  usePageMeta(
    product ? `${product.title} | ${item.name} | BDSM · BDS Marvel` : "Catalogue | BDSM · BDS Marvel",
    product ? `${product.title} — ${product.material}, ${product.finish.toLowerCase()} finish. Request a quote from BDSM · BDS Marvel.` : "Browse the BDSM · BDS Marvel material library."
  );
  const images = useMemo(() => gallery.map((_, offset) => gallery[(index + offset) % gallery.length].src), [gallery, index]);
  if (!item || !detail) return <Navigate to="/catalogue" replace />;
  if (!product) return <Navigate to={`/catalogue/${item.slug}`} replace />;
  const brand = item.brand || detail.brand || "BDS Marvel";
  const related = gallery.map((entry, i) => ({ ...entry, n: i + 1 })).filter((entry) => entry.n !== index + 1).slice(0, 4);
  const highlights = [["Made to order", "Cut, finished and sized for your project"], ["Samples available", "See the real material before you commit"], ["Installed in-house", "Our own crews fit what we supply"]];
  return <main className="pdp" data-testid="catalogue-product-page">
    <Link to={`/catalogue/${item.slug}`} state={location.state} className="pdp-back" data-testid="product-back-link"><ChevronLeft size={16} /> BACK TO {item.name.toUpperCase()}</Link>
    <nav className="pdp-crumbs" data-testid="product-breadcrumbs">
      <Link to="/catalogue" data-testid="product-crumb-catalogue">Catalogue</Link><ChevronRight size={12} />
      <Link to={`/catalogue/${item.slug}`} state={location.state} data-testid="product-crumb-collection">{item.name}</Link><ChevronRight size={12} />
      <span>{product.title}</span>
    </nav>
    <section className="pdp-top">
      <ProductGallery images={images} name={product.title} />
      <aside className="pdp-info">
        <p className="pdp-brand" data-testid="product-brand">{brand.toUpperCase()} · {item.name.toUpperCase()}</p>
        <h1 data-testid="product-name">{product.title}</h1>
        <p className="pdp-sub">{product.material} · {product.finish}</p>
        <div className="pdp-actions">
          <button type="button" className="pdp-btn pdp-btn--solid" onClick={() => setQuoteOpen(true)} data-testid="product-request-quote-btn">REQUEST QUOTE <ArrowUpRight size={16} /></button>
        </div>
        <ul className="pdp-highlights">{highlights.map(([title, text]) => <li key={title}><Check size={16} /><div><strong>{title}</strong><span>{text}</span></div></li>)}</ul>
        <ProductAccordion title="Item details" open testId="product-details-toggle">
          <dl className="pdp-dl" data-testid="product-details">
            <div><dt>Material</dt><dd>{product.material}</dd></div>
            <div><dt>Finish</dt><dd>{product.finish}</dd></div>
            <div><dt>Best for</dt><dd>{product.use}</dd></div>
            <div><dt>Collection</dt><dd>{item.name}</dd></div>
            {item.origin && <div><dt>Origin</dt><dd>{item.origin}</dd></div>}
          </dl>
        </ProductAccordion>
        <ProductAccordion title="Description" open testId="product-description-toggle">
          <p data-testid="product-description">{product.title} in {product.material.toLowerCase()}, with a {product.finish.toLowerCase()} finish — specified for {product.use.toLowerCase()}. Part of the {item.name} collection by {brand}. {detail.desc}</p>
        </ProductAccordion>
        <ProductAccordion title="Specification" testId="product-spec-toggle">
          <dl className="pdp-dl">{detail.specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        </ProductAccordion>
        <ProductAccordion title="Samples, delivery & installation" testId="product-delivery-toggle">
          <p>Request a quote and we'll confirm sizes, quantities and lead time for your site. Physical samples can be couriered or viewed at our studio, and our in-house team handles delivery and installation across India.</p>
        </ProductAccordion>
      </aside>
    </section>
    <section className="pdp-related">
      <div className="pdp-related__head"><h2>More from <em>{item.name.toLowerCase()}</em></h2><Link to={`/catalogue/${item.slug}`} state={location.state} data-testid="product-view-collection">VIEW COLLECTION <ArrowUpRight size={14} /></Link></div>
      <div className="pdp-related__grid">{related.map((entry) => <Link key={entry.src} to={`/catalogue/${item.slug}/${entry.n}`} state={location.state} className="pdp-rel" data-testid={`product-related-${entry.n}`}>
        <div className="pdp-rel__img"><img src={entry.src} alt={entry.title} loading="lazy" /></div>
        <h3>{entry.title}</h3><span>{entry.material} · {entry.finish}</span>
      </Link>)}</div>
    </section>
    <ProductQuoteModal open={quoteOpen} onClose={() => setQuoteOpen(false)} details={{ product: product.title, collection: item.name, brand, material: product.material, finish: product.finish, use: product.use, image: product.src }} />
  </main>;
}

function CatalogueItemPage() {
  const { slug } = useParams();
  const location = useLocation();
  const backTo = location.state?.from || "/catalogue";
  const backLabel = location.state?.fromLabel ? `BACK TO ${location.state.fromLabel.toUpperCase()}` : "BACK TO CATALOGUE";
  const item = findCatalogueItem(slug);
  const detail = item ? catalogueDetails[item.slug] : null;
  const { openConsult } = useConsultation();
  usePageMeta(
    item ? `${item.name} | BDSM · BDS Marvel Catalogue` : "Catalogue | BDSM · BDS Marvel",
    item ? `${item.name} — sampled, finished and supplied by BDSM · BDS Marvel.` : "Browse the BDSM · BDS Marvel material library."
  );
  if (!item || !detail) return <Navigate to="/catalogue" replace />;
  const meta = item.meta || [item.material, item.product].filter(Boolean).join(" · ");
  const brand = item.brand || detail.brand;
  const chips = [item.material, item.product, item.origin, item.application].filter(Boolean);
  return <main className="cat-detail" data-testid="catalogue-detail-page">
    <section className="cat-detail-hero" style={{ backgroundImage: `linear-gradient(160deg, rgba(10,8,6,.86), rgba(10,8,6,.55)), url(${img(item.image)})` }}>
      <div className="detail-kicker"><span>BDSM · CATALOGUE</span><Link to={backTo} data-testid="detail-back-link">{backLabel}</Link></div>
      <div className="cat-detail-hero__copy">
        {brand && <p className="eyebrow" data-testid="detail-brand">{brand.toUpperCase()}</p>}
        <h1>{item.name}<span className="hero-dot">.</span></h1>
        <p className="detail-lede" data-testid="detail-description">{detail.desc}</p>
        <div className="detail-services">{chips.map((chip) => <span key={chip}>{chip}</span>)}</div>
      </div>
    </section>
    <section className="cat-detail-gallery">
      <div className="detail-intro"><span className="section-index">01 — IN DETAIL</span><h2>Closer to<br /><em>the material.</em></h2></div>
      <div className="mat-gallery" data-testid="detail-material-gallery">{buildMaterialGallery(item, detail, img).map((m, index) => <figure key={m.src} className="mat-card" data-testid={`detail-gallery-card-${index + 1}`}>
        <Link to={`/catalogue/${item.slug}/${index + 1}`} state={location.state} className="mat-card__link" data-testid={`detail-gallery-link-${index + 1}`}>
          <div className="mat-card__img"><img src={m.src} alt={`${m.title} — ${m.material}`} loading="lazy" data-testid={`detail-gallery-image-${index + 1}`} /><span className="mat-card__view">VIEW <ArrowUpRight size={13} /></span></div>
          <figcaption><h3>{m.title}</h3></figcaption>
        </Link>
      </figure>)}</div>
    </section>
    <section className="cat-detail-specs">
      <div className="detail-intro"><span className="section-index">02 — SPECIFICATION</span><h2>Made to<br /><em>spec.</em></h2></div>
      <ul className="cat-spec-list" data-testid="detail-spec-list">{detail.specs.map(([label, value]) => <li key={label}><span>{label}</span>{value}</li>)}</ul>
    </section>
    <section className="detail-cta detail-cta--dark">
      <span className="section-index">READY WHEN YOU ARE</span>
      <h2>See it in<br /><em>your project.</em></h2>
      <div className="cat-detail-cta__actions">
        <SampleTrigger className="contact-cta-btn" product={item.name} brand={brand} testId="detail-request-sample-btn">REQUEST QUOTE</SampleTrigger>
        <button type="button" className="np-btn cat-detail-cta__consult" onClick={() => openConsult(detail.consult)} data-testid="detail-consult-btn">GET CONSULTATION <ArrowUpRight size={16} /></button>
      </div>
    </section>
  </main>;
}

function ExperiencePage() {
  usePageMeta("The BDSM Living Studio | Design Stay", "Stay inside a working BDSM · BDS Marvel home — three suites built with our own stone, floors, finishes and furniture.");
  return <main className="experience-page" data-testid="experience-page">
    <section className="experience-hero" style={{ backgroundImage: `linear-gradient(160deg, rgba(10,8,6,.55), rgba(10,8,6,.32)), url(${img("photo-1600585154340-be6161a56a0c")})` }}>
      <div className="detail-kicker"><span>BDSM · LIVING STUDIO</span><Link to="/" state={{ restore: true }} data-testid="experience-back-link">BACK HOME</Link></div>
      <div className="experience-hero__copy"><p className="eyebrow">BnB · LIVING STUDIO</p><h1>Don't just see,<br /><em>Stay in it.</em></h1><Link to="/stays?start=where" className="np-btn np-btn--paper" data-testid="experience-book-cta">REQUEST A NIGHT <ArrowUpRight size={16} /></Link></div>
    </section>
    <section className="experience-tiers" data-testid="experience-tiers">
      <div className="experience-tiers__heading"><span className="section-index">THREE WAYS TO STAY</span><h2>Three BnBs,<br /><em>three kinds of night.</em></h2></div>
      <div className="experience-tiers__grid">
        {stayTiers.map((tier) => {
          const first = stays.find((stay) => stay.tier === tier.name);
          return <Link to={`/stays/${tier.slug}`} className="stay-tier-card" key={tier.slug} data-testid={`experience-tier-${tier.slug}`}>
            <div className="stay-tier-card__media"><img src={img(first.hero, 900)} alt={`${tier.name} stays`} loading="lazy" /></div>
            <div className="stay-tier-card__body">
              <h3>{tier.headline}</h3>
              <span className="stay-tier-card__meta">{stays.filter((stay) => stay.tier === tier.name).length} stays · from {stays.filter((stay) => stay.tier === tier.name).map((stay) => stay.price).sort()[0]}/night</span>
              <span className="stay-tier-card__cta">EXPLORE &amp; BOOK <ArrowUpRight size={15} /></span>
            </div>
          </Link>;
        })}
      </div>
    </section>
    <section className="experience-gallery">
      <div className="experience-gallery__heading"><span className="section-index">02 — INSIDE</span><h2>Every surface,<br /><em>made by us.</em></h2></div>
      <div className="experience-gallery__grid">
        {["photo-1600585154340-be6161a56a0c", "photo-1600566753190-17f0baa2a6c3", "photo-1618221195710-dd6b41faaea6", "photo-1600607687939-ce8a6c25118c", "photo-1616486338812-3dadae4b4ace", "photo-1580587771525-78b9dba3b914"].map((imageId, index) => <figure className={`experience-gallery__tile experience-gallery__tile--${index + 1}`} key={imageId}><img src={img(imageId, 1200)} alt="" data-testid={`experience-image-${index + 1}`} /></figure>)}
      </div>
    </section>
    <section className="experience-cta">
      <div><span className="section-index">READY WHEN YOU ARE</span><h2>Book a night at<br /><em>the Living Studio.</em></h2><p>Availability is limited — we host a handful of stays each month between site visits.</p></div>
      <Link to="/stays?start=where" className="np-btn np-btn--solid experience-cta__btn" data-testid="experience-book-second">REQUEST A NIGHT <ArrowUpRight size={16} /></Link>
    </section>
  </main>;
}

function BookingModal({ stay, onClose }) {
  const [form, setForm] = useState({ name: "", email: "", checkIn: "", checkOut: "", guests: "2", message: "" });
  const [status, setStatus] = useState({ state: "idle", error: "" });
  const [booked, setBooked] = useState([]);
  const [pending, setPending] = useState([]);
  const firstFieldRef = useRef(null);
  const scrollResumeRef = useRef(null);
  const open = Boolean(stay);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    window.clearTimeout(scrollResumeRef.current);
    if (open) {
      setStatus({ state: "idle", error: "" });
      setForm({ name: "", email: "", checkIn: "", checkOut: "", guests: "2", message: "" });
      apiFetch(apiPath(`/stays/availability?stay=${encodeURIComponent(stay.name)}`))
        .then((res) => (res.ok ? res.json() : { booked: [], requested: [] }))
        .then((data) => { setBooked(data.booked || []); setPending(data.requested || []); })
        .catch(() => { setBooked([]); setPending([]); });
      window.setTimeout(() => firstFieldRef.current?.focus(), 80);
      document.body.style.overflow = "hidden";
      stopSmoothScroll();
      return () => { document.body.style.overflow = ""; };
    }
    document.body.style.overflow = "";
    scrollResumeRef.current = window.setTimeout(() => startSmoothScroll(), 60);
    return () => window.clearTimeout(scrollResumeRef.current);
  }, [open]);
  useEffect(() => { const onKey = (event) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const overlapping = booked.find((range) => form.checkIn && form.checkOut && form.checkIn < range.check_out && form.checkOut > range.check_in);

  const submit = async (event) => {
    event.preventDefault();
    if (form.checkOut && form.checkIn && form.checkOut <= form.checkIn) {
      setStatus({ state: "error", error: "Check-out must be after check-in." });
      return;
    }
    if (overlapping) {
      setStatus({ state: "error", error: `Those nights are already booked (${overlapping.check_in} to ${overlapping.check_out}). Please pick different dates.` });
      return;
    }
    setStatus({ state: "sending", error: "" });
    try {
      const response = await apiFetch(apiPath(`/bookings`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stay: stay.name, name: form.name.trim(), email: form.email.trim(), check_in: form.checkIn, check_out: form.checkOut, guests: Number(form.guests), message: form.message.trim() || null }) });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        const message = typeof detail?.detail === "string" ? detail.detail : detail?.detail?.[0]?.msg;
        throw new Error(message || "Please double-check your details and try again.");
      }
      setStatus({ state: "sent", error: "" });
    } catch (error) {
      setStatus({ state: "error", error: error.message || "Something went wrong. Please try again." });
    }
  };

  if (!open) return null;
  return <div className="contact-modal" role="dialog" aria-modal="true" aria-label="Book a stay" data-testid="booking-modal">
    <button className="contact-modal__scrim" onClick={onClose} aria-label="Close" data-testid="booking-modal-scrim" />
    <div className="contact-modal__panel">
      <button className="contact-modal__close" onClick={onClose} aria-label="Close" data-testid="booking-modal-close"><X size={22} /></button>
      <div className="contact-modal__intro">
        <span className="section-index">BOOK A STAY</span>
        <h2>{stay.name}</h2>
        <p>{stay.location} · from {stay.price}/night · sleeps {stay.guests}. Send your dates — we confirm availability within one working day.</p>
        <div className="contact-modal__meta"><span>info@bdsmarvel.com</span><span>{stay.location}</span></div>
      </div>
      {status.state === "sent" ? <div className="contact-modal__success" data-testid="booking-modal-success"><Check size={40} /><h3>Request received.</h3><p>Thanks — we'll confirm availability for {stay.name} within one working day and hold your dates in the meantime.</p><button onClick={onClose} data-testid="booking-modal-done">CLOSE</button></div> : <form className="contact-modal__form" onSubmit={submit} data-testid="booking-modal-form">
        <label className="cm-field"><span>Your name</span><input ref={firstFieldRef} required value={form.name} onChange={update("name")} placeholder="Riya Kapoor" data-testid="booking-name-input" /></label>
        <label className="cm-field"><span>Email</span><input required type="email" value={form.email} onChange={update("email")} placeholder="you@email.com" data-testid="booking-email-input" /></label>
        <label className="cm-field"><span>Check-in</span><input required type="date" min={today} value={form.checkIn} onChange={update("checkIn")} data-testid="booking-checkin-input" /></label>
        <label className="cm-field"><span>Check-out</span><input required type="date" min={form.checkIn || today} value={form.checkOut} onChange={update("checkOut")} data-testid="booking-checkout-input" /></label>
        {booked.length > 0 && <div className="cm-booked" data-testid="booking-booked-ranges"><span>Already booked:</span>{booked.map((range) => <em key={`${range.check_in}-${range.check_out}`}>{range.check_in} → {range.check_out}</em>)}</div>}
        {pending.length > 0 && <div className="cm-booked cm-booked--pending" data-testid="booking-pending-ranges"><span>Awaiting confirmation:</span>{pending.map((range) => <em key={`${range.check_in}-${range.check_out}`}>{range.check_in} → {range.check_out}</em>)}</div>}
        <label className="cm-field cm-field--full"><span>Guests</span><select value={form.guests} onChange={update("guests")} data-testid="booking-guests-select">{Array.from({ length: stay.guests }, (_, i) => i + 1).map((count) => <option key={count} value={count}>{count} {count === 1 ? "guest" : "guests"}</option>)}</select></label>
        <label className="cm-field cm-field--full"><span>Anything we should know? (optional)</span><textarea rows={3} value={form.message} onChange={update("message")} placeholder="Arrival time, occasions, material walkthrough requests…" data-testid="booking-message-input" /></label>
        {status.state === "error" && <div className="cm-error" data-testid="booking-modal-error">{status.error}</div>}
        <button type="submit" className="cm-submit" disabled={status.state === "sending"} data-testid="booking-modal-submit">{status.state === "sending" ? <><Loader2 size={16} className="cm-spin" /> Sending…</> : <>REQUEST BOOKING <ArrowUpRight size={16} /></>}</button>
      </form>}
    </div>
  </div>;
}

function StayCard({ stay, index, onBook }) {
  return <article className={`stay-card ${index % 2 === 1 ? "stay-card--flip" : ""}`} data-testid={`stay-card-${stay.slug}`}>
    <div className="stay-card__media"><img src={img(stay.hero, 1200)} alt={stay.name} loading="lazy" /></div>
    <div className="stay-card__body">
      <span className="section-index">{String(index + 1).padStart(2, "0")}</span>
      <h2>{stay.name}</h2>
      <p className="stay-card__location">{stay.location} · {stay.bedrooms} {stay.bedrooms === 1 ? "bedroom" : "bedrooms"} · sleeps {stay.guests}</p>
      <p className="stay-card__description">{stay.description}</p>
      <ul className="stay-card__amenities">{stay.amenities.map((amenity) => <li key={amenity}>{amenity}</li>)}</ul>
      <div className="stay-card__footer">
        <span className="stay-card__price" data-testid={`stay-price-${stay.slug}`}>from <strong>{stay.price}</strong> / night</span>
        <button type="button" className="np-btn np-btn--solid" onClick={() => onBook(stay)} data-testid={`stay-book-${stay.slug}`}>BOOK THIS STAY <ArrowUpRight size={16} /></button>
      </div>
    </div>
  </article>;
}

function StaysPage() {
  usePageMeta("Stays & BnBs | BDSM · BDS Marvel", "Explore BDSM · BDS Marvel stays — premium, mid and budget-friendly BnBs across India. Book a night with secure online payment.");
  return <main className="stays-page" data-testid="stays-page">
    <section className="stays-hero">
      <div className="detail-kicker"><span>BDSM · STAYS</span><Link to="/experience" state={{ restore: true }} data-testid="stays-back-link">THE LIVING STUDIO</Link></div>
      <div className="stays-hero__copy"><p className="eyebrow">AIR BNB · THREE CATEGORIES</p><h1>Explore our BnBs.<br /><em>Book your night.</em></h1><p>Fifteen stays across three categories — premium homes where you experience our work first-hand, easy mid-range city apartments, and honest budget-friendly rooms. Pick your dates and guests, then pay securely online.</p></div>
    </section>
    <section className="experience-tiers" data-testid="stays-tier-index">
      <div className="experience-tiers__grid">
        {stayTiers.map((tier) => {
          const tierStays = stays.filter((stay) => stay.tier === tier.name);
          const lowest = tierStays.map((stay) => stay.price).sort()[0];
          return <Link to={`/stays/${tier.slug}`} className="stay-tier-card" key={tier.slug} data-testid={`stays-tier-${tier.slug}`}>
            <div className="stay-tier-card__media"><img src={img(tierStays[0].hero, 900)} alt={`${tier.name} stays`} /></div>
            <div className="stay-tier-card__body">
              <h3>{tier.headline}</h3>
              <p>{tier.copy}</p>
              <span className="stay-tier-card__meta">{tierStays.length} stays · from {lowest}/night</span>
              <span className="stay-tier-card__cta">EXPLORE STAYS <ArrowUpRight size={15} /></span>
            </div>
          </Link>;
        })}
      </div>
    </section>
  </main>;
}

function StaysCategoryPage() {
  const { tier } = useParams();
  const navigate = useNavigate();
  const meta = stayTiers.find((item) => item.slug === tier);
  const tierStays = stays.filter((stay) => tierSlugOf(stay.tier) === tier);
  usePageMeta(meta ? `${meta.name} Stays | BDSM · BDS Marvel` : "Stays | BDSM · BDS Marvel", meta ? `${meta.headline} ${meta.copy}` : "Explore BDSM · BDS Marvel stays.");
  if (!meta) return <Navigate to="/stays" replace />;
  return <main className="stays-page" data-testid="stays-category-page">
    <section className="stays-hero">
      <div className="detail-kicker"><span>BDSM · STAYS</span><Link to="/stays" state={{ restore: true }} data-testid="stays-category-back-link">ALL CATEGORIES</Link></div>
      <div className="stays-hero__copy"><p className="eyebrow">{tierStays.length} STAYS</p><h1>{meta.headline.replace(/\.$/, "")}<br /><em>Pick your stay.</em></h1></div>
    </section>
    <section className="stays-list" data-testid="stays-list">
      {tierStays.map((stay, index) => <StayCard key={stay.slug} stay={stay} index={index} onBook={(selected) => navigate(`/stays/home/${selected.slug}`)} />)}
    </section>
  </main>;
}

function ContactPage() {
  usePageMeta("Contact Us | BDSM · BDS Marvel", "Talk to BDSM · BDS Marvel about your project — studios in Mumbai, Kishangarh, Gurugram, Pune, New Delhi and Goa. We reply within one working day.");
  const { setOpen } = useContact();
  const cities = wordpressContent("cities", [
    { code: "MUM", brand: "BDSM", city: "Mumbai", address: "Sales & Design Studio · Kalina, Santacruz East, Mumbai, Maharashtra 400098" },
    { code: "KSN", brand: "DRAWSTONES", city: "Kishangarh", address: "Marble Workshop · RIICO Marble Zone, Kishangarh, Ajmer, Rajasthan 305801" },
    { code: "GGN", brand: "RENEST", city: "Gurugram", address: "Flooring Warehouse · Sector 49, Sohna Road, Gurugram, Haryana 122018" },
    { code: "PNE", brand: "FORMWORK", city: "Pune", address: "Construction Office · Baner-Pashan Link Road, Pune, Maharashtra 411045" },
    { code: "DEL", brand: "VIGNETTE", city: "New Delhi", address: "Interior Design Studio · Shahpur Jat, New Delhi 110049" },
    { code: "GOA", brand: "LIVING STUDIO", city: "Goa", address: "BDSM Living Studio · Assagao, Bardez, North Goa 403507" },
  ]);
  const [active, setActive] = useState(0);
  return <main className="contact-page" data-testid="contact-page">
    <section className="contact-page__hero"><h1>Come see<br /><em>the material.</em></h1></section>
    <section className="contact-page__body">
      <div className="contact-cities" data-testid="contact-cities">
        {cities.map((city, index) => <div className={`contact-accordion-item ${index === active ? "contact-accordion-item--active" : ""}`} key={city.code} data-testid={`contact-accordion-item-${city.code}`}>
          <button className={`contact-city ${index === active ? "contact-city--active" : ""}`} onClick={() => setActive(index)} aria-expanded={index === active} aria-controls={`contact-panel-${city.code}`} data-testid={`contact-city-${city.code}`}>
            <span className="contact-city__code">{city.brand}</span>
            <ChevronDown size={18} />
          </button>
          <div className="contact-accordion-panel" id={`contact-panel-${city.code}`} aria-hidden={index !== active} data-testid={`contact-panel-${city.code}`}>
            <div className="contact-accordion-panel__inner">
              <p className="contact-detail__location" data-testid={`active-city-name-${city.code}`}>{city.city}</p>
              <p className="contact-detail__address" data-testid={`active-city-address-${city.code}`}>{city.address}</p>
              <button className="contact-detail__cta" onClick={() => setOpen(true)} data-testid={`contact-get-in-touch-${city.code}`}>Get in Touch <ArrowUpRight size={16} /></button>
            </div>
          </div>
        </div>)}
        <div className="contact-page__info">
          <a href="mailto:info@bdsmarvel.com" data-testid="press-email">info@bdsmarvel.com</a>
          <a href="mailto:info.bdsmarvel@gmail.com" data-testid="bd-email">info.bdsmarvel@gmail.com</a>
          <p>Phone : <a href="tel:+911140000000" data-testid="contact-phone">+91 11 4000 0000</a></p>
          <div className="contact-page__socials">
            <a href="https://www.instagram.com/bds.marvel" target="_blank" rel="noreferrer" aria-label="Instagram" data-testid="social-instagram"><Instagram size={18} /></a>
            <a href="https://facebook.com" target="_blank" rel="noreferrer" aria-label="Facebook" data-testid="social-facebook"><Facebook size={18} /></a>
            <a href="https://twitter.com" target="_blank" rel="noreferrer" aria-label="Twitter" data-testid="social-twitter"><Twitter size={18} /></a>
            <a href="https://www.linkedin.com/company/bdsm" target="_blank" rel="noreferrer" aria-label="LinkedIn" data-testid="social-linkedin"><Linkedin size={18} /></a>
            <a href="https://youtube.com" target="_blank" rel="noreferrer" aria-label="YouTube" data-testid="social-youtube"><Youtube size={18} /></a>
          </div>
        </div>
      </div>
      <div className="contact-detail">
        <div className="contact-monument" aria-hidden="true">
          <svg viewBox="0 0 620 320" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
            <g fill="none" stroke="#2b2b2b" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 300 L600 300" />
              <path d="M120 300 L120 200 Q120 170 160 170 L200 170 Q240 170 240 200 L240 300" />
              <path d="M170 300 L170 200 Q170 180 185 180 Q200 180 200 200 L200 300" />
              <path d="M120 220 L240 220" />
              <path d="M380 300 L380 200 Q380 170 420 170 L460 170 Q500 170 500 200 L500 300" />
              <path d="M430 300 L430 200 Q430 180 445 180 Q460 180 460 200 L460 300" />
              <path d="M380 220 L500 220" />
              <path d="M250 300 L250 130 L370 130 L370 300" />
              <path d="M260 300 L260 145 L360 145 L360 300" />
              <path d="M280 300 L280 165 Q280 150 300 150 Q320 150 320 165 L320 300" />
              <path d="M300 150 L300 300" />
              <path d="M250 200 L370 200" />
              <path d="M250 250 L370 250" />
              <path d="M170 170 L170 140 L210 140 L210 170" />
              <path d="M175 140 L175 115 L205 115 L205 140" />
              <path d="M190 115 L190 95" />
              <path d="M186 95 L194 95 L190 82 Z" />
              <path d="M430 170 L430 140 L470 140 L470 170" />
              <path d="M435 140 L435 115 L465 115 L465 140" />
              <path d="M450 115 L450 95" />
              <path d="M446 95 L454 95 L450 82 Z" />
              <path d="M305 130 L305 100 L315 100 L315 130" />
              <path d="M310 100 L310 80" />
              <path d="M306 80 L314 80 L310 65 Z" />
              <circle cx="310" cy="180" r="6" />
            </g>
          </svg>
        </div>
      </div>
    </section>
  </main>;
}

function AboutPage() {
  usePageMeta("About Us | BDSM · BDS Marvel", "One design and build company for stone, flooring, construction and interiors — 20+ years, 200+ projects, studios across India.");
  const principles = wordpressContent("principles", [
    { number: "01", title: "Material comes first", text: "Before the drawing, we specify the stone or the surface. The rest of the project is designed around what the material actually wants to do." },
    { number: "02", title: "One accountable team", text: "Materials, flooring, construction and interiors all report into a single project lead. Fewer handovers, fewer things lost in translation." },
    { number: "03", title: "Detail is a discipline", text: "Every joint, threshold and reveal is drawn before it's built. Nothing is decided on site that could have been decided at the desk." },
    { number: "04", title: "Craft is not decorative", text: "Traditional cutting and finishing techniques are part of the engineering — not a nostalgia bolted on at the end." },
    { number: "05", title: "Experience over pitch", text: "Instead of a moodboard, we invite clients to stay in a space that uses our full palette. Specify from inside the reference." },
    { number: "06", title: "Long horizons", text: "We build for how a space looks in year ten, not the day it opens." },
  ]);
  const timeline = wordpressContent("timeline", [
    { year: "2003", event: "First quarry allocation in Kishangarh; workshop begins cutting and polishing." },
    { year: "2008", event: "Facade stone supply for the first hotel group project in Rajasthan." },
    { year: "2013", event: "Flooring line launched — contract SPC and hospitality-grade oak plank." },
    { year: "2017", event: "Construction team formed to close the loop from material to structure." },
    { year: "2020", event: "Interiors studio established for full design + execution." },
    { year: "2023", event: "BDSM · BDS Marvel brings stone, flooring, construction and interior decor under one roof — the Drawstones, Renest, Formwork and Vignette teams." },
    { year: "2024", event: "BDSM Living Studio opens in Goa as our public reference and stayable showroom." },
  ]);
  const team = wordpressContent("team", [
    { name: "Drawstones", role: "Materials & Sourcing", image: "photo-1618221195710-dd6b41faaea6" },
    { name: "Renest", role: "Specification & Distribution", image: "photo-1616486338812-3dadae4b4ace" },
    { name: "Formwork", role: "Structure & Site Management", image: "photo-1503387762-592deb58ef4e" },
    { name: "Vignette", role: "Design & Execution", image: "photo-1600585154340-be6161a56a0c" },
    { name: "Head of Craft", role: "Workshop & Fabrication", image: "photo-1600607687939-ce8a6c25118c" },
    { name: "Head of Living Studio", role: "B&B & Client Experience", image: "photo-1600566753190-17f0baa2a6c3" },
  ]);
  return <main className="about-page" data-testid="about-page">
    <section className="about-hero">
      <div className="detail-kicker"><span>BDSM · ABOUT</span><Link to="/" state={{ restore: true }} data-testid="about-back-link">BACK HOME</Link></div>
      <p className="eyebrow">THE STUDIO</p>
      <h1>One team, from<br /><em>quarry to keys.</em></h1>
      <div className="about-hero__lede">
        <p><strong>BDSM · BDS Marvel</strong> is one design and build company — stone, flooring, construction and interiors, handled in-house by our own teams: Drawstones, Renest, Formwork and Vignette. One contract, one accountable team, from facade to floor to furniture.</p>
        <p>The names are new — our people have built for the country's most demanding hotels, developers and civic projects for over twenty years.</p>
      </div>
    </section>

    <section className="about-strip">
      <div className="about-strip__stat"><CountUp value="20+" /><span>years of building</span></div>
      <div className="about-strip__stat"><CountUp value="04" /><span>in-house divisions</span></div>
      <div className="about-strip__stat"><CountUp value="05" /><span>cities operated from</span></div>
      <div className="about-strip__stat"><CountUp value="200+" /><span>projects delivered</span></div>
    </section>

    <section className="about-principles">
      <div className="about-section-heading"><span className="section-index">01 — HOW WE WORK</span><h2>Principles we<br /><em>run through everything.</em></h2></div>
      <div className="principles-grid">
        {principles.map((principle) => <article key={principle.number} className="principle-card" data-testid={`principle-${principle.number}`}>
          <span className="principle-card__number">{principle.number}</span>
          <h3>{principle.title}</h3>
          <p>{principle.text}</p>
        </article>)}
      </div>
    </section>

    <section className="about-timeline">
      <div className="about-section-heading"><span className="section-index">02 — HOW WE GOT HERE</span><h2>Twenty years,<br /><em>told briefly.</em></h2></div>
      <ol className="timeline-list">
        {timeline.map((item, index) => <li key={item.year} className="timeline-item" data-testid={`timeline-${item.year}`}>
          <div className="timeline-year"><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.year}</strong></div>
          <p>{item.event}</p>
        </li>)}
      </ol>
    </section>

    <section className="about-team">
      <div className="about-section-heading"><span className="section-index">03 — THE PEOPLE</span><h2>People behind<br /><em>the work.</em></h2></div>
      <div className="team-grid">
        {team.map((member, index) => <article key={member.name} className="team-card" data-testid={`team-${index + 1}`}>
          <div className="team-card__image"><img src={img(member.image, 900)} alt="" /></div>
          <div className="team-card__body"><span>{member.role}</span><h3>{member.name}</h3></div>
        </article>)}
      </div>
      <p className="about-team__note">Team names and portraits are being finalised — reach out via <Link to="/contact">the contact page</Link> for direct leadership introductions.</p>
    </section>

    <section className="about-cta">
      <div><span className="section-index">READY WHEN YOU ARE</span><h2>Let's build<br /><em>something together.</em></h2><p>Bring us a site, a brief, or just a stone you'd like to use. We'll take it from there.</p></div>
      <ContactTrigger className="np-btn np-btn--paper" testId="about-cta-button">START A PROJECT</ContactTrigger>
    </section>
  </main>;
}

function StaysTierRoute() {
  const { tier } = useParams();
  return <StaysHome key={tier} initialTier={stayTiers.some((t) => t.slug === tier) ? tier : "all"} />;
}

function RouteLoading() {
  return <main className="sx-page sx-center" role="status" aria-live="polite">Loading page…</main>;
}

function AppRoutes() {
  const location = useLocation();
  // Google sign-in returns with #session_id=...; exchange it before rendering routes
  if (location.hash?.includes("session_id=")) return <Suspense fallback={<RouteLoading />}><AuthCallback /></Suspense>;
  return <PageShell>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/projects" element={<ProjectsArchive />} />
          <Route path="/projects/:slug" element={<ProjectPage />} />
          <Route path="/businesses/:slug" element={<SegmentPage />} />
          <Route path="/catalogue" element={<CataloguePage />} />
          <Route path="/catalogue/:slug" element={<CatalogueItemPage />} />
          <Route path="/catalogue/:slug/:piece" element={<CatalogueProductPage />} />
          <Route path="/experience" element={<ExperiencePage />} />
          <Route path="/stays" element={<StaysHome />} />
          <Route path="/stays/search" element={<StaysSearch />} />
          <Route path="/stays/home/:slug" element={<StayDetail />} />
          <Route path="/stays/book/:slug" element={<Checkout />} />
          <Route path="/stays/payment/:slug" element={<StayPayment />} />
          <Route path="/stays/trips" element={<MyTrips />} />
          <Route path="/stays/account" element={<Account />} />
          <Route path="/stays/trips/:id" element={<TripStatus />} />
          <Route path="/stays/:tier" element={<StaysTierRoute />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/owner" element={<OwnerDashboard />} />
          <Route path="/work" element={<ProjectsArchive />} />
          <Route path="/work/:slug" element={<ProjectPage />} />
          <Route path="/agency/:slug" element={<SegmentPage />} />
        </Routes>
      </Suspense>
      </PageShell>;
}

function App() {
  return <Router basename={window.BDS_WORDPRESS?.routerMode === "browser" ? window.BDS_WORDPRESS.basename : undefined}>
    <AuthProvider>
    <StaysProvider>
    <ContactProvider>
      <ConsultationProvider>
      <SampleProvider>
      <InquiryProvider>
      <AppRoutes />
      </InquiryProvider>
      </SampleProvider>
      </ConsultationProvider>
    </ContactProvider>
    </StaysProvider>
    </AuthProvider>
  </Router>;
}

export default App;
