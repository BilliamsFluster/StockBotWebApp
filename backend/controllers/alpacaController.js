import User from '../models/User.js';

/**
 * Save Alpaca API credentials to the user's account.
 * No Alpaca API calls yet — just store in DB.
 */
export const connectAlpaca = async (req, res) => {
    console.log('req.user:', req.user); 
  try {
    console.log('req.user:', req.user); // 👈 Check this
    const { app_key, app_secret, mode } = req.body;

    if (!req.user?.id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!app_key || !app_secret) {
      return res.status(400).json({ error: 'API key and secret are required.' });
    }

    const updated = await User.findByIdAndUpdate(
      req.user.id,
      {
        alpaca_tokens: {
          app_key,
          app_secret,
          mode: mode || 'paper'
        }
      },
      { new: true } // Return updated document
    );

    console.log('Updated user:', updated);

    return res.json({
      success: true,
      message: 'Alpaca API keys saved successfully.',
      alpaca_tokens: updated.alpaca_tokens
    });
  } catch (err) {
    console.error('Error saving Alpaca keys:', err.message);
    return res.status(500).json({ error: 'Failed to save Alpaca credentials.' });
  }
};


/**
 * For later: Fetch Alpaca account info from DB or Alpaca API.
 * Right now, just returns stored DB values for the user.
 */
export const getAlpacaAccountStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user?.alpaca_tokens?.app_key || !user?.alpaca_tokens?.app_secret) {
      return res.status(400).json({ error: 'Alpaca account not connected.' });
    }

    // For now, just return what’s in DB
    return res.json({
      connected: true,
      mode: user.alpaca_tokens.mode || 'paper'
    });
  } catch (err) {
    console.error('Error fetching Alpaca account status:', err.message);
    return res.status(500).json({ error: 'Failed to fetch Alpaca account status.' });
  }
};

export const disconnectAlpacaAPI = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $unset: { alpaca_tokens: "" }
    });

    res.json({ message: 'Alpaca disconnected successfully' });
  } catch (err) {
    console.error('❌ Error disconnecting Alpaca:', err);
    res.status(500).json({ message: 'Failed to disconnect Alpaca' });
  }
};
