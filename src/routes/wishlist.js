const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const Studio = require("../models/Studio");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// ---------- Wishlist (guest side) ----------
router.get("/", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).populate({
    path: "wishlist",
    options: { sort: { createdAt: -1 } },
  });
  res.json({ studios: user?.wishlist || [] });
});

// ---------- Toggle a studio in the wishlist ----------
router.post("/:studioId/toggle", requireAuth, async (req, res) => {
  const { studioId } = req.params;
  if (!mongoose.isValidObjectId(studioId)) {
    return res.status(400).json({ message: "Invalid studio id." });
  }

  const studio = await Studio.findById(studioId);
  if (!studio) return res.status(404).json({ message: "Studio not found." });

  const user = await User.findById(req.user.id);
  const has = user.wishlist.some((id) => id.toString() === studioId);

  if (has) {
    user.wishlist = user.wishlist.filter((id) => id.toString() !== studioId);
  } else {
    user.wishlist.push(studio._id);
  }
  await user.save();

  res.json({ saved: !has, count: user.wishlist.length });
});

module.exports = router;
