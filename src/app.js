require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const connectDB = require("./db");
const authRoutes = require("./routes/auth");
const studioRoutes = require("./routes/studios");
const bookingRoutes = require("./routes/bookings");
const wishlistRoutes = require("./routes/wishlist");
const { attachUser } = require("./middleware/auth");

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

module.exports = app;
