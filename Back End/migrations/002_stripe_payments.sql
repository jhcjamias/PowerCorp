-- ---------------------------------------------------------------------------
-- 002_stripe_payments.sql
--
-- Online card payments through Stripe Checkout. Run once, after 000 and 001,
-- on every database (local, test and RDS) before deploying the code that uses it:
--
--     mysql -h <host> -u <user> -p barbershop < "Back End/migrations/002_stripe_payments.sql"
--
-- An online booking stores its Checkout Session (to match Stripe's webhook and
-- the customer's return to the site) and, once paid, its PaymentIntent (to
-- refund it). Payment states live in the existing Appointment.payment_status:
--   Awaiting payment -> Paid -> Refunded / Partially refunded
--   Awaiting payment -> Expired / Cancelled / Payment failed / Checkout failed
-- ---------------------------------------------------------------------------

ALTER TABLE Appointment
  ADD COLUMN stripe_checkout_session_id varchar(255) DEFAULT NULL
    COMMENT 'Stripe Checkout Session (cs_...) for an online payment',
  ADD COLUMN stripe_payment_intent_id varchar(255) DEFAULT NULL
    COMMENT 'Stripe PaymentIntent (pi_...) once paid; used for refunds',
  ADD UNIQUE KEY uq_appointment_stripe_session (stripe_checkout_session_id),
  ADD KEY idx_appointment_stripe_intent (stripe_payment_intent_id);
