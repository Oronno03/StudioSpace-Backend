import express from "express";
import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Studio from "../models/Studio.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

/**
 * Challenge 2: a slot is occupied while the request is waiting for the host
 * (Pending) or after the host approved it (Confirmed). Cancelled bookings
 * release the slot. Checking Pending as well as Confirmed means two guests
 * can never race each other into the same window before a host responds.
 */
const ACTIVE_BOOKING_STATUSES = ["Pending", "Confirmed"];

function normalizeTime(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

function normalizeDate(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function hoursBetween(startTime, endTime) {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const minutes = eh * 60 + em - (sh * 60 + sm);
  return minutes / 60;
}

/** Exact overlap query used by both booking creation and host confirmation. */
function overlapFilter({ studioId, date, startTime, endTime, statuses, excludeId }) {
  const filter = {
    studioId,
    date,
    status: { $in: statuses },
    // Challenge 2 formula: StartA < EndB AND EndA > StartB
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  };

  if (excludeId) filter._id = { $ne: excludeId };
  return filter;
}

function conflictResponse(collision, studioTitle) {
  return {
    code: "BOOKING_CONFLICT",
    message: `Double booking blocked: ${studioTitle} is already booked on ${collision.date} from ${collision.startTime} to ${collision.endTime} (status: ${collision.status}). Please choose a different time slot.`,
    conflict: {
      date: collision.date,
      startTime: collision.startTime,
      endTime: collision.endTime,
      status: collision.status,
    },
  };
}

// ---------- Create booking (Challenge 1: auth + Challenge 2: overlap check) ----------
router.post("/", requireAuth, async (req, res) => {
  const { studioId, date, startTime, endTime } = req.body || {};

  const normalizedDate = normalizeDate(date);
  const normalizedStart = normalizeTime(startTime);
  const normalizedEnd = normalizeTime(endTime);

  if (!studioId || !normalizedDate || !normalizedStart || !normalizedEnd) {
    return res.status(400).json({
      message: "Studio, date (YYYY-MM-DD) and a valid start/end time are required.",
    });
  }
  if (!mongoose.isValidObjectId(studioId)) {
    return res.status(400).json({ message: "Invalid studio id." });
  }
  if (normalizedEnd <= normalizedStart) {
    return res.status(400).json({ message: "End time must be after start time." });
  }

  const studio = await Studio.findById(studioId);
  if (!studio) return res.status(404).json({ message: "Studio not found." });

  // Challenge 2 — reject double bookings before creating the reservation.
  const collision = await Booking.findOne(
    overlapFilter({
      studioId: studio._id,
      date: normalizedDate,
      startTime: normalizedStart,
      endTime: normalizedEnd,
      statuses: ACTIVE_BOOKING_STATUSES,
    })
  );

  if (collision) {
    return res.status(409).json(conflictResponse(collision, studio.title));
  }

  const computedHours = hoursBetween(normalizedStart, normalizedEnd);
  if (computedHours <= 0) {
    return res.status(400).json({ message: "Booking must be at least one hour long." });
  }

  // Always calculate money server-side so a client cannot tamper with it.
  const computedTotal =
    computedHours * studio.hourlyRate + (studio.securityDeposit || 0);

  const booking = await Booking.create({
    studioId: studio._id,
    studioTitle: studio.title,
    studioImage: studio.image,
    studioLocation: studio.location,
    ownerEmail: studio.ownerEmail.toLowerCase(),
    userEmail: req.user.email.toLowerCase(),
    userName: req.user.name,
    date: normalizedDate,
    startTime: normalizedStart,
    endTime: normalizedEnd,
    hours: computedHours,
    totalPrice: computedTotal,
    // New reservations always start Pending — only the host can confirm.
    status: "Pending",
  });

  // Defense in depth for simultaneous requests: if an older overlapping
  // booking slipped in between the check and the insert, keep the older one.
  const racedFilter = overlapFilter({
    studioId: studio._id,
    date: normalizedDate,
    startTime: normalizedStart,
    endTime: normalizedEnd,
    statuses: ACTIVE_BOOKING_STATUSES,
  });
  racedFilter._id = { $lt: booking._id };

  const raced = await Booking.findOne(racedFilter);

  if (raced) {
    await booking.deleteOne();
    return res.status(409).json(conflictResponse(raced, studio.title));
  }

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

  // Challenge 2: re-check at confirmation time so two legacy pending overlaps
  // can never both become Confirmed.
  if (status === "Confirmed") {
    const collision = await Booking.findOne(
      overlapFilter({
        studioId: booking.studioId,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        statuses: ["Confirmed"],
        excludeId: booking._id,
      })
    );

    if (collision) {
      return res.status(409).json(conflictResponse(collision, booking.studioTitle));
    }
  }

  booking.status = status;
  await booking.save();
  res.json({ booking, message: `Booking marked as ${status}.` });
});

export default router;
