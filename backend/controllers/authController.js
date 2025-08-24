import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import { log } from '../utils/logger.js';
import { body, validationResult } from 'express-validator';

const JWT_SECRET = process.env.JWT_SECRET || 'yoursecretkey';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'refreshsecretkey';
const TOKEN_EXPIRY = '20m';
const REFRESH_EXPIRY = '8h';
const REFRESH_EXPIRY_MS = 8 * 60 * 60 * 1000; // for cookie in ms

export const registerValidation = [
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required')
    .escape(),
  body('email')
    .trim()
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
];

export const loginValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required'),
];


const generateToken = (userId) =>
  jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

const generateRefreshToken = (userId) =>
  jwt.sign({ id: userId }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });

export const registerUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { username, email, password } = req.body;

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
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    await user.save();

    // ✅ Access token cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 20 * 60 * 1000, // 20 minutes
      path: '/',
    });

    // ✅ Refresh token cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: REFRESH_EXPIRY_MS,
      path: '/',
    });

    res.json({
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

    const newAccessToken = generateToken(user._id);

    // ✅ Set new access token cookie again
    res.cookie('token', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 20 * 60 * 1000, // 20 minutes
      path: '/',
    });

    res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });

  } catch (err) {
    res.status(403).json({ message: 'Invalid or expired refresh token' });
  }
};

