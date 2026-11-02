import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import connectDB from "./db.js";
import authRoutes from "./routes/auth.js";
import studioRoutes from "./routes/studios.js";
import bookingRoutes from "./routes/bookings.js";
import wishlistRoutes from "./routes/wishlist.js";
import { attachUser } from "./middleware/auth.js";

const app = express();

const origins = (process.env.CLIENT_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: origins,
    credentials: true,
  }),
);
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
