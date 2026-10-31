require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const connectDB = require("./src/db");
const authRoutes = require("./src/routes/auth");
const studioRoutes = require("./src/routes/studios");
const bookingRoutes = require("./src/routes/bookings");
const wishlistRoutes = require("./src/routes/wishlist");

const app = express();

const origins = (process.env.CLIENT_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: origins,
    credentials: true,
  })
);
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

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
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// ---------- Error handler ----------
app.use((err, req, res, next) => {
  console.error("[StudioSpace API]", err);
  res.status(err.status || 500).json({ message: err.message || "Something went wrong" });
});

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`StudioSpace API running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });
