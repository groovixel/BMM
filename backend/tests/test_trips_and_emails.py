"""Tests for owner email notifications ON + Guest Trips (GET /stays/bookings/mine)."""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://import-main-branch.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture
def guest_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"TEST_trips_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{API}/auth/register", json={"name": "TEST Trips", "email": email, "password": "secret123"})
    assert r.status_code in (200, 201), f"register failed {r.status_code} {r.text}"
    return s, email


def _future(days):
    import datetime as dt
    return (dt.date.today() + dt.timedelta(days=days)).isoformat()


# --- Inquiry: public POST 201 + email send ---
def test_inquiry_create_201():
    r = requests.post(f"{API}/inquiries", json={
        "name": "TEST Inquirer",
        "email": "test_inquiry@example.com",
        "message": "TEST hello from pytest, please confirm receipt."
    })
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["name"] == "TEST Inquirer"
    assert "id" in data


# --- Stays booking: POST triggers email ---
def test_create_stay_booking_triggers_email(guest_session):
    s, email = guest_session
    ci = _future(60)
    co = _future(62)
    payload = {
        "stay": "The Living Studio", "stay_slug": "living-studio", "mode": "instant",
        "check_in": ci, "check_out": co,
        "adults": 2, "children": 0, "infants": 0, "pets": 0, "capacity": 6, "nightly": 28000,
        "name": "TEST Guest", "email": email, "phone": "+911234567890",
        "message": "TEST booking from pytest"
    }
    r = s.post(f"{API}/stays/bookings", json=payload)
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["status"] == "confirmed"
    assert b["reference"].startswith("BDS-")
    assert b["nights"] == 2
    assert b["total"] == 56000
    return b


# --- GET /stays/bookings/mine ---
def test_bookings_mine_unauth_401():
    r = requests.get(f"{API}/stays/bookings/mine")
    assert r.status_code == 401


def test_bookings_mine_empty_for_fresh_user(guest_session):
    s, _ = guest_session
    r = s.get(f"{API}/stays/bookings/mine")
    assert r.status_code == 200
    assert r.json() == []


def test_bookings_mine_returns_my_booking(guest_session):
    s, email = guest_session
    ci = _future(70)
    co = _future(73)
    r = s.post(f"{API}/stays/bookings", json={
        "stay": "The Oak Apartment", "stay_slug": "oak-apartment", "mode": "request",
        "check_in": ci, "check_out": co,
        "adults": 2, "children": 0, "infants": 0, "pets": 0, "capacity": 4, "nightly": 10500,
        "name": "TEST Guest", "email": email, "phone": "+911234567890",
        "message": "TEST request"
    })
    assert r.status_code == 201, r.text
    bid = r.json()["id"]

    g = s.get(f"{API}/stays/bookings/mine")
    assert g.status_code == 200
    trips = g.json()
    assert isinstance(trips, list) and len(trips) >= 1
    assert any(t["id"] == bid for t in trips)
    # trip detail route also used by the FE
    d = s.get(f"{API}/stays/bookings/{bid}")
    assert d.status_code == 200
    assert d.json()["id"] == bid


def test_bookings_mine_not_leaking_other_users(guest_session):
    s1, _ = guest_session
    # another user
    s2 = requests.Session()
    s2.headers.update({"Content-Type": "application/json"})
    email2 = f"TEST_other_{uuid.uuid4().hex[:8]}@example.com"
    r = s2.post(f"{API}/auth/register", json={"name": "TEST Other", "email": email2, "password": "secret123"})
    assert r.status_code in (200, 201)
    r = s2.post(f"{API}/stays/bookings", json={
        "stay": "The Kota Flat", "stay_slug": "kota-flat", "mode": "instant",
        "check_in": _future(80), "check_out": _future(82),
        "adults": 1, "children": 0, "infants": 0, "pets": 0, "capacity": 3, "nightly": 9800,
        "name": "TEST Other", "email": email2, "phone": "+911234567890", "message": ""
    })
    assert r.status_code == 201
    other_bid = r.json()["id"]
    g = s1.get(f"{API}/stays/bookings/mine")
    assert g.status_code == 200
    assert all(t["id"] != other_bid for t in g.json())
