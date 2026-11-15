# Rolaz Cutz Customer API Contract

This is the backend contract used by the customer frontend in `app.js`. The customer frontend defaults to local mock mode until these routes are ready. Do not place provider keys, access tokens, database passwords, or SMS credentials in the frontend.

## Turn on the backend connection

Define this before `app.js` loads:

```html
<script>
  window.ROLAZ_CUSTOMER_CONFIG = {
    mode: 'http',
    apiBaseUrl: 'https://your-api-host.example'
  };
</script>
```

Use an empty `apiBaseUrl` when the frontend and API share the same origin. Every customer request uses JSON and sends cookies with `credentials: "include"`.

## Shared rules

- Use HTTPS in production.
- Return JSON for every response except a successful `204 No Content`.
- Return errors as `{ "message": "Plain English explanation." }`.
- Use `400` for invalid input, `401` for an expired or missing customer session, `403` for a forbidden action, `404` for a missing record, `409` for an appointment overlap or other conflict, `429` for a rate limit, and `500` only for an unexpected server error.
- Store money as integer cents in the database. Appointment API snapshots use `price` in dollars because that is the existing admin contract.
- Store timestamps in UTC. Appointment `date` and `time` represent the shop's local `America/Chicago` calendar values.
- Do not reveal whether a phone number already has an account in send-code responses.
- A customer session and the admin session must use separate cookies and separate authorization checks.
- If the frontend and API use different origins, allow credentialed CORS only from each approved frontend origin. Never combine cookie credentials with a wildcard `*` origin.

## Public shop routes

### GET `/api/public/business`

Response:

```json
{
  "name": "Rolaz Cutz Barbershop",
  "address": "20260 Katy Freeway Suite #116, Katy, TX 77449",
  "phone": "+1 832-874-8680",
  "email": "rolazcutz@gmail.com",
  "timezone": "America/Chicago",
  "schedule": {
    "0": null,
    "1": null,
    "2": [660, 1140],
    "3": [660, 1140],
    "4": [600, 1170],
    "5": [540, 1185],
    "6": [540, 900]
  },
  "hours": [
    ["Monday", "Closed"],
    ["Tuesday", "11:00 AM – 7:00 PM"],
    ["Wednesday", "11:00 AM – 7:00 PM"],
    ["Thursday", "10:00 AM – 7:30 PM"],
    ["Friday", "9:00 AM – 7:45 PM"],
    ["Saturday", "9:00 AM – 3:00 PM"],
    ["Sunday", "Closed"]
  ]
}
```

### GET `/api/public/services`

Return the active main services in display order. Prices are integer cents here.

```json
[
  {
    "id": "workz",
    "name": "The Workz",
    "description": "The full service: The OG with Scissor Workz, Eyebrow Detail, and Lineworkz included.",
    "priceCents": 6000,
    "duration": 50
  }
]
```

### GET `/api/public/upgrades`

`serviceIds` is the source of truth for allowed combinations. Eyebrow Detail is allowed with `regular`, `kids`, and `beard`. The Workz allows no upgrades because they are already included.

```json
[
  {
    "id": "eyebrow-detail",
    "name": "Eyebrow Detail",
    "description": "A clean eyebrow finish for a sharper overall look.",
    "priceCents": 500,
    "duration": 5,
    "serviceIds": ["regular", "kids", "beard"]
  }
]
```

### GET `/api/public/availability`

Query parameters:

- `date`: required `YYYY-MM-DD` shop-local date.
- `serviceId`: required service ID.
- `upgradeIds`: optional comma-separated upgrade IDs.
- `replacesId`: optional appointment ID being rescheduled. Exclude that appointment from its own overlap check.

Response times are integer minutes after midnight so they match the existing customer UI.

```json
{
  "date": "2026-12-04",
  "timezone": "America/Chicago",
  "slots": [
    { "time": 660, "available": true },
    { "time": 675, "available": false }
  ]
}
```

The backend must recalculate duration from its own service records. Never trust a price or duration sent by the browser. Reject an invalid service/upgrade combination with `400`. Reject a slot that became unavailable during booking with `409` and a message such as `That time was just booked. Please choose another time.`

## Live Google reviews

### GET `/api/public/reviews`

Success response:

```json
{
  "status": "success",
  "rating": 4.9,
  "totalCount": 83,
  "googleUrl": "https://www.google.com/...",
  "attribution": "Google",
  "reviews": [
    {
      "id": "provider-review-id",
      "authorName": "Customer name",
      "rating": 5,
      "text": "Review text",
      "relativeTime": "a week ago",
      "authorPhotoUrl": "https://provider-image.example/..."
    }
  ]
}
```

Use a server-side Google integration and a short cache, such as 15 minutes. Google provider credentials are backend only. Never send a Google API key or OAuth refresh token to the browser. If the provider is not configured, return `200` with this honest state instead of sample reviews:

```json
{
  "status": "unavailable",
  "rating": null,
  "totalCount": 0,
  "reviews": [],
  "googleUrl": "https://www.google.com/...",
  "attribution": "Google",
  "message": "Live Google reviews are temporarily unavailable."
}
```

Google Place Details is acceptable when the limited review set is enough. Use the Google Business Profile API only after the owner verifies and authorizes the business location when broader account-managed review access is needed. Follow Google's required attribution and display rules.

## Live Instagram posts

### GET `/api/public/instagram`

Success response:

```json
{
  "status": "success",
  "profileUrl": "https://www.instagram.com/rolaz_cutz/",
  "posts": [
    {
      "id": "provider-media-id",
      "mediaType": "IMAGE",
      "mediaUrl": "https://provider-media.example/...",
      "thumbnailUrl": "",
      "permalink": "https://www.instagram.com/p/.../",
      "caption": "Post caption",
      "timestamp": "2026-11-10T12:00:00Z"
    }
  ]
}
```

Use Meta's Instagram API for the approved Rolaz Cutz professional account. Keep the Meta app secret, user access token, and refresh process on the server only. Cache the feed for about 15 minutes and refresh it in the backend. When the provider is unavailable, return `status: "unavailable"`, the profile URL, an empty `posts` array, and a plain message. Never create fake posts.

## Passwordless phone verification

The recommended sign-in is a one-time SMS code. A phone number by itself is not authentication.

### POST `/api/customer/auth/send-code`

Request for account creation:

```json
{
  "phone": "+18325550100",
  "intent": "register",
  "name": "Customer Name",
  "email": "optional@example.com"
}
```

Request for sign-in:

```json
{
  "phone": "+18325550100",
  "intent": "login",
  "name": "",
  "email": ""
}
```

Normalize the phone number to E.164. Registration requires a name and phone number. Email is optional, but validate it when present. Respond the same way whether or not the number is registered:

```json
{
  "status": "sent",
  "phone": "+18325550100",
  "expiresInSeconds": 600,
  "resendAfterSeconds": 30
}
```

Production must never return the verification code. Use an SMS verification provider, six-digit codes, a 10-minute expiration, a 30-second resend wait, a maximum verification-attempt count, per-phone and per-IP rate limits, and provider fraud controls. Return `429` with a useful `message` when limited.

### POST `/api/customer/auth/verify-code`

```json
{
  "phone": "+18325550100",
  "code": "123456",
  "intent": "register",
  "name": "Customer Name",
  "email": "optional@example.com"
}
```

On success, create or load the customer and set a secure customer-session cookie:

```json
{
  "authenticated": true,
  "customer": {
    "id": "customer-id",
    "name": "Customer Name",
    "email": "optional@example.com",
    "phone": "+18325550100"
  }
}
```

The cookie must be `HttpOnly`, `Secure` in production, and use an appropriate `SameSite` setting. Rotate the session after verification. Store only a hashed session token server-side. Do not store SMS codes in browser storage.

### GET `/api/customer/session`

Return the same authenticated session object, or `401` when signed out.

### POST `/api/customer/auth/logout`

Revoke the customer session and clear its cookie. Return `204 No Content`.

## Customer profile

### GET `/api/customer/profile`

Requires the customer session. Return:

```json
{
  "id": "customer-id",
  "name": "Customer Name",
  "email": "optional@example.com",
  "phone": "+18325550100"
}
```

### PATCH `/api/customer/profile`

Allow name and optional email updates. A verified phone-number change must use a new verification flow; do not accept an unverified replacement phone number from this route.

## Appointments

### GET `/api/customer/appointments`

Requires a customer session. Return an array of appointments owned by that customer. Do not return another customer's records.

### POST `/api/customer/appointments`

Guest booking may be allowed. The frontend sends this admin-compatible snapshot:

```json
{
  "date": "2026-12-04",
  "time": "13:15",
  "customer": {
    "name": "Customer Name",
    "email": "",
    "phone": "+18325550100"
  },
  "services": [
    { "id": "regular", "name": "The OG", "price": 45, "durationMin": 35 },
    { "id": "eyebrow-detail", "name": "Eyebrow Detail", "price": 5, "durationMin": 5 }
  ],
  "status": "Booked",
  "payment": "Pay at Shop",
  "paymentMethod": "shop",
  "receiptSent": false,
  "referencePhotos": 0,
  "notes": "",
  "policyAccepted": true,
  "policyVersion": "2026-11-11"
}
```

The API must look up services again and recalculate the total. Treat the browser's `name`, `price`, and `durationMin` values as display snapshots, not trusted billing rules. Save the exact admin appointment shape so the supplied admin frontend receives:

- `status` as one of `Booked`, `Completed`, or `Cancelled`.
- `time` as shop-local `HH:MM`.
- `services[].price` in dollars.
- `services[].durationMin` in minutes.
- `payment` as `Pay at Shop` and `paymentMethod` as `shop`.
- `receiptSent` as a boolean and `referencePhotos` as a number.

Require `policyAccepted: true` with the current `policyVersion`, and require a future shop-local date. Reject invalid or stale policy versions with `400`.

Completed and Cancelled appointments cannot be rescheduled or cancelled again; reject those requests with `409`.

The booking insert and overlap check must be one transaction. Reject overlap conflicts with `409`.

A guest appointment has no customer account owner. If that phone number later creates an account, do not automatically claim or expose the earlier guest appointment. A separate, verified claim process can be designed later.

### PATCH `/api/customer/appointments/:id`

Rescheduling sends the complete appointment snapshot with a new date/time. Update the existing row and preserve its ID. Exclude this appointment from the overlap query, but still reject overlap with another booking using `409`.

Cancellation sends:

```json
{ "status": "Cancelled" }
```

Require either the owning customer session or a separate secure guest-management token. Never authorize appointment changes by a public appointment ID alone.

Return the saved appointment in the same admin shape after create, reschedule, or cancel.

## Admin connection

The supplied admin frontend expects `GET /api/appointments` and `PATCH /api/appointments/:id`. Those routes and the customer routes must read and write the same appointment records. The customer frontend does not call admin routes directly.

The backend must reject overlapping one-barber appointments with `409` even if two clients submit at the same time. The admin schedule, customer availability, and customer booking transaction must use the same shop hours, duration rules, and appointment table.

The supplied admin frontend's real switch is `VITE_USE_MOCK_API=false` in `Front End/.env.local`. There is no `VITE_USE_MOCK_APPOINTMENTS` switch in this codebase, so do not add or document one as if it already exists.

Add a shared appointment integration test that creates a booking through the customer route, confirms it appears through `GET /api/appointments`, changes it through the admin route, and confirms the updated record appears through the customer route. Include overlap, ownership, reschedule, cancellation, and terminal-status checks.

## Minimum database records

- `customers`: ID, name, optional email, normalized verified phone, created/updated timestamps.
- `customer_sessions`: hashed token, customer ID, expiration, revoked timestamp.
- `appointments`: existing admin fields plus nullable customer owner ID, guest-management token hash, policy version, and timestamps.
- `services` and `upgrades`: active state, display order, price in cents, duration, compatibility.
- Provider cache tables or a server cache for Google reviews and Instagram posts.

Add database uniqueness or locking needed to prevent overlapping active appointments for the single barber. Application-only checks are not enough under simultaneous requests.

