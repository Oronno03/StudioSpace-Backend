/**
 * End-to-end API test for StudioSpace.
 *
 * Usage:  node tests/api.test.mjs
 * Requires the API running at http://localhost:5000 and the seed data loaded.
 */
const BASE = process.env.API_URL || "http://localhost:5000";

let passed = 0;
let failed = 0;

function ok(label, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label} ${detail ? "→ " + detail : ""}`);
  }
}

/** Minimal cookie jar: stores the auth cookie from Set-Cookie. */
function jar() {
  return { cookie: "" };
}

async function call(method, path, { body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers["Cookie"] = cookie;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  const setCookie = res.headers.get("set-cookie") || "";
  const authCookie = setCookie.split(";")[0];
  if (authCookie) cookie = authCookie;

  return { status: res.status, data, cookie };
}

async function main() {
  const H = jar(); // harry (guest)
  const M = jar(); // maya (host)

  console.log("\n== Health & public endpoints ==");
  let r = await call("GET", "/api/health");
  ok("GET /api/health → 200", r.status === 200, r.status);

  r = await call("GET", "/api/studios");
  ok("GET /api/studios → 200 with 8 studios", r.status === 200 && r.data.studios.length >= 8, `${r.status}/${r.data?.studios?.length}`);

  r = await call("GET", "/api/studios/featured");
  ok("GET /api/studios/featured → 200 with exactly 6", r.status === 200 && r.data.studios.length === 6, `${r.status}/${r.data?.studios?.length}`);

  const sample = r.data.studios[0];
  r = await call("GET", `/api/studios/${sample._id}`);
  ok("GET /api/studios/:id → 200", r.status === 200 && r.data.studio._id === sample._id, r.status);

  r = await call("GET", "/api/studios?category=Photo%20Studio&sort=price-asc");
  ok("GET /api/studios?category=Photo Studio → filtered", r.status === 200 && r.data.studios.every((s) => s.category === "Photo Studio"), r.status);

  r = await call("GET", "/api/studios/000000000000000000000000");
  ok("GET /api/studios/:missing → 404", r.status === 404, r.status);

  console.log("\n== Auth guards (Challenge 1) ==");
  r = await call("POST", "/api/studios", { body: { title: "X" } });
  ok("POST /api/studios without cookie → 401", r.status === 401, r.status);

  r = await call("POST", "/api/bookings", { body: {} });
  ok("POST /api/bookings without cookie → 401", r.status === 401, r.status);

  r = await call("DELETE", `/api/studios/${sample._id}`);
  ok("DELETE /api/studios/:id without cookie → 401", r.status === 401, r.status);

  console.log("\n== Login / register validation ==");
  r = await call("POST", "/api/auth/login", { body: { email: "harry@studiospace.dev", password: "wrongpass" } });
  ok("Login with wrong password → 401", r.status === 401, r.status);

  r = await call("POST", "/api/auth/register", { body: { name: "Test", email: `weak${Date.now()}@test.dev`, password: "abc" } });
  ok("Register with weak password → 400", r.status === 400, r.status);

  r = await call("POST", "/api/auth/register", { body: { name: "Test", email: `dup${Date.now()}@test.dev`, password: "Password123", photoURL: "" } });
  ok("Register valid new user → 201 + cookie", r.status === 201 && !!r.cookie, `${r.status}/${!!r.cookie}`);

  r = await call("POST", "/api/auth/login", { body: { email: "harry@studiospace.dev", password: "Password123" } });
  H.cookie = r.cookie;
  ok("Login harry → 200 + cookie", r.status === 200 && !!r.cookie, r.status);

  r = await call("GET", "/api/auth/me", { cookie: H.cookie });
  ok("GET /api/auth/me with cookie → Harry", r.status === 200 && r.data.user.email === "harry@studiospace.dev", r.status);

  r = await call("POST", "/api/auth/login", { body: { email: "maya@studiospace.dev", password: "Password123" } });
  M.cookie = r.cookie;
  ok("Login maya (host) → 200", r.status === 200 && !!r.cookie, r.status);

  console.log("\n== Studio CRUD ==");
  r = await call("POST", "/api/studios", {
    cookie: H.cookie,
    body: {
      title: "Test Studio by Harry",
      category: "Art Workshop",
      hourlyRate: 42,
      securityDeposit: 60,
      maxCapacity: 8,
      location: "Testville, TX",
      image: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261",
      amenities: ["Wi-Fi", "Kiln"],
      overview: "A temporary test studio created by the automated API test suite.",
    },
  });
  ok("POST /api/studios with cookie → 201", r.status === 201, `${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
  const created = r.data?.studio;

  r = await call("GET", "/api/studios/mine", { cookie: H.cookie });
  ok("GET /api/studios/mine lists own listing", r.status === 200 && r.data.studios.some((s) => s._id === created._id), r.status);

  r = await call("PATCH", `/api/studios/${created._id}`, {
    cookie: H.cookie,
    body: { hourlyRate: 55, title: "Updated Test Studio" },
  });
  ok("PATCH own studio → 200 + updated rate", r.status === 200 && r.data.studio.hourlyRate === 55, r.status);

  r = await call("PATCH", `/api/studios/${created._id}`, {
    cookie: M.cookie,
    body: { hourlyRate: 999 },
  });
  ok("PATCH someone else's studio → 403", r.status === 403, r.status);

  r = await call("DELETE", `/api/studios/${created._id}`, { cookie: H.cookie });
  ok("DELETE own studio → 200", r.status === 200, r.status);

  console.log("\n== Bookings + double-booking (Challenge 2) ==");
  // Unique date per run so repeated test executions never collide.
  const date = new Date(Date.now() + (20 + Math.floor(Math.random() * 200)) * 864e5)
    .toISOString()
    .slice(0, 10);

  r = await call("POST", "/api/bookings", {
    cookie: H.cookie,
    body: { studioId: sample._id, date, startTime: "10:00", endTime: "14:00" },
  });
  ok("Create booking → 201 Pending", r.status === 201 && r.data.booking.status === "Pending", `${r.status}/${r.data?.booking?.status}`);
  const booking = r.data?.booking;

  r = await call("GET", "/api/bookings/mine", { cookie: H.cookie });
  ok("GET /api/bookings/mine contains booking", r.status === 200 && r.data.bookings.some((b) => b._id === booking._id), r.status);

  // Host confirms the booking
  r = await call("PATCH", `/api/bookings/${booking._id}/status`, {
    cookie: M.cookie,
    body: { status: "Confirmed" },
  });
  ok("Host confirms booking → 200", r.status === 200 && r.data.booking.status === "Confirmed", r.status);

  // Overlapping request must be rejected
  r = await call("POST", "/api/bookings", {
    cookie: H.cookie,
    body: { studioId: sample._id, date, startTime: "12:00", endTime: "16:00" },
  });
  ok("Overlapping booking → 409 with clear message", r.status === 409 && /already booked/i.test(r.data.message), `${r.status} ${r.data?.message}`);

  // Adjacent request should be allowed
  r = await call("POST", "/api/bookings", {
    cookie: H.cookie,
    body: { studioId: sample._id, date, startTime: "14:00", endTime: "17:00" },
  });
  ok("Adjacent (non-overlapping) booking → 201", r.status === 201, r.status);
  const adjacent = r.data?.booking;

  // Guest can cancel a pending booking
  r = await call("PATCH", `/api/bookings/${adjacent._id}/status`, {
    cookie: H.cookie,
    body: { status: "Cancelled" },
  });
  ok("Guest cancels own Pending booking → 200", r.status === 200 && r.data.booking.status === "Cancelled", r.status);

  // Guest cannot cancel a confirmed booking
  r = await call("PATCH", `/api/bookings/${booking._id}/status`, {
    cookie: H.cookie,
    body: { status: "Cancelled" },
  });
  ok("Guest cannot cancel Confirmed booking → 400", r.status === 400, r.status);

  // Invalid time range
  r = await call("POST", "/api/bookings", {
    cookie: H.cookie,
    body: { studioId: sample._id, date, startTime: "15:00", endTime: "14:00" },
  });
  ok("End before start → 400", r.status === 400, r.status);

  // Cleanup: host releases the test slot so reruns stay clean.
  await call("PATCH", `/api/bookings/${booking._id}/status`, {
    cookie: M.cookie,
    body: { status: "Cancelled" },
  });

  console.log("\n== Wishlist ==");
  r = await call("POST", `/api/wishlist/${sample._id}/toggle`, { cookie: H.cookie });
  ok("Toggle wishlist on → saved true", r.status === 200 && r.data.saved === true, `${r.status}/${r.data?.saved}`);

  r = await call("GET", "/api/wishlist", { cookie: H.cookie });
  ok("GET /api/wishlist contains studio", r.status === 200 && r.data.studios.some((s) => s._id === sample._id), r.status);

  r = await call("POST", `/api/wishlist/${sample._id}/toggle`, { cookie: H.cookie });
  ok("Toggle wishlist off → saved false", r.status === 200 && r.data.saved === false, `${r.status}/${r.data?.saved}`);

  console.log("\n== Logout & error handling ==");
  r = await call("POST", "/api/auth/logout", { cookie: H.cookie });
  ok("Logout → 200", r.status === 200, r.status);
  // Simulate the browser honouring the cleared cookie
  H.cookie = "";

  r = await call("GET", "/api/auth/me", { cookie: H.cookie });
  ok("GET /api/auth/me after logout → 401", r.status === 401, r.status);

  r = await call("GET", "/api/does-not-exist");
  ok("Unknown route → 404 JSON", r.status === 404, r.status);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test suite crashed:", err);
  process.exit(1);
});
