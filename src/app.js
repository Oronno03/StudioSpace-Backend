import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { toNodeHandler } from "better-auth/node";

import connectDB from "./db.js";
import { getAuth } from "./better-auth.js";
import authRoutes from "./routes/auth.js";
import studioRoutes from "./routes/studios.js";
import bookingRoutes from "./routes/bookings.js";
import wishlistRoutes from "./routes/wishlist.js";
import { attachUser } from "./middleware/auth.js";

const app = express();

app.set("trust proxy", 1);

const origins = [
  ...new Set([
    ...(process.env.CLIENT_ORIGIN || "http://localhost:3000")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    "http://localhost:3000",
    "https://studiospace-live.vercel.app",
  ]),
];

app.use(
  cors({
    origin: origins,
    credentials: true,
  }),
);

// StudioSpace keeps its existing JWT endpoints under /api/auth. Everything
// else under that prefix belongs to BetterAuth (session, sign-in, one-tap,
// sign-out, etc.). BetterAuth must be mounted before express.json() because
// it reads the raw request stream itself.
const STUDIOSPACE_AUTH_ROUTES = new Set([
  "login",
  "register",
  "google",
  "me",
  "logout",
]);

app.all("/api/auth/{*any}", async (req, res, next) => {
  const segment = req.path.replace(/^\/api\/auth\/?/, "").split("/")[0];
  if (STUDIOSPACE_AUTH_ROUTES.has(segment)) return next();

  try {
    const auth = await getAuth();
    await toNodeHandler(auth)(req, res);
  } catch (err) {
    next(err);
  }
});

app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

// Connect lazily on the first request and reuse the cached connection for
// later invocations. This keeps local development, tests and Vercel warm
// starts on the same code path.
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

// Decode the JWT HTTPOnly cookie (if present) for every request.
app.use(attachUser);

// ---------- Routes ----------
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "studiospace-api" });
});

app.use("/api/auth", authRoutes);
app.use("/api/studios", studioRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/wishlist", wishlistRoutes);

// ---------- 404 ----------
app.use((req, res) => {
  res
    .status(404)
    .json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// ---------- Error handler ----------
app.use((err, req, res, next) => {
  console.error("[StudioSpace API]", err);
  res
    .status(err.status || 500)
    .json({ message: err.message || "Something went wrong" });
});

export default app;
