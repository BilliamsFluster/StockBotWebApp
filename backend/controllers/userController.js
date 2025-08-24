import User from '../models/User.js';
import { body, validationResult } from 'express-validator';

export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password'); // Exclude password
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const updateProfileValidation = [
  body('username').optional().trim().notEmpty().escape(),
  body('email').optional().isEmail().withMessage('Valid email is required').normalizeEmail(),
];

export const updateUserProfile = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const { username, email } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { username, email },
      { new: true, runValidators: true }
    ).select('-password');

    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const updatePreferencesValidation = [
  body('model').optional().isString(),
  body('format').optional().isString(),
  body('voiceEnabled').optional().isBoolean(),
  body('activeBroker').optional().isIn(['schwab', 'alpaca']),
];

export const updatePreferences = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { model, format, voiceEnabled, activeBroker } = req.body;
  const user = await User.findById(req.user._id);

  if (!user) return res.status(404).json({ message: 'User not found' });

  user.preferences = {
    ...user.preferences,
    ...(model !== undefined && { model }),
    ...(format !== undefined && { format }),
    ...(voiceEnabled !== undefined && { voiceEnabled }),
    ...(activeBroker !== undefined && { activeBroker }),
  };

  await user.save();
  res.json({ message: 'Preferences updated', preferences: user.preferences });
};


export const getPreferences = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const defaults = {
      model: 'qwen3:8b',
      format: 'markdown',
      voiceEnabled: false,
      activeBroker: 'alpaca', 
    };

    const preferences = user.preferences?.toObject?.() || {};

    return res.json({
      preferences: {
        ...defaults,
        ...preferences,
      },
    });
  } catch (err) {
    console.error('❌ Error in getPreferences:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

