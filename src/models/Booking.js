const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    studioId: { type: mongoose.Schema.Types.ObjectId, ref: "Studio", required: true },
    studioTitle: { type: String, required: true },
    studioImage: { type: String, default: "" },
    studioLocation: { type: String, default: "" },
    ownerEmail: { type: String, required: true, lowercase: true },
    userEmail: { type: String, required: true, lowercase: true },
    userName: { type: String, required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    startTime: { type: String, required: true }, // HH:MM (24h)
    endTime: { type: String, required: true }, // HH:MM (24h)
    hours: { type: Number, required: true, min: 1 },
    totalPrice: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["Pending", "Confirmed", "Completed", "Cancelled"],
      default: "Pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", bookingSchema);
