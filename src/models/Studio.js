const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    avatar: { type: String, default: "" },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, required: true },
    date: { type: Date, default: Date.now },
  },
  { _id: true }
);

const studioSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true },
    hourlyRate: { type: Number, required: true, min: 0 },
    securityDeposit: { type: Number, default: 0, min: 0 },
    maxCapacity: { type: Number, required: true, min: 1 },
    location: { type: String, required: true, trim: true },
    image: { type: String, required: true },
    gallery: [{ type: String }],
    amenities: [{ type: String }],
    overview: { type: String, required: true },
    ownerEmail: { type: String, required: true, lowercase: true, trim: true },
    ownerName: { type: String, required: true },
    hostPhone: { type: String, default: "" },
    rating: { type: Number, default: 4.5, min: 0, max: 5 },
    reviews: [reviewSchema],
  },
  { timestamps: true }
);

// Text index powers the search box on /studios
studioSchema.index({ title: "text", location: "text", overview: "text", category: "text" });

module.exports = mongoose.model("Studio", studioSchema);
