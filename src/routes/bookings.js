const express = require("express");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Studio = require("../models/Studio");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/** "HH:MM" strings compare correctly with < / > because they are zero padded. */
function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function hoursBetween(startTime, endTime) {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const minutes = eh * 60 + em - (sh * 60 + sm);
  return minutes / 60;
}

// ---------- Create booking (Challenge 1: auth + Challenge 2: overlap check) ----------
router.post("/", requireAuth, async (req, res) => {
  const { studioId, date, startTime, endTime, hours, totalPrice } = req.body || {};

  if (!studioId || !date || !startTime || !endTime) {
    return res.status(400).json({ message: "Studio, date and time range are required." });
  }
  if (!mongoose.isValidObjectId(studioId)) {
    return res.status(400).json({ message: "Invalid studio id." });
  }
  if (endTime <= startTime) {
    return res.status(400).json({ message: "End time must be after start time." });
  }

  const studio = await Studio.findById(studioId);
  if (!studio) return res.status(404).json({ message: "Studio not found." });

  // Challenge 2 — reject double bookings: check overlap with existing Confirmed slots.
  const collision = await Booking.findOne({
    studioId: studio._id,
    date,
    status: { $in: ["Confirmed"] },
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  });

  if (collision) {
    return res.status(409).json({
      message: `That time slot is already booked (${collision.startTime} – ${collision.endTime}). Please pick another window.`,
    });
  }

  const computedHours = hours || hoursBetween(startTime, endTime);
  if (computedHours <= 0) {
    return res.status(400).json({ message: "Booking must be at least one hour long." });
  }
  const computedTotal = totalPrice ?? computedHours * studio.hourlyRate + studio.securityDeposit;

  const booking = await Booking.create({
    studioId: studio._id,
    studioTitle: studio.title,
    studioImage: studio.image,
    studioLocation: studio.location,
    ownerEmail: studio.ownerEmail.toLowerCase(),
    userEmail: req.user.email.toLowerCase(),
    userName: req.user.name,
    date,
    startTime,
    endTime,
    hours: computedHours,
    totalPrice: computedTotal,
    // New reservations always start Pending — only the host can confirm.
    status: "Pending",
  });

  res.status(201).json({ booking, message: "Booking request sent — awaiting host confirmation." });
});

// ---------- Host: studio bookings (for confirming / completing) ----------
router.get("/for-studio/:studioId", requireAuth, async (req, res) => {
  const { studioId } = req.params;
  if (!mongoose.isValidObjectId(studioId)) {
    return res.status(400).json({ message: "Invalid studio id." });
  }
  const bookings = await Booking.find({ studioId })
    .sort({ date: 1, startTime: 1 })
    .lean();
  res.json({ bookings });
});

// ---------- My bookings (guest side) ----------
router.get("/mine", requireAuth, async (req, res) => {
  const bookings = await Booking.find({ userEmail: req.user.email.toLowerCase() })
    .sort({ createdAt: -1 })
    .lean();
  res.json({ bookings });
});

// ---------- My studio bookings (host side) ----------
router.get("/host", requireAuth, async (req, res) => {
  const bookings = await Booking.find({ ownerEmail: req.user.email.toLowerCase() })
    .sort({ createdAt: -1 })
    .lean();
  res.json({ bookings });
});

// ---------- Update status ----------
// - guest: may only cancel a Pending booking
// - host: may confirm / complete / cancel bookings for their own studio
router.patch("/:id/status", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  const allowed = ["Pending", "Confirmed", "Completed", "Cancelled"];

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid booking id." });
  }
  if (!allowed.includes(status)) {
    return res.status(400).json({ message: "Invalid status value." });
  }

  const booking = await Booking.findById(id);
  if (!booking) return res.status(404).json({ message: "Booking not found." });

  const isGuest = booking.userEmail === req.user.email.toLowerCase();
  const isHost = booking.ownerEmail === req.user.email.toLowerCase();

  if (isGuest) {
    if (status !== "Cancelled") {
      return res.status(403).json({ message: "Guests can only cancel their own bookings." });
    }
    if (booking.status !== "Pending") {
      return res.status(400).json({ message: "Only pending bookings can be cancelled." });
    }
  } else if (isHost) {
    // Hosts may move bookings through the workflow.
  } else {
    return res.status(403).json({ message: "Forbidden: not your booking." });
  }

  booking.status = status;
  await booking.save();
  res.json({ booking, message: `Booking marked as ${status}.` });
});

module.exports = router;
