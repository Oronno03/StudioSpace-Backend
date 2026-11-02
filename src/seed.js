/**
 * Seed script — populates MongoDB with demo studios, a demo guest account
 * and a demo host account so the site has content and the examiner has
 * test credentials to log in with.
 *
 * Usage:  npm run seed
 * Demo guest:  harry@studiospace.dev  / Password123
 * Demo host:   maya@studiospace.dev   / Password123
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import connectDB from "./db.js";
import User from "./models/User.js";
import Studio from "./models/Studio.js";
import Booking from "./models/Booking.js";

const studios = [
  {
    title: "Lumina Cyc Wall Studio",
    category: "Photo Studio",
    hourlyRate: 65,
    securityDeposit: 100,
    maxCapacity: 12,
    location: "Bushwick, Brooklyn, NY",
    image: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1567443024551-f3e3cc2be870?auto=format&fit=crop&w=1600&q=80",
      "https://images.unsplash.com/photo-1542038784456-1ea8e935640e?auto=format&fit=crop&w=1600&q=80",
    ],
    amenities: ["Infinite Cyc Wall", "Profoto Lighting", "Wi-Fi", "Makeup Station", "Blackout Blinds", "Parking"],
    overview:
      "A daylight-balanced infinity cyc wall studio built for commercial product, fashion and editorial shoots. Drive-in access, 14ft ceilings and a full Profoto lighting package make this the go-to space for Brooklyn creatives.",
    ownerEmail: "maya@studiospace.dev",
    ownerName: "Maya Chen",
    rating: 4.9,
    reviews: [
      { name: "Harry Rivera", avatar: "https://i.pravatar.cc/100?img=12", rating: 5, comment: "Cyc wall is flawless and the light is gorgeous all afternoon. Maya is a fantastic host." },
      { name: "Ava Thompson", avatar: "https://i.pravatar.cc/100?img=45", rating: 5, comment: "Booked for a lookbook shoot — gear was spotless and check-in took 2 minutes." },
    ],
  },
  {
    title: "SoundStage 9 — Cinema Sound Stage",
    category: "Sound Stage",
    hourlyRate: 180,
    securityDeposit: 500,
    maxCapacity: 30,
    location: "Downtown Los Angeles, CA",
    image: "https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1585951237318-9ea5e175b891?auto=format&fit=crop&w=1600&q=80",
    ],
    amenities: ["Green Room", "Grid Rigging", "Loading Dock", "Dressing Rooms", "3-Phase Power", "Production Office"],
    overview:
      "A 6,000 sq ft cinema sound stage with a full grid, cyclorama and drive-in loading dock. Ideal for narrative shorts, commercials and music videos needing real production infrastructure.",
    ownerEmail: "maya@studiospace.dev",
    ownerName: "Maya Chen",
    rating: 4.8,
    reviews: [
      { name: "Noah Kim", avatar: "https://i.pravatar.cc/100?img=33", rating: 5, comment: "Rigged a 20ft set in a day. Grid and power are the real deal here." },
    ],
  },
  {
    title: "The Velvet Room Podcast Lounge",
    category: "Podcast Lounge",
    hourlyRate: 35,
    securityDeposit: 50,
    maxCapacity: 6,
    location: "Shoreditch, London, UK",
    image: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&w=1600&q=80",
    ],
    amenities: ["4x Shure SM7B", "RØDECaster Pro II", "Acoustic Treatment", "Stream Deck", "Coffee Bar", "Wi-Fi"],
    overview:
      "An acoustically treated four-seat podcast lounge with broadcast-ready microphones and a one-button stream setup. Walk in, press record, leave with your files.",
    ownerEmail: "maya@studiospace.dev",
    ownerName: "Maya Chen",
    rating: 4.7,
    reviews: [
      { name: "Priya Patel", avatar: "https://i.pravatar.cc/100?img=25", rating: 5, comment: "Best sounding room I've recorded in this year. Everything just works." },
    ],
  },
  {
    title: "Analog Heart Recording Suite",
    category: "Music Suite",
    hourlyRate: 90,
    securityDeposit: 200,
    maxCapacity: 8,
    location: "Silver Lake, Los Angeles, CA",
    image: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1519508234439-4f23643125c1?auto=format&fit=crop&w=1600&q=80",
    ],
    amenities: ["Neve Console", "Live Room", "Vocal Booth", "Monitoring", "Backline", "Engineer On Call"],
    overview:
      "A warm analog tracking suite built around a vintage Neve console, with a live room, iso vocal booth and a wall of outboard gear. Perfect for records that need tape saturation and character.",
    ownerEmail: "maya@studiospace.dev",
    ownerName: "Maya Chen",
    rating: 4.9,
    reviews: [
      { name: "Leo Martins", avatar: "https://i.pravatar.cc/100?img=68", rating: 5, comment: "Tracked our EP here. The live room has an incredible vibe." },
    ],
  },
  {
    title: "Clay & Kiln Art Workshop",
    category: "Art Workshop",
    hourlyRate: 45,
    securityDeposit: 75,
    maxCapacity: 16,
    location: "Williamsburg, Brooklyn, NY",
    image: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1493106641515-6b5631de4bb9?auto=format&fit=crop&w=1600&q=80",
    ],
    amenities: ["12 Pottery Wheels", "2 Kilns", "Slab Roller", "Wash Stations", "Natural Light", "Aprons Included"],
    overview:
      "A light-filled ceramics workshop available for classes, residencies and team sessions. Twelve wheels, two kilns and a mess-friendly layout that cleans up fast.",
    ownerEmail: "maya@studiospace.dev",
    ownerName: "Maya Chen",
    rating: 4.6,
    reviews: [],
  },
  {
    title: "Golden Hour Film Stage",
    category: "Film Stage",
    hourlyRate: 120,
    securityDeposit: 400,
    maxCapacity: 20,
    location: "Atlanta, GA",
    image: "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=1200&q=80",
    gallery: [],
    amenities: ["20ft Green Screen", "Dimmer Rack", "Grip Package", "Client Lounge", "Wi-Fi", "Craft Services Area"],
    overview:
      "A flexible film stage with a 20ft chroma-green wall, full dimmer rack and grip package included. Client lounge with live camera feed so producers can watch in comfort.",
    ownerEmail: "maya@studiospace.dev",
    ownerName: "Maya Chen",
    rating: 4.5,
    reviews: [],
  },
  {
    title: "Loft 84 Daylight Photo Studio",
    category: "Photo Studio",
    hourlyRate: 55,
    securityDeposit: 80,
    maxCapacity: 10,
    location: "Mission District, San Francisco, CA",
    image: "https://images.unsplash.com/photo-1554048612-b6a482bc67e5?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1600&q=80",
    ],
    amenities: ["North-Facing Windows", "Seamless Paper", "C-Stands", "Wi-Fi", "Changing Room", "Freight Elevator"],
    overview:
      "A classic brick-loft daylight studio with 12ft north-facing windows. Warm, honest light from open to close — a favorite for portrait and lifestyle work.",
    ownerEmail: "maya@studiospace.dev",
    ownerName: "Maya Chen",
    rating: 4.7,
    reviews: [],
  },
  {
    title: "Night Owl Podcast & Video Booth",
    category: "Podcast Lounge",
    hourlyRate: 40,
    securityDeposit: 60,
    maxCapacity: 5,
    location: "Austin, TX",
    image: "https://images.unsplash.com/photo-1589903308904-1010c2294adc?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1600&q=80",
    ],
    amenities: ["4K Cameras", "Elgato Key Lights", "Sound Panels", "Teleprompter", "Wi-Fi", "Streaming PC"],
    overview:
      "A video-first podcast booth with matched 4K cameras, Elgato lighting and a streaming-ready PC. Records multi-cam video and broadcast audio in one take.",
    ownerEmail: "maya@studiospace.dev",
    ownerName: "Maya Chen",
    rating: 4.8,
    reviews: [],
  },
];

async function run() {
  await connectDB();

  console.log("Clearing old data...");
  await Promise.all([User.deleteMany({}), Studio.deleteMany({}), Booking.deleteMany({})]);

  const passwordHash = await bcrypt.hash("Password123", 10);

  console.log("Creating users...");
  const host = await User.create({
    name: "Maya Chen",
    email: "maya@studiospace.dev",
    passwordHash,
    photoURL: "https://i.pravatar.cc/160?img=47",
  });
  const guest = await User.create({
    name: "Harry Rivera",
    email: "harry@studiospace.dev",
    passwordHash,
    photoURL: "https://i.pravatar.cc/160?img=12",
  });

  console.log("Creating studios...");
  const created = await Studio.create(
    studios.map((s) => ({ ...s, ownerEmail: host.email }))
  );

  // Give the demo guest one pending booking so /my-bookings isn't empty on first look.
  console.log("Creating a demo booking...");
  await Booking.create({
    studioId: created[0]._id,
    studioTitle: created[0].title,
    studioImage: created[0].image,
    studioLocation: created[0].location,
    ownerEmail: host.email,
    userEmail: guest.email,
    userName: guest.name,
    date: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    startTime: "10:00",
    endTime: "14:00",
    hours: 4,
    totalPrice: 4 * created[0].hourlyRate + created[0].securityDeposit,
    status: "Pending",
  });

  console.log("\nSeed complete ✔");
  console.log("Studios:", created.length);
  console.log("Demo guest login:  harry@studiospace.dev / Password123");
  console.log("Demo host  login:  maya@studiospace.dev  / Password123");

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
