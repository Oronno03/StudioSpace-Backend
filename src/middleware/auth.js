import jwt from "jsonwebtoken";
import { fromNodeHeaders } from "better-auth/node";
import User from "../models/User.js";
import { getAuth } from "../better-auth.js";

const COOKIE_NAME = "studiospace_token";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set in the environment");
  return secret;
}

function signToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

function authCookieOptions() {
  // The deployed client and API live on different Vercel domains, so the
  // session cookie must be SameSite=None; Secure. Local development keeps
  // the friendlier Lax default.
  const crossSite =
    process.env.COOKIE_CROSS_SITE === "true" ||
    process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    sameSite: crossSite ? "none" : "lax",
    secure: crossSite,
    path: "/",
  };
}

/** True when the request carries a BetterAuth session cookie (incl. __Secure-). */
function hasBetterAuthSessionCookie(cookies) {
  return Object.keys(cookies || {}).some((name) =>
    name.includes("better-auth.session_token")
  );
}

/**
 * Challenge 1 + 6.6: accept either
 *   1. the existing StudioSpace JWT HTTPOnly cookie, or
 *   2. a BetterAuth session cookie backed by the MongoDB adapter.
 *
 * BetterAuth users are mirrored into the app's `users` collection so every
 * existing route (wishlist, bookings, listings) keeps working unchanged.
 */
async function attachUser(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];

  if (token) {
    try {
      req.user = jwt.verify(token, getJwtSecret());
      req.authProvider = "jwt";
      return next();
    } catch {
      // Expired/forged JWT — fall through and try a BetterAuth session.
    }
  }

  if (!hasBetterAuthSessionCookie(req.cookies)) return next();

  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    const sessionUser = session?.user;
    if (sessionUser?.email) {
      const email = sessionUser.email.toLowerCase();
      let user = await User.findOne({ email });

      if (!user) {
        try {
          user = await User.create({
            name: sessionUser.name || email.split("@")[0],
            email,
            photoURL: sessionUser.image || "",
          });
        } catch {
          // Another request may have mirrored the same BetterAuth user.
          user = await User.findOne({ email });
        }
      }

      if (user) {
        req.user = {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          photoURL: user.photoURL || "",
        };
        req.authProvider = "better-auth";
        req.betterAuthSession = session?.session || null;
      }
    }
  } catch (err) {
    // A bad/expired BetterAuth cookie must never break public endpoints.
    console.error("[auth] BetterAuth session lookup failed:", err.message);
  }

  next();
}

/** Challenge 1: protects server-side mutations — 401 unless authenticated. */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized: please log in to continue." });
  }
  next();
}

/** Same, but only allows the listed email (or any authenticated user when empty). */
function requireOwner(ownerEmailGetter) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized: please log in to continue." });
    }
    const owner = ownerEmailGetter(req);
    if (owner && owner.toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(403).json({ message: "Forbidden: you do not own this resource." });
    }
    next();
  };
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    ...authCookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, authCookieOptions());
}

/** Clear BetterAuth's own cookies on logout (secure + local variants). */
function clearBetterAuthCookies(res) {
  const options = authCookieOptions();
  const names = [
    "better-auth.session_token",
    "better-auth.session_data",
    "better-auth.account_data",
    "__Secure-better-auth.session_token",
    "__Secure-better-auth.session_data",
    "__Secure-better-auth.account_data",
  ];

  for (const name of names) {
    res.clearCookie(name, options);
  }
}

export {
  COOKIE_NAME,
  signToken,
  attachUser,
  requireAuth,
  requireOwner,
  setAuthCookie,
  clearAuthCookie,
  clearBetterAuthCookies,
  hasBetterAuthSessionCookie,
};
