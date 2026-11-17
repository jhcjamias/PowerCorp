"""
Online card payment through Stripe Checkout.

Same rules as the other test files: runs the real Flask app against a
disposable MySQL database whose name ends in "_test", loaded from
migrations/000_schema.sql, 001_seed.sql and 002_stripe_payments.sql.

Two groups of tests:

* StripeCheckoutTest always runs. Stripe's API is replaced by an in-memory
  fake, and webhook events are signed with a local test secret, so the real
  stripe library checks every signature. No network, no Stripe account.

* StripeTestModeTest calls Stripe's real *test mode* API. It runs only when
  STRIPE_SECRET_KEY holds a test key (sk_test_...). It refuses live keys.
  It creates test Checkout Sessions, a test card charge and a test refund;
  no real money moves.

    DB_HOST=127.0.0.1 DB_PORT=... DB_USER=... DB_PASSWORD=... DB_NAME=barbershop_test \
    STRIPE_SECRET_KEY=sk_test_... \
        python -m unittest discover -s "Back End/tests" -v
"""

import hashlib
import hmac
import json
import os
import random
import sys
import time
import unittest
from datetime import timedelta

DB_NAME = os.getenv("DB_NAME", "")
if not DB_NAME.endswith("_test"):
    raise unittest.SkipTest("Set DB_HOST/DB_USER/DB_PASSWORD/DB_NAME for a database named *_test.")

LIVE_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
if LIVE_KEY.startswith(("sk_live_", "rk_live_")):
    raise unittest.SkipTest("Refusing to run payment tests with a LIVE Stripe key. Use an sk_test_ key.")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import crud  # noqa: E402
import stripe  # noqa: E402
from sqlhelper import create_connection, execute_query, execute_read_query  # noqa: E402
from werkzeug.security import generate_password_hash  # noqa: E402

ADMIN_PASSWORD = "integration-test-password"
WEBHOOK_SECRET = "whsec_local_test_secret"
SITE = "https://rolaz.example"
REGULAR_CENTS = 4500  # migrations/001_seed.sql: The OG
SCISSOR_CENTS = 500   # Scissor Workz upgrade


class FakeStripe:
    """Just enough of Stripe Checkout and Refunds for the app's four calls."""

    def __init__(self):
        self.sessions = {}
        self.created = []
        self.expired = []
        self.refunds = []
        self.fail_create = False
        self.fail_refund = False

    def create(self, params, idempotency_key):
        if self.fail_create:
            raise RuntimeError("Stripe is unreachable")
        session_id = f"cs_test_fake{random.randint(0, 10**12)}"
        amount = sum(item["price_data"]["unit_amount"] * item["quantity"] for item in params["line_items"])
        session = {
            "id": session_id, "object": "checkout.session", "mode": "payment",
            "url": f"https://checkout.stripe.com/c/pay/{session_id}",
            "status": "open", "payment_status": "unpaid", "currency": "usd",
            "amount_total": amount, "metadata": dict(params["metadata"]), "payment_intent": None,
        }
        self.sessions[session_id] = session
        self.created.append((params, idempotency_key))
        return dict(session)

    def retrieve(self, session_id):
        return dict(self.sessions[session_id])

    def expire(self, session_id):
        session = self.sessions[session_id]
        if session["status"] != "open":
            raise RuntimeError("Only open sessions can be expired")
        session["status"] = "expired"
        self.expired.append(session_id)
        return dict(session)

    def refund(self, payment_intent_id, appointment_id):
        if self.fail_refund:
            raise RuntimeError("Stripe refused the refund")
        self.refunds.append((payment_intent_id, appointment_id))
        return {"id": f"re_{appointment_id}", "status": "succeeded"}

    def pay(self, session_id, amount=None):
        """What Stripe's session looks like after the customer pays."""
        session = self.sessions[session_id]
        session.update(status="complete", payment_status="paid", payment_intent=f"pi_for_{session_id}")
        if amount is not None:
            session["amount_total"] = amount
        return dict(session)


class StripeBase(unittest.TestCase):
    first_day_offset = 120  # far from the other test files' Tuesdays

    @classmethod
    def setUpClass(cls):
        crud.app.config["TESTING"] = True
        cls.conn = create_connection(*crud.DB_SETTINGS)
        cls.conn.autocommit = True
        execute_query(cls.conn, "SET time_zone = '+00:00'")
        cls.username = f"test-stripe-admin-{random.randint(0, 10**9)}"
        _, cls.staff_id = execute_query(
            cls.conn,
            "INSERT INTO Staff (name, username, password_hash, role) VALUES (%s, %s, %s, 'admin')",
            ("Stripe Admin", cls.username, generate_password_hash(ADMIN_PASSWORD)),
        )
        os.environ["BARBER_STAFF_ID"] = str(cls.staff_id)
        crud._barber_staff_id = None
        cls.week = 0
        day = crud.shop_today() + timedelta(days=cls.first_day_offset)
        while day.weekday() != 1:
            day += timedelta(days=1)
        cls.first_tuesday = day
        cls.saved = (crud.STRIPE_SECRET_KEY, crud.STRIPE_WEBHOOK_SECRET, crud.SITE_URL)

        admin = crud.app.test_client()
        response = admin.post("/api/auth/login", json={"identifier": cls.username, "password": ADMIN_PASSWORD})
        assert response.status_code == 200, response.get_json()
        cls.admin = admin
        cls.admin_headers = {"Authorization": f"Bearer {response.get_json()['token']}"}

    @classmethod
    def tearDownClass(cls):
        crud.STRIPE_SECRET_KEY, crud.STRIPE_WEBHOOK_SECRET, crud.SITE_URL = cls.saved
        conn = cls.conn
        ids = [r["appointment_id"] for r in execute_read_query(
            conn, "SELECT appointment_id FROM Appointment WHERE staff_id = %s", (cls.staff_id,))]
        for appointment_id in ids:
            execute_query(conn, "DELETE FROM User_Upload WHERE appointment_id = %s", (appointment_id,))
            execute_query(conn, "DELETE FROM Appointment_Service WHERE appointment_id = %s", (appointment_id,))
            execute_query(conn, "DELETE FROM Appointment WHERE appointment_id = %s", (appointment_id,))
        execute_query(conn, "DELETE FROM Staff_Session WHERE staff_id = %s", (cls.staff_id,))
        execute_query(conn, "DELETE FROM Staff WHERE staff_id = %s", (cls.staff_id,))
        conn.close()

    # -- helpers -------------------------------------------------------------

    def next_tuesday(self):
        day = self.first_tuesday + timedelta(days=7 * type(self).week)
        type(self).week += 1
        return day

    def booking_body(self, day, services=None, payment="Stripe", method="stripe", email=""):
        return {
            "date": day.isoformat(), "time": "12:00",
            "customer": {"name": "Pat Guest", "email": email, "phone": f"+1832555{random.randint(0, 9999):04d}"},
            # The browser's prices are deliberately wrong: the server must ignore them.
            "services": services or [{"id": "regular", "name": "x", "price": 1, "durationMin": 1}],
            "status": "Booked", "payment": payment, "paymentMethod": method,
            "receiptSent": False, "referencePhotos": 0, "notes": "",
            "policyAccepted": True, "policyVersion": crud.POLICY_VERSION,
        }

    def checkout(self, day=None, services=None, email="", expect=201):
        day = day or self.next_tuesday()
        response = crud.app.test_client().post(
            "/api/customer/stripe/checkout", json=self.booking_body(day, services, email=email))
        self.assertEqual(response.status_code, expect, response.get_json())
        body = response.get_json()
        body["day"] = day
        return body

    def admin_view(self, appointment_id):
        response = self.admin.get(f"/api/appointments/{appointment_id}", headers=self.admin_headers)
        self.assertEqual(response.status_code, 200, response.get_json())
        return response.get_json()

    def db_row(self, appointment_id):
        return execute_read_query(
            self.conn, "SELECT * FROM Appointment WHERE appointment_id = %s", (appointment_id,))[0]

    def guest_patch(self, appointment_id, token, body):
        return crud.app.test_client().patch(
            f"/api/customer/appointments/{appointment_id}", json=body,
            headers={"X-Guest-Token": token} if token else {})

    def admin_cancel(self, appointment_id, status="Cancelled"):
        return self.admin.patch(f"/api/appointments/{appointment_id}", json={"status": status},
                                headers=self.admin_headers)

    def send_event(self, event_type, obj, secret=WEBHOOK_SECRET):
        payload = json.dumps({"id": f"evt_{random.randint(0, 10**9)}", "object": "event",
                              "type": event_type, "data": {"object": obj}})
        stamp = int(time.time())
        signature = hmac.new(secret.encode(), f"{stamp}.{payload}".encode(), hashlib.sha256).hexdigest()
        return crud.app.test_client().post(
            "/api/stripe/webhook", data=payload, content_type="application/json",
            headers={"Stripe-Signature": f"t={stamp},v1={signature}"})

    def slot_open(self, day, minute=720):
        response = crud.app.test_client().get(
            f"/api/public/availability?date={day.isoformat()}&serviceId=regular")
        return next(s["available"] for s in response.get_json()["slots"] if s["time"] == minute)


class StripeCheckoutTest(StripeBase):
    """Offline: a fake Stripe API, real signature checks, real database."""

    def setUp(self):
        self.fake = FakeStripe()
        self.saved_calls = (crud.stripe_create_checkout, crud.stripe_retrieve_checkout,
                            crud.stripe_expire_checkout, crud.stripe_refund)
        crud.stripe_create_checkout = self.fake.create
        crud.stripe_retrieve_checkout = self.fake.retrieve
        crud.stripe_expire_checkout = self.fake.expire
        crud.stripe_refund = self.fake.refund
        crud.STRIPE_SECRET_KEY = "sk_test_offline_placeholder"
        crud.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET
        crud.SITE_URL = SITE

    def tearDown(self):
        (crud.stripe_create_checkout, crud.stripe_retrieve_checkout,
         crud.stripe_expire_checkout, crud.stripe_refund) = self.saved_calls

    def paid(self, checkout, amount=None):
        """Simulate the customer paying, delivered by Stripe's webhook."""
        session = self.fake.pay(checkout["sessionId"], amount)
        response = self.send_event("checkout.session.completed", session)
        self.assertEqual(response.status_code, 200, response.get_json())
        return session

    # -- starting a checkout ------------------------------------------------

    def test_not_configured_answers_503_and_books_nothing(self):
        crud.STRIPE_SECRET_KEY = ""
        day = self.next_tuesday()
        self.checkout(day=day, expect=503)
        self.assertTrue(self.slot_open(day), "nothing may be reserved without Stripe")

    def test_checkout_holds_the_time_and_charges_catalog_prices(self):
        checkout = self.checkout(
            services=[{"id": "regular", "name": "x", "price": 1, "durationMin": 1},
                      {"id": "scissor-workz", "name": "x", "price": 1, "durationMin": 1}],
            email="pat@example.com")
        self.assertTrue(checkout["checkoutUrl"].startswith("https://checkout.stripe.com/"))
        self.assertTrue(checkout["guestToken"], "a guest gets a management code")

        params, key = self.fake.created[-1]
        charged = sum(item["price_data"]["unit_amount"] for item in params["line_items"])
        self.assertEqual(charged, REGULAR_CENTS + SCISSOR_CENTS, "prices come from the catalog")
        self.assertEqual(params["metadata"], {"appointment_id": checkout["appointmentId"]})
        self.assertEqual(params["customer_email"], "pat@example.com")
        self.assertEqual(key, f"checkout-appointment-{checkout['appointmentId']}")
        self.assertAlmostEqual(params["expires_at"] - time.time(), crud.STRIPE_CHECKOUT_SECONDS, delta=5)
        self.assertEqual(params["success_url"],
                         f"{SITE}/?checkout=success&session_id={{CHECKOUT_SESSION_ID}}#payment-success")
        self.assertEqual(params["cancel_url"], f"{SITE}/?checkout=cancel#payment-cancel")

        view = self.admin_view(checkout["appointmentId"])
        self.assertEqual(view["status"], "Booked", "the admin pages know this status")
        self.assertEqual(view["payment"], "Awaiting payment")
        self.assertEqual(view["paymentMethod"], "Online card")
        self.assertFalse(self.slot_open(checkout["day"]), "the unpaid booking holds its time")

    def test_return_address_falls_back_to_the_approved_origin_only(self):
        crud.SITE_URL = ""
        day = self.next_tuesday()
        body = self.booking_body(day)
        response = crud.app.test_client().post("/api/customer/stripe/checkout", json=body,
                                               headers={"Origin": "http://localhost:5500"})
        self.assertEqual(response.status_code, 201, response.get_json())
        self.assertTrue(self.fake.created[-1][0]["success_url"].startswith("http://localhost:5500/?"))

        response = crud.app.test_client().post("/api/customer/stripe/checkout",
                                               json=self.booking_body(self.next_tuesday()))
        self.assertEqual(response.status_code, 503, "no SITE_URL and no Origin: refuse, never localhost")

    def test_stripe_failure_releases_the_time(self):
        self.fake.fail_create = True
        day = self.next_tuesday()
        self.checkout(day=day, expect=502)
        self.assertTrue(self.slot_open(day))

    def test_checkout_refuses_wrong_payment_fields_and_reschedules(self):
        body = self.booking_body(self.next_tuesday(), payment="Pay at Shop", method="shop")
        self.assertEqual(crud.app.test_client().post("/api/customer/stripe/checkout", json=body).status_code, 400)
        body = self.booking_body(self.next_tuesday())
        body["replacesId"] = "12"
        self.assertEqual(crud.app.test_client().post("/api/customer/stripe/checkout", json=body).status_code, 400)
        # And the Pay at Shop route still refuses online payment fields.
        body = self.booking_body(self.next_tuesday())
        self.assertEqual(crud.app.test_client().post("/api/customer/appointments", json=body).status_code, 400)

    # -- the webhook ----------------------------------------------------------

    def test_webhook_rejects_bad_signatures_and_needs_a_secret(self):
        checkout = self.checkout()
        session = self.fake.pay(checkout["sessionId"])
        self.assertEqual(self.send_event("checkout.session.completed", session, secret="whsec_wrong").status_code, 400)
        self.assertEqual(self.admin_view(checkout["appointmentId"])["payment"], "Awaiting payment")
        crud.STRIPE_WEBHOOK_SECRET = ""
        self.assertEqual(self.send_event("checkout.session.completed", session).status_code, 503)

    def test_paid_webhook_marks_paid_once(self):
        checkout = self.checkout()
        session = self.paid(checkout)
        self.assertEqual(self.send_event("checkout.session.completed", session).status_code, 200, "replays are fine")
        view = self.admin_view(checkout["appointmentId"])
        self.assertEqual((view["status"], view["payment"]), ("Booked", "Paid"))
        self.assertEqual(self.db_row(checkout["appointmentId"])["stripe_payment_intent_id"], session["payment_intent"])

    def test_wrong_amount_is_not_marked_paid(self):
        checkout = self.checkout()
        self.paid(checkout, amount=100)
        self.assertEqual(self.admin_view(checkout["appointmentId"])["payment"], "Awaiting payment")

    def test_session_for_another_booking_is_ignored(self):
        first, second = self.checkout(), self.checkout()
        session = self.fake.pay(first["sessionId"])
        session["metadata"] = {"appointment_id": second["appointmentId"]}
        self.assertEqual(self.send_event("checkout.session.completed", session).status_code, 200)
        self.assertEqual(self.admin_view(second["appointmentId"])["payment"], "Awaiting payment")

    def test_expired_checkout_frees_the_time(self):
        checkout = self.checkout()
        session = dict(self.fake.sessions[checkout["sessionId"]], status="expired")
        self.assertEqual(self.send_event("checkout.session.expired", session).status_code, 200)
        view = self.admin_view(checkout["appointmentId"])
        self.assertEqual((view["status"], view["payment"]), ("Cancelled", "Expired"))
        self.assertTrue(self.slot_open(checkout["day"]))

    def test_dashboard_refund_is_recorded(self):
        checkout = self.checkout()
        session = self.paid(checkout)
        charge = {"object": "charge", "payment_intent": session["payment_intent"],
                  "amount": REGULAR_CENTS, "amount_refunded": 1000}
        self.send_event("charge.refunded", charge)
        self.assertEqual(self.admin_view(checkout["appointmentId"])["payment"], "Partially refunded")
        self.send_event("charge.refunded", dict(charge, amount_refunded=REGULAR_CENTS))
        self.assertEqual(self.admin_view(checkout["appointmentId"])["payment"], "Refunded")

    # -- the page Stripe returns to -------------------------------------------

    def test_return_page_needs_the_guest_code_and_checks_stripe_directly(self):
        checkout = self.checkout()
        path = f"/api/customer/stripe/checkout/{checkout['sessionId']}"
        client = crud.app.test_client()
        self.assertEqual(client.get(path).status_code, 401)
        self.assertEqual(client.get(path, headers={"X-Guest-Token": "wrong"}).status_code, 403)
        self.assertEqual(client.get("/api/customer/stripe/checkout/cs_test_unknown",
                                    headers={"X-Guest-Token": checkout["guestToken"]}).status_code, 404)

        response = client.get(path, headers={"X-Guest-Token": checkout["guestToken"]})
        self.assertEqual(response.get_json()["payment"], "Awaiting payment")

        # Paid, but the webhook hasn't arrived yet: the return page asks Stripe.
        self.fake.pay(checkout["sessionId"])
        body = client.get(path, headers={"X-Guest-Token": checkout["guestToken"]}).get_json()
        self.assertEqual((body["id"], body["status"], body["payment"]),
                         (checkout["appointmentId"], "Booked", "Paid"))
        self.assertEqual(body["paymentMethod"], "Online card")

    # -- cancelling and refunds ---------------------------------------------

    def test_customer_cancel_of_paid_booking_refunds_in_full(self):
        checkout = self.checkout()
        session = self.paid(checkout)
        response = self.guest_patch(checkout["appointmentId"], checkout["guestToken"], {"status": "Cancelled"})
        self.assertEqual(response.status_code, 200, response.get_json())
        self.assertEqual((response.get_json()["status"], response.get_json()["payment"]), ("Cancelled", "Refunded"))
        self.assertEqual(self.fake.refunds, [(session["payment_intent"], int(checkout["appointmentId"]))])
        self.assertTrue(self.slot_open(checkout["day"]))

    def test_customer_cannot_cancel_prepaid_inside_two_hours(self):
        checkout = self.checkout()
        self.paid(checkout)
        soon = crud.utc_now() + timedelta(minutes=90)
        execute_query(self.conn, "UPDATE Appointment SET start_time = %s, end_time = %s WHERE appointment_id = %s",
                      (soon, soon + timedelta(minutes=35), checkout["appointmentId"]))
        response = self.guest_patch(checkout["appointmentId"], checkout["guestToken"], {"status": "Cancelled"})
        self.assertEqual(response.status_code, 409)
        self.assertIn("2 hours", response.get_json()["message"])
        self.assertEqual(self.fake.refunds, [])
        # Staff can still cancel, and that refunds.
        self.assertEqual(self.admin_cancel(checkout["appointmentId"]).status_code, 200)
        self.assertEqual(self.admin_view(checkout["appointmentId"])["payment"], "Refunded")

    def test_admin_cancel_refunds_but_no_show_and_completed_keep_payment(self):
        cancelled, no_show, completed = self.checkout(), self.checkout(), self.checkout()
        for checkout in (cancelled, no_show, completed):
            self.paid(checkout)
        self.assertEqual(self.admin_cancel(cancelled["appointmentId"]).status_code, 200)
        self.assertEqual(self.admin_cancel(no_show["appointmentId"], "No-show").status_code, 200)
        self.assertEqual(self.admin_cancel(completed["appointmentId"], "Completed").status_code, 200)
        self.assertEqual(self.admin_view(cancelled["appointmentId"])["payment"], "Refunded")
        self.assertEqual(self.admin_view(no_show["appointmentId"])["payment"], "Paid")
        self.assertEqual(self.admin_view(completed["appointmentId"])["payment"], "Paid")
        self.assertEqual(len(self.fake.refunds), 1)

    def test_refund_failure_keeps_the_booking(self):
        checkout = self.checkout()
        self.paid(checkout)
        self.fake.fail_refund = True
        response = self.admin_cancel(checkout["appointmentId"])
        self.assertEqual(response.status_code, 502)
        view = self.admin_view(checkout["appointmentId"])
        self.assertEqual((view["status"], view["payment"]), ("Booked", "Paid"))

    def test_cancelling_an_unpaid_hold_closes_the_payment_page(self):
        checkout = self.checkout()
        response = self.guest_patch(checkout["appointmentId"], checkout["guestToken"], {"status": "Cancelled"})
        self.assertEqual(response.status_code, 200, response.get_json())
        self.assertEqual(response.get_json()["payment"], "Cancelled")
        self.assertEqual(self.fake.expired, [checkout["sessionId"]])
        self.assertTrue(self.slot_open(checkout["day"]))

    def test_payment_that_arrives_after_cancelling_is_refunded(self):
        checkout = self.checkout()
        self.guest_patch(checkout["appointmentId"], checkout["guestToken"], {"status": "Cancelled"})
        # Stripe finished the payment just before the page was closed.
        self.fake.sessions[checkout["sessionId"]]["status"] = "open"
        self.paid(checkout)
        view = self.admin_view(checkout["appointmentId"])
        self.assertEqual((view["status"], view["payment"]), ("Cancelled", "Refunded"))
        self.assertEqual(len(self.fake.refunds), 1)

    # -- rescheduling --------------------------------------------------------

    def test_prepaid_booking_can_move_but_not_change_services(self):
        checkout = self.checkout()
        self.paid(checkout)
        new_day = self.next_tuesday()
        same = [{"id": "regular", "name": "x", "price": 1, "durationMin": 1}]
        response = self.guest_patch(checkout["appointmentId"], checkout["guestToken"],
                                    {"date": new_day.isoformat(), "time": "13:00", "services": same})
        self.assertEqual(response.status_code, 200, response.get_json())
        self.assertEqual(response.get_json()["services"][0]["price"], 45)
        self.assertEqual(response.get_json()["payment"], "Paid")

        more = same + [{"id": "scissor-workz", "name": "x", "price": 1, "durationMin": 1}]
        response = self.guest_patch(checkout["appointmentId"], checkout["guestToken"],
                                    {"date": new_day.isoformat(), "time": "14:00", "services": more})
        self.assertEqual(response.status_code, 409)


@unittest.skipUnless(LIVE_KEY.startswith("sk_test_"),
                     "Set STRIPE_SECRET_KEY=sk_test_... to run these against Stripe's test mode.")
class StripeTestModeTest(StripeBase):
    """Real calls to Stripe's test-mode API. Test cards only; no real money."""

    first_day_offset = 260

    def setUp(self):
        crud.STRIPE_SECRET_KEY = LIVE_KEY
        crud.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET  # events below are signed locally
        crud.SITE_URL = "http://localhost:5500"
        self.client = stripe.StripeClient(LIVE_KEY)
        self.sessions = []

    def tearDown(self):
        for session_id in self.sessions:
            try:
                self.client.v1.checkout.sessions.expire(session_id)
            except stripe.StripeError:
                pass  # already expired or complete

    def test_live_checkout_session_matches_the_booking_and_cancel_expires_it(self):
        checkout = self.checkout()
        self.sessions.append(checkout["sessionId"])
        self.assertTrue(checkout["checkoutUrl"].startswith("https://checkout.stripe.com/"))

        session = self.client.v1.checkout.sessions.retrieve(checkout["sessionId"])
        self.assertEqual(session.amount_total, REGULAR_CENTS)
        self.assertEqual(session.currency, "usd")
        self.assertEqual(session.metadata["appointment_id"], checkout["appointmentId"])
        self.assertEqual(session.client_reference_id, checkout["appointmentId"])
        self.assertEqual(session.status, "open")
        self.assertTrue(session.success_url.startswith("http://localhost:5500/?checkout=success"))

        # The return page asks Stripe and correctly still sees it unpaid.
        body = crud.app.test_client().get(
            f"/api/customer/stripe/checkout/{checkout['sessionId']}",
            headers={"X-Guest-Token": checkout["guestToken"]}).get_json()
        self.assertEqual(body["payment"], "Awaiting payment")

        response = self.guest_patch(checkout["appointmentId"], checkout["guestToken"], {"status": "Cancelled"})
        self.assertEqual(response.status_code, 200, response.get_json())
        self.assertEqual(self.client.v1.checkout.sessions.retrieve(checkout["sessionId"]).status, "expired")

    def test_live_paid_booking_is_refunded_when_cancelled(self):
        checkout = self.checkout()
        self.sessions.append(checkout["sessionId"])
        # A real test-mode card charge stands in for the customer finishing Checkout.
        intent = self.client.v1.payment_intents.create(params={
            "amount": REGULAR_CENTS, "currency": "usd", "payment_method": "pm_card_visa", "confirm": True,
            "automatic_payment_methods": {"enabled": True, "allow_redirects": "never"},
            "metadata": {"appointment_id": checkout["appointmentId"]},
        })
        self.assertEqual(intent.status, "succeeded")
        completed = {
            "id": checkout["sessionId"], "object": "checkout.session", "mode": "payment",
            "status": "complete", "payment_status": "paid", "currency": "usd",
            "amount_total": REGULAR_CENTS, "payment_intent": intent.id,
            "metadata": {"appointment_id": checkout["appointmentId"]},
        }
        self.assertEqual(self.send_event("checkout.session.completed", completed).status_code, 200)
        self.assertEqual(self.admin_view(checkout["appointmentId"])["payment"], "Paid")

        self.assertEqual(self.admin_cancel(checkout["appointmentId"]).status_code, 200)
        self.assertEqual(self.admin_view(checkout["appointmentId"])["payment"], "Refunded")
        refunds = self.client.v1.refunds.list(params={"payment_intent": intent.id}).data
        self.assertEqual(len(refunds), 1)
        self.assertEqual(refunds[0].amount, REGULAR_CENTS)
        self.assertIn(refunds[0].status, ("succeeded", "pending"))


if __name__ == "__main__":
    unittest.main()
