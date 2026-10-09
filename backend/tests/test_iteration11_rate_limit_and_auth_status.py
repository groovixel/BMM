"""Iteration 11 tests:
- SPAM SHIELD rate limiting on POST /api/inquiries and /api/sample-requests (5/hr/IP, independent buckets)
- QUIET CONSOLE new endpoint GET /api/auth/status (always 200)
- Regression: /api/auth/login + /api/auth/me still work
"""
import os
import time
import uuid
import requests
import pytest

def _load_backend_url():
    if os.environ.get("REACT_APP_BACKEND_URL"):
        return os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.strip().startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE = _load_backend_url() + "/api"
ADMIN_EMAIL = "info@bdsmarvel.com"
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]


# Spoof a unique IP via X-Forwarded-For so we don't hammer the real client-IP bucket repeatedly.
def _hdrs():
    return {"X-Forwarded-For": f"10.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}"}


# ---------- SPAM SHIELD ----------

def test_inquiries_rate_limit_5_then_429():
    ip_hdr = _hdrs()
    payload = {
        "name": "TEST_RL Inquiry",
        "email": "test_rl@example.com",
        "message": "automated rate-limit boundary test (iteration 11)",
    }
    statuses = []
    for i in range(6):
        r = requests.post(f"{BASE}/inquiries", json=payload, headers=ip_hdr, timeout=20)
        statuses.append(r.status_code)
    assert statuses[:5] == [201, 201, 201, 201, 201], f"first 5 should be 201, got {statuses}"
    assert statuses[5] == 429, f"6th should be 429, got {statuses}"
    # Check error detail text
    r6 = requests.post(f"{BASE}/inquiries", json=payload, headers=ip_hdr, timeout=20)
    assert r6.status_code == 429
    assert "Too many submissions" in r6.json().get("detail", "")


def test_sample_requests_rate_limit_independent_bucket():
    ip_hdr = _hdrs()
    payload = {
        "product": "TEST sample product",
        "name": "TEST_RL Sample",
        "email": "test_rl_sample@example.com",
        "phone": "+10000000000",
        "address": "123 Test Street, Test City",
        "notes": "automated rate-limit boundary test (iteration 11)",
    }
    statuses = []
    for i in range(6):
        r = requests.post(f"{BASE}/sample-requests", json=payload, headers=ip_hdr, timeout=20)
        statuses.append(r.status_code)
    assert statuses[:5] == [201] * 5, f"first 5 should be 201, got {statuses} / body={r.text[:300]}"
    assert statuses[5] == 429, f"6th should be 429, got {statuses}"


def test_inquiries_and_sample_requests_are_independent_buckets():
    ip_hdr = _hdrs()  # same IP for both forms
    inq = {
        "name": "TEST_RL IndepInq",
        "email": "indep_inq@example.com",
        "message": "indep bucket test",
    }
    smp = {
        "product": "TEST indep sample",
        "name": "TEST_RL IndepSmp",
        "email": "indep_smp@example.com",
        "phone": "+10000000000",
        "address": "123 Indep Street, Test City",
        "notes": "indep bucket test",
    }
    # Exhaust inquiries bucket
    for i in range(5):
        r = requests.post(f"{BASE}/inquiries", json=inq, headers=ip_hdr, timeout=20)
        assert r.status_code == 201, f"inq {i}: {r.status_code} {r.text[:200]}"
    r = requests.post(f"{BASE}/inquiries", json=inq, headers=ip_hdr, timeout=20)
    assert r.status_code == 429
    # Sample-request bucket for SAME IP should still accept
    r = requests.post(f"{BASE}/sample-requests", json=smp, headers=ip_hdr, timeout=20)
    assert r.status_code == 201, f"sample should succeed under independent bucket: {r.status_code} {r.text[:200]}"


# ---------- QUIET CONSOLE: /api/auth/status ----------

def test_auth_status_unauthenticated_returns_200_null_user():
    r = requests.get(f"{BASE}/auth/status", timeout=10)
    assert r.status_code == 200, r.text
    assert r.json() == {"user": None}


def test_auth_status_authenticated_returns_user():
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    r = s.get(f"{BASE}/auth/status", timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("user") is not None
    assert data["user"].get("role") == "admin"
    assert data["user"].get("email") == ADMIN_EMAIL


# ---------- Regression: existing auth ----------

def test_auth_login_me_and_unauth_me_401():
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body.get("role") == "admin"
    # Authenticated /auth/me
    r = s.get(f"{BASE}/auth/me", timeout=10)
    assert r.status_code == 200
    assert r.json().get("email") == ADMIN_EMAIL
    # Unauth /auth/me -> 401
    r = requests.get(f"{BASE}/auth/me", timeout=10)
    assert r.status_code == 401


# ---------- Single valid submission still persists ----------

def test_single_valid_inquiry_persists_and_admin_can_see():
    ip_hdr = _hdrs()
    marker = f"TEST_RL_PERSIST_{uuid.uuid4().hex[:8]}"
    r = requests.post(
        f"{BASE}/inquiries",
        json={"name": marker, "email": "persist@example.com", "message": "persist check"},
        headers=ip_hdr,
        timeout=20,
    )
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["name"] == marker
    # Admin GET
    s = requests.Session()
    s.post(f"{BASE}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    r = s.get(f"{BASE}/inquiries?limit=100", timeout=15)
    assert r.status_code == 200
    rows = r.json()
    assert any(row.get("name") == marker for row in rows), f"created inquiry {marker} not found in admin list"
