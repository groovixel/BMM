from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Request, Depends
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Literal
import secrets
import bcrypt
import jwt
import uuid
import re
import ipaddress
import httpx
import requests
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta
from collections import defaultdict, deque


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


async def require_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Owner access only.")
    return user


# --- Simple in-memory IP rate limiting for public (unauthenticated) form submits ---
_RATE_BUCKETS: dict = defaultdict(deque)


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(bucket: str, max_requests: int = 5, window_seconds: int = 3600):
    """Dependency: reject (429) when a client IP already has `max_requests` recorded
    hits in `bucket` within the window. Returns a recorder callable; the endpoint
    calls it AFTER a successful write so invalid (422) requests don't consume budget."""
    async def _dep(request: Request):
        ip = _client_ip(request)
        key = f"{bucket}:{ip}"
        now = datetime.now(timezone.utc).timestamp()
        dq = _RATE_BUCKETS[key]
        while dq and now - dq[0] > window_seconds:
            dq.popleft()
        if len(dq) >= max_requests:
            raise HTTPException(status_code=429, detail="Too many submissions. Please try again later.")
        return lambda: _RATE_BUCKETS[key].append(datetime.now(timezone.utc).timestamp())
    return _dep


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}


# --- Email notifications (Emergent managed Resend) ---

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")
OWNER_EMAIL = os.environ["OWNER_EMAIL"]

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []
    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []
    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)
    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str, reply_to: str | None = None) -> str | None:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html,
               "from_name": EMAIL_FROM_NAME}
    if reply_to or EMAIL_REPLY_TO:
        payload["contact_email"] = reply_to or EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=502, detail="Failed to send email")
    except Exception as e:
        logger.error(f"Email send error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send email")


def _inquiry_email_html(inq: "Inquiry") -> str:
    def row(label, value):
        return (f'<tr><td style="padding:8px 16px 8px 0;color:#8a8577;font-size:11px;'
                f'letter-spacing:2px;text-transform:uppercase;vertical-align:top">{label}</td>'
                f'<td style="padding:8px 0;font-size:14px;color:#141414">{value}</td></tr>')
    rows = row("Name", escape(inq.name))
    rows += row("Email", f'<a href="mailto:{escape(inq.email)}" style="color:#141414">{escape(inq.email)}</a>')
    if inq.company:
        rows += row("Company", escape(inq.company))
    if inq.agency:
        rows += row("Business", escape(inq.agency))
    if inq.budget:
        rows += row("Budget", escape(inq.budget))
    rows += row("Message", escape(inq.message).replace("\n", "<br />"))
    return ('<table role="presentation" width="100%" style="background:#f5f2ea;padding:32px 0">'
            '<tr><td align="center"><table role="presentation" width="560" '
            'style="background:#ffffff;padding:32px;font-family:Arial,sans-serif">'
            '<tr><td><p style="font-size:11px;letter-spacing:3px;color:#8a8577;margin:0 0 8px">BDS MARVEL &middot; NEW INQUIRY</p>'
            '<h1 style="font-size:22px;margin:0 0 24px;color:#141414">New project inquiry</h1>'
            f'<table role="presentation" width="100%">{rows}</table>'
            f'<p style="font-size:12px;color:#8a8577;margin:24px 0 0">Sent by the {escape(EMAIL_FROM_NAME)} website contact form. We never ask for passwords or card details by email.</p>'
            '</td></tr></table></td></tr></table>')


# --- Inquiries (Contact form) ---

class InquiryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    company: Optional[str] = Field(default=None, max_length=160)
    agency: Optional[str] = Field(default=None, max_length=80)
    budget: Optional[str] = Field(default=None, max_length=60)
    message: str = Field(min_length=5, max_length=4000)


class Inquiry(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: str
    company: Optional[str] = None
    agency: Optional[str] = None
    budget: Optional[str] = None
    message: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


@api_router.post("/inquiries", response_model=Inquiry, status_code=201)
async def create_inquiry(payload: InquiryCreate, _rl=Depends(rate_limit("inquiries"))):
    inquiry = Inquiry(**payload.model_dump())
    doc = inquiry.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.inquiries.insert_one(doc)
    _rl()
    logger.info("New inquiry from %s <%s>", inquiry.name, inquiry.email)
    try:
        await send_email(to=OWNER_EMAIL, subject=f"New project inquiry - {inquiry.name}",
                         html=_inquiry_email_html(inquiry))
        logger.info("Inquiry notification emailed to %s", OWNER_EMAIL)
    except Exception as exc:
        logger.error("Inquiry saved but email notification failed: %s", exc)
    return inquiry


@api_router.get("/inquiries", response_model=List[Inquiry])
async def list_inquiries(limit: int = 50, _: dict = Depends(require_admin)):
    limit = max(1, min(limit, 200))
    rows = await db.inquiries.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    for row in rows:
        if isinstance(row.get('created_at'), str):
            row['created_at'] = datetime.fromisoformat(row['created_at'])
    return rows


# --- Stay bookings (Air BnB booking requests) ---

class BookingCreate(BaseModel):
    stay: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    check_in: str
    check_out: str
    guests: int = Field(ge=1, le=16)
    message: Optional[str] = Field(default=None, max_length=1000)


class Booking(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    stay: str
    name: str
    email: str
    check_in: str
    check_out: str
    guests: int
    message: Optional[str] = None
    status: str = "requested"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def _booking_email_html(bk: "Booking") -> str:
    def row(label, value):
        return (f'<tr><td style="padding:8px 16px 8px 0;color:#8a8577;font-size:11px;'
                f'letter-spacing:2px;text-transform:uppercase;vertical-align:top">{label}</td>'
                f'<td style="padding:8px 0;font-size:14px;color:#141414">{value}</td></tr>')
    rows = row("Stay", escape(bk.stay))
    rows += row("Dates", f'{escape(bk.check_in)} &rarr; {escape(bk.check_out)}')
    rows += row("Guests", str(bk.guests))
    rows += row("Name", escape(bk.name))
    rows += row("Email", f'<a href="mailto:{escape(bk.email)}" style="color:#141414">{escape(bk.email)}</a>')
    if bk.message:
        rows += row("Notes", escape(bk.message).replace("\n", "<br />"))
    return ('<table role="presentation" width="100%" style="background:#f5f2ea;padding:32px 0">'
            '<tr><td align="center"><table role="presentation" width="560" '
            'style="background:#ffffff;padding:32px;font-family:Arial,sans-serif">'
            '<tr><td><p style="font-size:11px;letter-spacing:3px;color:#8a8577;margin:0 0 8px">BDS MARVEL &middot; STAY BOOKING</p>'
            '<h1 style="font-size:22px;margin:0 0 24px;color:#141414">New booking request</h1>'
            f'<table role="presentation" width="100%">{rows}</table>'
            f'<p style="font-size:12px;color:#8a8577;margin:24px 0 0">Sent by the {escape(EMAIL_FROM_NAME)} website stays page. We never ask for passwords or card details by email.</p>'
            '</td></tr></table></td></tr></table>')


@api_router.post("/bookings", response_model=Booking, status_code=201)
async def create_booking(payload: BookingCreate, _rl=Depends(rate_limit("bookings"))):
    try:
        check_in = datetime.strptime(payload.check_in, "%Y-%m-%d").date()
        check_out = datetime.strptime(payload.check_out, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=422, detail="Dates must be YYYY-MM-DD")
    if check_out <= check_in:
        raise HTTPException(status_code=422, detail="Check-out must be after check-in")
    existing = await db.bookings.find({"stay": payload.stay, "status": "confirmed"}, {"_id": 0, "check_in": 1, "check_out": 1}).to_list(500)
    for other in existing:
        if payload.check_in < other["check_out"] and payload.check_out > other["check_in"]:
            raise HTTPException(status_code=409, detail=f"Those nights are already booked ({other['check_in']} to {other['check_out']}). Please pick different dates.")
    booking = Booking(**payload.model_dump())
    doc = booking.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.bookings.insert_one(doc)
    _rl()
    logger.info("New booking request for %s from %s <%s>", booking.stay, booking.name, booking.email)
    try:
        await send_email(to=OWNER_EMAIL, subject=f"New stay booking - {booking.stay}",
                         html=_booking_email_html(booking))
        logger.info("Booking notification emailed to %s", OWNER_EMAIL)
    except Exception as exc:
        logger.error("Booking saved but email notification failed: %s", exc)
    return booking


@api_router.get("/bookings", response_model=List[Booking])
async def list_bookings(limit: int = 50, _: dict = Depends(require_admin)):
    limit = max(1, min(limit, 200))
    rows = await db.bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    for row in rows:
        if isinstance(row.get('created_at'), str):
            row['created_at'] = datetime.fromisoformat(row['created_at'])
    return rows


@api_router.get("/stays/availability")
async def stays_availability(stay: Optional[str] = None):
    query = {"stay": stay} if stay else {}
    projection = {"_id": 0, "stay": 1, "check_in": 1, "check_out": 1}
    confirmed = await db.bookings.find({**query, "status": "confirmed"}, projection).to_list(1000)
    requested = await db.bookings.find({**query, "status": "requested"}, projection).to_list(1000)
    return {"booked": confirmed, "requested": requested}


class BookingStatusUpdate(BaseModel):
    status: str


@api_router.post("/bookings/{booking_id}/status", response_model=Booking)
async def update_booking_status(booking_id: str, payload: BookingStatusUpdate, _: dict = Depends(require_admin)):
    if payload.status not in ("requested", "confirmed", "cancelled"):
        raise HTTPException(status_code=422, detail="Status must be requested, confirmed or cancelled")
    target = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Booking not found")
    if payload.status == "confirmed":
        others = await db.bookings.find(
            {"stay": target["stay"], "status": "confirmed", "id": {"$ne": booking_id}},
            {"_id": 0, "check_in": 1, "check_out": 1},
        ).to_list(500)
        for other in others:
            if target["check_in"] < other["check_out"] and target["check_out"] > other["check_in"]:
                raise HTTPException(status_code=409, detail=f"Those nights are already confirmed for another guest ({other['check_in']} to {other['check_out']}).")
    result = await db.bookings.update_one({"id": booking_id}, {"$set": {"status": payload.status}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Booking not found")
    doc = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if isinstance(doc.get('created_at'), str):
        doc['created_at'] = datetime.fromisoformat(doc['created_at'])
    logger.info("Booking %s marked %s", booking_id, payload.status)
    return doc


# --- Object storage (Emergent) for optional consultation file uploads ---

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "bdsmarvel"
_storage_key = None

_MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif",
    "webp": "image/webp", "heic": "image/heic", "pdf": "application/pdf",
}


_MAGIC = {"jpg": [b"\xff\xd8\xff"], "jpeg": [b"\xff\xd8\xff"], "png": [b"\x89PNG"], "gif": [b"GIF8"], "pdf": [b"%PDF"]}


def _magic_ok(ext: str, data: bytes) -> bool:
    if ext == "webp":
        return data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    if ext == "heic":
        return data[4:8] == b"ftyp"
    return any(data.startswith(m) for m in _MAGIC[ext])


def init_storage(force: bool = False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key, "Content-Type": content_type},
                            data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


@api_router.post("/consultations/upload")
async def upload_consultation_file(file: UploadFile = File(...), _rl=Depends(rate_limit("uploads", max_requests=10))):
    data = await file.read(15 * 1024 * 1024 + 1)
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 15MB)")
    filename = (file.filename or "upload")[-200:]
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in _MIME_TYPES or not _magic_ok(ext, data):
        raise HTTPException(status_code=415, detail="Only JPG, PNG, GIF, WEBP, HEIC or PDF files are allowed")
    content_type = _MIME_TYPES[ext]
    file_id = str(uuid.uuid4())
    path = f"{APP_NAME}/consultations/{file_id}.{ext}"
    try:
        result = put_object(path, data, content_type)
    except Exception as exc:
        logger.error("Consultation file upload failed: %s", exc)
        raise HTTPException(status_code=502, detail="File upload failed, please try again")
    await db.consultation_files.insert_one({
        "id": file_id,
        "storage_path": result["path"],
        "original_filename": filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    _rl()
    return {"id": file_id, "filename": filename, "url": f"/api/files/{file_id}"}


@api_router.get("/files/{file_id}")
async def download_file(file_id: str, _: dict = Depends(require_admin)):
    record = await db.consultation_files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    data, _ct = get_object(record["storage_path"])
    ext = record["storage_path"].rsplit(".", 1)[-1].lower()
    return Response(content=data, media_type=_MIME_TYPES.get(ext, "application/octet-stream"), headers={
        "Content-Disposition": f'attachment; filename="{file_id}.{ext}"', "X-Content-Type-Options": "nosniff"})


# --- Consultation inquiries (per-service consulting requests) ---

class ConsultationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=3, max_length=40)
    email: EmailStr
    city: Optional[str] = Field(default=None, max_length=120)
    project_type: Optional[str] = Field(default=None, max_length=120)
    service: str = Field(min_length=1, max_length=120)
    requirements: str = Field(min_length=3, max_length=4000)
    project_size: Optional[str] = Field(default=None, max_length=120)
    budget: Optional[str] = Field(default=None, max_length=60)
    file_id: Optional[str] = Field(default=None, max_length=60)
    file_name: Optional[str] = Field(default=None, max_length=260)


class Consultation(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: str
    email: str
    city: Optional[str] = None
    project_type: Optional[str] = None
    service: str
    requirements: str
    project_size: Optional[str] = None
    budget: Optional[str] = None
    file_id: Optional[str] = None
    file_name: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def _consultation_email_html(c: "Consultation") -> str:
    def row(label, value):
        return (f'<tr><td style="padding:8px 16px 8px 0;color:#8a8577;font-size:11px;'
                f'letter-spacing:2px;text-transform:uppercase;vertical-align:top">{label}</td>'
                f'<td style="padding:8px 0;font-size:14px;color:#141414">{value}</td></tr>')
    rows = row("Service", escape(c.service))
    rows += row("Name", escape(c.name))
    rows += row("Phone", escape(c.phone))
    rows += row("Email", f'<a href="mailto:{escape(c.email)}" style="color:#141414">{escape(c.email)}</a>')
    if c.city:
        rows += row("City", escape(c.city))
    if c.project_type:
        rows += row("Project type", escape(c.project_type))
    if c.project_size:
        rows += row("Project size", escape(c.project_size))
    if c.budget:
        rows += row("Budget", escape(c.budget))
    rows += row("Requirements", escape(c.requirements).replace("\n", "<br />"))
    if c.file_name:
        rows += row("Attachment", escape(c.file_name))
    return ('<table role="presentation" width="100%" style="background:#f5f2ea;padding:32px 0">'
            '<tr><td align="center"><table role="presentation" width="560" '
            'style="background:#ffffff;padding:32px;font-family:Arial,sans-serif">'
            '<tr><td><p style="font-size:11px;letter-spacing:3px;color:#8a8577;margin:0 0 8px">BDS MARVEL &middot; CONSULTATION</p>'
            '<h1 style="font-size:22px;margin:0 0 24px;color:#141414">New consultation request</h1>'
            f'<table role="presentation" width="100%">{rows}</table>'
            f'<p style="font-size:12px;color:#8a8577;margin:24px 0 0">Sent by the {escape(EMAIL_FROM_NAME)} website consultation form. We never ask for passwords or card details by email.</p>'
            '</td></tr></table></td></tr></table>')


@api_router.post("/consultations", response_model=Consultation, status_code=201)
async def create_consultation(payload: ConsultationCreate, _rl=Depends(rate_limit("consultations"))):
    consultation = Consultation(**payload.model_dump())
    doc = consultation.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.consultations.insert_one(doc)
    _rl()
    logger.info("New consultation (%s) from %s <%s>", consultation.service, consultation.name, consultation.email)
    try:
        await send_email(to=OWNER_EMAIL, subject=f"New consultation - {consultation.service}",
                         html=_consultation_email_html(consultation))
        logger.info("Consultation notification emailed to %s", OWNER_EMAIL)
    except Exception as exc:
        logger.error("Consultation saved but email notification failed: %s", exc)
    return consultation


@api_router.get("/consultations", response_model=List[Consultation])
async def list_consultations(limit: int = 50, _: dict = Depends(require_admin)):
    limit = max(1, min(limit, 200))
    rows = await db.consultations.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    for row in rows:
        if isinstance(row.get('created_at'), str):
            row['created_at'] = datetime.fromisoformat(row['created_at'])
    return rows



# --- Shared email helpers ---

def _email_row(label, value):
    return (f'<tr><td style="padding:8px 16px 8px 0;color:#8a8577;font-size:11px;'
            f'letter-spacing:2px;text-transform:uppercase;vertical-align:top">{label}</td>'
            f'<td style="padding:8px 0;font-size:14px;color:#141414">{value}</td></tr>')


def _email_shell(kicker: str, title: str, rows: str, source: str) -> str:
    return ('<table role="presentation" width="100%" style="background:#f5f2ea;padding:32px 0">'
            '<tr><td align="center"><table role="presentation" width="560" '
            'style="background:#ffffff;padding:32px;font-family:Arial,sans-serif">'
            f'<tr><td><p style="font-size:11px;letter-spacing:3px;color:#8a8577;margin:0 0 8px">BDS MARVEL &middot; {kicker}</p>'
            f'<h1 style="font-size:22px;margin:0 0 24px;color:#141414">{title}</h1>'
            f'<table role="presentation" width="100%">{rows}</table>'
            f'<p style="font-size:12px;color:#8a8577;margin:24px 0 0">Sent by the {escape(EMAIL_FROM_NAME)} website {source}. We never ask for passwords or card details by email.</p>'
            '</td></tr></table></td></tr></table>')


# --- Sample requests (catalogue "Request Sample" form) ---

class SampleRequestCreate(BaseModel):
    product: str = Field(min_length=1, max_length=160)
    brand: Optional[str] = Field(default=None, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=3, max_length=40)
    address: str = Field(min_length=5, max_length=500)
    city: Optional[str] = Field(default=None, max_length=120)
    pincode: Optional[str] = Field(default=None, max_length=12)
    notes: Optional[str] = Field(default=None, max_length=1000)


class SampleRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    product: str
    brand: Optional[str] = None
    name: str
    email: str
    phone: str
    address: str
    city: Optional[str] = None
    pincode: Optional[str] = None
    notes: Optional[str] = None
    status: str = "requested"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def _sample_request_email_html(sr: "SampleRequest") -> str:
    rows = _email_row("Product", escape(sr.product))
    if sr.brand:
        rows += _email_row("Brand", escape(sr.brand))
    rows += _email_row("Name", escape(sr.name))
    rows += _email_row("Phone", escape(sr.phone))
    rows += _email_row("Email", f'<a href="mailto:{escape(sr.email)}" style="color:#141414">{escape(sr.email)}</a>')
    rows += _email_row("Ship to", escape(sr.address).replace("\n", "<br />"))
    if sr.city:
        rows += _email_row("City", escape(sr.city))
    if sr.pincode:
        rows += _email_row("Pincode", escape(sr.pincode))
    if sr.notes:
        rows += _email_row("Notes", escape(sr.notes).replace("\n", "<br />"))
    return _email_shell("SAMPLE REQUEST", "New sample request", rows, "sample request form")


@api_router.post("/sample-requests", response_model=SampleRequest, status_code=201)
async def create_sample_request(payload: SampleRequestCreate, _rl=Depends(rate_limit("sample-requests"))):
    sample = SampleRequest(**payload.model_dump())
    doc = sample.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.sample_requests.insert_one(doc)
    _rl()
    logger.info("New sample request (%s) from %s <%s>", sample.product, sample.name, sample.email)
    try:
        await send_email(to=OWNER_EMAIL, subject=f"New sample request - {sample.product}",
                         html=_sample_request_email_html(sample))
        logger.info("Sample request notification emailed to %s", OWNER_EMAIL)
    except Exception as exc:
        logger.error("Sample request saved but email notification failed: %s", exc)
    return sample


@api_router.get("/sample-requests", response_model=List[SampleRequest])
async def list_sample_requests(limit: int = 50, _: dict = Depends(require_admin)):
    limit = max(1, min(limit, 200))
    rows = await db.sample_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    for row in rows:
        if isinstance(row.get('created_at'), str):
            row['created_at'] = datetime.fromisoformat(row['created_at'])
    return rows


# --- Product quote requests (product page "Request Quote" form) ---

class QuoteRequestCreate(BaseModel):
    product: str = Field(min_length=1, max_length=200)
    collection: str = Field(min_length=1, max_length=160)
    brand: Optional[str] = Field(default=None, max_length=120)
    material: Optional[str] = Field(default=None, max_length=160)
    finish: Optional[str] = Field(default=None, max_length=160)
    use: Optional[str] = Field(default=None, max_length=160)
    product_url: Optional[str] = Field(default=None, max_length=500)
    image: Optional[str] = Field(default=None, max_length=500)
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=3, max_length=40)
    city: Optional[str] = Field(default=None, max_length=120)
    quantity: Optional[str] = Field(default=None, max_length=120)
    timeline: Optional[str] = Field(default=None, max_length=60)
    want_sample: bool = False
    message: Optional[str] = Field(default=None, max_length=2000)


class QuoteRequest(QuoteRequestCreate):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    status: str = "new"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def _quote_request_email_html(q: "QuoteRequest") -> str:
    rows = _email_row("Product", escape(q.product))
    rows += _email_row("Collection", escape(q.collection))
    for label, value in (("Brand", q.brand), ("Material", q.material), ("Finish", q.finish), ("Best for", q.use)):
        if value:
            rows += _email_row(label, escape(value))
    if q.product_url:
        rows += _email_row("Product page", f'<a href="{escape(q.product_url)}" style="color:#141414">{escape(q.product_url)}</a>')
    rows += _email_row("Name", escape(q.name))
    rows += _email_row("Phone", escape(q.phone))
    rows += _email_row("Email", f'<a href="mailto:{escape(q.email)}" style="color:#141414">{escape(q.email)}</a>')
    for label, value in (("City", q.city), ("Quantity / area", q.quantity), ("Timeline", q.timeline)):
        if value:
            rows += _email_row(label, escape(value))
    rows += _email_row("Sample wanted", "Yes" if q.want_sample else "No")
    if q.message:
        rows += _email_row("Message", escape(q.message).replace("\n", "<br />"))
    return _email_shell("QUOTE REQUEST", "New product quote request", rows, "product quote form")


def _safe_https(url: Optional[str]) -> Optional[str]:
    return url if url and urlparse(url).scheme == "https" else None


def _quote_customer_email_html(q: "QuoteRequest") -> str:
    image = _safe_https(q.image)
    rows = _email_row("", f'<img src="{escape(image)}" alt="{escape(q.product)}" width="240" style="display:block;border-radius:8px;max-width:100%" />') if image else ""
    rows += _email_row("Product", escape(q.product))
    rows += _email_row("Collection", escape(q.collection))
    for label, value in (("Brand", q.brand), ("Material", q.material), ("Finish", q.finish), ("Best for", q.use),
                         ("Quantity / area", q.quantity), ("Needed by", q.timeline)):
        if value:
            rows += _email_row(label, escape(value))
    rows += _email_row("Sample", "Requested" if q.want_sample else "Not requested")
    link = _safe_https(q.product_url)
    if link:
        rows += _email_row("Product page", f'<a href="{escape(link)}" style="color:#141414">View this product</a>')
    rows += _email_row("What's next", "Our team will reply with pricing and lead times within one working day.")
    return _email_shell("QUOTE REQUEST", f"We've received your quote request, {escape(q.name.split()[0])}", rows, "product quote form")


@api_router.post("/quote-requests", response_model=QuoteRequest, status_code=201)
async def create_quote_request(payload: QuoteRequestCreate, _rl=Depends(rate_limit("quote-requests"))):
    quote = QuoteRequest(**payload.model_dump())
    doc = quote.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.quote_requests.insert_one(doc)
    _rl()
    logger.info("New quote request (%s) from %s <%s>", quote.product, quote.name, quote.email)
    try:
        await send_email(to=OWNER_EMAIL, subject=f"New quote request - {quote.product}", html=_quote_request_email_html(quote))
    except Exception as exc:
        logger.error("Quote request saved but email notification failed: %s", exc)
    try:
        await send_email(to=quote.email, subject=f"Your quote request - {quote.product}", html=_quote_customer_email_html(quote))
        logger.info("Quote confirmation emailed to %s", quote.email)
    except Exception as exc:
        logger.error("Quote request saved but customer confirmation failed: %s", exc)
    return quote


@api_router.get("/quote-requests", response_model=List[QuoteRequest])
async def list_quote_requests(limit: int = 50, _: dict = Depends(require_admin)):
    limit = max(1, min(limit, 200))
    rows = await db.quote_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    for row in rows:
        if isinstance(row.get('created_at'), str):
            row['created_at'] = datetime.fromisoformat(row['created_at'])
    return rows


# --- Product inquiries (brand-page "Make an Inquiry" form) ---

class ProductInquiryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=40)
    brand: str = Field(min_length=1, max_length=120)
    product: Optional[str] = Field(default=None, max_length=160)
    quantity: Optional[str] = Field(default=None, max_length=120)
    message: str = Field(min_length=5, max_length=4000)


class ProductInquiry(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: str
    phone: Optional[str] = None
    brand: str
    product: Optional[str] = None
    quantity: Optional[str] = None
    message: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def _product_inquiry_email_html(pi: "ProductInquiry") -> str:
    rows = _email_row("Brand", escape(pi.brand))
    if pi.product:
        rows += _email_row("Product", escape(pi.product))
    if pi.quantity:
        rows += _email_row("Quantity", escape(pi.quantity))
    rows += _email_row("Name", escape(pi.name))
    rows += _email_row("Email", f'<a href="mailto:{escape(pi.email)}" style="color:#141414">{escape(pi.email)}</a>')
    if pi.phone:
        rows += _email_row("Phone", escape(pi.phone))
    rows += _email_row("Message", escape(pi.message).replace("\n", "<br />"))
    return _email_shell("PRODUCT INQUIRY", f"New {escape(pi.brand)} product inquiry", rows, "product inquiry form")


@api_router.post("/product-inquiries", response_model=ProductInquiry, status_code=201)
async def create_product_inquiry(payload: ProductInquiryCreate, _rl=Depends(rate_limit("product-inquiries"))):
    inquiry = ProductInquiry(**payload.model_dump())
    doc = inquiry.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.product_inquiries.insert_one(doc)
    _rl()
    logger.info("New product inquiry (%s / %s) from %s <%s>", inquiry.brand, inquiry.product or "-", inquiry.name, inquiry.email)
    try:
        await send_email(to=OWNER_EMAIL, subject=f"New product inquiry - {inquiry.brand}",
                         html=_product_inquiry_email_html(inquiry))
        logger.info("Product inquiry notification emailed to %s", OWNER_EMAIL)
    except Exception as exc:
        logger.error("Product inquiry saved but email notification failed: %s", exc)
    return inquiry


@api_router.get("/product-inquiries", response_model=List[ProductInquiry])
async def list_product_inquiries(limit: int = 50, _: dict = Depends(require_admin)):
    limit = max(1, min(limit, 200))
    rows = await db.product_inquiries.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    for row in rows:
        if isinstance(row.get('created_at'), str):
            row['created_at'] = datetime.fromisoformat(row['created_at'])
    return rows


# --- Auth: JWT email/password + Emergent-managed Google sign-in (shared users collection) ---

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def _jwt(user_id: str, kind: str, delta: timedelta) -> str:
    payload = {"sub": user_id, "type": kind, "exp": datetime.now(timezone.utc) + delta}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _set_cookie(response: Response, key: str, value: str, max_age: int):
    response.set_cookie(key=key, value=value, httponly=True, secure=True, samesite="none", max_age=max_age, path="/")


def _issue_jwt(response: Response, user_id: str):
    _set_cookie(response, "access_token", _jwt(user_id, "access", timedelta(minutes=15)), 900)
    _set_cookie(response, "refresh_token", _jwt(user_id, "refresh", timedelta(days=7)), 604800)


class UserOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str = "guest"


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class SessionIn(BaseModel):
    session_id: str = Field(min_length=1, max_length=400)


async def _user_from_session(token: str):
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        return None
    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        return None
    return await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0, "password_hash": 0})


async def _user_from_jwt(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        return None
    if payload.get("type") != "access":
        return None
    return await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0, "password_hash": 0})


async def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    bearer = auth_header[7:] if auth_header.startswith("Bearer ") else None
    for token, kind in ((request.cookies.get("session_token"), "session"), (request.cookies.get("access_token"), "jwt"), (bearer, "session"), (bearer, "jwt")):
        if not token:
            continue
        user = await (_user_from_session(token) if kind == "session" else _user_from_jwt(token))
        if user:
            return user
    raise HTTPException(status_code=401, detail="Not authenticated")


@api_router.post("/auth/register", response_model=UserOut)
async def register(payload: RegisterIn, response: Response, _rl=Depends(rate_limit("register"))):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="An account with this email already exists. Please log in.")
    user = {"user_id": f"user_{uuid.uuid4().hex[:12]}", "email": email, "name": payload.name.strip(),
            "password_hash": hash_password(payload.password), "role": "guest", "created_at": datetime.now(timezone.utc).isoformat()}
    await db.users.insert_one(user)
    _rl()
    _issue_jwt(response, user["user_id"])
    return UserOut(**user)


@api_router.post("/auth/login", response_model=UserOut)
async def login(payload: LoginIn, request: Request, response: Response, _rl=Depends(rate_limit("login", max_requests=30, window_seconds=900))):
    email = payload.email.lower()
    identifier = f"{_client_ip(request)}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier}, {"_id": 0})
    acct = await db.login_attempts.find_one({"identifier": f"acct:{email}"}, {"_id": 0})
    now = datetime.now(timezone.utc)
    for a in (attempt, acct):
        if a and a.get("locked_until") and datetime.fromisoformat(a["locked_until"]) > now:
            raise HTTPException(status_code=429, detail="Too many attempts. Please try again in 15 minutes.")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not user.get("password_hash") or not verify_password(payload.password, user["password_hash"]):
        count = (attempt or {}).get("count", 0) + 1
        update = {"count": count, "locked_until": (now + timedelta(minutes=15)).isoformat() if count >= 5 else None}
        await db.login_attempts.update_one({"identifier": identifier}, {"$set": update}, upsert=True)
        acct_count = (acct or {}).get("count", 0) + 1
        await db.login_attempts.update_one({"identifier": f"acct:{email}"}, {"$set": {
            "count": 0 if acct_count >= 20 else acct_count,
            "locked_until": (now + timedelta(minutes=15)).isoformat() if acct_count >= 20 else None}}, upsert=True)
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    _rl()
    await db.login_attempts.delete_one({"identifier": identifier})
    _issue_jwt(response, user["user_id"])
    if user.get("role") == "admin":
        await _alert_new_admin_device(request)
    return UserOut(**user)


_UA_LABELS = [("Edg", "Edge"), ("OPR", "Opera"), ("Chrome", "Chrome"), ("Firefox", "Firefox"), ("Safari", "Safari")]
_OS_LABELS = [("Windows", "Windows"), ("Mac OS", "macOS"), ("Android", "Android"), ("iPhone", "iOS"), ("iPad", "iPadOS"), ("Linux", "Linux")]


def _device_label(ua: str) -> str:
    browser = next((label for token, label in _UA_LABELS if token in ua), "Browser")
    os_name = next((label for token, label in _OS_LABELS if token in ua), "unknown OS")
    return f"{browser} on {os_name}"


def _new_device_email_html(ip: str, label: str, when: str) -> str:
    def row(k, v):
        return (f'<tr><td style="padding:8px 16px 8px 0;color:#8a8577;font-size:11px;letter-spacing:2px;'
                f'text-transform:uppercase;vertical-align:top">{k}</td><td style="padding:8px 0;font-size:14px;color:#141414">{v}</td></tr>')
    rows = row("Device", escape(label)) + row("IP address", escape(ip)) + row("Time", escape(when))
    return ('<table role="presentation" width="100%" style="background:#f5f2ea;padding:32px 0">'
            '<tr><td align="center"><table role="presentation" width="560" '
            'style="background:#ffffff;padding:32px;font-family:Arial,sans-serif">'
            '<tr><td><p style="font-size:11px;letter-spacing:3px;color:#8a8577;margin:0 0 8px">BDS MARVEL &middot; SECURITY ALERT</p>'
            '<h1 style="font-size:22px;margin:0 0 24px;color:#141414">Admin signed in from a new device</h1>'
            f'<table role="presentation" width="100%">{rows}</table>'
            '<p style="font-size:13px;color:#141414;margin:24px 0 0">If this was you, no action is needed. If not, sign in and change the admin password immediately.</p>'
            f'<p style="font-size:12px;color:#8a8577;margin:16px 0 0">Sent by the {escape(EMAIL_FROM_NAME)} website. We never ask for passwords by email.</p>'
            '</td></tr></table></td></tr></table>')


async def _alert_new_admin_device(request: Request):
    ip = _client_ip(request)
    ua = (request.headers.get("user-agent") or "")[:300]
    fingerprint = f"{ip}|{ua}"
    now = datetime.now(timezone.utc)
    known = await db.admin_devices.find_one({"fingerprint": fingerprint})
    if known:
        await db.admin_devices.update_one({"_id": known["_id"]}, {"$set": {"last_seen": now.isoformat()}})
        return
    await db.admin_devices.insert_one({"fingerprint": fingerprint, "ip": ip, "user_agent": ua,
                                       "label": _device_label(ua), "first_seen": now.isoformat(), "last_seen": now.isoformat()})
    logger.info("New admin device sign-in from %s (%s)", ip, _device_label(ua))
    try:
        await send_email(to=OWNER_EMAIL, subject="Security alert: admin signed in from a new device",
                         html=_new_device_email_html(ip, _device_label(ua), now.strftime("%d %b %Y, %H:%M UTC")))
        logger.info("New-device admin alert emailed to %s", OWNER_EMAIL)
    except Exception as exc:
        logger.error("New-device admin alert email failed: %s", exc)


@api_router.post("/auth/session", response_model=UserOut)
async def google_session(payload: SessionIn, response: Response):
    async with httpx.AsyncClient(timeout=20) as http:
        resp = await http.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": payload.session_id})
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Google sign-in failed. Please try again.")
    data = resp.json()
    email = data["email"].lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": existing.get("name") or data.get("name"), "picture": data.get("picture")}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({"user_id": user_id, "email": email, "name": data.get("name") or email, "picture": data.get("picture"),
                                   "role": "guest", "created_at": datetime.now(timezone.utc).isoformat()})
    await db.user_sessions.insert_one({"user_id": user_id, "session_token": data["session_token"],
                                       "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
                                       "created_at": datetime.now(timezone.utc).isoformat()})
    _set_cookie(response, "session_token", data["session_token"], 604800)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return UserOut(**user)


@api_router.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return UserOut(**user)


@api_router.get("/auth/status")
async def auth_status(request: Request, response: Response):
    """Quiet session probe: always 200. Returns {"user": UserOut|null}. Silently
    refreshes the access cookie when it is expired but the refresh token is valid,
    so public pages never log 401s from probing auth state."""
    try:
        user = await get_current_user(request)
        return {"user": UserOut(**user).model_dump()}
    except HTTPException:
        pass
    token = request.cookies.get("refresh_token")
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get("type") == "refresh":
                user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0, "password_hash": 0})
                if user:
                    _set_cookie(response, "access_token", _jwt(payload["sub"], "access", timedelta(minutes=15)), 900)
                    return {"user": UserOut(**user).model_dump()}
        except jwt.InvalidTokenError:
            pass
    return {"user": None}


@api_router.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    try:
        payload = jwt.decode(token or "", JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if payload.get("type") != "refresh" or not await db.users.find_one({"user_id": payload["sub"]}, {"_id": 1}):
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    _set_cookie(response, "access_token", _jwt(payload["sub"], "access", timedelta(minutes=15)), 900)
    return {"ok": True}


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    for key in ("access_token", "refresh_token", "session_token"):
        response.delete_cookie(key, path="/", secure=True, samesite="none")
    return {"ok": True}


# --- Stay bookings v2 (guided checkout: request vs instant book) ---

class StayBookingCreate(BaseModel):
    stay: str = Field(min_length=1, max_length=120)
    stay_slug: str = Field(min_length=1, max_length=120)
    mode: Literal["request", "instant"]
    check_in: str
    check_out: str
    adults: int = Field(ge=1, le=16)
    children: int = Field(default=0, ge=0, le=16)
    infants: int = Field(default=0, ge=0, le=5)
    pets: int = Field(default=0, ge=0, le=5)
    capacity: int = Field(ge=1, le=16)
    nightly: int = Field(ge=0)
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=6, max_length=40)
    message: Optional[str] = Field(default=None, max_length=1000)


class StayBooking(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    reference: str
    user_id: str
    stay: str
    stay_slug: str
    mode: str
    status: str
    check_in: str
    check_out: str
    nights: int
    guests: int
    adults: int
    children: int
    infants: int
    pets: int
    nightly: int
    total: int
    name: str
    email: str
    phone: str
    message: Optional[str] = None
    created_at: str


async def _confirmed_overlap(stay: str, check_in: str, check_out: str, exclude_id: str | None = None):
    query = {"stay": stay, "status": "confirmed"}
    if exclude_id:
        query["id"] = {"$ne": exclude_id}
    for other in await db.bookings.find(query, {"_id": 0, "check_in": 1, "check_out": 1}).to_list(1000):
        if check_in < other["check_out"] and check_out > other["check_in"]:
            return other
    return None


def _guest_booking_email_html(bk: "StayBooking", trip_url: str | None) -> str:
    confirmed = bk.status == "confirmed"
    rows = _email_row("Stay", escape(bk.stay))
    rows += _email_row("Dates", f'{escape(bk.check_in)} &rarr; {escape(bk.check_out)}')
    rows += _email_row("Guests", str(bk.guests))
    rows += _email_row("Total", f'&#8377;{bk.total:,} &middot; {bk.nights} night{"s" if bk.nights > 1 else ""}')
    rows += _email_row("Reference", escape(bk.reference))
    rows += _email_row("Status", "Confirmed" if confirmed else "Pending host approval")
    if trip_url:
        rows += _email_row("Your trip", f'<a href="{escape(trip_url)}" style="color:#141414">View your booking</a>')
    note = ("Check-in details and arrival notes follow by email. Payment is made at the property - no online charge has been taken."
            if confirmed else
            "The host reviews requests within one working day. This is not a confirmed booking yet - we will email you as soon as it is approved.")
    rows += _email_row("What's next", escape(note))
    title = f"You're booked - {escape(bk.stay)}" if confirmed else f"Request received - {escape(bk.stay)}"
    return _email_shell("STAY BOOKING", title, rows, "stays page")


@api_router.post("/stays/bookings", response_model=StayBooking, status_code=201)
async def create_stay_booking(payload: StayBookingCreate, request: Request, user: dict = Depends(get_current_user)):
    try:
        check_in = datetime.strptime(payload.check_in, "%Y-%m-%d").date()
        check_out = datetime.strptime(payload.check_out, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=422, detail="Dates must be YYYY-MM-DD")
    if check_in < datetime.now(timezone.utc).date():
        raise HTTPException(status_code=422, detail="Check-in can't be in the past.")
    if check_out <= check_in:
        raise HTTPException(status_code=422, detail="Check-out must be after check-in.")
    guests = payload.adults + payload.children
    if guests > payload.capacity:
        raise HTTPException(status_code=422, detail=f"This stay sleeps up to {payload.capacity} guests.")
    clash = await _confirmed_overlap(payload.stay, payload.check_in, payload.check_out)
    if clash:
        raise HTTPException(status_code=409, detail=f"Those nights are already booked ({clash['check_in']} to {clash['check_out']}). Please pick different dates.")
    nights = (check_out - check_in).days
    data = payload.model_dump(exclude={"capacity"})
    booking = StayBooking(**data, id=str(uuid.uuid4()), reference=f"BDS-{secrets.token_hex(3).upper()}", user_id=user["user_id"],
                          status="confirmed" if payload.mode == "instant" else "requested", nights=nights, guests=guests,
                          total=payload.nightly * nights, created_at=datetime.now(timezone.utc).isoformat())
    await db.bookings.insert_one(booking.model_dump())
    logger.info("Stay booking %s (%s) for %s by %s", booking.reference, booking.status, booking.stay, booking.email)
    try:
        legacy = Booking(stay=booking.stay, name=booking.name, email=booking.email, check_in=booking.check_in, check_out=booking.check_out,
                         guests=booking.guests, message=f"[{booking.reference} · {booking.mode} · {booking.status}] {booking.message or ''}")
        await send_email(to=OWNER_EMAIL, subject=f"{'New reservation' if booking.mode == 'instant' else 'New booking request'} - {booking.stay} ({booking.reference})",
                         html=_booking_email_html(legacy))
    except Exception as exc:
        logger.error("Stay booking saved but email notification failed: %s", exc)
    try:
        origin = request.headers.get("origin", "")
        host = request.headers.get("host", "")
        trip_url = f"{origin}/stays/trips/{booking.id}" if origin.startswith("https://") and urlparse(origin).netloc == host else None
        await send_email(to=booking.email,
                         subject=f"{'Booking confirmed' if booking.status == 'confirmed' else 'Booking request received'} - {booking.stay} ({booking.reference})",
                         html=_guest_booking_email_html(booking, trip_url))
        logger.info("Guest booking confirmation emailed to %s", booking.email)
    except Exception as exc:
        logger.error("Stay booking saved but guest confirmation email failed: %s", exc)
    return booking


@api_router.get("/stays/bookings/mine", response_model=List[StayBooking])
async def my_stay_bookings(user: dict = Depends(get_current_user)):
    return await db.bookings.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api_router.get("/stays/bookings/{booking_id}", response_model=StayBooking)
async def get_stay_booking(booking_id: str, user: dict = Depends(get_current_user)):
    doc = await db.bookings.find_one({"id": booking_id, "user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Booking not found")
    return doc


# --- Owner dashboard (admin only) ---

class AdminStatusUpdate(BaseModel):
    status: Literal["requested", "confirmed", "declined", "cancelled"]


@api_router.get("/admin/overview")
async def admin_overview(_: dict = Depends(require_admin)):
    today = datetime.now(timezone.utc).date().isoformat()
    pending = await db.bookings.count_documents({"status": "requested"})
    upcoming = await db.bookings.count_documents({"status": "confirmed", "check_out": {"$gte": today}})
    total_bookings = await db.bookings.count_documents({})
    enquiries = 0
    for coll in ("inquiries", "consultations", "sample_requests", "product_inquiries", "quote_requests"):
        enquiries += await db[coll].count_documents({})
    return {"pending_requests": pending, "upcoming_stays": upcoming,
            "total_bookings": total_bookings, "total_enquiries": enquiries}


@api_router.get("/admin/bookings")
async def admin_list_bookings(_: dict = Depends(require_admin)):
    return await db.bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api_router.post("/admin/bookings/{booking_id}/status")
async def admin_update_booking_status(booking_id: str, payload: AdminStatusUpdate, _: dict = Depends(require_admin)):
    target = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Booking not found")
    if payload.status == "confirmed":
        clash = await _confirmed_overlap(target["stay"], target["check_in"], target["check_out"], exclude_id=booking_id)
        if clash:
            raise HTTPException(status_code=409, detail=f"Those nights are already confirmed for another guest ({clash['check_in']} to {clash['check_out']}).")
    await db.bookings.update_one({"id": booking_id}, {"$set": {"status": payload.status}})
    logger.info("Admin marked booking %s as %s", booking_id, payload.status)
    return await db.bookings.find_one({"id": booking_id}, {"_id": 0})


@api_router.get("/admin/enquiries")
async def admin_list_enquiries(_: dict = Depends(require_admin)):
    sources = (("inquiries", "Contact"), ("consultations", "Consultation"),
               ("sample_requests", "Sample request"), ("product_inquiries", "Product inquiry"),
               ("quote_requests", "Quote request"))
    items = []
    for coll, label in sources:
        for doc in await db[coll].find({}, {"_id": 0}).to_list(500):
            doc["type"] = label
            items.append(doc)
    items.sort(key=lambda d: d.get("created_at", ""), reverse=True)
    return items[:500]


@app.on_event("startup")
async def startup_auth():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token")
    await db.login_attempts.create_index("identifier")
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email}, {"_id": 0})
    if not existing:
        await db.users.insert_one({"user_id": f"user_{uuid.uuid4().hex[:12]}", "email": admin_email, "name": "BDS Marvel Admin",
                                   "password_hash": hash_password(admin_password), "role": "admin", "created_at": datetime.now(timezone.utc).isoformat()})
    elif not existing.get("password_hash") or not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password), "role": "admin"}})
    await db.users.update_many({"role": "admin", "email": {"$ne": admin_email}}, {"$set": {"role": "guest"}})


# Include the router in the main app
app.include_router(api_router)

ALLOWED_ORIGINS = [o.strip().rstrip("/") for o in os.environ["CORS_ORIGINS"].split(",") if o.strip() and o.strip() != "*"]


@app.middleware("http")
async def origin_guard_and_headers(request: Request, call_next):
    origin = request.headers.get("origin")
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and origin:
        host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
        if origin.rstrip("/") not in ALLOWED_ORIGINS and urlparse(origin).netloc != host:
            return Response(content='{"detail":"Origin not allowed"}', status_code=403, media_type="application/json")
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    response.headers.setdefault("Cache-Control", "no-store")
    return response


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()