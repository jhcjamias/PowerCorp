# Message for the Backend Developer

Please connect the customer frontend to the backend using the routes in `CUSTOMER_API_CONTRACT.md`.

Here is what needs to be done:

1. Add the public business, services, upgrades, and availability routes. Use the same shop hours, services, prices, durations, and upgrade rules as the customer frontend. Eyebrow Detail must work with Lineworkz. The Workz cannot take any upgrades.

2. Add customer booking routes. A new appointment uses `POST /api/customer/appointments`. A reschedule uses `PATCH /api/customer/appointments/:id` and must keep the same appointment ID. A cancellation also uses that PATCH route with the status set to `Cancelled`.

3. Save customer appointments in the same appointment table and format used by the admin frontend. The status values are `Booked`, `Completed`, and `Cancelled`. Time uses `HH:MM`. Service prices are in dollars in the appointment response, and duration uses `durationMin`.

4. Recalculate the service price and duration on the backend. Do not trust the price or duration sent by the browser. Require `policyAccepted: true` and the current `policyVersion`. Only accept a future shop-local date. Check for schedule conflicts again while saving. If the time overlaps another active appointment, return `409` with a clear message. The check and save need to happen in one database transaction.

5. Add passwordless phone verification. Use a real SMS verification service. Send a 6-digit code that expires after 10 minutes. Wait at least 30 seconds before another code can be sent. Add a rate limit by phone number and IP address, limit wrong attempts, and turn on the provider's fraud protection. A phone number alone is not enough to sign in.

6. Registration requires a full name and verified phone number. Email is optional. Sign-in only asks for the phone number and verification code. Set a secure customer-session cookie after the code is approved. Keep the customer session separate from the admin session.

7. Do not automatically claim an old guest booking when someone creates an account with the same phone number. Guest bookings need their own secure management token. Account appointments must only be returned to the customer who owns them.

8. Add the Google reviews route. Pull real Rolaz Cutz reviews on the backend, cache them for about 15 minutes, and return the response shape in the contract. Use Google Place Details if the limited review set is enough. Use the Google Business Profile API only after the owner verifies and authorizes the location if broader access is needed.

9. Add the Instagram route. Connect the approved `rolaz_cutz` professional account through Meta's Instagram API. Cache the latest posts for about 15 minutes. If Google or Instagram is not connected, return an honest unavailable response with an empty list. Do not return fake reviews or posts.

10. Keep every Google, Meta, database, and SMS provider secret on the server only. Never put a key, token, provider secret, or database password in the front end or commit it to the repo. Move the database login that is currently in the backend code into environment variables and rotate that password before this repo is uploaded anywhere public.

11. Connect the customer and admin appointment routes to the same records. The admin schedule, customer availability, and booking save must all use the same one-barber overlap rules.

12. Completed and Cancelled appointments cannot be changed again. Reject another reschedule or cancellation with `409`.

13. If the frontend and backend use different origins, allow credentialed CORS only from the approved frontend origin. Do not use `*` with cookies.

14. Return JSON errors as `{ "message": "What went wrong." }`. Use `400` for bad input, `401` for a signed-out customer, `403` for a forbidden change, `404` when the record does not exist, `409` for a booking conflict, and `429` for a rate limit.

15. Add a shared appointment integration test. Create a booking with the customer API, confirm the admin API can read it, update it with the admin API, and confirm the customer API returns the same update. Test overlap rejection, ownership, rescheduling, cancellation, and terminal statuses too.

When those routes are ready, set the customer frontend config to `mode: 'http'` and point `apiBaseUrl` to the backend. In `Front End/.env.local`, set the existing admin switch `VITE_USE_MOCK_API=false`. Do not add a new `VITE_USE_MOCK_APPOINTMENTS` switch because that is not what the supplied admin code reads. Until the routes are ready, leave both frontends in mock mode so the site does not claim that a real text, review feed, Instagram feed, or appointment was created.

