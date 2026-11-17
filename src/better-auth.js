import { createHash } from "node:crypto";
import { MongoClient } from "mongodb";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { oneTap } from "better-auth/plugins";

/**
 * BetterAuth owns its own MongoDB collections (user, session, account,
 * verification) and exposes the standard /api/auth/* endpoints:
 *
 *   POST /api/auth/sign-up/email
 *   POST /api/auth/sign-in/email
 *   GET  /api/auth/get-session
 *   POST /api/auth/sign-out
 *   POST /api/auth/one-tap/callback   (Google Identity Services ID token)
 *
 * The app also keeps its existing JWT cookie flow for accounts created through
 * the StudioSpace login/register forms. attachUser() accepts either session.
 */

let authPromise = null;
let mongoClientPromise = null;

function getMongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set for the BetterAuth MongoDB adapter.");
  }

  if (!mongoClientPromise) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
    mongoClientPromise = client.connect().catch((err) => {
      mongoClientPromise = null;
      throw err;
    });
  }

  return mongoClientPromise;
}

function getSecret() {
  const explicit = process.env.BETTER_AUTH_SECRET;
  if (explicit && explicit.length >= 32) return explicit;

  // Never fail a deployment because BETTER_AUTH_SECRET is missing: derive a
  // stable 32+ character secret from the existing JWT secret instead.
  const fallback = process.env.JWT_SECRET || "studiospace-development-secret";
  return createHash("sha256").update(fallback).digest("hex");
}

function getBaseURL() {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT || 5000}`;
}

function getTrustedOrigins() {
  const origins = (process.env.CLIENT_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return [
    ...new Set([
      ...origins,
      "http://localhost:3000",
      "https://studiospace-live.vercel.app",
    ]),
  ];
}

async function buildAuth() {
  const client = await getMongoClient();
  const db = client.db();
  const crossSite =
    process.env.COOKIE_CROSS_SITE === "true" ||
    process.env.NODE_ENV === "production";

  return betterAuth({
    appName: "StudioSpace",
    baseURL: getBaseURL(),
    basePath: "/api/auth",
    secret: getSecret(),
    database: mongodbAdapter(db, { client, transaction: false }),
    trustedOrigins: getTrustedOrigins(),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    plugins: [
      // Google Identity Services sends a Google ID token from the browser.
      // BetterAuth verifies it and creates its own HTTPOnly session cookie.
      // The optional jwt() plugin is intentionally not used: sessions are
      // already handled here, and its shared JWKS encryption would couple the
      // database to one environment's BETTER_AUTH_SECRET.
      oneTap({ clientId: process.env.GOOGLE_CLIENT_ID || undefined }),
    ],
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: crossSite ? "none" : "lax",
        secure: crossSite,
        path: "/",
      },
    },
  });
}

/** Lazily create the BetterAuth instance after the Mongo client connects. */
export function getAuth() {
  if (!authPromise) {
    authPromise = buildAuth().catch((err) => {
      authPromise = null;
      throw err;
    });
  }
  return authPromise;
}
