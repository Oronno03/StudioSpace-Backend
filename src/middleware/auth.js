const jwt = require("jsonwebtoken");

const COOKIE_NAME = "studiospace_token";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set in the environment");
  return secret;
}

function signToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

/** Attaches req.user when a valid JWT is present in the HTTPOnly cookie. */
function attachUser(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next();
  try {
    req.user = jwt.verify(token, getJwtSecret());
  } catch {
    // Expired/forged token — ignore, route guard will reject if needed.
  }
  next();
}

/** Challenge 1: protects server-side mutations — 401 unless a valid JWT cookie exists. */
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
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

module.exports = {
  COOKIE_NAME,
  signToken,
  attachUser,
  requireAuth,
  requireOwner,
  setAuthCookie,
  clearAuthCookie,
};
