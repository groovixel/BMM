"""Security audit regression tests - iteration 14.

Covers: admin creds rotation, auth (register/login/me/status/logout), guest booking,
public forms, upload safety (magic bytes + ext), file download authZ+headers,
origin guard, brute-force lockout, security headers, removed /status endpoints,
and (last) public form rate limits.
"""
import io
import os
import struct
import zlib
import pytest
import requests
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://bdsm-project-2.preview.emergentagent.com"
API = f"{BASE_URL}/api"
ADMIN_EMAIL = os.environ["ADMIN_EMAIL"]
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]
ALLOWED_ORIGIN = os.environ.get("CORS_ORIGINS", BASE_URL).split(",")[0].strip().rstrip("/")


# ---------- helpers ----------
def _png_bytes():
    # 1x1 transparent PNG, valid magic bytes
    sig = b"\x89PNG\r\n\x1a\n"
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0))
    idat_data = zlib.compress(b"\x00\x00\x00\x00\x00")
    idat = chunk(b"IDAT", idat_data)
    iend = chunk(b"IEND", b"")
    return sig + ihdr + idat + iend


def _pdf_bytes():
    return b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
               headers={"Origin": ALLOWED_ORIGIN})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    assert r.json().get("role") == "admin"
    return s


# ---------- 1. Admin credential rotation ----------
class TestAdminCreds:
    def test_old_admin_password_rejected(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "Admin@123"},
                          headers={"Origin": ALLOWED_ORIGIN})
        assert r.status_code == 401, f"old password should be rejected, got {r.status_code}"

    def test_new_admin_password_works(self, admin_session):
        r = admin_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        body = r.json()
        assert body["email"].lower() == ADMIN_EMAIL.lower()
        assert body["role"] == "admin"


# ---------- 2. Admin dashboard data endpoints ----------
class TestAdminDashboard:
    def test_overview(self, admin_session):
        r = admin_session.get(f"{API}/admin/overview")
        assert r.status_code == 200
        for key in ("pending_requests", "upcoming_stays", "total_bookings", "total_enquiries"):
            assert key in r.json()

    def test_enquiries(self, admin_session):
        r = admin_session.get(f"{API}/admin/enquiries")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_bookings(self, admin_session):
        r = admin_session.get(f"{API}/admin/bookings")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_anon_admin_forbidden(self):
        r = requests.get(f"{API}/admin/overview")
        assert r.status_code == 401


# ---------- 3. Guest auth flows ----------
class TestGuestAuth:
    def test_register_password_too_short_api_422(self):
        import uuid
        r = requests.post(f"{API}/auth/register",
                          json={"name": "T", "email": f"t_{uuid.uuid4().hex[:8]}@test.io", "password": "short7!"},
                          headers={"Origin": ALLOWED_ORIGIN})
        assert r.status_code == 422

    def test_register_login_me_logout(self):
        import uuid
        email = f"guest_{uuid.uuid4().hex[:10]}@test.io"
        pwd = "Password123!"
        s = requests.Session()
        r = s.post(f"{API}/auth/register", json={"name": "Guest", "email": email, "password": pwd},
                   headers={"Origin": ALLOWED_ORIGIN})
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "guest"
        # me via cookie
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 200
        # status
        r = s.get(f"{API}/auth/status")
        assert r.status_code == 200 and r.json().get("user") is not None
        # logout
        r = s.post(f"{API}/auth/logout", headers={"Origin": ALLOWED_ORIGIN})
        assert r.status_code == 200
        # fresh login
        s2 = requests.Session()
        r = s2.post(f"{API}/auth/login", json={"email": email, "password": pwd},
                    headers={"Origin": ALLOWED_ORIGIN})
        assert r.status_code == 200

    def test_auth_status_anon(self):
        r = requests.get(f"{API}/auth/status")
        assert r.status_code == 200
        assert r.json().get("user") is None


# ---------- 4. Guest booking creation ----------
class TestStaysBooking:
    def test_logged_in_guest_creates_booking(self):
        import uuid
        email = f"stays_{uuid.uuid4().hex[:10]}@test.io"
        s = requests.Session()
        r = s.post(f"{API}/auth/register", json={"name": "Stay Guest", "email": email, "password": "Password123!"},
                   headers={"Origin": ALLOWED_ORIGIN})
        assert r.status_code == 200
        payload = {
            "stay": "Test Stay", "stay_slug": "test-stay", "mode": "request",
            "check_in": "2027-01-10", "check_out": "2027-01-12",
            "adults": 2, "children": 0, "infants": 0, "pets": 0,
            "capacity": 4, "nightly": 5000,
            "name": "Stay Guest", "email": email, "phone": "+911234567890",
            "message": "TEST_booking"
        }
        r = s.post(f"{API}/stays/bookings", json=payload, headers={"Origin": ALLOWED_ORIGIN})
        assert r.status_code == 201, f"booking failed: {r.status_code} {r.text}"
        bid = r.json().get("id")
        trips = s.get(f"{API}/stays/bookings/mine")
        assert trips.status_code == 200
        assert any(b.get("id") == bid for b in trips.json())


# ---------- 5. Public forms ----------
class TestPublicForms:
    def test_inquiry(self):
        import uuid
        r = requests.post(f"{API}/inquiries", json={
            "name": "TEST", "email": f"i_{uuid.uuid4().hex[:6]}@t.io",
            "phone": "+911234567890", "message": "TEST_hello world"
        }, headers={"Origin": ALLOWED_ORIGIN})
        assert r.status_code == 201, r.text

    def test_product_inquiry(self):
        import uuid
        r = requests.post(f"{API}/product-inquiries", json={
            "name": "TEST", "email": f"p_{uuid.uuid4().hex[:6]}@t.io",
            "phone": "+911234567890", "brand": "TestBrand", "product": "Test Product",
            "message": "TEST_product_inquiry_message"
        }, headers={"Origin": ALLOWED_ORIGIN})
        assert r.status_code in (200, 201), r.text

    def test_sample_request(self):
        import uuid
        r = requests.post(f"{API}/sample-requests", json={
            "name": "TEST", "email": f"s_{uuid.uuid4().hex[:6]}@t.io",
            "phone": "+911234567890", "product": "Sample Product",
            "address": "123 Test Street, Floor 4", "city": "Mumbai",
            "pincode": "400001"
        }, headers={"Origin": ALLOWED_ORIGIN})
        assert r.status_code in (200, 201), r.text


# ---------- 6. Upload safety ----------
class TestUploadSafety:
    def test_reject_text_as_png(self):
        files = {"file": ("fake.png", io.BytesIO(b"not a real png"), "image/png")}
        r = requests.post(f"{API}/consultations/upload", files=files, headers={"Origin": ALLOWED_ORIGIN})
        assert r.status_code == 415, f"expected 415, got {r.status_code}"

    def test_reject_disallowed_extension(self):
        files = {"file": ("evil.exe", io.BytesIO(b"MZ\x90\x00"), "application/octet-stream")}
        r = requests.post(f"{API}/consultations/upload", files=files, headers={"Origin": ALLOWED_ORIGIN})
        assert r.status_code == 415

    def test_accept_real_png(self, admin_session):
        files = {"file": ("ok.png", io.BytesIO(_png_bytes()), "image/png")}
        r = requests.post(f"{API}/consultations/upload", files=files, headers={"Origin": ALLOWED_ORIGIN})
        assert r.status_code == 200, r.text
        file_id = r.json()["id"]
        # anonymous download forbidden
        anon = requests.get(f"{API}/files/{file_id}")
        assert anon.status_code == 401
        # admin download
        adm = admin_session.get(f"{API}/files/{file_id}")
        assert adm.status_code == 200
        assert "attachment" in adm.headers.get("content-disposition", "").lower()
        assert adm.headers.get("x-content-type-options", "").lower() == "nosniff"

    def test_accept_real_pdf(self):
        files = {"file": ("doc.pdf", io.BytesIO(_pdf_bytes()), "application/pdf")}
        r = requests.post(f"{API}/consultations/upload", files=files, headers={"Origin": ALLOWED_ORIGIN})
        assert r.status_code == 200, r.text


# ---------- 7. Origin guard ----------
class TestOriginGuard:
    def test_post_evil_origin_blocked(self):
        r = requests.post(f"{API}/inquiries",
                          json={"name": "x", "email": "x@x.io", "phone": "+911234567890", "message": "evil"},
                          headers={"Origin": "https://evil.com"})
        assert r.status_code == 403

    def test_get_evil_origin_no_cors_header(self):
        r = requests.get(f"{API}/", headers={"Origin": "https://evil.com"})
        # middleware allows GETs through, CORS header must NOT echo evil origin
        assert r.headers.get("Access-Control-Allow-Origin") not in ("https://evil.com", "*")

    def test_same_origin_post_ok(self):
        import uuid
        r = requests.post(f"{API}/inquiries", json={
            "name": "ok", "email": f"ok_{uuid.uuid4().hex[:6]}@t.io",
            "phone": "+911234567890", "message": "TEST_same_origin"
        }, headers={"Origin": ALLOWED_ORIGIN})
        assert r.status_code == 201


# ---------- 8. Security headers ----------
class TestSecurityHeaders:
    def test_headers_on_api(self):
        r = requests.get(f"{API}/")
        h = {k.lower(): v for k, v in r.headers.items()}
        assert h.get("x-frame-options", "").upper() == "DENY"
        assert "max-age" in h.get("strict-transport-security", "").lower()
        assert h.get("x-content-type-options", "").lower() == "nosniff"
        assert "strict-origin" in h.get("referrer-policy", "").lower()


# ---------- 9. Removed /status endpoints ----------
class TestRemovedStatus:
    def test_status_get(self):
        r = requests.get(f"{API}/status")
        assert r.status_code in (404, 405)

    def test_status_post(self):
        r = requests.post(f"{API}/status", json={"client_name": "x"}, headers={"Origin": ALLOWED_ORIGIN})
        assert r.status_code in (404, 405)


# ---------- 10. Login brute-force lockout ----------
class TestLoginBruteForce:
    def test_five_bad_attempts_locks(self):
        import uuid
        email = f"bf_{uuid.uuid4().hex[:10]}@test.io"
        # register so account exists
        requests.post(f"{API}/auth/register", json={"name": "BF", "email": email, "password": "Password123!"},
                      headers={"Origin": ALLOWED_ORIGIN})
        codes = []
        for _ in range(6):
            r = requests.post(f"{API}/auth/login", json={"email": email, "password": "WrongPwd!!"},
                              headers={"Origin": ALLOWED_ORIGIN})
            codes.append(r.status_code)
        # First 5 should be 401; subsequent attempt should be 429
        assert 429 in codes, f"expected 429 in brute force sequence, got {codes}"


# ---------- 11. Public rate limits (run LAST - will block IP) ----------
class TestRateLimitsLast:
    """Run last — exhausts the per-IP bucket and causes 429s for the remainder."""
    @pytest.mark.order(-1)
    def test_inquiries_rate_limited_after_5(self):
        import uuid
        codes = []
        for _ in range(7):
            r = requests.post(f"{API}/inquiries", json={
                "name": "TEST", "email": f"rl_{uuid.uuid4().hex[:6]}@t.io",
                "phone": "+911234567890", "message": "TEST_rate_limit"
            }, headers={"Origin": ALLOWED_ORIGIN})
            codes.append(r.status_code)
        assert 429 in codes, f"expected 429 after 5 submits, got {codes}"
