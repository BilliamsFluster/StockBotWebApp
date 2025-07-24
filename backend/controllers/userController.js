import User from '../models/User.js';

export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password'); // Exclude password
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const updateUserProfile = async (req, res) => {
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

export const updatePreferences = async (req, res) => {
  const { model, format, voiceEnabled } = req.body;
  const user = await User.findById(req.user._id);

  if (!user) return res.status(404).json({ message: 'User not found' });

  user.preferences = {
    ...user.preferences, 
    ...(model !== undefined && { model }),
    ...(format !== undefined && { format }),
    ...(voiceEnabled !== undefined && { voiceEnabled }),
  };

  await user.save();
  res.json({ message: 'Preferences updated' });
};


export const getPreferences = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const defaults = {
      model: 'llama3',
      format: 'markdown',
      voiceEnabled: false,
    };

    // 🛠 Convert Mongoose subdocument to plain object
    const preferences = user.preferences?.toObject?.() || {};

    return res.json({
      preferences: {
        ...defaults,
        ...preferences, // ✅ now guaranteed to be plain JSON
      },
    });
  } catch (err) {
    console.error('❌ Error in getPreferences:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
