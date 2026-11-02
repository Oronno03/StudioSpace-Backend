import express from "express";
import mongoose from "mongoose";
import Studio from "../models/Studio.js";
import Booking from "../models/Booking.js";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// ---------- List studios (public) ----------
// Supports: search, category, minRate, maxRate, location, sort (newest | rating | price-asc | price-desc), limit
router.get("/", async (req, res) => {
  const { search, category, minRate, maxRate, location, sort, limit } = req.query;
  const filter = {};

  if (search) {
    const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ title: rx }, { location: rx }, { category: rx }, { overview: rx }];
  }
  if (category && category !== "All") filter.category = category;
  if (location) filter.location = new RegExp(location.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

  const rateFilter = {};
  if (minRate !== undefined && minRate !== "") rateFilter.$gte = Number(minRate);
  if (maxRate !== undefined && maxRate !== "") rateFilter.$lte = Number(maxRate);
  if (Object.keys(rateFilter).length) filter.hourlyRate = rateFilter;

  let query = Studio.find(filter);

  switch (sort) {
    case "rating":
      query = query.sort({ rating: -1, createdAt: -1 });
      break;
    case "price-asc":
      query = query.sort({ hourlyRate: 1 });
      break;
    case "price-desc":
      query = query.sort({ hourlyRate: -1 });
      break;
    default:
      query = query.sort({ createdAt: -1 });
  }

  if (limit) query = query.limit(Number(limit));

  const studios = await query.lean();
  res.json({ studios });
});

// ---------- Featured studios (public, home page) ----------
router.get("/featured", async (req, res) => {
  const studios = await Studio.find()
    .sort({ rating: -1, createdAt: -1 })
    .limit(6)
    .lean();
  res.json({ studios });
});

// ---------- User's own listings ----------
router.get("/mine", requireAuth, async (req, res) => {
  const studios = await Studio.find({ ownerEmail: req.user.email.toLowerCase() })
    .sort({ createdAt: -1 })
    .lean();
  res.json({ studios });
});

// ---------- Single studio ----------
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid studio id." });
  }
  const studio = await Studio.findById(id).lean();
  if (!studio) return res.status(404).json({ message: "Studio not found." });
  res.json({ studio });
});

// ---------- Create studio (Challenge 1: protected by JWT HTTPOnly cookie) ----------
router.post("/", requireAuth, async (req, res) => {
  const {
    title,
    category,
    hourlyRate,
    securityDeposit,
    maxCapacity,
    location,
    image,
    gallery,
    amenities,
    overview,
    hostPhone,
  } = req.body || {};

  if (!title || !category || hourlyRate === undefined || !maxCapacity || !location || !image || !overview) {
    return res.status(400).json({ message: "Please fill in all required fields." });
  }

  const studio = await Studio.create({
    title,
    category,
    hourlyRate: Number(hourlyRate),
    securityDeposit: Number(securityDeposit || 0),
    maxCapacity: Number(maxCapacity),
    location,
    image,
    gallery: Array.isArray(gallery) ? gallery.filter(Boolean) : [],
    amenities: Array.isArray(amenities) ? amenities : [],
    overview,
    hostPhone: hostPhone || "",
    ownerEmail: req.user.email.toLowerCase(),
    ownerName: req.user.name,
  });

  res.status(201).json({ studio, message: "Studio listed successfully." });
});

// ---------- Update studio (owner only) ----------
router.patch("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid studio id." });
  }

  const studio = await Studio.findById(id);
  if (!studio) return res.status(404).json({ message: "Studio not found." });
  if (studio.ownerEmail.toLowerCase() !== req.user.email.toLowerCase()) {
    return res.status(403).json({ message: "Forbidden: only the host can edit this studio." });
  }

  const fields = [
    "title",
    "category",
    "securityDeposit",
    "maxCapacity",
    "location",
    "image",
    "overview",
    "hostPhone",
  ];
  for (const f of fields) {
    if (req.body[f] !== undefined) studio[f] = req.body[f];
  }
  if (req.body.hourlyRate !== undefined) studio.hourlyRate = Number(req.body.hourlyRate);
  if (req.body.maxCapacity !== undefined) studio.maxCapacity = Number(req.body.maxCapacity);
  if (req.body.securityDeposit !== undefined) studio.securityDeposit = Number(req.body.securityDeposit);
  if (Array.isArray(req.body.amenities)) studio.amenities = req.body.amenities;
  if (Array.isArray(req.body.gallery)) studio.gallery = req.body.gallery.filter(Boolean);

  await studio.save();
  res.json({ studio, message: "Studio updated." });
});

// ---------- Delete studio (owner only, Challenge 1) ----------
router.delete("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid studio id." });
  }

  const studio = await Studio.findById(id);
  if (!studio) return res.status(404).json({ message: "Studio not found." });
  if (studio.ownerEmail.toLowerCase() !== req.user.email.toLowerCase()) {
    return res.status(403).json({ message: "Forbidden: only the host can delete this studio." });
  }

  await studio.deleteOne();
  await Booking.deleteMany({ studioId: studio._id });
  await User.updateMany({ wishlist: studio._id }, { $pull: { wishlist: studio._id } });
  res.json({ message: "Studio deleted." });
});

export default router;
