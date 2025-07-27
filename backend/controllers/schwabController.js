import { env } from '../config/env.js';
import { exchangeCodeForTokensInternal, refreshSchwabAccessTokenInternal } from '../config/schwab.js';

const STOCKBOT_URL = env.STOCKBOT_URL;

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










