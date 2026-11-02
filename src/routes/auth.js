import express from "express";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import {
  signToken,
  requireAuth,
  setAuthCookie,
  clearAuthCookie,
} from "../middleware/auth.js";

const router = express.Router();

const PASSWORD_RULES = {
  minLength: 6,
  test: (pw) => /[A-Z]/.test(pw) && /[a-z]/.test(pw) && pw.length >= 6,
};

function validatePassword(pw) {
  if (!/[A-Z]/.test(pw)) return "Password must contain an uppercase letter.";
  if (!/[a-z]/.test(pw)) return "Password must contain a lowercase letter.";
  if (pw.length < 6) return "Password must be at least 6 characters long.";
  return null;
}

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    photoURL: user.photoURL || "",
  };
}

// ---------- Register ----------
router.post("/register", async (req, res) => {
  const { name, email, password, photoURL } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email and password are required." });
  }

  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ message: pwError });

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(409).json({ message: "An account with this email already exists." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email,
    passwordHash,
    photoURL: photoURL || "",
  });

  setAuthCookie(res, signToken({ id: user._id, email: user.email, name: user.name }));
  res.status(201).json({ user: publicUser(user), message: "Account created successfully." });
});

// ---------- Login ----------
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !user.passwordHash) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  setAuthCookie(res, signToken({ id: user._id, email: user.email, name: user.name }));
  res.json({ user: publicUser(user), message: "Logged in successfully." });
});

// ---------- Google sign-in ----------
// The frontend obtains a Google ID token from Google Identity Services and posts it here.
// We verify it against GOOGLE_CLIENT_ID when configured.
router.post("/google", async (req, res) => {
  const { credential, name, email, photoURL, demo } = req.body || {};

  let verifiedEmail = null;
  let verifiedName = null;
  let verifiedPhoto = null;

  // Development demo mode — only honored while GOOGLE_CLIENT_ID is unset,
  // so a production deployment can never be tricked into it.
  if (demo && !process.env.GOOGLE_CLIENT_ID) {
    let demoUser = await User.findOne({ email: "demo@studiospace.dev" });
    if (!demoUser) {
      demoUser = await User.create({
        name: "Demo Explorer",
        email: "demo@studiospace.dev",
        photoURL: "https://i.pravatar.cc/160?img=68",
      });
    }
    setAuthCookie(res, signToken({ id: demoUser._id, email: demoUser.email, name: demoUser.name }));
    return res.json({ user: publicUser(demoUser), message: "Signed in with Google (demo mode)." });
  }

  if (credential) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId) {
      try {
        const client = new OAuth2Client(clientId);
        const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
        const payload = ticket.getPayload();
        verifiedEmail = payload?.email;
        verifiedName = payload?.name;
        verifiedPhoto = payload?.picture;
      } catch {
        return res.status(401).json({ message: "Google sign-in verification failed." });
      }
    } else {
      // Development fallback: GOOGLE_CLIENT_ID not configured yet.
      // Decode the (unverified) ID token payload so the flow works locally.
      try {
        const payload = JSON.parse(
          Buffer.from(credential.split(".")[1], "base64url").toString("utf8")
        );
        verifiedEmail = payload?.email;
        verifiedName = payload?.name;
        verifiedPhoto = payload?.picture;
      } catch {
        return res.status(400).json({ message: "Malformed Google credential." });
      }
    }
  }

  const finalEmail = (verifiedEmail || email || "").toLowerCase();
  const finalName = verifiedName || name || "Google User";
  const finalPhoto = verifiedPhoto || photoURL || "";

  if (!finalEmail) {
    return res.status(400).json({ message: "Google sign-in did not return an email." });
  }

  let user = await User.findOne({ email: finalEmail });
  if (!user) {
    user = await User.create({ name: finalName, email: finalEmail, photoURL: finalPhoto });
  } else if (finalPhoto && user.photoURL !== finalPhoto) {
    user.photoURL = finalPhoto;
    await user.save();
  }

  setAuthCookie(res, signToken({ id: user._id, email: user.email, name: user.name }));
  res.json({ user: publicUser(user), message: "Signed in with Google." });
});

// ---------- Current user ----------
router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: "User not found." });
  res.json({ user: publicUser(user) });
});

// ---------- Logout ----------
router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ message: "Logged out." });
});

export { PASSWORD_RULES };
export default router;
