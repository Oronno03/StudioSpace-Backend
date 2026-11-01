# StudioSpace API

Backend for **StudioSpace** — a peer-to-peer creative workspace & production studio sharing platform.

- **Runtime:** Node.js + Express 5
- **Database:** MongoDB (Mongoose)
- **Auth:** JWT stored in an **HTTPOnly cookie** (Challenge 1), plus Google sign-in
- **Security:** password hashing with bcryptjs, CORS restricted to the client origin

## Quick start

```bash
npm install
cp .env.example .env      # then fill in MONGODB_URI and JWT_SECRET
npm run seed              # optional: loads demo studios + test accounts
npm run dev               # starts http://localhost:5000
```

## Test accounts (created by `npm run seed`)

| Role  | Email                  | Password    |
|-------|------------------------|-------------|
| Guest | harry@studiospace.dev  | Password123 |
| Host  | maya@studiospace.dev   | Password123 |

## API overview

| Method | Route                          | Auth   | Description |
|--------|--------------------------------|--------|-------------|
| POST   | `/api/auth/register`           | –      | Create account, sets JWT cookie |
| POST   | `/api/auth/login`              | –      | Log in, sets JWT cookie |
| POST   | `/api/auth/google`             | –      | Google sign-in, sets JWT cookie |
| GET    | `/api/auth/me`                 | cookie | Current user |
| POST   | `/api/auth/logout`             | –      | Clears cookie |
| GET    | `/api/studios`                 | –      | List + filter/search studios |
| GET    | `/api/studios/featured`        | –      | Top 6 studios (home page) |
| GET    | `/api/studios/mine`            | cookie | Current host's listings |
| GET    | `/api/studios/:id`             | –      | Single studio |
| POST   | `/api/studios`                 | cookie | Create listing |
| PATCH  | `/api/studios/:id`             | cookie | Update own listing |
| DELETE | `/api/studios/:id`             | cookie | Delete own listing |
| POST   | `/api/bookings`                | cookie | Book (double-booking protected — Challenge 2) |
| GET    | `/api/bookings/mine`           | cookie | Guest's bookings |
| GET    | `/api/bookings/host`           | cookie | Host's bookings |
| PATCH  | `/api/bookings/:id/status`     | cookie | Cancel / confirm / complete |
| GET    | `/api/wishlist`                | cookie | Saved studios |
| POST   | `/api/wishlist/:studioId/toggle` | cookie | Toggle saved studio |

## Challenges implemented

1. **JWT in HTTPOnly cookies** — all mutations (`POST /api/studios`, `DELETE /api/studios/:id`, `POST /api/bookings`, …) reject unauthenticated requests with `401 Unauthorized`.
2. **Double-booking prevention** — `POST /api/bookings` checks the requested window against existing *Confirmed* bookings for the same studio and rejects overlaps with `409 Conflict`.

## Testing

```bash
node tests/api.test.mjs
```

Runs 34 end-to-end assertions against a running server + seeded data: health, listing filters, auth guards, registration validation, studio CRUD, booking workflow, overlap rejection, cancellation rules, wishlist and logout.

## Notes

- New bookings always start as `Pending`; only the studio owner can confirm, complete or decline them (`PATCH /api/bookings/:id/status`).
- Google sign-in verifies ID tokens against `GOOGLE_CLIENT_ID`; if the variable is empty it falls back to a demo mode for local development only.
- `.env` is git-ignored — use `.env.example` as the template.
