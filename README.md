# StudioSpace API

Backend for **StudioSpace** — a peer-to-peer creative workspace & production studio sharing platform.

🔗 **Live API:** https://studiospace-api-flax.vercel.app/api/health

- **Runtime:** Node.js + Express 5 (ES modules, `"type": "module"`)
- **Database:** MongoDB (Mongoose)
- **Auth:** BetterAuth (MongoDB adapter + sessions) for Google One Tap and standard session endpoints, plus the existing JWT-in-an-HTTPOnly-cookie flow
- **Security:** password hashing with bcryptjs, CORS restricted to the client origin, BetterAuth CSRF/origin checks

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
| POST   | `/api/auth/google`             | –      | Legacy Google ID-token sign-in, sets JWT cookie |
| GET    | `/api/auth/me`                 | cookie | Current user (JWT or BetterAuth session) |
| POST   | `/api/auth/logout`             | –      | Revokes BetterAuth session + clears both cookies |
| POST   | `/api/auth/sign-up/email`      | –      | BetterAuth email/password sign-up |
| POST   | `/api/auth/sign-in/email`      | –      | BetterAuth email/password sign-in |
| GET    | `/api/auth/get-session`        | cookie | BetterAuth session + user from MongoDB |
| POST   | `/api/auth/one-tap/callback`   | –      | BetterAuth Google One Tap (Google ID token) |
| POST   | `/api/auth/sign-out`           | cookie | Revoke the BetterAuth session |
| GET    | `/api/auth/ok`                 | –      | BetterAuth mount health check |
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

## Authentication (BetterAuth + JWT)

BetterAuth is mounted at `/api/auth/*` in `src/app.js` **before** `express.json()`, so it can read the raw request stream. It is configured in `src/better-auth.js` with:

- `mongodbAdapter(client.db(), { client })` — BetterAuth stores `user`, `session`, `account`, `verification` and `jwks` documents in the same MongoDB database as the app.
- `emailAndPassword` — standard BetterAuth sign-up/sign-in endpoints.
- `oneTap()` — verifies the Google ID token from Google Identity Services and creates a BetterAuth session.
- `jwt()` — exposes BetterAuth's signed-JWT/JWKS support.
- Seven-day sessions with daily rolling refresh and `SameSite=None; Secure` cookies in production.

The existing StudioSpace login/register forms still issue the `studiospace_token` JWT cookie. `attachUser` in `src/middleware/auth.js` accepts **either** credential, so all protected routes work with a BetterAuth session too. When a BetterAuth user first calls an app route, their profile is mirrored into the app's `users` collection so wishlists, listings and bookings keep a single identity.

## Challenges implemented

1. **JWT in HTTPOnly cookies** — all mutations (`POST /api/studios`, `DELETE /api/studios/:id`, `POST /api/bookings`, …) reject unauthenticated requests with `401 Unauthorized`. BetterAuth sessions are accepted by the same guard.
2. **Double-booking prevention** — `POST /api/bookings` rejects any overlap (`StartA < EndB && EndA > StartB`) with an active **Pending or Confirmed** booking for the same studio and date using `409 Conflict` plus a descriptive `BOOKING_CONFLICT` payload. Confirming a booking re-checks against other **Confirmed** bookings, so two pending overlaps can never both be confirmed. Cancelled slots are released.

## Testing

```bash
node tests/api.test.mjs
```

Runs 45 end-to-end assertions against a running server + seeded data: health, listing filters, auth guards, registration validation, studio CRUD, pending/confirmed overlap rejection, cancellation rules, cancelled-slot release, wishlist, BetterAuth sign-up/session/get-session/sign-out, and logout.

## Deployment

The API is deployed as a Vercel Function. `index.js` exports the Express app from
`src/app.js`, while the same file keeps the local `app.listen` path for development.
Pushes to `main` automatically deploy to production through Vercel’s GitHub integration.

Production environment variables:

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Signs the app's HTTPOnly JWT cookie |
| `BETTER_AUTH_SECRET` | 32+ character BetterAuth secret (sessions, JWT plugin) |
| `BETTER_AUTH_URL` | Public API origin, e.g. `https://studiospace-api-flax.vercel.app` |
| `CLIENT_ORIGIN` | Comma-separated allowed frontend origins |
| `GOOGLE_CLIENT_ID` | Verifies Google ID tokens / Google One Tap audience |
| `COOKIE_CROSS_SITE` | `true` on Vercel so cookies use `SameSite=None; Secure` |

MongoDB Atlas must allow the Vercel function's outbound IPs. For this demo the
Atlas network access list includes `0.0.0.0/0`.

## Notes

- New bookings always start as `Pending`; only the studio owner can confirm, complete or decline them (`PATCH /api/bookings/:id/status`). Pending and Confirmed reservations both reserve their window; Cancelled reservations release it.
- Google sign-in first goes through BetterAuth's Google One Tap endpoint (`/api/auth/one-tap/callback`). The legacy `/api/auth/google` verified-ID-token endpoint remains as a fallback; if `GOOGLE_CLIENT_ID` is empty it offers a demo mode for local development only.
- `.env` is git-ignored — use `.env.example` as the template.
