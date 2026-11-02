import mongoose from "mongoose";

/**
 * Connect to MongoDB. Cached across hot-reloads in development so
 * we don't open a new connection pool on every file change.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env and add your connection string.");
  }

  if (mongoose.connection.readyState >= 1) {
    return mongoose.connection;
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log("MongoDB connected:", mongoose.connection.name);
  return mongoose.connection;
}

export default connectDB;
