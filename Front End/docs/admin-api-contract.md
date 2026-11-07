# Rolaz Cutz Admin: API contract (front end → Flask back end)

This is what the admin pages (Vue) expect from the back end. It covers the pages built so far
(login and appointments). New pages will add sections. If the back end needs to differ,
tell the front-end person and the call is changed in one file (listed under each section).

- **Base URL:** `VITE_API_URL` (default `http://127.0.0.1:5000`). Flask needs CORS enabled for the Vite dev origin (`http://localhost:5173`).
- **Format:** JSON in and out (`Content-Type: application/json`).
- **Auth:** every request except login sends `Authorization: Bearer <token>`.
- **Turning it on:** in `Front End/.env.local` set `VITE_USE_MOCK_AUTH=false` and `VITE_USE_MOCK_API=false`.
- **Dates and times:** `date` is `YYYY-MM-DD`, `time` is 24-hour `HH:MM`, both in the shop's local time (no time zone conversion on the front end).
- **Phones:** 10 digits, no punctuation (`"2815550100"`). The front end formats them for display.
- **Money:** plain numbers in dollars (`45`, `50.5`).

## Errors the front end handles

| Status | Front end does |
|---|---|
| 401 on any call except login | Signs the admin out and shows the login page ("Your session has expired") |
| 403 | Shows "You don't have permission to do that." |
| any other non-2xx | Shows a generic "Something went wrong" message |
| 204 | Treated as success with no body |

For 4xx errors on appointment changes, an optional `{ "message": "..." }` body is welcome
(for example a double-booking), but today the front end shows its own wording.

## 1. Login

`POST /api/auth/login` (file: `src/admin/login-page/authService.js`)

Request:
```json
{ "phone": "2815550100", "password": "..." }
```
Responses:
- `200` `{ "token": "…", "user": { "id": 1, "name": "Rolaz", "role": "admin" } }`
- `401` wrong phone or password
- `403` valid user but not an admin (`role` must be `"admin"` to get in)

## 2. Appointments (file: `src/admin/appointments/appointmentsService.js`)

### The appointment object (same shape everywhere)
```json
{
  "id": "a-1042",
  "date": "2026-10-27",
  "time": "11:00",
  "customer": { "name": "Chris Alvarez", "phone": "8325550119" },
  "services": [
    { "id": "haircut", "name": "Haircut", "price": 45, "durationMin": 45 },
    { "id": "beard", "name": "Beard", "price": 10, "durationMin": 15 }
  ],
  "status": "Booked",
  "payment": "Paid",
  "paymentMethod": "Card",
  "receiptSent": true,
  "referencePhotos": 2,
  "notes": "Low fade, #2 on the sides"
}
```
- `id`: a string (the front end never does math on it).
- `status`: exactly `"Booked"`, `"Completed"` or `"Cancelled"`.
- Total and end time are calculated by the front end from `services` (sum of price / duration).
- `referencePhotos` is a count for now. If photos get real URLs later, we will change this to a list.
- Bookings made on the customer site must use this same shape, with `status: "Booked"`.

### List
`GET /api/appointments` → `200` an array of appointment objects (or `{ "appointments": [...] }`).
The front end does the filtering, sorting and paging itself for now (about 8 per page), so the
simplest back end returns everything. If the list grows large we will switch to query
parameters (`?from=&to=&status=&q=&page=`).

### Change an appointment
`PATCH /api/appointments/:id` → `200` the **updated appointment object**.

| Action in the admin | Request body |
|---|---|
| Cancel appointment | `{ "status": "Cancelled" }` |
| Completed | `{ "status": "Completed" }` |
| Reschedule | `{ "date": "2026-10-30", "time": "14:30" }` |

Other statuses: `404` if the id doesn't exist.

### Rules the back end should enforce (not just the front end)
- **No double-booking.** The shop has one barber. A reschedule (and a new booking from the customer site) must be rejected with `409` when it overlaps another `Booked` appointment on the same date. Overlap = new start < other end and other start < new end, using the sum of service durations.
- Only `Booked` appointments can be rescheduled or cancelled. Reject changes to `Completed` / `Cancelled` ones with `409`.
- Don't allow a reschedule into the past.
- Refunds and customer text messages on cancellation: **undecided**, to be settled with the client. The front end only sets the status.

## 3. Schedule and time off (file: `src/admin/schedule/scheduleService.js`)

### Objects
```json
// weeklyHours: always 7 items, one per day. day: Sunday = 0 ... Saturday = 6
{ "day": 2, "open": true, "start": "11:00", "end": "19:00" }

// timeOff
{ "id": "t-1", "date": "2026-11-03", "endDate": "2026-11-05", "allDay": true,
  "start": "", "end": "", "reason": "Family trip" }
// part-day entry: allDay false, date === endDate, start "13:00", end "15:00"
```
- `reason` may be an empty string. `id` is a string.
- Closed days still carry `start` / `end` (the front end keeps them so re-opening a day remembers the hours).

### Endpoints
| Call | Body | Response |
|---|---|---|
| `GET /api/schedule` | none | `{ "weeklyHours": [...7 items], "timeOff": [...] }` |
| `PUT /api/schedule/hours` | `{ "weeklyHours": [...7 items] }` | `{ "weeklyHours": [...] }` |
| `POST /api/schedule/time-off` | `{ date, endDate, allDay, start, end, reason }` | `201` the new time-off object (with its `id`) |
| `DELETE /api/schedule/time-off/:id` | none | `204` |

### Rules the back end should enforce
- When working out which slots a customer can book, use `weeklyHours` and `timeOff` together: no slot outside open hours, none that touches a time-off entry, and none that would run past closing time.
- Adding time off does **not** cancel appointments that already exist in that window. The admin page only warns about them (it compares against the appointment list) and Rolaz handles each one on the Appointments page.
- Validate: `end` after `start`; `endDate` not before `date`; times as `HH:MM`.

## Coming later (will be added here as each page is built)
Services and prices, customers, dashboard numbers, reports.
Services and prices should be the single list that both the admin and the customer booking page read.
