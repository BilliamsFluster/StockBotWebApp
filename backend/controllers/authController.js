import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import { log } from '../utils/logger.js';

const JWT_SECRET = process.env.JWT_SECRET || 'yoursecretkey';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'refreshsecretkey';
const TOKEN_EXPIRY = '20m';
const REFRESH_EXPIRY = '8h';
const REFRESH_EXPIRY_MS = 8 * 60 * 60 * 1000; // for cookie in ms


const generateToken = (userId) =>
  jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

const generateRefreshToken = (userId) =>
  jwt.sign({ id: userId }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });

export const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const newUser = new User({ username, email, password });
    await newUser.save();

    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    log('REGISTER ERROR:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    

    if (!email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    await user.save();

    
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: false, // ✅ set to true in production with HTTPS
      sameSite: 'Lax',
      maxAge: REFRESH_EXPIRY_MS,
      path: '/',
    });

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const logoutUser = async (req, res) => {
  // Optionally: Remove stored refresh token from DB
  if (req.user) {
    await User.findByIdAndUpdate(req.user.id, { refreshToken: null });
  }

  // Clear both cookies
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
    path: "/",
  });

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
    path: "/",
  });

  res.status(200).json({ message: "Logged out successfully" });
};


export const refreshAccessToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ message: 'No refresh token provided' });
    }

    const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    // Only generate new access token — keep refresh token as is
    const newAccessToken = generateToken(user._id);

    res.json({
      token: newAccessToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err) {
    res.status(403).json({
      message: 'Invalid or expired refresh token',
      error: err.message,
    });
  }
};

