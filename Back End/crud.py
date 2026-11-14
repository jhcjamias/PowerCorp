"""
Rolaz Cutz Barbershop API
-------------------------
Implements CUSTOMER_API_CONTRACT.md (customer site) and the admin routes in
Front End/docs/admin-api-contract.md that share the same appointment records.

Project dependencies:
    creds.py       -> Creds() with conString, userName, password, dbName
    sqlhelper.py   -> create_connection, execute_query, execute_read_query

Database: run migrations/001_customer_api.sql once before starting this app.

Environment variables (all optional in development):
    APP_ENV                 "production" turns on production rules (default development)
    APP_SECRET_KEY          required in production; signs SMS code hashes
    DB_HOST / DB_USER / DB_PASSWORD / DB_NAME / DB_PORT   override creds.py (tests)
    CORS_ORIGINS            comma-separated approved frontend origins
    COOKIE_SECURE           "true"/"false" (default true in production)
    COOKIE_SAMESITE         Lax (default), Strict, or None (cross-site; needs Secure)
    TRUST_PROXY_HOPS        number of reverse proxies in front of the app (default 0)
    POLICY_VERSION          current Appointment & Payment Policy version
    BARBER_STAFF_ID         Staff row that owns the single chair
    TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_VERIFY_SERVICE_SID
    GOOGLE_PLACES_API_KEY / GOOGLE_PLACE_ID / GOOGLE_REVIEWS_URL
    INSTAGRAM_ACCESS_TOKEN
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from functools import wraps
from zoneinfo import ZoneInfo

import flask
from flask import g, jsonify, request
from flask_cors import CORS
from mysql.connector import Error
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

import creds
from sqlhelper import create_connection, execute_query, execute_read_query


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

def env_flag(name, default):
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in ("1", "true", "yes")


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

IS_PRODUCTION = os.getenv("APP_ENV", "development").strip().lower() == "production"

SECRET_KEY = os.getenv("APP_SECRET_KEY", "").encode()
if not SECRET_KEY:
    if IS_PRODUCTION:
        raise RuntimeError("APP_SECRET_KEY must be set in production.")
    SECRET_KEY = secrets.token_bytes(32)
    logger.warning("APP_SECRET_KEY is not set; using a temporary development key.")

SHOP_TZ_NAME = "America/Chicago"
SHOP_TZ = ZoneInfo(SHOP_TZ_NAME)
POLICY_VERSION = os.getenv("POLICY_VERSION", "2026-11-11")
SLOT_STEP_MINUTES = 15
MAX_NOTES_LENGTH = 1000

BUSINESS = {
    "name": "Rolaz Cutz Barbershop",
    "address": "20260 Katy Freeway Suite #116, Katy, TX 77449",
    "phone": "+1 832-874-8680",
    "email": "rolazcutz@gmail.com",
}

# Real opening hours in shop-local minutes after midnight; 0 = Sunday.
# A Weekly_Hours row for the barber overrides the matching day.
DEFAULT_WEEKLY_HOURS = {
    0: None,
    1: None,
    2: (660, 1140),
    3: (660, 1140),
    4: (600, 1170),
    5: (540, 1185),
    6: (540, 900),
}
DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

# Customer sessions (cookie) and admin sessions (bearer token) are separate.
CUSTOMER_COOKIE = "rolaz_customer_session"
CUSTOMER_SESSION_DAYS = 30
ADMIN_SESSION_HOURS = 12
COOKIE_SECURE = env_flag("COOKIE_SECURE", IS_PRODUCTION)
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "Lax").strip().capitalize()
if COOKIE_SAMESITE not in ("Lax", "Strict", "None"):
    raise RuntimeError("COOKIE_SAMESITE must be Lax, Strict, or None.")
if COOKIE_SAMESITE == "None" and not COOKIE_SECURE:
    raise RuntimeError("COOKIE_SAMESITE=None requires COOKIE_SECURE=true.")

# SMS verification rules.
OTP_TTL_SECONDS = 600
OTP_RESEND_SECONDS = 30
OTP_MAX_ATTEMPTS = 5
OTP_MAX_PER_PHONE_PER_HOUR = 5
OTP_MAX_PER_IP_PER_HOUR = 20

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_VERIFY_SERVICE_SID = os.getenv("TWILIO_VERIFY_SERVICE_SID", "")

GOOGLE_PLACES_API_KEY = os.getenv("GOOGLE_PLACES_API_KEY", "")
GOOGLE_PLACE_ID = os.getenv("GOOGLE_PLACE_ID", "")
GOOGLE_REVIEWS_URL = os.getenv(
    "GOOGLE_REVIEWS_URL",
    "https://www.google.com/maps/search/?api=1&query=Rolaz%20Cutz%20Barbershop%20Katy%20TX",
)
INSTAGRAM_PROFILE_URL = "https://www.instagram.com/rolaz_cutz/"
PROVIDER_CACHE_SECONDS = 15 * 60
PROVIDER_FAILURE_CACHE_SECONDS = 60

DEFAULT_ORIGINS = [
    "http://localhost:5173", "http://127.0.0.1:5173",   # admin (Vite)
    "http://localhost:5500", "http://127.0.0.1:5500",   # customer site (Live Server)
    "http://localhost:8000", "http://127.0.0.1:8000",
]
ALLOWED_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv("CORS_ORIGINS", ",".join(DEFAULT_ORIGINS)).split(",")
    if origin.strip()
]
if "*" in ALLOWED_ORIGINS:
    raise RuntimeError("CORS_ORIGINS cannot contain '*' because the API uses credentials.")


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = flask.Flask(__name__)
app.config["JSON_SORT_KEYS"] = False
app.config["DEBUG"] = os.getenv("FLASK_DEBUG", "false").lower() == "true"

proxy_hops = int(os.getenv("TRUST_PROXY_HOPS", "0"))
if proxy_hops > 0:
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=proxy_hops, x_proto=proxy_hops)

# Credentialed CORS only for approved origins, never a wildcard.
CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=True)

my_creds = creds.Creds()
DB_SETTINGS = (
    os.getenv("DB_HOST") or my_creds.conString,
    os.getenv("DB_USER") or my_creds.userName,
    os.getenv("DB_PASSWORD") or my_creds.password,
    os.getenv("DB_NAME") or my_creds.dbName,
    int(os.getenv("DB_PORT", "3306")),
)


class ApiError(Exception):
    """An error with a status code and a plain-English message for the client."""

    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


# ---------------------------------------------------------------------------
# Database access
# ---------------------------------------------------------------------------
# Each request gets its own connection. A single shared connection would let
# two requests share one transaction, which defeats the booking lock.

def db():
    if "db" not in g:
        connection = create_connection(*DB_SETTINGS)
        if connection is None or not connection.is_connected():
            raise ApiError(503, "The booking system is temporarily unavailable. Please try again shortly.")
        cursor = connection.cursor()
        cursor.execute("SET time_zone = '+00:00'")  # all DATETIME values are UTC
        cursor.close()
        g.db = connection
    return g.db


@app.teardown_appcontext
def close_db(_error):
    connection = g.pop("db", None)
    if connection is not None:
        try:
            if connection.in_transaction:
                connection.rollback()
            connection.close()
        except Error:
            logger.exception("Could not close the database connection.")


def read(sql, params=None):
    return execute_read_query(db(), sql, tuple(params) if params is not None else None)


def write(sql, params=None, commit=True):
    return execute_query(db(), sql, tuple(params) if params is not None else None, commit=commit)


@contextmanager
def transaction():
    """
    Run statements as one READ COMMITTED transaction. Use write(..., commit=False)
    inside it. READ COMMITTED means every read sees rows committed by other
    requests, including rows committed while this one waited for a lock.
    """
    connection = db()
    if connection.in_transaction:
        connection.commit()  # end the implicit transaction left by earlier reads
    connection.start_transaction(isolation_level="READ COMMITTED")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise


def is_duplicate_key(error):
    return getattr(error, "errno", None) == 1062


# ---------------------------------------------------------------------------
# General helpers
# ---------------------------------------------------------------------------

def clean(rows):
    """Convert MySQL values into JSON-serializable Python values."""
    cleaned_rows = []
    for row in rows or []:
        item = {}
        for key, value in row.items():
            if isinstance(value, Decimal):
                value = float(value)
            elif isinstance(value, datetime):
                value = value.strftime("%Y-%m-%d %H:%M:%S")
            elif isinstance(value, date):
                value = value.isoformat()
            elif isinstance(value, timedelta):
                value = str(value)
            item[key] = value
        cleaned_rows.append(item)
    return cleaned_rows


def json_body():
    """Return the request's JSON object, or raise 400."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "The request body must be a JSON object.")
    return data


def required_int(data, field, minimum=1):
    value = data.get(field)
    if isinstance(value, bool):
        raise ApiError(400, f"{field} must be a whole number.")
    try:
        value = int(value)
    except (TypeError, ValueError):
        raise ApiError(400, f"{field} must be a whole number.")
    if value < minimum:
        raise ApiError(400, f"{field} must be at least {minimum}.")
    return value


def required_text(data, field):
    value = data.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ApiError(400, f"{field} is required.")
    return value.strip()


def sha256_hex(value):
    return hashlib.sha256(value.encode()).hexdigest()


def utc_now():
    """Current time as a naive UTC datetime, the format stored in MySQL."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def shop_today():
    return datetime.now(SHOP_TZ).date()


def shop_day_index(day):
    """Sunday = 0 ... Saturday = 6, matching the API's schedule keys."""
    return (day.weekday() + 1) % 7


def local_to_utc(day, minutes):
    """Shop-local date plus minutes after midnight -> naive UTC datetime."""
    hour, minute = divmod(minutes, 60)
    local = datetime(day.year, day.month, day.day, hour, minute, tzinfo=SHOP_TZ)
    return local.astimezone(timezone.utc).replace(tzinfo=None)


def utc_to_local(value):
    return value.replace(tzinfo=timezone.utc).astimezone(SHOP_TZ)


def local_minutes(value_utc, day):
    """Minutes between the shop-local midnight of `day` and a UTC datetime."""
    local = utc_to_local(value_utc)
    return (local.date() - day).days * 1440 + local.hour * 60 + local.minute


def parse_date(value, field="date"):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ApiError(400, f"{field} must use YYYY-MM-DD format.")
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ApiError(400, f"{field} is not a real calendar date.")


def parse_hhmm(value, field="time"):
    """'13:15' -> 795 minutes after midnight."""
    if not isinstance(value, str) or not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", value):
        raise ApiError(400, f"{field} must use 24-hour HH:MM format.")
    hours, minutes = value.split(":")
    return int(hours) * 60 + int(minutes)


def parse_local_datetime(value, field):
    """'YYYY-MM-DD HH:MM:SS' in shop time -> naive UTC datetime."""
    try:
        local = datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    except (TypeError, ValueError):
        raise ApiError(400, f"{field} must use YYYY-MM-DD HH:MM:SS format.")
    return local.replace(tzinfo=SHOP_TZ).astimezone(timezone.utc).replace(tzinfo=None)


def minutes_to_label(minutes):
    hour, minute = divmod(minutes, 60)
    suffix = "AM" if hour < 12 else "PM"
    return f"{(hour % 12) or 12}:{minute:02d} {suffix}"


def dollars(cents):
    """Integer cents -> dollars for the admin-compatible appointment shape."""
    cents = int(cents or 0)
    return cents // 100 if cents % 100 == 0 else round(cents / 100, 2)


def normalize_phone(value):
    """Return an E.164 phone number. Ten-digit numbers are treated as US."""
    message = "Please enter a valid phone number."
    if not isinstance(value, str) or not re.fullmatch(r"[\d\s().+-]{7,25}", value.strip()):
        raise ApiError(400, message)
    raw = value.strip()
    digits = re.sub(r"\D", "", raw)
    if raw.startswith("+"):
        e164 = "+" + digits
    elif len(digits) == 10:
        e164 = "+1" + digits
    elif len(digits) == 11 and digits.startswith("1"):
        e164 = "+" + digits
    else:
        raise ApiError(400, message)
    if not re.fullmatch(r"\+[1-9]\d{7,14}", e164):
        raise ApiError(400, message)
    if e164.startswith("+1") and not re.fullmatch(r"\+1[2-9]\d{2}[2-9]\d{6}", e164):
        raise ApiError(400, message)
    return e164


def try_normalize_phone(value):
    try:
        return normalize_phone(value)
    except ApiError:
        return None


def national_phone(value):
    """The admin contract uses 10 digits for US numbers."""
    e164 = try_normalize_phone(value or "")
    if e164 and e164.startswith("+1") and len(e164) == 12:
        return e164[2:]
    return e164 or (value or "")


def validate_name(value):
    if not isinstance(value, str):
        raise ApiError(400, "Please enter your name.")
    name = " ".join(value.split())
    if not name:
        raise ApiError(400, "Please enter your name.")
    if len(name) > 100:
        raise ApiError(400, "Name must be 100 characters or fewer.")
    first, _, last = name.partition(" ")
    if len(first) > 50 or len(last) > 50:
        raise ApiError(400, "Please shorten your name.")
    return name


def split_name(name):
    first, _, last = name.partition(" ")
    return first, last


def validate_optional_email(value):
    if value is None:
        return None
    if not isinstance(value, str):
        raise ApiError(400, "Please enter a valid email address.")
    email = value.strip()
    if not email:
        return None
    if len(email) > 100 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise ApiError(400, "Please enter a valid email address.")
    return email


def validate_notes(value):
    if value in (None, ""):
        return ""
    if not isinstance(value, str):
        raise ApiError(400, "notes must be text.")
    if len(value) > MAX_NOTES_LENGTH:
        raise ApiError(400, f"Notes must be {MAX_NOTES_LENGTH} characters or fewer.")
    return value.strip()


def client_ip():
    return (request.remote_addr or "unknown")[:45]


# ---------------------------------------------------------------------------
# Error handling and request guards
# ---------------------------------------------------------------------------

@app.errorhandler(ApiError)
def handle_api_error(error):
    return jsonify({"message": error.message}), error.status


@app.errorhandler(Error)
def handle_database_error(error):
    logger.exception("Database operation failed: %s", error)
    return jsonify({"message": "Something went wrong on our end. Please try again."}), 500


@app.errorhandler(HTTPException)
def handle_http_error(error):
    messages = {
        404: "That endpoint or record was not found.",
        405: "That HTTP method is not allowed for this endpoint.",
    }
    return jsonify({"message": messages.get(error.code, error.description)}), error.code


@app.errorhandler(Exception)
def handle_unexpected_error(error):
    logger.exception("Unexpected server error: %s", error)
    return jsonify({"message": "Something went wrong on our end. Please try again."}), 500


@app.before_request
def reject_cross_site_writes():
    """
    Customer routes authenticate with a cookie, so refuse state-changing
    requests sent from an unapproved site (CSRF protection on top of SameSite).
    """
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return None
    if not request.path.startswith("/api/customer/"):
        return None
    origin = request.headers.get("Origin")
    if origin is None:
        return None  # not a browser cross-site request
    allowed = set(ALLOWED_ORIGINS) | {request.host_url.rstrip("/")}
    if origin.rstrip("/") not in allowed:
        return jsonify({"message": "This request was blocked because it came from an unapproved site."}), 403
    return None


@app.route("/", methods=["GET"])
def home():
    return jsonify({"application": "Rolaz Cutz API", "status": "running"})


# ---------------------------------------------------------------------------
# Catalog: services and upgrades
# ---------------------------------------------------------------------------

def load_catalog():
    """Return {slug: item} for every Service row, with upgrade compatibility."""
    rows = read(
        """
        SELECT service_id, slug, kind, name, description, price_cents,
               duration_minutes, is_active, display_order
        FROM Service
        ORDER BY display_order, name
        """
    )
    compat = read(
        """
        SELECT c.upgrade_id, s.slug, s.is_active
        FROM Service_Upgrade_Compatibility c
        JOIN Service s ON s.service_id = c.service_id
        ORDER BY s.display_order, s.name
        """
    )
    by_id = {}
    catalog = {}
    for row in rows:
        item = {
            "service_id": row["service_id"],
            "slug": row["slug"],
            "kind": row["kind"],
            "name": row["name"],
            "description": row["description"] or "",
            "price_cents": int(row["price_cents"]),
            "duration": int(row["duration_minutes"]),
            "active": bool(row["is_active"]),
            "service_ids": [],
            "active_service_ids": [],
        }
        catalog[row["slug"]] = item
        by_id[row["service_id"]] = item
    for row in compat:
        upgrade = by_id.get(row["upgrade_id"])
        if upgrade is not None:
            upgrade["service_ids"].append(row["slug"])
            if row["is_active"]:
                upgrade["active_service_ids"].append(row["slug"])
    return catalog


def build_quote(catalog, service_slug, upgrade_slugs):
    """
    Validate a service/upgrade combination against the database and return
    the trusted lines, total price, and total duration.
    """
    service = catalog.get(service_slug) if isinstance(service_slug, str) else None
    if not service or service["kind"] != "service" or not service["active"]:
        raise ApiError(400, "Please choose a service.")
    if not isinstance(upgrade_slugs, list) or not all(isinstance(s, str) for s in upgrade_slugs):
        raise ApiError(400, "Please choose valid Upgradez.")
    if len(set(upgrade_slugs)) != len(upgrade_slugs):
        raise ApiError(400, "Each upgrade can be selected only once.")

    upgrades = []
    for slug in upgrade_slugs:
        upgrade = catalog.get(slug)
        if not upgrade or upgrade["kind"] != "upgrade" or not upgrade["active"]:
            raise ApiError(400, "One or more selected Upgradez are unavailable.")
        if service["slug"] not in upgrade["service_ids"]:
            raise ApiError(400, f"{upgrade['name']} is not available with {service['name']}.")
        upgrades.append(upgrade)

    lines = [service] + upgrades
    return {
        "lines": lines,
        "price_cents": sum(line["price_cents"] for line in lines),
        "duration": sum(line["duration"] for line in lines),
    }


def quote_from_ids(catalog, ids):
    """Quote from a flat list of IDs: exactly one main service plus upgrades."""
    if not isinstance(ids, list) or not ids or not all(isinstance(i, str) for i in ids):
        raise ApiError(400, "Please choose a service.")
    main = [i for i in ids if catalog.get(i, {}).get("kind") == "service"]
    if len(main) != 1:
        raise ApiError(400, "Please choose exactly one main service.")
    return build_quote(catalog, main[0], [i for i in ids if i != main[0]])


def quote_from_snapshot(catalog, services):
    """Quote from the browser's services snapshot. Only the IDs are trusted."""
    if not isinstance(services, list) or not services:
        raise ApiError(400, "Please choose a service.")
    ids = []
    for item in services:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            raise ApiError(400, "Each service needs an id.")
        ids.append(item["id"])
    return quote_from_ids(catalog, ids)


def public_service(item):
    return {
        "id": item["slug"],
        "name": item["name"],
        "description": item["description"],
        "priceCents": item["price_cents"],
        "duration": item["duration"],
    }


def admin_service(item):
    result = {
        "id": item["slug"],
        "name": item["name"],
        "description": item["description"],
        "price": dollars(item["price_cents"]),
        "durationMin": item["duration"],
        "active": item["active"],
        "kind": item["kind"],
    }
    if item["kind"] == "upgrade":
        result["serviceIds"] = item["service_ids"]
    return result


@app.route("/api/public/services", methods=["GET"])
def public_services():
    catalog = load_catalog()
    return jsonify([
        public_service(item) for item in catalog.values()
        if item["kind"] == "service" and item["active"]
    ]), 200


@app.route("/api/public/upgrades", methods=["GET"])
def public_upgrades():
    catalog = load_catalog()
    result = []
    for item in catalog.values():
        if item["kind"] == "upgrade" and item["active"]:
            entry = public_service(item)
            entry["serviceIds"] = item["active_service_ids"]
            result.append(entry)
    return jsonify(result), 200


# ---------------------------------------------------------------------------
# Shop hours, time off, and availability
# ---------------------------------------------------------------------------

_barber_staff_id = None


def barber_staff_id():
    """The single barber whose chair every appointment books."""
    global _barber_staff_id
    if _barber_staff_id is None:
        configured = os.getenv("BARBER_STAFF_ID")
        if configured:
            _barber_staff_id = int(configured)
        else:
            rows = read(
                "SELECT staff_id FROM Staff ORDER BY role = 'barber' DESC, staff_id LIMIT 1"
            )
            if not rows:
                raise ApiError(503, "Online booking is not set up yet. Please call the shop.")
            _barber_staff_id = rows[0]["staff_id"]
    return _barber_staff_id


def weekly_schedule(staff_id):
    """{day_index: (open_minute, close_minute) or None}."""
    schedule = dict(DEFAULT_WEEKLY_HOURS)
    rows = read(
        """
        SELECT day_of_week, start_time, end_time, is_open
        FROM Weekly_Hours
        WHERE staff_id = %s
        """,
        (staff_id,),
    )
    for row in rows:
        day = int(row["day_of_week"])
        if day not in schedule:
            continue
        if not row["is_open"] or row["start_time"] is None or row["end_time"] is None:
            schedule[day] = None
        else:
            start = int(row["start_time"].total_seconds() // 60)
            end = int(row["end_time"].total_seconds() // 60)
            schedule[day] = (start, end) if end > start else None
    return schedule


def busy_intervals(staff_id, day, exclude_appointment_id=None):
    """Appointments and time off touching a shop-local day, as local minutes."""
    day_start = local_to_utc(day, 0)
    day_end = local_to_utc(day + timedelta(days=1), 0)

    sql = """
        SELECT start_time, end_time
        FROM Appointment
        WHERE staff_id = %s
          AND status <> 'canceled'
          AND start_time < %s
          AND end_time > %s
    """
    params = [staff_id, day_end, day_start]
    if exclude_appointment_id is not None:
        sql += " AND appointment_id <> %s"
        params.append(exclude_appointment_id)
    appointments = read(sql, params)

    time_off = read(
        """
        SELECT slot_start AS start_time, slot_end AS end_time
        FROM Time_Slot
        WHERE staff_id = %s
          AND is_blocked = 1
          AND slot_start < %s
          AND slot_end > %s
        """,
        (staff_id, day_end, day_start),
    )

    def to_minutes(rows):
        return [(local_minutes(r["start_time"], day), local_minutes(r["end_time"], day)) for r in rows]

    return to_minutes(appointments), to_minutes(time_off)


def overlaps(start, end, intervals):
    return any(start < other_end and other_start < end for other_start, other_end in intervals)


def compute_slots(staff_id, day, duration, exclude_appointment_id=None):
    hours = weekly_schedule(staff_id)[shop_day_index(day)]
    if not hours:
        return []
    appointments, time_off = busy_intervals(staff_id, day, exclude_appointment_id)
    busy = appointments + time_off
    bookable_day = day > shop_today()  # customers book future dates only
    slots = []
    for minute in range(hours[0], hours[1] - duration + 1, SLOT_STEP_MINUTES):
        available = bookable_day and not overlaps(minute, minute + duration, busy)
        slots.append({"time": minute, "available": available})
    return slots


def reserve_slot(staff_id, day, minute, duration, exclude_appointment_id=None, staff_booking=False):
    """
    Validate a time inside an open transaction and return (start_utc, end_utc).

    Locking the barber's Staff row first makes concurrent bookings for the same
    chair run one at a time, so the overlap check below cannot race.
    """
    if not read("SELECT staff_id FROM Staff WHERE staff_id = %s FOR UPDATE", (staff_id,)):
        raise ApiError(503, "Online booking is not set up yet. Please call the shop.")

    start_utc = local_to_utc(day, minute)
    end_utc = start_utc + timedelta(minutes=duration)

    if staff_booking:
        if start_utc <= utc_now():
            raise ApiError(400, "Appointments cannot be scheduled in the past.")
    elif day <= shop_today():
        raise ApiError(400, "Please choose a future appointment date.")

    hours = weekly_schedule(staff_id)[shop_day_index(day)]
    if not hours:
        raise ApiError(400, "The shop is closed on that day.")
    if minute < hours[0] or minute + duration > hours[1]:
        raise ApiError(400, "That time is outside the shop's opening hours.")

    appointments, time_off = busy_intervals(staff_id, day, exclude_appointment_id)
    if overlaps(minute, minute + duration, appointments):
        raise ApiError(409, "That time was just booked. Please choose another time.")
    if overlaps(minute, minute + duration, time_off):
        raise ApiError(409, "The shop is unavailable at that time. Please choose another time.")

    return start_utc, end_utc


@app.route("/api/public/business", methods=["GET"])
def public_business():
    schedule = weekly_schedule(barber_staff_id())
    hours = []
    for day in (1, 2, 3, 4, 5, 6, 0):  # Monday first, like the shop's sign
        window = schedule[day]
        text = "Closed" if not window else f"{minutes_to_label(window[0])} – {minutes_to_label(window[1])}"
        hours.append([DAY_NAMES[day], text])
    return jsonify({
        **BUSINESS,
        "timezone": SHOP_TZ_NAME,
        "schedule": {str(day): list(schedule[day]) if schedule[day] else None for day in range(7)},
        "hours": hours,
    }), 200


@app.route("/api/public/availability", methods=["GET"])
def public_availability():
    day = parse_date(request.args.get("date"))
    service_id = request.args.get("serviceId")
    if not service_id:
        raise ApiError(400, "serviceId is required.")
    upgrade_ids = [s.strip() for s in request.args.get("upgradeIds", "").split(",") if s.strip()]

    replaces_id = request.args.get("replacesId")
    if replaces_id:
        try:
            replaces_id = int(replaces_id)
        except ValueError:
            raise ApiError(400, "replacesId must be an appointment ID.")
    else:
        replaces_id = None

    quote = build_quote(load_catalog(), service_id, upgrade_ids)
    slots = compute_slots(barber_staff_id(), day, quote["duration"], replaces_id)
    return jsonify({"date": day.isoformat(), "timezone": SHOP_TZ_NAME, "slots": slots}), 200


# ---------------------------------------------------------------------------
# Appointment records (shared by customer and admin routes)
# ---------------------------------------------------------------------------

STATUS_TO_API = {
    "booked": "Booked",
    "completed": "Completed",
    "canceled": "Cancelled",
    "no_show": "No-show",
}
API_TO_STATUS = {value: key for key, value in STATUS_TO_API.items()}

APPOINTMENT_SELECT = """
    SELECT
        a.appointment_id,
        a.customer_id,
        a.start_time,
        a.end_time,
        a.status,
        a.notes,
        COALESCE(a.customer_name, TRIM(CONCAT(c.first_name, ' ', c.last_name))) AS customer_name,
        COALESCE(a.customer_phone, c.phone_e164, c.phone) AS customer_phone,
        COALESCE(a.customer_email, c.email) AS customer_email,
        a.payment_status,
        a.payment_method,
        a.receipt_sent,
        a.policy_version,
        (SELECT COUNT(*) FROM User_Upload u WHERE u.appointment_id = a.appointment_id)
            AS reference_photos
    FROM Appointment a
    LEFT JOIN Customer c ON c.customer_id = a.customer_id
"""


def fetch_appointments(where_sql="", params=(), order_sql=" ORDER BY a.start_time"):
    rows = read(APPOINTMENT_SELECT + where_sql + order_sql, params)
    if not rows:
        return []
    ids = [row["appointment_id"] for row in rows]
    placeholders = ", ".join(["%s"] * len(ids))
    line_rows = read(
        f"""
        SELECT
            aps.appointment_id,
            s.slug,
            COALESCE(aps.name_at_booking, s.name) AS name,
            COALESCE(aps.price_cents_at_booking, ROUND(aps.price_at_booking * 100), s.price_cents)
                AS price_cents,
            COALESCE(aps.duration_at_booking, s.duration_minutes) AS duration
        FROM Appointment_Service aps
        JOIN Service s ON s.service_id = aps.service_id
        WHERE aps.appointment_id IN ({placeholders})
        ORDER BY aps.appointment_id, aps.line_order, s.kind = 'upgrade', s.display_order
        """,
        ids,
    )
    lines = {}
    for line in line_rows:
        lines.setdefault(line["appointment_id"], []).append(line)
    for row in rows:
        row["lines"] = lines.get(row["appointment_id"], [])
    return rows


def fetch_appointment(appointment_id):
    rows = fetch_appointments(" WHERE a.appointment_id = %s", (appointment_id,))
    if not rows:
        raise ApiError(404, "Appointment not found.")
    return rows[0]


def appointment_json(row, audience):
    """The admin appointment shape. `audience` only changes phone formatting."""
    local = utc_to_local(row["start_time"])
    phone = row["customer_phone"] or ""
    phone = national_phone(phone) if audience == "admin" else (try_normalize_phone(phone) or phone)
    return {
        "id": str(row["appointment_id"]),
        "date": local.date().isoformat(),
        "time": local.strftime("%H:%M"),
        "customer": {
            "name": row["customer_name"] or "",
            "email": row["customer_email"] or "",
            "phone": phone,
        },
        "services": [
            {
                "id": line["slug"],
                "name": line["name"],
                "price": dollars(line["price_cents"]),
                "durationMin": int(line["duration"]),
            }
            for line in row["lines"]
        ],
        "status": STATUS_TO_API.get(row["status"], row["status"]),
        "payment": row["payment_status"],
        "paymentMethod": row["payment_method"],
        "receiptSent": bool(row["receipt_sent"]),
        "referencePhotos": int(row["reference_photos"] or 0),
        "notes": row["notes"] or "",
        "policyAccepted": row["policy_version"] is not None,
        "policyVersion": row["policy_version"],
    }


def insert_lines(appointment_id, quote):
    for order, line in enumerate(quote["lines"]):
        write(
            """
            INSERT INTO Appointment_Service
                (appointment_id, service_id, line_order, name_at_booking,
                 price_cents_at_booking, duration_at_booking)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (appointment_id, line["service_id"], order, line["name"],
             line["price_cents"], line["duration"]),
            commit=False,
        )


def insert_appointment(*, staff_id, quote, day, minute, customer_id, name, phone, email,
                       notes, payment_status, payment_method, policy_version,
                       guest_token_hash, staff_booking):
    """Overlap check and insert in one transaction. Returns the new ID."""
    with transaction():
        start_utc, end_utc = reserve_slot(
            staff_id, day, minute, quote["duration"], staff_booking=staff_booking
        )
        now = utc_now()
        _, appointment_id = write(
            """
            INSERT INTO Appointment
                (customer_id, staff_id, start_time, end_time, status, notes,
                 customer_name, customer_phone, customer_email,
                 payment_status, payment_method, receipt_sent,
                 policy_version, policy_accepted_at, guest_token_hash,
                 created_at, updated_at)
            VALUES (%s, %s, %s, %s, 'booked', %s, %s, %s, %s, %s, %s, 0, %s, %s, %s, %s, %s)
            """,
            (customer_id, staff_id, start_utc, end_utc, notes,
             name, phone, email, payment_status, payment_method,
             policy_version, now if policy_version else None, guest_token_hash,
             now, now),
            commit=False,
        )
        insert_lines(appointment_id, quote)
    return appointment_id


def lock_booked_appointment(appointment_id):
    """Inside a transaction: lock the row and require status 'booked'."""
    rows = read(
        "SELECT status FROM Appointment WHERE appointment_id = %s FOR UPDATE",
        (appointment_id,),
    )
    if not rows:
        raise ApiError(404, "Appointment not found.")
    if rows[0]["status"] != "booked":
        raise ApiError(409, "This appointment is already "
                       f"{STATUS_TO_API[rows[0]['status']].lower()} and can no longer be changed.")


def reschedule(appointment_id, day, minute, quote=None, notes=None, staff_booking=False):
    """Move a booked appointment in place, keeping its ID."""
    with transaction():
        # Lock order matches new bookings (Staff row first) to avoid deadlocks.
        staff_rows = read(
            "SELECT staff_id, status, TIMESTAMPDIFF(MINUTE, start_time, end_time) AS duration "
            "FROM Appointment WHERE appointment_id = %s",
            (appointment_id,),
        )
        if not staff_rows:
            raise ApiError(404, "Appointment not found.")
        if staff_rows[0]["status"] != "booked":
            lock_booked_appointment(appointment_id)  # raises the 409 message
        staff_id = staff_rows[0]["staff_id"]
        duration = quote["duration"] if quote else int(staff_rows[0]["duration"])

        start_utc, end_utc = reserve_slot(
            staff_id, day, minute, duration,
            exclude_appointment_id=appointment_id, staff_booking=staff_booking,
        )
        lock_booked_appointment(appointment_id)

        sets = ["start_time = %s", "end_time = %s", "updated_at = %s"]
        params = [start_utc, end_utc, utc_now()]
        if notes is not None:
            sets.append("notes = %s")
            params.append(notes)
        params.append(appointment_id)
        write(
            "UPDATE Appointment SET " + ", ".join(sets) + " WHERE appointment_id = %s",
            params, commit=False,
        )
        if quote:
            write("DELETE FROM Appointment_Service WHERE appointment_id = %s",
                  (appointment_id,), commit=False)
            insert_lines(appointment_id, quote)


def set_status(appointment_id, new_status):
    """Change a booked appointment's status. Terminal statuses are final."""
    with transaction():
        lock_booked_appointment(appointment_id)
        write(
            "UPDATE Appointment SET status = %s, updated_at = %s WHERE appointment_id = %s",
            (new_status, utc_now(), appointment_id),
            commit=False,
        )


# ---------------------------------------------------------------------------
# Passwordless phone verification (customers)
# ---------------------------------------------------------------------------

def sms_provider():
    if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID:
        return "twilio"
    if not IS_PRODUCTION:
        return "console"  # development only: the code is printed in the server log
    return None


def generate_otp_code():
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(phone, code):
    return hmac.new(SECRET_KEY, f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


def twilio_verify(path, fields):
    url = (f"https://verify.twilio.com/v2/Services/"
           f"{urllib.parse.quote(TWILIO_VERIFY_SERVICE_SID)}/{path}")
    auth = base64.b64encode(f"{TWILIO_ACCOUNT_SID}:{TWILIO_AUTH_TOKEN}".encode()).decode()
    req = urllib.request.Request(
        url,
        data=urllib.parse.urlencode(fields).encode(),
        headers={"Authorization": f"Basic {auth}", "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=8) as response:
        return json.loads(response.read().decode())


def send_verification_sms(phone):
    """Send a code. Returns the code hash to store, or None if the provider checks codes."""
    provider = sms_provider()
    if provider is None:
        raise ApiError(503, "Text message sign-in is temporarily unavailable. Please call the shop.")
    if provider == "console":
        code = generate_otp_code()
        logger.warning("DEVELOPMENT ONLY - verification code for %s: %s", phone, code)
        return hash_otp(phone, code)
    try:
        twilio_verify("Verifications", {"To": phone, "Channel": "sms"})
    except urllib.error.HTTPError as error:
        logger.error("Twilio Verify send failed with HTTP %s", error.code)
        if error.code == 429:
            raise ApiError(429, "Too many codes were requested. Please wait a few minutes and try again.")
        raise ApiError(503, "We couldn't send a text message right now. Please try again.")
    except (urllib.error.URLError, TimeoutError):
        logger.exception("Twilio Verify is unreachable.")
        raise ApiError(503, "We couldn't send a text message right now. Please try again.")
    return None


def check_verification_code(phone, code, code_hash):
    if code_hash is not None:
        return hmac.compare_digest(code_hash, hash_otp(phone, code))
    try:
        result = twilio_verify("VerificationCheck", {"To": phone, "Code": code})
    except urllib.error.HTTPError as error:
        if error.code == 404:  # expired, already used, or too many attempts
            return False
        logger.error("Twilio Verify check failed with HTTP %s", error.code)
        raise ApiError(503, "We couldn't check that code right now. Please try again.")
    except (urllib.error.URLError, TimeoutError):
        logger.exception("Twilio Verify is unreachable.")
        raise ApiError(503, "We couldn't check that code right now. Please try again.")
    return result.get("status") == "approved"


def read_intent(data):
    intent = data.get("intent")
    if intent not in ("register", "login"):
        raise ApiError(400, "intent must be register or login.")
    return intent


@app.route("/api/customer/auth/send-code", methods=["POST"])
def customer_send_code():
    data = json_body()
    intent = read_intent(data)
    phone = normalize_phone(data.get("phone"))
    if intent == "register":
        validate_name(data.get("name"))
        validate_optional_email(data.get("email"))

    now = utc_now()
    hour_ago = now - timedelta(hours=1)
    ip = client_ip()

    latest = read(
        "SELECT created_at FROM Phone_Verification WHERE phone_e164 = %s "
        "ORDER BY created_at DESC LIMIT 1",
        (phone,),
    )
    if latest:
        wait = OTP_RESEND_SECONDS - int((now - latest[0]["created_at"]).total_seconds())
        if wait > 0:
            raise ApiError(429, f"Please wait {wait} seconds before requesting another code.")

    per_phone = read(
        "SELECT COUNT(*) AS n FROM Phone_Verification WHERE phone_e164 = %s AND created_at > %s",
        (phone, hour_ago),
    )[0]["n"]
    per_ip = read(
        "SELECT COUNT(*) AS n FROM Phone_Verification WHERE request_ip = %s AND created_at > %s",
        (ip, hour_ago),
    )[0]["n"]
    if per_phone >= OTP_MAX_PER_PHONE_PER_HOUR or per_ip >= OTP_MAX_PER_IP_PER_HOUR:
        raise ApiError(429, "Too many codes were requested. Please try again in an hour.")

    # The same response is returned whether or not the phone has an account.
    code_hash = send_verification_sms(phone)
    with transaction():
        write(
            "UPDATE Phone_Verification SET consumed_at = %s "
            "WHERE phone_e164 = %s AND consumed_at IS NULL",
            (now, phone), commit=False,
        )
        write(
            """
            INSERT INTO Phone_Verification
                (phone_e164, intent, code_hash, request_ip, created_at, expires_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (phone, intent, code_hash, ip, now, now + timedelta(seconds=OTP_TTL_SECONDS)),
            commit=False,
        )

    return jsonify({
        "status": "sent",
        "phone": phone,
        "expiresInSeconds": OTP_TTL_SECONDS,
        "resendAfterSeconds": OTP_RESEND_SECONDS,
    }), 200


def customer_profile(row):
    return {
        "id": str(row["customer_id"]),
        "name": f"{row['first_name']} {row['last_name'] or ''}".strip(),
        "email": row["email"] or "",
        "phone": row["phone_e164"] or try_normalize_phone(row["phone"] or "") or "",
    }


CUSTOMER_COLUMNS = "customer_id, first_name, last_name, email, phone, phone_e164"


def find_customer_by_phone(phone):
    rows = read(f"SELECT {CUSTOMER_COLUMNS} FROM Customer WHERE phone_e164 = %s", (phone,))
    return rows[0] if rows else None


def start_customer_session(response, customer_id):
    """Revoke the current session cookie (if any) and issue a fresh one."""
    old_token = request.cookies.get(CUSTOMER_COOKIE)
    now = utc_now()
    if old_token:
        write(
            "UPDATE Customer_Session SET revoked_at = %s WHERE token_hash = %s AND revoked_at IS NULL",
            (now, sha256_hex(old_token)),
        )
    token = secrets.token_urlsafe(32)
    write(
        "INSERT INTO Customer_Session (token_hash, customer_id, created_at, expires_at) "
        "VALUES (%s, %s, %s, %s)",
        (sha256_hex(token), customer_id, now, now + timedelta(days=CUSTOMER_SESSION_DAYS)),
    )
    response.set_cookie(
        CUSTOMER_COOKIE, token,
        max_age=CUSTOMER_SESSION_DAYS * 86400,
        httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, path="/",
    )


@app.route("/api/customer/auth/verify-code", methods=["POST"])
def customer_verify_code():
    data = json_body()
    intent = read_intent(data)
    phone = normalize_phone(data.get("phone"))
    code = data.get("code")
    if not isinstance(code, str) or not re.fullmatch(r"\d{6}", code.strip()):
        raise ApiError(400, "Please enter the 6-digit code we texted you.")
    code = code.strip()
    if intent == "register":
        name = validate_name(data.get("name"))
        email = validate_optional_email(data.get("email"))

    now = utc_now()
    rows = read(
        """
        SELECT verification_id, code_hash, attempts, expires_at
        FROM Phone_Verification
        WHERE phone_e164 = %s AND consumed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (phone,),
    )
    if not rows or rows[0]["expires_at"] <= now:
        raise ApiError(400, "That code has expired. Please request a new one.")
    verification = rows[0]

    # Count the attempt before checking so parallel guesses cannot exceed the limit.
    affected, _ = write(
        "UPDATE Phone_Verification SET attempts = attempts + 1 "
        "WHERE verification_id = %s AND attempts < %s AND consumed_at IS NULL",
        (verification["verification_id"], OTP_MAX_ATTEMPTS),
    )
    if affected == 0:
        raise ApiError(429, "Too many incorrect attempts. Please request a new code.")

    if not check_verification_code(phone, code, verification["code_hash"]):
        raise ApiError(400, "That code is incorrect. Please check it and try again.")

    affected, _ = write(
        "UPDATE Phone_Verification SET consumed_at = %s "
        "WHERE verification_id = %s AND consumed_at IS NULL",
        (now, verification["verification_id"]),
    )
    if affected == 0:
        raise ApiError(400, "That code was already used. Please request a new one.")

    customer = find_customer_by_phone(phone)
    if customer is None:
        if intent == "login":
            raise ApiError(404, "We couldn't find an account for that phone number. Please create one.")
        first, last = split_name(name)
        try:
            write(
                """
                INSERT INTO Customer
                    (first_name, last_name, phone, phone_e164, phone_verified_at,
                     email, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (first, last, phone, phone, now, email, now, now),
            )
        except Error as error:
            if not is_duplicate_key(error):
                raise
            if find_customer_by_phone(phone) is None:  # the email was the duplicate
                raise ApiError(409, "That email address is already used by another account.")
        customer = find_customer_by_phone(phone)
    else:
        write(
            "UPDATE Customer SET phone_verified_at = %s WHERE customer_id = %s",
            (now, customer["customer_id"]),
        )

    response = jsonify({"authenticated": True, "customer": customer_profile(customer)})
    start_customer_session(response, customer["customer_id"])
    return response, 200


def current_customer():
    """The signed-in customer, or None."""
    if "customer" not in g:
        g.customer = None
        token = request.cookies.get(CUSTOMER_COOKIE)
        if token:
            rows = read(
                f"""
                SELECT {", ".join("c." + col.strip() for col in CUSTOMER_COLUMNS.split(","))}
                FROM Customer_Session s
                JOIN Customer c ON c.customer_id = s.customer_id
                WHERE s.token_hash = %s
                  AND s.revoked_at IS NULL
                  AND s.expires_at > %s
                """,
                (sha256_hex(token), utc_now()),
            )
            g.customer = rows[0] if rows else None
    return g.customer


def require_customer(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if current_customer() is None:
            raise ApiError(401, "Please sign in to continue.")
        return view(*args, **kwargs)
    return wrapper


@app.route("/api/customer/session", methods=["GET"])
@require_customer
def customer_session():
    return jsonify({"authenticated": True, "customer": customer_profile(current_customer())}), 200


@app.route("/api/customer/auth/logout", methods=["POST"])
def customer_logout():
    token = request.cookies.get(CUSTOMER_COOKIE)
    if token:
        write(
            "UPDATE Customer_Session SET revoked_at = %s WHERE token_hash = %s AND revoked_at IS NULL",
            (utc_now(), sha256_hex(token)),
        )
    response = flask.make_response("", 204)
    response.delete_cookie(CUSTOMER_COOKIE, path="/", secure=COOKIE_SECURE,
                           httponly=True, samesite=COOKIE_SAMESITE)
    return response


# ---------------------------------------------------------------------------
# Customer profile
# ---------------------------------------------------------------------------

@app.route("/api/customer/profile", methods=["GET"])
@require_customer
def get_customer_profile():
    return jsonify(customer_profile(current_customer())), 200


@app.route("/api/customer/profile", methods=["PATCH"])
@require_customer
def update_customer_profile():
    data = json_body()
    customer = current_customer()

    # A phone change needs its own verification flow, so only allow the same number.
    if data.get("phone") not in (None, ""):
        if normalize_phone(data["phone"]) != customer["phone_e164"]:
            raise ApiError(400, "To change your phone number, please verify the new number first.")

    sets, params = [], []
    if "name" in data:
        first, last = split_name(validate_name(data["name"]))
        sets += ["first_name = %s", "last_name = %s"]
        params += [first, last]
    if "email" in data:
        sets.append("email = %s")
        params.append(validate_optional_email(data["email"]))
    if not sets:
        raise ApiError(400, "Please provide a name or email to update.")

    sets.append("updated_at = %s")
    params += [utc_now(), customer["customer_id"]]
    try:
        write("UPDATE Customer SET " + ", ".join(sets) + " WHERE customer_id = %s", params)
    except Error as error:
        if is_duplicate_key(error):
            raise ApiError(409, "That email address is already used by another account.")
        raise

    updated = read(f"SELECT {CUSTOMER_COLUMNS} FROM Customer WHERE customer_id = %s",
                   (customer["customer_id"],))[0]
    return jsonify(customer_profile(updated)), 200


# ---------------------------------------------------------------------------
# Customer appointments
# ---------------------------------------------------------------------------

def check_policy(data):
    if data.get("policyAccepted") is not True or data.get("policyVersion") != POLICY_VERSION:
        raise ApiError(400, "Please review and accept the current Appointment & Payment Policy.")


def check_snapshot_extras(data):
    """Validate the admin-shape fields the browser sends but cannot control."""
    if data.get("status", "Booked") != "Booked":
        raise ApiError(400, "New appointments must have status Booked.")
    if data.get("payment", "Pay at Shop") != "Pay at Shop" or data.get("paymentMethod", "shop") != "shop":
        raise ApiError(400, "Online payment is not available yet. Please choose Pay at Shop.")
    if "receiptSent" in data and not isinstance(data["receiptSent"], bool):
        raise ApiError(400, "receiptSent must be true or false.")
    photos = data.get("referencePhotos", 0)
    if isinstance(photos, bool) or not isinstance(photos, int) or photos < 0:
        raise ApiError(400, "referencePhotos must be a number.")


@app.route("/api/customer/appointments", methods=["GET"])
@require_customer
def list_customer_appointments():
    rows = fetch_appointments(
        " WHERE a.customer_id = %s", (current_customer()["customer_id"],),
        order_sql=" ORDER BY a.start_time DESC",
    )
    return jsonify([appointment_json(row, "customer") for row in rows]), 200


@app.route("/api/customer/appointments", methods=["POST"])
def create_customer_appointment():
    data = json_body()
    check_policy(data)
    check_snapshot_extras(data)
    day = parse_date(data.get("date"))
    minute = parse_hhmm(data.get("time"))
    if day <= shop_today():
        raise ApiError(400, "Please choose a future appointment date.")
    notes = validate_notes(data.get("notes"))
    snapshot = data.get("customer") if isinstance(data.get("customer"), dict) else {}

    account = current_customer()
    if account:
        # A signed-in booking belongs to the account and uses its verified phone.
        customer_id = account["customer_id"]
        profile = customer_profile(account)
        name = validate_name(snapshot["name"]) if snapshot.get("name") else profile["name"]
        email = validate_optional_email(snapshot.get("email")) or (account["email"] or None)
        phone = profile["phone"]
        guest_token = None
    else:
        # Guest booking: no owner. A management token authorizes later changes.
        customer_id = None
        name = validate_name(snapshot.get("name"))
        phone = normalize_phone(snapshot.get("phone"))
        email = validate_optional_email(snapshot.get("email"))
        guest_token = secrets.token_urlsafe(32)

    quote = quote_from_snapshot(load_catalog(), data.get("services"))
    appointment_id = insert_appointment(
        staff_id=barber_staff_id(), quote=quote, day=day, minute=minute,
        customer_id=customer_id, name=name, phone=phone, email=email, notes=notes,
        payment_status="Pay at Shop", payment_method="shop",
        policy_version=POLICY_VERSION,
        guest_token_hash=sha256_hex(guest_token) if guest_token else None,
        staff_booking=False,
    )

    result = appointment_json(fetch_appointment(appointment_id), "customer")
    if guest_token:
        # Shown once. The guest needs it to reschedule or cancel this booking.
        result["guestToken"] = guest_token
    return jsonify(result), 201


def authorize_customer_change(appointment_id, data):
    """Allow the owning customer session or a valid guest-management token."""
    rows = read(
        "SELECT customer_id, guest_token_hash FROM Appointment WHERE appointment_id = %s",
        (appointment_id,),
    )
    if not rows:
        raise ApiError(404, "Appointment not found.")
    row = rows[0]

    account = current_customer()
    if account and row["customer_id"] is not None and row["customer_id"] == account["customer_id"]:
        return

    token = request.headers.get("X-Guest-Token") or data.get("guestToken")
    if isinstance(token, str) and token and row["guest_token_hash"]:
        if hmac.compare_digest(row["guest_token_hash"], sha256_hex(token)):
            return

    if account is None and not token:
        raise ApiError(401, "Please sign in to change this appointment.")
    raise ApiError(403, "You can only change your own appointments.")


@app.route("/api/customer/appointments/<int:appointment_id>", methods=["PATCH"])
def update_customer_appointment(appointment_id):
    data = json_body()
    authorize_customer_change(appointment_id, data)

    status = data.get("status")
    wants_move = "date" in data or "time" in data

    if status == "Cancelled" and not wants_move:
        current = fetch_appointment(appointment_id)
        if current["status"] == "booked" and current["start_time"] <= utc_now():
            raise ApiError(409, "This appointment has already started and can no longer be cancelled online.")
        set_status(appointment_id, "canceled")
    elif status in (None, "Booked") and wants_move:
        day = parse_date(data.get("date"))
        minute = parse_hhmm(data.get("time"))
        if "policyVersion" in data:
            check_policy(data)
        quote = None
        if "services" in data:
            quote = quote_from_snapshot(load_catalog(), data["services"])
        notes = validate_notes(data["notes"]) if "notes" in data else None
        reschedule(appointment_id, day, minute, quote=quote, notes=notes)
    elif status in ("Completed", "No-show"):
        raise ApiError(403, "Only the shop can mark an appointment completed or missed.")
    else:
        raise ApiError(400, "Send a new date and time to reschedule, or status Cancelled to cancel.")

    return jsonify(appointment_json(fetch_appointment(appointment_id), "customer")), 200


# ---------------------------------------------------------------------------
# Live Google reviews and Instagram posts (server-side, cached)
# ---------------------------------------------------------------------------

_provider_cache = {}
_provider_lock = threading.Lock()


def cached(key, loader):
    """Cache successes for 15 minutes and failures briefly, per process."""
    with _provider_lock:
        hit = _provider_cache.get(key)
        if hit and hit[0] > time.monotonic():
            return hit[1]
    value, ok = loader()
    ttl = PROVIDER_CACHE_SECONDS if ok else PROVIDER_FAILURE_CACHE_SECONDS
    with _provider_lock:
        _provider_cache[key] = (time.monotonic() + ttl, value)
    return value


def http_get_json(url, headers=None):
    req = urllib.request.Request(url, headers={"Accept": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=6) as response:
        return json.loads(response.read().decode())


def load_google_reviews():
    unavailable = {
        "status": "unavailable",
        "rating": None,
        "totalCount": 0,
        "reviews": [],
        "googleUrl": GOOGLE_REVIEWS_URL,
        "attribution": "Google",
        "message": "Live Google reviews are temporarily unavailable.",
    }
    if not GOOGLE_PLACES_API_KEY or not GOOGLE_PLACE_ID:
        return unavailable, False
    try:
        place = http_get_json(
            "https://places.googleapis.com/v1/places/" + urllib.parse.quote(GOOGLE_PLACE_ID),
            headers={
                "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
                "X-Goog-FieldMask": "rating,userRatingCount,reviews,googleMapsUri",
            },
        )
    except (urllib.error.URLError, TimeoutError, ValueError):
        logger.exception("Google Place Details request failed.")
        return unavailable, False

    reviews = []
    for review in place.get("reviews", []):
        author = review.get("authorAttribution") or {}
        photo = author.get("photoUri", "")
        if photo.startswith("//"):
            photo = "https:" + photo
        text = review.get("text") or review.get("originalText") or {}
        reviews.append({
            "id": review.get("name", ""),
            "authorName": author.get("displayName", "Google user"),
            "authorUrl": author.get("uri", ""),
            "rating": review.get("rating"),
            "text": text.get("text", ""),
            "relativeTime": review.get("relativePublishTimeDescription", ""),
            "authorPhotoUrl": photo,
        })
    return {
        "status": "success",
        "rating": place.get("rating"),
        "totalCount": place.get("userRatingCount", 0),
        "googleUrl": place.get("googleMapsUri") or GOOGLE_REVIEWS_URL,
        "attribution": "Google",
        "reviews": reviews,
    }, True


@app.route("/api/public/reviews", methods=["GET"])
def public_reviews():
    return jsonify(cached("google-reviews", load_google_reviews)), 200


# The long-lived Instagram token is refreshed in memory about once a day.
# Long-lived tokens last 60 days; update INSTAGRAM_ACCESS_TOKEN before then
# or persist the refreshed token if the server runs for longer.
_instagram = {"token": os.getenv("INSTAGRAM_ACCESS_TOKEN", ""), "refreshed_at": time.monotonic()}


def instagram_token():
    with _provider_lock:
        token = _instagram["token"]
        due = time.monotonic() - _instagram["refreshed_at"] > 24 * 3600
    if token and due:
        try:
            refreshed = http_get_json(
                "https://graph.instagram.com/refresh_access_token?"
                + urllib.parse.urlencode({"grant_type": "ig_refresh_token", "access_token": token})
            )
            if refreshed.get("access_token"):
                token = refreshed["access_token"]
        except (urllib.error.URLError, TimeoutError, ValueError):
            logger.warning("Instagram token refresh failed; using the current token.")
        with _provider_lock:
            _instagram.update(token=token, refreshed_at=time.monotonic())
    return token


def load_instagram_posts():
    unavailable = {
        "status": "unavailable",
        "profileUrl": INSTAGRAM_PROFILE_URL,
        "posts": [],
        "message": "Live Instagram posts are temporarily unavailable.",
    }
    token = instagram_token()
    if not token:
        return unavailable, False
    try:
        media = http_get_json(
            "https://graph.instagram.com/me/media?" + urllib.parse.urlencode({
                "fields": "id,media_type,media_url,thumbnail_url,permalink,caption,timestamp",
                "limit": 12,
                "access_token": token,
            })
        )
    except (urllib.error.URLError, TimeoutError, ValueError):
        logger.exception("Instagram media request failed.")
        return unavailable, False

    posts = [{
        "id": item.get("id", ""),
        "mediaType": item.get("media_type", ""),
        "mediaUrl": item.get("media_url", ""),
        "thumbnailUrl": item.get("thumbnail_url", ""),
        "permalink": item.get("permalink", ""),
        "caption": item.get("caption", ""),
        "timestamp": item.get("timestamp", ""),
    } for item in media.get("data", [])]
    return {"status": "success", "profileUrl": INSTAGRAM_PROFILE_URL, "posts": posts}, True


@app.route("/api/public/instagram", methods=["GET"])
def public_instagram():
    return jsonify(cached("instagram-posts", load_instagram_posts)), 200


# ---------------------------------------------------------------------------
# Admin authentication (bearer token; separate from customer cookies)
# ---------------------------------------------------------------------------

# Compared against when the phone is unknown so response time does not reveal it.
_DUMMY_PASSWORD_HASH = generate_password_hash(secrets.token_urlsafe(16))


@app.route("/api/auth/login", methods=["POST"])
def admin_login():
    data = json_body()
    phone = try_normalize_phone(data.get("phone") or "")
    password = data.get("password")
    if not phone or not isinstance(password, str) or not password:
        raise ApiError(401, "Wrong phone number or password.")

    staff = None
    for row in read("SELECT staff_id, name, role, phone, password_hash FROM Staff WHERE phone IS NOT NULL"):
        if try_normalize_phone(row["phone"]) == phone:
            staff = row
            break

    password_ok = check_password_hash(
        staff["password_hash"] if staff else _DUMMY_PASSWORD_HASH, password
    )
    if not staff or not password_ok:
        raise ApiError(401, "Wrong phone number or password.")
    if staff["role"] != "admin":
        raise ApiError(403, "You don't have permission to use the admin site.")

    token = secrets.token_urlsafe(32)
    now = utc_now()
    write(
        "INSERT INTO Staff_Session (token_hash, staff_id, created_at, expires_at) VALUES (%s, %s, %s, %s)",
        (sha256_hex(token), staff["staff_id"], now, now + timedelta(hours=ADMIN_SESSION_HOURS)),
    )
    return jsonify({
        "token": token,
        "user": {"id": staff["staff_id"], "name": staff["name"], "role": staff["role"]},
    }), 200


def bearer_token():
    header = request.headers.get("Authorization", "")
    return header[7:].strip() if header.startswith("Bearer ") else ""


def require_admin(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        token = bearer_token()
        if not token:
            raise ApiError(401, "Your session has expired. Please log in again.")
        rows = read(
            """
            SELECT st.staff_id, st.name, st.role
            FROM Staff_Session ss
            JOIN Staff st ON st.staff_id = ss.staff_id
            WHERE ss.token_hash = %s AND ss.revoked_at IS NULL AND ss.expires_at > %s
            """,
            (sha256_hex(token), utc_now()),
        )
        if not rows:
            raise ApiError(401, "Your session has expired. Please log in again.")
        if rows[0]["role"] != "admin":
            raise ApiError(403, "You don't have permission to do that.")
        g.staff = rows[0]
        return view(*args, **kwargs)
    return wrapper


@app.route("/api/auth/logout", methods=["POST"])
@require_admin
def admin_logout():
    write(
        "UPDATE Staff_Session SET revoked_at = %s WHERE token_hash = %s",
        (utc_now(), sha256_hex(bearer_token())),
    )
    return "", 204


# ---------------------------------------------------------------------------
# Admin appointments (same records as the customer routes)
# ---------------------------------------------------------------------------

@app.route("/api/appointments", methods=["GET"])
@require_admin
def admin_list_appointments():
    return jsonify([appointment_json(row, "admin") for row in fetch_appointments()]), 200


@app.route("/api/appointments/<int:appointment_id>", methods=["GET"])
@require_admin
def admin_get_appointment(appointment_id):
    return jsonify(appointment_json(fetch_appointment(appointment_id), "admin")), 200


@app.route("/api/appointments", methods=["POST"])
@require_admin
def admin_create_appointment():
    """Staff add a walk-in or phone booking. Same hours and overlap rules."""
    data = json_body()
    day = parse_date(data.get("date"))
    minute = parse_hhmm(data.get("time"))
    customer = data.get("customer") if isinstance(data.get("customer"), dict) else {}
    name = validate_name(customer.get("name"))
    phone = normalize_phone(customer.get("phone"))
    email = validate_optional_email(customer.get("email"))
    notes = validate_notes(data.get("notes"))

    payment_method = data.get("paymentMethod", "Pay at shop")
    if payment_method not in ("Pay at shop", "Card"):
        raise ApiError(400, "paymentMethod must be 'Pay at shop' or 'Card'.")

    quote = quote_from_ids(load_catalog(), data.get("serviceIds"))
    appointment_id = insert_appointment(
        staff_id=barber_staff_id(), quote=quote, day=day, minute=minute,
        customer_id=None, name=name, phone=phone, email=email, notes=notes,
        payment_status="Paid" if payment_method == "Card" else "Unpaid",
        payment_method=payment_method, policy_version=None,
        guest_token_hash=None, staff_booking=True,
    )
    return jsonify(appointment_json(fetch_appointment(appointment_id), "admin")), 201


@app.route("/api/appointments/<int:appointment_id>", methods=["PATCH"])
@require_admin
def admin_update_appointment(appointment_id):
    data = json_body()
    status = data.get("status")
    wants_move = "date" in data or "time" in data

    if status is not None and wants_move:
        raise ApiError(400, "Change the status or the date and time, not both at once.")
    if status is not None:
        if status not in ("Cancelled", "Completed", "No-show"):
            raise ApiError(400, "status must be Cancelled, Completed, or No-show.")
        set_status(appointment_id, API_TO_STATUS[status])
    elif wants_move:
        day = parse_date(data.get("date"))
        minute = parse_hhmm(data.get("time"))
        reschedule(appointment_id, day, minute, staff_booking=True)
    else:
        raise ApiError(400, "Nothing to change.")

    return jsonify(appointment_json(fetch_appointment(appointment_id), "admin")), 200


# ---------------------------------------------------------------------------
# Admin services and prices
# ---------------------------------------------------------------------------

def validate_service_fields(data, partial):
    fields = {}
    if "name" in data or not partial:
        name = data.get("name")
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 100:
            raise ApiError(400, "name is required and must be 100 characters or fewer.")
        fields["name"] = " ".join(name.split())
    if "price" in data or not partial:
        price = data.get("price")
        if isinstance(price, bool) or not isinstance(price, (int, float)) or not 0 <= price <= 1000:
            raise ApiError(400, "price must be a number from 0 to 1000.")
        fields["price_cents"] = int(round(Decimal(str(price)) * 100))
    if "durationMin" in data or not partial:
        duration = data.get("durationMin")
        if isinstance(duration, bool) or not isinstance(duration, int) or not 5 <= duration <= 480:
            raise ApiError(400, "durationMin must be a whole number from 5 to 480.")
        fields["duration_minutes"] = duration
    if "active" in data:
        if not isinstance(data["active"], bool):
            raise ApiError(400, "active must be true or false.")
        fields["is_active"] = data["active"]
    if "description" in data:
        if not isinstance(data["description"], str):
            raise ApiError(400, "description must be text.")
        fields["description"] = data["description"].strip()
    return fields


def ensure_unique_name(name, exclude_slug=None):
    rows = read("SELECT slug FROM Service WHERE LOWER(name) = LOWER(%s)", (name,))
    if any(row["slug"] != exclude_slug for row in rows):
        raise ApiError(409, "A service with that name already exists.")


def save_compatibility(catalog, upgrade, service_slugs):
    if not isinstance(service_slugs, list) or not all(isinstance(s, str) for s in service_slugs):
        raise ApiError(400, "serviceIds must be a list of service IDs.")
    targets = []
    for slug in set(service_slugs):
        target = catalog.get(slug)
        if not target or target["kind"] != "service":
            raise ApiError(400, f"Unknown service: {slug}.")
        targets.append(target["service_id"])
    write("DELETE FROM Service_Upgrade_Compatibility WHERE upgrade_id = %s",
          (upgrade["service_id"],), commit=False)
    for service_id in targets:
        write("INSERT INTO Service_Upgrade_Compatibility (upgrade_id, service_id) VALUES (%s, %s)",
              (upgrade["service_id"], service_id), commit=False)


@app.route("/api/services", methods=["GET"])
@require_admin
def admin_list_services():
    return jsonify([admin_service(item) for item in load_catalog().values()]), 200


@app.route("/api/services", methods=["POST"])
@require_admin
def admin_create_service():
    data = json_body()
    fields = validate_service_fields(data, partial=False)
    kind = data.get("kind", "service")
    if kind not in ("service", "upgrade"):
        raise ApiError(400, "kind must be service or upgrade.")
    ensure_unique_name(fields["name"])

    catalog = load_catalog()
    base = re.sub(r"[^a-z0-9]+", "-", fields["name"].lower()).strip("-")[:40] or "service"
    slug, n = base, 2
    while slug in catalog:
        slug, n = f"{base}-{n}", n + 1

    with transaction():
        _, service_id = write(
            """
            INSERT INTO Service
                (slug, kind, name, description, price_cents, duration_minutes, is_active, display_order)
            SELECT %s, %s, %s, %s, %s, %s, %s, COALESCE(MAX(display_order), 0) + 10 FROM Service
            """,
            (slug, kind, fields["name"], fields.get("description", ""), fields["price_cents"],
             fields["duration_minutes"], fields.get("is_active", True)),
            commit=False,
        )
        if kind == "upgrade" and "serviceIds" in data:
            save_compatibility(catalog, {"service_id": service_id}, data["serviceIds"])

    return jsonify(admin_service(load_catalog()[slug])), 201


@app.route("/api/services/<slug>", methods=["PATCH"])
@require_admin
def admin_update_service(slug):
    data = json_body()
    catalog = load_catalog()
    item = catalog.get(slug)
    if not item:
        raise ApiError(404, "Service not found.")
    fields = validate_service_fields(data, partial=True)
    if "serviceIds" in data and item["kind"] != "upgrade":
        raise ApiError(400, "Only upgrades have serviceIds.")
    if not fields and "serviceIds" not in data:
        raise ApiError(400, "Nothing to change.")
    if "name" in fields:
        ensure_unique_name(fields["name"], exclude_slug=slug)

    # Existing appointments keep their own name/price/duration snapshot.
    with transaction():
        if fields:
            write(
                "UPDATE Service SET " + ", ".join(f"{col} = %s" for col in fields)
                + " WHERE service_id = %s",
                list(fields.values()) + [item["service_id"]],
                commit=False,
            )
        if "serviceIds" in data:
            save_compatibility(catalog, item, data["serviceIds"])

    return jsonify(admin_service(load_catalog()[slug])), 200


# ---------------------------------------------------------------------------
# Staff time off and weekly hours (admin). Times in requests are shop-local.
# ---------------------------------------------------------------------------

@app.route("/api/staff/<int:staff_id>/time-off", methods=["GET"])
@require_admin
def read_time_off(staff_id):
    rows = read(
        """
        SELECT slot_id, slot_start, slot_end
        FROM Time_Slot
        WHERE staff_id = %s AND is_blocked = 1
        ORDER BY slot_start
        """,
        (staff_id,),
    )
    result = []
    for row in rows:
        start = utc_to_local(row["slot_start"])
        end = utc_to_local(row["slot_end"])
        result.append({
            "slot_id": row["slot_id"],
            "day_off_date": start.date().isoformat(),
            "start_time": start.strftime("%H:%M:%S"),
            "end_date": end.date().isoformat(),
            "end_time": end.strftime("%H:%M:%S"),
        })
    return jsonify(result), 200


@app.route("/api/staff/<int:staff_id>/time-off", methods=["POST"])
@require_admin
def create_day_off(staff_id):
    data = json_body()
    start = parse_local_datetime(data.get("slot_start"), "slot_start")
    end = parse_local_datetime(data.get("slot_end"), "slot_end")
    if end <= start:
        raise ApiError(400, "slot_end must be later than slot_start.")
    if not read("SELECT staff_id FROM Staff WHERE staff_id = %s", (staff_id,)):
        raise ApiError(404, "Staff member not found.")
    write(
        "INSERT INTO Time_Slot (staff_id, slot_start, slot_end, is_blocked) VALUES (%s, %s, %s, 1)",
        (staff_id, start, end),
    )
    return jsonify({"message": "Time off added successfully."}), 201


@app.route("/api/staff/<int:staff_id>/weekly-hours", methods=["PUT"])
@require_admin
def update_weekly_hours(staff_id):
    data = json_body()
    day_of_week = required_int(data, "day_of_week", minimum=0)
    start_time = required_text(data, "start_time")
    end_time = required_text(data, "end_time")
    is_open = data.get("is_open")

    if day_of_week > 6:
        raise ApiError(400, "day_of_week must be between 0 and 6.")
    if not isinstance(is_open, bool):
        raise ApiError(400, "is_open must be true or false.")
    try:
        datetime.strptime(start_time, "%H:%M:%S")
        datetime.strptime(end_time, "%H:%M:%S")
    except ValueError:
        raise ApiError(400, "start_time and end_time must use HH:MM:SS.")
    if is_open and start_time >= end_time:
        raise ApiError(400, "end_time must be later than start_time.")
    if not read("SELECT staff_id FROM Staff WHERE staff_id = %s", (staff_id,)):
        raise ApiError(404, "Staff member not found.")

    write(
        """
        INSERT INTO Weekly_Hours (staff_id, day_of_week, start_time, end_time, is_open)
        VALUES (%s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            start_time = VALUES(start_time),
            end_time = VALUES(end_time),
            is_open = VALUES(is_open)
        """,
        (staff_id, day_of_week, start_time, end_time, is_open),
    )
    return jsonify({"message": "Weekly hours saved successfully."}), 200


# ---------------------------------------------------------------------------
# Shopping cart (optional retail functionality, unchanged behavior)
# ---------------------------------------------------------------------------

def get_cart_id(customer_id):
    rows = read(
        "SELECT cart_id FROM Cart WHERE customer_id = %s ORDER BY cart_id LIMIT 1",
        (customer_id,),
    )
    return rows[0]["cart_id"] if rows else None


def get_cart_items(customer_id):
    rows = read(
        """
        SELECT
            p.product_id,
            p.name AS item_name,
            ci.quantity,
            p.price AS unit_price,
            ci.quantity * p.price AS line_total,
            SUM(ci.quantity * p.price) OVER () AS cart_total
        FROM Cart c
        JOIN Cart_Item ci ON c.cart_id = ci.cart_id
        JOIN Product p ON ci.product_id = p.product_id
        WHERE c.customer_id = %s
        ORDER BY p.name
        """,
        (customer_id,),
    )
    return clean(rows)


@app.route("/api/cart/<int:customer_id>", methods=["GET"])
def view_cart(customer_id):
    return jsonify(get_cart_items(customer_id)), 200


@app.route("/api/cart", methods=["POST"])
def create_cart():
    data = json_body()
    customer_id = required_int(data, "customer_id")

    if get_cart_id(customer_id) is None:
        if not read("SELECT customer_id FROM Customer WHERE customer_id = %s", (customer_id,)):
            raise ApiError(404, "Customer not found.")
        write("INSERT INTO Cart (customer_id, created_at) VALUES (%s, %s)", (customer_id, utc_now()))

    rows = read(
        """
        SELECT cart_id, customer_id, created_at AS date_created
        FROM Cart
        WHERE customer_id = %s
        ORDER BY cart_id
        LIMIT 1
        """,
        (customer_id,),
    )
    return jsonify(clean(rows)[0]), 201


@app.route("/api/cart/items", methods=["PUT"])
def update_cart_item():
    data = json_body()
    customer_id = required_int(data, "customer_id")
    product_id = required_int(data, "product_id")
    quantity = required_int(data, "quantity", minimum=0)

    cart_id = get_cart_id(customer_id)
    if cart_id is None:
        raise ApiError(404, "Customer does not have a cart.")

    if quantity == 0:
        write("DELETE FROM Cart_Item WHERE cart_id = %s AND product_id = %s", (cart_id, product_id))
    else:
        write(
            """
            INSERT INTO Cart_Item (cart_id, product_id, quantity)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)
            """,
            (cart_id, product_id, quantity),
        )
    return jsonify(get_cart_items(customer_id)), 200


# ---------------------------------------------------------------------------
# Run development server only when this file is executed directly
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=int(os.getenv("PORT", "5000")),
        debug=app.config["DEBUG"],
    )
