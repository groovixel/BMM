"""Guest booking confirmation email + guardrail for undeliverable guest email."""
import os
import uuid
import time
import subprocess
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://import-main-branch.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ORIGIN = "https://import-main-branch.preview.emergentagent.com"


def _future(days):
    import datetime as dt
    return (dt.date.today() + dt.timedelta(days=days)).isoformat()


def _register(email):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Origin": ORIGIN})
    r = s.post(f"{API}/auth/register", json={"name": "TEST GuestConf", "email": email, "password": "secret123"})
    assert r.status_code in (200, 201), r.text
    return s


def _tail_backend_log(n=400):
    try:
        out = subprocess.check_output(["tail", "-n", str(n), "/var/log/supervisor/backend.err.log"], text=True)
    except Exception:
        out = ""
    try:
        out += "\n" + subprocess.check_output(["tail", "-n", str(n), "/var/log/supervisor/backend.out.log"], text=True)
    except Exception:
        pass
    return out


def test_booking_sends_owner_and_guest_confirmation_delivered_resend():
    """Guest = delivered@resend.dev — both owner + guest emails should log success."""
    guest_email = "delivered@resend.dev"
    # Register a fresh account owner but use delivered@resend.dev as the booking contact email
    reg_email = f"TEST_conf_{uuid.uuid4().hex[:8]}@example.com"
    s = _register(reg_email)
    ci, co = _future(90), _future(92)
    payload = {
        "stay": "The Living Studio", "stay_slug": "living-studio", "mode": "instant",
        "check_in": ci, "check_out": co,
        "adults": 2, "children": 0, "infants": 0, "pets": 0, "capacity": 6, "nightly": 28000,
        "name": "TEST GuestConf", "email": guest_email, "phone": "+911234567890",
        "message": "TEST pytest confirmation email"
    }
    r = s.post(f"{API}/stays/bookings", json=payload, headers={"Origin": ORIGIN})
    assert r.status_code == 201, r.text
    ref = r.json()["reference"]
    bid = r.json()["id"]
    # Give email proxy a moment
    time.sleep(3)
    logs = _tail_backend_log(600)
    assert "info@bdsmarvel.com" in logs, "owner notification log line missing"
    assert f"Guest booking confirmation emailed to {guest_email}" in logs, "guest confirmation log line missing"
    assert ref in logs
    print(f"OK booking {ref} id={bid} — both emails logged")


def test_booking_still_201_with_undeliverable_guest_email():
    """nobody@example.com — proxy rejects (422), but booking must still succeed."""
    reg_email = f"TEST_bad_{uuid.uuid4().hex[:8]}@example.com"
    s = _register(reg_email)
    bad_guest = f"nobody_{uuid.uuid4().hex[:6]}@example.com"
    ci, co = _future(100), _future(102)
    payload = {
        "stay": "The Oak Apartment", "stay_slug": "oak-apartment", "mode": "request",
        "check_in": ci, "check_out": co,
        "adults": 2, "children": 0, "infants": 0, "pets": 0, "capacity": 4, "nightly": 10500,
        "name": "TEST BadEmail", "email": bad_guest, "phone": "+911234567890",
        "message": "TEST undeliverable"
    }
    r = s.post(f"{API}/stays/bookings", json=payload, headers={"Origin": ORIGIN})
    assert r.status_code == 201, r.text
    time.sleep(2)
    logs = _tail_backend_log(400)
    # Should still log owner notification OK
    assert "info@bdsmarvel.com" in logs
    # And log a failure for guest confirmation (error line)
    assert ("guest confirmation email failed" in logs) or ("Guest booking confirmation emailed to " + bad_guest in logs is False)
    print("OK booking persisted despite undeliverable guest email")
