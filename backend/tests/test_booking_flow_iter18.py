"""End-to-end backend test for stays booking flow + owner email notification.

Covers:
- POST /api/bookings success path (status=requested, persisted, response schema)
- Owner notification email send accepted by Emergent proxy (verified via backend log)
- GET /api/bookings (admin) returns newly created booking
- POST /api/bookings/{id}/status confirm, then overlap/409 guard
- Non-overlapping new booking succeeds
- GET /api/stays/availability?stay=... reflects confirmed/requested
"""
import os
import re
import time
import uuid
from datetime import date, timedelta

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "info@bdsmarvel.com"
ADMIN_PASSWORD = "hPrJt0tgYZg7chAg2CgDAa1!"
BACKEND_OUT_LOG = "/var/log/supervisor/backend.out.log"
BACKEND_ERR_LOG = "/var/log/supervisor/backend.err.log"


def _origin_headers():
    # mutating requests must have Origin matching backend host
    return {"Origin": BASE_URL, "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               headers=_origin_headers(),
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("email") == ADMIN_EMAIL
    assert data.get("role") == "admin"
    return s


@pytest.fixture(scope="module")
def unique_stay():
    # Use a brand new stay string to avoid any collision with existing bookings
    return f"TEST_Stay_{uuid.uuid4().hex[:8]}"


def _future(days):
    return (date.today() + timedelta(days=days)).isoformat()


def _tail_log(path, n=400):
    try:
        with open(path, "r", errors="ignore") as f:
            return "".join(f.readlines()[-n:])
    except FileNotFoundError:
        return ""


def test_create_booking_persists_and_emails_owner(admin_session, unique_stay):
    payload = {
        "stay": unique_stay,
        "name": "TEST Guest",
        "email": "test.guest+iter18@example.com",
        "check_in": _future(30),
        "check_out": _future(33),
        "guests": 2,
        "message": "iter18 automated test",
    }
    log_before = _tail_log(BACKEND_OUT_LOG, 50)
    r = requests.post(f"{BASE_URL}/api/bookings", json=payload, headers=_origin_headers())
    assert r.status_code == 201, f"Create booking failed: {r.status_code} {r.text}"
    booking = r.json()
    assert booking["stay"] == unique_stay
    assert booking["status"] == "requested"
    assert booking["check_in"] == payload["check_in"]
    assert booking["check_out"] == payload["check_out"]
    assert booking["guests"] == 2
    assert "id" in booking and isinstance(booking["id"], str)

    # Give backend a moment to write email send log line
    time.sleep(2.5)
    out = _tail_log(BACKEND_OUT_LOG, 500)
    err = _tail_log(BACKEND_ERR_LOG, 500)
    combined = out + err

    # Expect either success log OR httpx 202 line referencing email send
    email_sent_marker = f"Booking notification emailed to {ADMIN_EMAIL}" in combined
    httpx_202 = re.search(r"POST https://integrations\.emergentagent\.com/api/v1/email/send[^\n]*202", combined)
    failure_marker = "Booking saved but email notification failed" in combined
    assert not failure_marker, f"Owner email send FAILED per logs. Tail:\n{combined[-2000:]}"
    assert email_sent_marker or httpx_202, (
        f"No evidence of owner email send (202) in backend logs. Tail:\n{combined[-2000:]}"
    )

    # Admin GET /api/bookings sees it
    r2 = admin_session.get(f"{BASE_URL}/api/bookings")
    assert r2.status_code == 200
    ids = [b["id"] for b in r2.json()]
    assert booking["id"] in ids

    # stash for next tests
    pytest._iter18_booking = booking


def test_overlap_guard_after_confirmation(admin_session, unique_stay):
    booking = pytest._iter18_booking
    # Confirm the booking
    r = admin_session.post(
        f"{BASE_URL}/api/bookings/{booking['id']}/status",
        json={"status": "confirmed"},
        headers=_origin_headers(),
    )
    assert r.status_code == 200, f"Confirm failed: {r.status_code} {r.text}"
    assert r.json()["status"] == "confirmed"

    # New overlapping booking -> 409
    overlapping = {
        "stay": unique_stay,
        "name": "TEST Overlap",
        "email": "overlap+iter18@example.com",
        "check_in": _future(31),  # inside confirmed window 30->33
        "check_out": _future(34),
        "guests": 1,
    }
    r2 = requests.post(f"{BASE_URL}/api/bookings", json=overlapping, headers=_origin_headers())
    assert r2.status_code == 409, f"Expected 409, got {r2.status_code} {r2.text}"

    # Non-overlapping booking -> 201
    non_overlap = {
        "stay": unique_stay,
        "name": "TEST NonOverlap",
        "email": "nonoverlap+iter18@example.com",
        "check_in": _future(40),
        "check_out": _future(42),
        "guests": 1,
    }
    r3 = requests.post(f"{BASE_URL}/api/bookings", json=non_overlap, headers=_origin_headers())
    assert r3.status_code == 201, f"Non-overlap failed: {r3.status_code} {r3.text}"
    pytest._iter18_booking2 = r3.json()


def test_availability_reflects_statuses(admin_session, unique_stay):
    r = requests.get(f"{BASE_URL}/api/stays/availability", params={"stay": unique_stay})
    assert r.status_code == 200
    data = r.json()
    assert "booked" in data and "requested" in data
    booked = [(b["check_in"], b["check_out"]) for b in data["booked"]]
    requested = [(b["check_in"], b["check_out"]) for b in data["requested"]]
    confirmed = pytest._iter18_booking
    second = pytest._iter18_booking2
    assert (confirmed["check_in"], confirmed["check_out"]) in booked
    assert (second["check_in"], second["check_out"]) in requested


def test_bookings_requires_admin():
    r = requests.get(f"{BASE_URL}/api/bookings")
    assert r.status_code in (401, 403)


def test_date_validation():
    bad = {
        "stay": "whatever",
        "name": "x",
        "email": "x@example.com",
        "check_in": "2026-02-10",
        "check_out": "2026-02-10",
        "guests": 1,
    }
    r = requests.post(f"{BASE_URL}/api/bookings", json=bad, headers=_origin_headers())
    assert r.status_code == 422
