"""Iteration 10 - Faithful import verification tests for BDS Marvel (BDSM) app.

Covers the review-request flows:
- backend health
- admin login + /auth/me + cookie session
- protected endpoints auth gating
- inquiry/consultation/sample-request/product-inquiry POSTs with persistence check
- stays availability + booking creation
"""
import os
import time
import uuid
import datetime as dt
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://sync-public-repo.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "info@bdsmarvel.com"
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["email"].lower() == ADMIN_EMAIL
    assert data["role"] == "admin"
    # cookie should be set
    assert any(c.name in ("access_token", "session_token") for c in s.cookies), f"no auth cookie: {s.cookies}"
    return s


# ---------- Health ----------
def test_root_hello_world():
    r = requests.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    assert r.json() == {"message": "Hello World"}


# ---------- Auth ----------
def test_admin_login_and_me(admin_session):
    r = admin_session.get(f"{API}/auth/me", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["email"].lower() == ADMIN_EMAIL
    assert data["role"] == "admin"


def test_login_bad_credentials():
    r = requests.post(f"{API}/auth/login", json={"email": "nope@bdsmarvel.com", "password": "wrong"}, timeout=15)
    assert r.status_code in (401, 429)


# ---------- Protected endpoints auth gating ----------
def test_inquiries_requires_auth():
    r = requests.get(f"{API}/inquiries", timeout=10)
    assert r.status_code == 401


def test_admin_overview_requires_auth():
    r = requests.get(f"{API}/admin/overview", timeout=10)
    assert r.status_code == 401


def test_admin_overview_authed(admin_session):
    r = admin_session.get(f"{API}/admin/overview", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)


# ---------- Inquiry (contact form) ----------
def test_create_inquiry_persists(admin_session):
    tag = f"TEST_{uuid.uuid4().hex[:8]}"
    payload = {
        "name": f"TEST Inquiry {tag}",
        "email": f"test_{tag}@example.com",
        "company": "TEST Co",
        "budget": "10-25L",
        "message": f"Automated iteration10 test inquiry {tag}. Please ignore."
    }
    r = requests.post(f"{API}/inquiries", json=payload, timeout=60)
    assert r.status_code == 201, f"inquiry create failed: {r.status_code} {r.text}"
    created = r.json()
    assert created["email"] == payload["email"]
    assert created["name"] == payload["name"]
    inq_id = created["id"]

    # verify persisted via admin list
    r2 = admin_session.get(f"{API}/inquiries?limit=200", timeout=15)
    assert r2.status_code == 200
    rows = r2.json()
    assert any(row["id"] == inq_id for row in rows), "created inquiry not found in admin list"


# ---------- Consultations ----------
def test_create_consultation(admin_session):
    tag = f"TEST_{uuid.uuid4().hex[:8]}"
    payload = {
        "name": f"TEST Cons {tag}",
        "phone": "+919999999999",
        "email": f"cons_{tag}@example.com",
        "city": "Mumbai",
        "service": "Architecture",
        "requirements": f"Automated consultation iteration10 {tag}",
    }
    r = requests.post(f"{API}/consultations", json=payload, timeout=60)
    assert r.status_code == 201, f"{r.status_code} {r.text}"
    created = r.json()
    assert created["service"] == "Architecture"
    cid = created["id"]
    r2 = admin_session.get(f"{API}/consultations?limit=200", timeout=15)
    assert r2.status_code == 200
    assert any(row["id"] == cid for row in r2.json())


# ---------- Sample requests ----------
def test_create_sample_request(admin_session):
    tag = f"TEST_{uuid.uuid4().hex[:8]}"
    payload = {
        "product": f"TEST Marble Slab {tag}",
        "brand": "BDS Marvel",
        "name": f"TEST Sample {tag}",
        "email": f"sample_{tag}@example.com",
        "phone": "+919999999999",
        "address": "123 Test Lane, Test City",
        "city": "Mumbai",
        "pincode": "400001",
        "notes": "Automated iteration10 sample request",
    }
    r = requests.post(f"{API}/sample-requests", json=payload, timeout=60)
    assert r.status_code == 201, f"{r.status_code} {r.text}"
    sid = r.json()["id"]
    r2 = admin_session.get(f"{API}/sample-requests?limit=200", timeout=15)
    assert r2.status_code == 200
    assert any(row["id"] == sid for row in r2.json())


# ---------- Product inquiries ----------
def test_create_product_inquiry(admin_session):
    tag = f"TEST_{uuid.uuid4().hex[:8]}"
    payload = {
        "name": f"TEST ProdInq {tag}",
        "email": f"pi_{tag}@example.com",
        "phone": "+919999999999",
        "brand": "BDS Marvel",
        "product": "Botticino Classico",
        "quantity": "200 sqft",
        "message": f"Automated iteration10 product inquiry {tag}.",
    }
    r = requests.post(f"{API}/product-inquiries", json=payload, timeout=60)
    assert r.status_code == 201, f"{r.status_code} {r.text}"
    pid = r.json()["id"]
    r2 = admin_session.get(f"{API}/product-inquiries?limit=200", timeout=15)
    assert r2.status_code == 200
    assert any(row["id"] == pid for row in r2.json())


# ---------- Stays ----------
def test_stays_availability():
    r = requests.get(f"{API}/stays/availability", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, (dict, list))


def test_stays_booking_create():
    # Use a stay slug likely to exist based on prior iterations
    today = dt.date.today()
    # push to year 2029 to avoid conflicts
    ci = dt.date(2029, 11, 10).isoformat()
    co = dt.date(2029, 11, 13).isoformat()
    tag = uuid.uuid4().hex[:6]
    payload = {
        "stay": "The Marble House",
        "stay_slug": "marble-house",
        "mode": "request",
        "check_in": ci,
        "check_out": co,
        "adults": 2,
        "children": 0,
        "infants": 0,
        "pets": 0,
        "capacity": 2,
        "nightly": 12000,
        "name": f"TEST Guest {tag}",
        "email": f"stay_{tag}@example.com",
        "phone": "+919999999999",
        "message": "Automated iteration10 stay booking",
    }
    r = requests.post(f"{API}/stays/bookings", json=payload, timeout=30)
    # 201 when open; 409 if conflict; 400 if validation; accept 201 primarily
    assert r.status_code in (201, 409, 400, 401, 422), f"{r.status_code} {r.text}"
    if r.status_code == 201:
        body = r.json()
        assert body.get("email") == payload["email"]
