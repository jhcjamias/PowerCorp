"""
Barbershop Booking API
----------------------
Project dependencies expected:
    creds.py       -> Creds() with conString, userName, password, dbName
    sqlhelper.py   -> create_connection, execute_query, execute_read_query

"""

import os
import logging
from datetime import date, datetime, timedelta
from decimal import Decimal

import flask
from flask import jsonify, request
from flask_cors import CORS
from mysql.connector import Error
from werkzeug.security import generate_password_hash

import creds
from sqlhelper import create_connection, execute_query, execute_read_query


# ---------------------------------------------------------------------------
# Application and database configuration
# ---------------------------------------------------------------------------

app = flask.Flask(__name__)
CORS(app)

app.config["JSON_SORT_KEYS"] = False
app.config["DEBUG"] = os.getenv("FLASK_DEBUG", "false").lower() == "true"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

my_creds = creds.Creds()
conn = create_connection(
    my_creds.conString,
    my_creds.userName,
    my_creds.password,
    my_creds.dbName,
)


# ---------------------------------------------------------------------------
# Shared helpers
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
    """Return a JSON object or an empty dictionary."""
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def required_int(data, field, minimum=1):
    """Read and validate a required integer field."""
    try:
        value = int(data[field])
    except (KeyError, TypeError, ValueError):
        raise ValueError(f"{field} must be an integer")

    if value < minimum:
        raise ValueError(f"{field} must be at least {minimum}")

    return value


def required_text(data, field):
    """Read and validate a required non-empty string."""
    value = data.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} is required")
    return value.strip()


def parse_datetime(value, field="start_time"):
    """Parse the API's expected local datetime format."""
    if not isinstance(value, str):
        raise ValueError(f"{field} must use YYYY-MM-DD HH:MM:SS format")

    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        raise ValueError(f"{field} must use YYYY-MM-DD HH:MM:SS format")


def parse_iso_date(value, field):
    """Parse a YYYY-MM-DD date."""
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field} must use YYYY-MM-DD format")


def has_conflict(staff_id, start, end, exclude_appt_id=None):
    """
    Return True if a barber has an overlapping booked/completed appointment.

    The exclusion parameter supports rescheduling an existing appointment.
    """
    sql = """
        SELECT 1
        FROM Appointment
        WHERE staff_id = %s
          AND status IN ('booked', 'completed')
          AND start_time < %s
          AND end_time > %s
    """
    params = [staff_id, end, start]

    if exclude_appt_id is not None:
        sql += " AND appointment_id <> %s"
        params.append(exclude_appt_id)

    sql += " LIMIT 1"
    rows = execute_read_query(conn, sql, tuple(params))
    return bool(rows)


def get_cart_id(customer_id):
    rows = execute_read_query(
        conn,
        """
        SELECT cart_id
        FROM Cart
        WHERE customer_id = %s
        ORDER BY cart_id
        LIMIT 1
        """,
        (customer_id,),
    )
    return rows[0]["cart_id"] if rows else None


def get_cart_items(customer_id):
    rows = execute_read_query(
        conn,
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


def database_error_response(error):
    """Log database details without exposing SQL or credentials to clients."""
    logger.exception("Database operation failed: %s", error)
    return jsonify({"error": "A database operation failed."}), 500


@app.errorhandler(Error)
def handle_database_error(error):
    return database_error_response(error)


@app.errorhandler(404)
def handle_not_found(_error):
    return jsonify({"error": "Endpoint or resource not found."}), 404


@app.errorhandler(405)
def handle_method_not_allowed(_error):
    return jsonify({"error": "HTTP method not allowed for this endpoint."}), 405


@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "application": "Barbershop Booking API",
        "status": "running",
    })


# ---------------------------------------------------------------------------
# Services
# ---------------------------------------------------------------------------

@app.route("/api/services", methods=["GET"])
def view_services():
    rows = execute_read_query(
        conn,
        """
        SELECT service_id, name, description, price, duration_minutes
        FROM Service
        ORDER BY name
        """,
    )
    return jsonify(clean(rows)), 200


@app.route("/api/services/<int:service_id>", methods=["GET"])
def view_service(service_id):
    rows = execute_read_query(
        conn,
        """
        SELECT service_id, name, description, price, duration_minutes
        FROM Service
        WHERE service_id = %s
        """,
        (service_id,),
    )
    if not rows:
        return jsonify({"error": "Service not found."}), 404
    return jsonify(clean(rows)[0]), 200


@app.route("/api/services/<int:service_id>", methods=["PUT"])
def update_service(service_id):
    data = json_body()

    try:
        name = required_text(data, "name")
        description = data.get("description", "")
        price = Decimal(str(data["price"]))
        duration = required_int(data, "duration_minutes")
    except (KeyError, TypeError, ValueError, ArithmeticError) as exc:
        return jsonify({"error": str(exc) or "Invalid service data."}), 400

    if price < 0:
        return jsonify({"error": "price cannot be negative."}), 400

    affected, _ = execute_query(
        conn,
        """
        UPDATE Service
        SET name = %s,
            description = %s,
            price = %s,
            duration_minutes = %s
        WHERE service_id = %s
        """,
        (name, description, price, duration, service_id),
    )

    if affected == 0:
        exists = execute_read_query(
            conn,
            "SELECT service_id FROM Service WHERE service_id = %s",
            (service_id,),
        )
        if not exists:
            return jsonify({"error": "Service not found."}), 404

    return jsonify({"message": "Service updated successfully."}), 200


# ---------------------------------------------------------------------------
# Calendar and appointment availability overview
# ---------------------------------------------------------------------------

@app.route("/api/calendar", methods=["GET"])
def view_calendar():
    try:
        year = int(request.args.get("year", date.today().year))
        month = int(request.args.get("month", date.today().month))
        first_day = date(year, month, 1)
    except (TypeError, ValueError):
        return jsonify({"error": "year and month must form a valid calendar month."}), 400

    if not 1 <= month <= 12:
        return jsonify({"error": "month must be between 1 and 12."}), 400

    next_month = (
        date(year + 1, 1, 1)
        if month == 12
        else date(year, month + 1, 1)
    )

    rows = execute_read_query(
        conn,
        """
        WITH slots AS (
            SELECT
                st.staff_id,
                st.name AS barber,
                DATE(ts.slot_start) AS slot_date,
                ts.slot_start,
                ts.slot_end,
                CASE
                    WHEN ts.is_blocked = 1 THEN 0
                    WHEN EXISTS (
                        SELECT 1
                        FROM Appointment a
                        WHERE a.staff_id = ts.staff_id
                          AND a.status IN ('booked', 'completed')
                          AND a.start_time < ts.slot_end
                          AND a.end_time > ts.slot_start
                    ) THEN 0
                    ELSE 1
                END AS is_open
            FROM Time_Slot ts
            JOIN Staff st ON ts.staff_id = st.staff_id
            WHERE ts.slot_start >= %s
              AND ts.slot_start < %s
        )
        SELECT
            slot_date,
            CASE
                WHEN SUM(is_open) OVER (PARTITION BY slot_date) > 0
                THEN 'Available'
                ELSE 'Fully Booked'
            END AS date_availability_status,
            staff_id,
            barber,
            slot_start AS time_slot_start,
            slot_end AS time_slot_end,
            CASE WHEN is_open = 1 THEN 'Available' ELSE 'Booked' END
                AS time_slot_availability
        FROM slots
        ORDER BY slot_date, slot_start, barber
        """,
        (first_day, next_month),
    )

    return jsonify(clean(rows)), 200


# ---------------------------------------------------------------------------
# Appointments
# ---------------------------------------------------------------------------

@app.route("/api/appointments", methods=["POST"])
def create_appointment():
    data = json_body()

    try:
        customer_id = required_int(data, "customer_id")
        staff_id = required_int(data, "staff_id")
        service_id = required_int(data, "service_id")
        start = parse_datetime(data.get("start_time"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    service_rows = execute_read_query(
        conn,
        """
        SELECT price, duration_minutes
        FROM Service
        WHERE service_id = %s
        """,
        (service_id,),
    )
    if not service_rows:
        return jsonify({"error": "Service not found."}), 404

    # Confirm that the referenced customer and staff member exist.
    customer_rows = execute_read_query(
        conn,
        "SELECT customer_id FROM Customer WHERE customer_id = %s",
        (customer_id,),
    )
    if not customer_rows:
        return jsonify({"error": "Customer not found."}), 404

    staff_rows = execute_read_query(
        conn,
        "SELECT staff_id FROM Staff WHERE staff_id = %s",
        (staff_id,),
    )
    if not staff_rows:
        return jsonify({"error": "Staff member not found."}), 404

    end = start + timedelta(minutes=int(service_rows[0]["duration_minutes"]))

    if has_conflict(staff_id, start, end):
        return jsonify({"error": "The requested appointment time is unavailable."}), 409

    try:
        conn.start_transaction()

        _, appointment_id = execute_query(
            conn,
            """
            INSERT INTO Appointment
                (customer_id, staff_id, start_time, end_time, status)
            VALUES (%s, %s, %s, %s, 'booked')
            """,
            (customer_id, staff_id, start, end),
        )

        execute_query(
            conn,
            """
            INSERT INTO Appointment_Service
                (appointment_id, service_id, price_at_booking)
            VALUES (%s, %s, %s)
            """,
            (appointment_id, service_id, service_rows[0]["price"]),
        )

        conn.commit()

    except Exception:
        conn.rollback()
        logger.exception("Could not create appointment.")
        return jsonify({"error": "Appointment could not be created."}), 500

    return jsonify({
        "appointment_id": appointment_id,
        "customer_id": customer_id,
        "staff_id": staff_id,
        "service_id": service_id,
        "appointment_date": start.strftime("%Y-%m-%d"),
        "appointment_time": start.strftime("%H:%M:%S"),
        "end_time": end.strftime("%H:%M:%S"),
        "confirmation_number": f"BB-{appointment_id:06d}",
    }), 201


@app.route("/api/appointments/<int:appointment_id>", methods=["GET"])
def view_appointment(appointment_id):
    rows = execute_read_query(
        conn,
        """
        SELECT
            a.appointment_id,
            a.customer_id,
            a.staff_id,
            CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
            c.phone,
            c.email,
            a.status AS appointment_status,
            DATE(a.start_time) AS appointment_date,
            TIME(a.start_time) AS appointment_time,
            TIMESTAMPDIFF(MINUTE, a.start_time, a.end_time) AS duration_minutes,
            a.notes,
            (
                SELECT GROUP_CONCAT(s.name SEPARATOR ', ')
                FROM Appointment_Service aps
                JOIN Service s ON s.service_id = aps.service_id
                WHERE aps.appointment_id = a.appointment_id
            ) AS services,
            (
                SELECT SUM(aps.price_at_booking)
                FROM Appointment_Service aps
                WHERE aps.appointment_id = a.appointment_id
            ) AS appointment_price,
            (
                SELECT GROUP_CONCAT(u.file_url SEPARATOR ', ')
                FROM User_Upload u
                WHERE u.appointment_id = a.appointment_id
            ) AS reference_photos
        FROM Appointment a
        JOIN Customer c ON c.customer_id = a.customer_id
        WHERE a.appointment_id = %s
        """,
        (appointment_id,),
    )

    if not rows:
        return jsonify({"error": "Appointment not found."}), 404
    return jsonify(clean(rows)[0]), 200


@app.route("/api/appointments/<int:appointment_id>", methods=["PUT"])
def reschedule_appointment(appointment_id):
    data = json_body()

    try:
        new_start = parse_datetime(data.get("start_time"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    rows = execute_read_query(
        conn,
        """
        SELECT
            staff_id,
            TIMESTAMPDIFF(MINUTE, start_time, end_time) AS duration_minutes
        FROM Appointment
        WHERE appointment_id = %s
          AND status = 'booked'
        """,
        (appointment_id,),
    )
    if not rows:
        return jsonify({"error": "No booked appointment found with that ID."}), 404

    staff_id = rows[0]["staff_id"]
    new_end = new_start + timedelta(minutes=int(rows[0]["duration_minutes"]))

    if has_conflict(staff_id, new_start, new_end, exclude_appt_id=appointment_id):
        return jsonify({"error": "The requested appointment time is unavailable."}), 409

    affected, _ = execute_query(
        conn,
        """
        UPDATE Appointment
        SET start_time = %s, end_time = %s
        WHERE appointment_id = %s
          AND status = 'booked'
        """,
        (new_start, new_end, appointment_id),
    )

    if affected == 0:
        return jsonify({"error": "Appointment could not be rescheduled."}), 409

    return jsonify({
        "appointment_id": appointment_id,
        "confirmation_number": f"BB-{appointment_id:06d}",
        "appointment_date": new_start.strftime("%Y-%m-%d"),
        "appointment_time": new_start.strftime("%H:%M:%S"),
        "end_time": new_end.strftime("%H:%M:%S"),
    }), 200


@app.route("/api/appointments/<int:appointment_id>/cancel", methods=["POST"])
def cancel_appointment(appointment_id):
    affected, _ = execute_query(
        conn,
        """
        UPDATE Appointment
        SET status = 'canceled'
        WHERE appointment_id = %s
          AND status = 'booked'
        """,
        (appointment_id,),
    )

    if affected == 0:
        return jsonify({"error": "No booked appointment found with that ID."}), 404

    return jsonify({
        "appointment_id": appointment_id,
        "confirmation_number": f"BB-{appointment_id:06d}",
        "status": "canceled",
    }), 200


@app.route("/api/customers/<int:customer_id>/appointments", methods=["GET"])
def appointment_history(customer_id):
    rows = execute_read_query(
        conn,
        """
        SELECT
            a.appointment_id,
            a.customer_id,
            DATE(a.start_time) AS appointment_date,
            TIME(a.start_time) AS appointment_time,
            a.status AS appointment_status,
            GROUP_CONCAT(sv.name SEPARATOR ', ') AS service_name,
            SUM(aps.price_at_booking) AS cost,
            COALESCE(
                (
                    SELECT
                        CASE
                            WHEN SUM(p.status = 'succeeded') > 0 THEN 'succeeded'
                            WHEN SUM(p.status = 'pending') > 0 THEN 'pending'
                            WHEN SUM(p.status = 'refunded') > 0 THEN 'refunded'
                            WHEN SUM(p.status = 'failed') > 0 THEN 'failed'
                        END
                    FROM Payment p
                    WHERE p.appointment_id = a.appointment_id
                ),
                'unpaid'
            ) AS payment_status
        FROM Appointment a
        JOIN Appointment_Service aps
            ON aps.appointment_id = a.appointment_id
        JOIN Service sv
            ON sv.service_id = aps.service_id
        WHERE a.customer_id = %s
        GROUP BY
            a.appointment_id,
            a.customer_id,
            a.start_time,
            a.status
        ORDER BY a.start_time DESC
        """,
        (customer_id,),
    )
    return jsonify(clean(rows)), 200


# ---------------------------------------------------------------------------
# Customer and appointment administration/read endpoints
# ---------------------------------------------------------------------------

@app.route("/api/customers", methods=["GET"])
def read_customers():
    rows = execute_read_query(
        conn,
        """
        SELECT
            customer_id,
            first_name,
            last_name,
            CONCAT(first_name, ' ', last_name) AS customer_name,
            phone,
            email
        FROM Customer
        ORDER BY last_name, first_name
        """,
    )
    return jsonify(clean(rows)), 200


@app.route("/api/customers", methods=["POST"])
def create_customer():
    """Create a customer profile. Passwords are stored only as secure hashes."""
    data = json_body()

    try:
        first_name = required_text(data, "first_name")
        last_name = required_text(data, "last_name")
        username = required_text(data, "username")
        password = required_text(data, "password")
        phone = required_text(data, "phone")

        if len(first_name) > 50 or len(last_name) > 50 or len(username) > 50:
            raise ValueError("first_name, last_name, and username must be 50 characters or fewer")
        if len(password) < 8:
            raise ValueError("password must be at least 8 characters")
        if len(phone) > 20:
            raise ValueError("phone must be 20 characters or fewer")

        email = data.get("email") or None
        if email is not None:
            if not isinstance(email, str):
                raise ValueError("email must be a string or null")
            email = email.strip() or None
            if email and len(email) > 100:
                raise ValueError("email must be 100 characters or fewer")

        preferred_service_id = data.get("preferred_service_id")
        if preferred_service_id in ("", None):
            preferred_service_id = None
        else:
            preferred_service_id = int(preferred_service_id)
            if preferred_service_id < 1:
                raise ValueError("preferred_service_id must be a positive integer")
            service = execute_read_query(
                conn,
                "SELECT service_id FROM Service WHERE service_id = %s",
                (preferred_service_id,),
            )
            if not service:
                return jsonify({"error": "Preferred service not found."}), 400

        dob = data.get("date_of_birth") or None
        if dob is not None:
            dob = parse_iso_date(dob, "date_of_birth")

        password_hash = generate_password_hash(password)
        affected, customer_id = execute_query(
            conn,
            """
            INSERT INTO Customer
                (preferred_service_id, first_name, last_name, username,
                 password_hash, phone, email, date_of_birth)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (preferred_service_id, first_name, last_name, username,
             password_hash, phone, email, dob),
        )
        return jsonify({
            "customer_id": customer_id,
            "first_name": first_name,
            "last_name": last_name,
            "username": username,
            "phone": phone,
            "email": email,
            "preferred_service_id": preferred_service_id,
            "date_of_birth": dob.isoformat() if dob else None,
            "message": "Customer profile created successfully.",
        }), 201
    except (ValueError, TypeError) as error:
        return jsonify({"error": str(error)}), 400
    except Error as error:
        # MySQL error 1062 means a unique username or email already exists.
        if getattr(error, "errno", None) == 1062:
            return jsonify({"error": "That username or email is already in use."}), 409
        raise


@app.route("/api/customers/<int:customer_id>", methods=["PUT", "PATCH"])
def update_customer(customer_id):
    """Update editable profile fields; omitted fields remain unchanged."""
    data = json_body()
    if not data:
        return jsonify({"error": "A JSON object with at least one field is required."}), 400

    # Only these profile fields may be changed through this endpoint.
    allowed_fields = {
        "first_name", "last_name", "username", "password",
        "phone", "email", "preferred_service_id", "date_of_birth",
    }
    unknown_fields = set(data) - allowed_fields
    if unknown_fields:
        return jsonify({"error": "Unsupported field(s): " + ", ".join(sorted(unknown_fields))}), 400

    existing = execute_read_query(
        conn,
        "SELECT customer_id FROM Customer WHERE customer_id = %s",
        (customer_id,),
    )
    if not existing:
        return jsonify({"error": "Customer not found."}), 404

    updates = []
    params = []
    try:
        for field, max_length in (("first_name", 50), ("last_name", 50),
                                  ("username", 50), ("phone", 20)):
            if field in data:
                value = data[field]
                if not isinstance(value, str) or not value.strip():
                    raise ValueError(f"{field} cannot be empty")
                value = value.strip()
                if len(value) > max_length:
                    raise ValueError(f"{field} must be {max_length} characters or fewer")
                updates.append(f"{field} = %s")
                params.append(value)

        if "password" in data:
            password = required_text(data, "password")
            if len(password) < 8:
                raise ValueError("password must be at least 8 characters")
            updates.append("password_hash = %s")
            params.append(generate_password_hash(password))

        if "email" in data:
            email = data["email"]
            if email is not None and not isinstance(email, str):
                raise ValueError("email must be a string or null")
            email = email.strip() or None if isinstance(email, str) else None
            if email and len(email) > 100:
                raise ValueError("email must be 100 characters or fewer")
            updates.append("email = %s")
            params.append(email)

        if "preferred_service_id" in data:
            service_id = data["preferred_service_id"]
            if service_id in (None, ""):
                service_id = None
            else:
                service_id = int(service_id)
                if service_id < 1:
                    raise ValueError("preferred_service_id must be a positive integer")
                service = execute_read_query(
                    conn, "SELECT service_id FROM Service WHERE service_id = %s", (service_id,)
                )
                if not service:
                    return jsonify({"error": "Preferred service not found."}), 400
            updates.append("preferred_service_id = %s")
            params.append(service_id)

        if "date_of_birth" in data:
            dob = data["date_of_birth"]
            dob = parse_iso_date(dob, "date_of_birth") if dob else None
            updates.append("date_of_birth = %s")
            params.append(dob)

        if not updates:
            return jsonify({"error": "No profile fields were provided to update."}), 400

        params.append(customer_id)
        execute_query(
            conn,
            "UPDATE Customer SET " + ", ".join(updates) + " WHERE customer_id = %s",
            tuple(params),
        )
        return jsonify({
            "customer_id": customer_id,
            "message": "Customer profile updated successfully.",
        }), 200
    except (ValueError, TypeError) as error:
        return jsonify({"error": str(error)}), 400
    except Error as error:
        if getattr(error, "errno", None) == 1062:
            return jsonify({"error": "That username or email is already in use."}), 409
        raise


@app.route("/api/customers/<int:customer_id>", methods=["GET"])
def read_customer_details(customer_id):
    rows = execute_read_query(
        conn,
        """
        SELECT
            c.customer_id,
            CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
            c.phone,
            c.email,
            a.appointment_id,
            DATE(a.start_time) AS appointment_date,
            TIME(a.start_time) AS appointment_time,
            GROUP_CONCAT(s.name SEPARATOR ', ') AS services,
            TIMESTAMPDIFF(MINUTE, a.start_time, a.end_time) AS duration_minutes,
            a.notes AS customer_notes,
            a.status AS appointment_status
        FROM Customer c
        LEFT JOIN Appointment a ON a.customer_id = c.customer_id
        LEFT JOIN Appointment_Service aps ON aps.appointment_id = a.appointment_id
        LEFT JOIN Service s ON s.service_id = aps.service_id
        WHERE c.customer_id = %s
        GROUP BY
            c.customer_id,
            c.first_name,
            c.last_name,
            c.phone,
            c.email,
            a.appointment_id,
            a.start_time,
            a.end_time,
            a.notes,
            a.status
        ORDER BY a.start_time DESC
        """,
        (customer_id,),
    )

    if not rows:
        return jsonify({"error": "Customer not found."}), 404
    return jsonify(clean(rows)), 200


@app.route("/api/appointments", methods=["GET"])
def read_appointments():
    """List appointments; optional start_date and end_date filters are supported."""
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    status = request.args.get("status")

    conditions = []
    params = []

    if start_date:
        try:
            start_date = parse_iso_date(start_date, "start_date")
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        conditions.append("a.start_time >= %s")
        params.append(start_date)

    if end_date:
        try:
            end_date = parse_iso_date(end_date, "end_date")
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        conditions.append("a.start_time < %s")
        params.append(end_date + timedelta(days=1))

    if status:
        allowed_statuses = {"booked", "completed", "canceled"}
        if status not in allowed_statuses:
            return jsonify({"error": "Invalid appointment status."}), 400
        conditions.append("a.status = %s")
        params.append(status)

    where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""

    sql = """
        SELECT
            a.appointment_id,
            a.customer_id,
            a.staff_id,
            DATE(a.start_time) AS appointment_date,
            TIME(a.start_time) AS appointment_time,
            CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
            c.phone,
            GROUP_CONCAT(s.name SEPARATOR ', ') AS services,
            SUM(aps.price_at_booking) AS appointment_price,
            a.status AS appointment_status,
            COALESCE(
                (
                    SELECT
                        CASE
                            WHEN SUM(p.status = 'succeeded') > 0 THEN 'succeeded'
                            WHEN SUM(p.status = 'pending') > 0 THEN 'pending'
                            WHEN SUM(p.status = 'refunded') > 0 THEN 'refunded'
                            WHEN SUM(p.status = 'failed') > 0 THEN 'failed'
                        END
                    FROM Payment p
                    WHERE p.appointment_id = a.appointment_id
                ),
                'Unpaid'
            ) AS payment_status
        FROM Appointment a
        JOIN Customer c ON c.customer_id = a.customer_id
        JOIN Appointment_Service aps ON aps.appointment_id = a.appointment_id
        JOIN Service s ON s.service_id = aps.service_id
    """ + where_clause + """
        GROUP BY
            a.appointment_id,
            a.customer_id,
            a.staff_id,
            a.start_time,
            c.first_name,
            c.last_name,
            c.phone,
            a.status
        ORDER BY a.start_time
    """

    rows = execute_read_query(conn, sql, tuple(params))
    return jsonify(clean(rows)), 200


@app.route("/api/appointments/upcoming", methods=["GET"])
def read_upcoming_appointments():
    rows = execute_read_query(
        conn,
        """
        SELECT
            a.appointment_id,
            a.customer_id,
            a.staff_id,
            CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
            c.phone,
            DATE(a.start_time) AS appointment_date,
            TIME(a.start_time) AS appointment_time,
            GROUP_CONCAT(s.name SEPARATOR ', ') AS services,
            SUM(aps.price_at_booking) AS total_price,
            a.status
        FROM Appointment a
        JOIN Customer c ON c.customer_id = a.customer_id
        JOIN Appointment_Service aps ON aps.appointment_id = a.appointment_id
        JOIN Service s ON s.service_id = aps.service_id
        WHERE a.start_time >= NOW()
          AND a.status = 'booked'
        GROUP BY
            a.appointment_id,
            a.customer_id,
            a.staff_id,
            c.first_name,
            c.last_name,
            c.phone,
            a.start_time,
            a.status
        ORDER BY a.start_time ASC
        """,
    )
    return jsonify(clean(rows)), 200


@app.route("/api/appointments/weekly", methods=["GET"])
def read_appointments_per_week():
    """Return appointments in a requested date range (end_date is inclusive)."""
    start_value = request.args.get("start_date")
    end_value = request.args.get("end_date")

    if not start_value or not end_value:
        return jsonify({
            "error": "start_date and end_date are required (YYYY-MM-DD)."
        }), 400

    try:
        start_date = parse_iso_date(start_value, "start_date")
        end_date = parse_iso_date(end_value, "end_date")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if end_date < start_date:
        return jsonify({"error": "end_date must be on or after start_date."}), 400

    rows = execute_read_query(
        conn,
        """
        SELECT
            a.appointment_id,
            DATE(a.start_time) AS appointment_date,
            TIME(a.start_time) AS appointment_time,
            CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
            GROUP_CONCAT(s.name SEPARATOR ', ') AS services,
            a.status AS appointment_status,
            SUM(aps.price_at_booking) AS total_price
        FROM Appointment a
        JOIN Customer c ON c.customer_id = a.customer_id
        JOIN Appointment_Service aps ON aps.appointment_id = a.appointment_id
        JOIN Service s ON s.service_id = aps.service_id
        WHERE a.start_time >= %s
          AND a.start_time < %s
        GROUP BY
            a.appointment_id,
            a.start_time,
            c.first_name,
            c.last_name,
            a.status
        ORDER BY a.start_time
        """,
        (start_date, end_date + timedelta(days=1)),
    )
    return jsonify(clean(rows)), 200


# ---------------------------------------------------------------------------
# Staff time off and weekly hours
# ---------------------------------------------------------------------------

@app.route("/api/staff/<int:staff_id>/time-off", methods=["GET"])
def read_time_off(staff_id):
    rows = execute_read_query(
        conn,
        """
        SELECT
            slot_id,
            DATE(slot_start) AS day_off_date,
            TIME(slot_start) AS start_time,
            TIME(slot_end) AS end_time
        FROM Time_Slot
        WHERE staff_id = %s
          AND is_blocked = 1
        ORDER BY slot_start
        """,
        (staff_id,),
    )
    return jsonify(clean(rows)), 200


@app.route("/api/staff/<int:staff_id>/time-off", methods=["POST"])
def create_day_off(staff_id):
    data = json_body()

    try:
        start = parse_datetime(data.get("slot_start"), "slot_start")
        end = parse_datetime(data.get("slot_end"), "slot_end")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if end <= start:
        return jsonify({"error": "slot_end must be later than slot_start."}), 400

    staff_rows = execute_read_query(
        conn,
        "SELECT staff_id FROM Staff WHERE staff_id = %s",
        (staff_id,),
    )
    if not staff_rows:
        return jsonify({"error": "Staff member not found."}), 404

    execute_query(
        conn,
        """
        INSERT INTO Time_Slot (staff_id, slot_start, slot_end, is_blocked)
        VALUES (%s, %s, %s, %s)
        """,
        (staff_id, start, end, 1),
    )

    return jsonify({"message": "Time off added successfully."}), 201


@app.route("/api/staff/<int:staff_id>/weekly-hours", methods=["PUT"])
def update_weekly_hours(staff_id):
    data = json_body()

    try:
        day_of_week = required_int(data, "day_of_week", minimum=0)
        start_time = required_text(data, "start_time")
        end_time = required_text(data, "end_time")
        is_open = data["is_open"]
    except (KeyError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400

    if day_of_week > 6:
        return jsonify({"error": "day_of_week must be between 0 and 6."}), 400

    if not isinstance(is_open, bool):
        return jsonify({"error": "is_open must be true or false."}), 400

    # Validate time strings before sending them to MySQL.
    try:
        datetime.strptime(start_time, "%H:%M:%S")
        datetime.strptime(end_time, "%H:%M:%S")
    except ValueError:
        return jsonify({"error": "start_time and end_time must use HH:MM:SS."}), 400

    if is_open and start_time >= end_time:
        return jsonify({"error": "end_time must be later than start_time."}), 400

    staff_rows = execute_read_query(
        conn,
        "SELECT staff_id FROM Staff WHERE staff_id = %s",
        (staff_id,),
    )
    if not staff_rows:
        return jsonify({"error": "Staff member not found."}), 404

    # Requires a UNIQUE KEY on Weekly_Hours(staff_id, day_of_week).
    execute_query(
        conn,
        """
        INSERT INTO Weekly_Hours
            (staff_id, day_of_week, start_time, end_time, is_open)
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
# Shopping cart (optional retail functionality)
# ---------------------------------------------------------------------------

@app.route("/api/cart/<int:customer_id>", methods=["GET"])
def view_cart(customer_id):
    return jsonify(get_cart_items(customer_id)), 200


@app.route("/api/cart", methods=["POST"])
def create_cart():
    data = json_body()

    try:
        customer_id = required_int(data, "customer_id")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    existing_cart_id = get_cart_id(customer_id)
    if existing_cart_id is None:
        customer = execute_read_query(
            conn,
            "SELECT customer_id FROM Customer WHERE customer_id = %s",
            (customer_id,),
        )
        if not customer:
            return jsonify({"error": "Customer not found."}), 404

        execute_query(
            conn,
            "INSERT INTO Cart (customer_id, created_at) VALUES (%s, NOW())",
            (customer_id,),
        )

    rows = execute_read_query(
        conn,
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

    try:
        customer_id = required_int(data, "customer_id")
        product_id = required_int(data, "product_id")
        quantity = required_int(data, "quantity", minimum=0)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    cart_id = get_cart_id(customer_id)
    if cart_id is None:
        return jsonify({"error": "Customer does not have a cart."}), 404

    if quantity == 0:
        execute_query(
            conn,
            """
            DELETE FROM Cart_Item
            WHERE cart_id = %s AND product_id = %s
            """,
            (cart_id, product_id),
        )
    else:
        execute_query(
            conn,
            """
            INSERT INTO Cart_Item (cart_id, product_id, quantity)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)
            """,
            (cart_id, product_id, quantity),
        )

    return jsonify(get_cart_items(customer_id)), 200


# ---------------------------------------------------------------------------
# Customer deactivation
# ---------------------------------------------------------------------------

@app.route("/api/customers/<int:customer_id>", methods=["DELETE"])
def deactivate_customer(customer_id):
    """
    Deactivate a customer rather than deleting their appointment/payment history.

    This assumes Customer has an `active` column. If your schema does not have
    that column yet, add it or temporarily remove this endpoint.
    """
    affected, _ = execute_query(
        conn,
        """
        UPDATE Customer
        SET active = 0
        WHERE customer_id = %s
        """,
        (customer_id,),
    )

    if affected == 0:
        exists = execute_read_query(
            conn,
            "SELECT customer_id FROM Customer WHERE customer_id = %s",
            (customer_id,),
        )
        if not exists:
            return jsonify({"error": "Customer not found."}), 404

    return jsonify({
        "customer_id": customer_id,
        "active": False,
        "message": "Customer deactivated successfully.",
    }), 200


# ---------------------------------------------------------------------------
# Run development server only when this file is executed directly
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=int(os.getenv("PORT", "5000")),
        debug=app.config["DEBUG"],
    )
