
import { exchangeCodeForTokensInternal, refreshSchwabAccessTokenInternal } from '../config/schwab.js';
import axios from "axios"
import User from '../models/User.js';

const STOCKBOT_URL = process.env.STOCKBOT_URL;

export const exchangeCodeForTokens = async (req, res) => {
  const { code } = req.body;
  const userId = req.user?._id;
  if (!code) return res.status(400).json({ error: 'Missing authorization code.' });
  if (!userId) return res.status(401).json({ error: 'User not authenticated.' });

  try {
    const result = await exchangeCodeForTokensInternal(code, userId);
    res.status(200).json(result);
  } catch (err) {
    console.error('Error exchanging code:', err);
    res.status(500).json({ error: 'Failed to exchange authorization code for tokens.' });
  }
};

export const refreshSchwabAccessToken = async (req, res) => {
  try {
    const accessToken = await refreshSchwabAccessTokenInternal(req.user._id);
    if (!accessToken) return res.status(401).json({ error: 'Token refresh failed' });
    res.status(200).json({ access_token: accessToken });
  } catch (err) {
    console.error('Error refreshing access token:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getSchwabAccountStatus = async (req, res) => {
  try {
    const accessToken = await refreshSchwabAccessTokenInternal(req.user._id);
    console.log
    if (!accessToken) {
      return res.status(401).json({
        connected: false,
        error: 'Unable to retrieve or refresh Schwab access token.',
      });
    }

    // Ping Schwab's lightweight endpoint to validate connection
    const response = await axios.get('https://api.schwabapi.com/trader/v1/accounts', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status === 200) {
      return res.status(200).json({ connected: true });
    } else {
      return res.status(200).json({ connected: false });
    }

  } catch (err) {
    console.error('❌ Schwab account status check failed:', err.response?.data || err.message);
    return res.status(500).json({
      connected: false,
      error: 'Internal error checking Schwab account status.',
    });
  }
};


export const setSchwabCredentials = async (req, res) => {
  try {
    const { app_key, app_secret } = req.body;
    if (!app_key || !app_secret) {
      return res.status(400).json({ message: 'Missing credentials' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Mongoose pre-save hook will encrypt these
    user.schwab_tokens = {
      ...user.schwab_tokens,
      app_key,
      app_secret
    };

    await user.save();
    return res.json({ success: true });
  } catch (err) {
    console.error('Error setting Schwab credentials:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Check if Schwab credentials exist
export const checkSchwabCredentials = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const exists = !!(user?.schwab_tokens?.app_key && user?.schwab_tokens?.app_secret);
    return res.json({ exists });
  } catch (err) {
    console.error('Error checking Schwab credentials:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};


// controllers/schwabController.js
export const disconnectSchwabAPI = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $unset: { schwab_tokens: "" }
    });

    res.json({ message: 'Schwab disconnected successfully' });
  } catch (err) {
    console.error('❌ Error disconnecting Schwab:', err);
    res.status(500).json({ message: 'Failed to disconnect Schwab' });
  }
};






