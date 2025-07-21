import axios from 'axios';
import base64 from 'base-64';
import User from '../models/User.js';
import { refreshSchwabToken } from '../config/schwab.js';

export const exchangeCodeForTokens = async (req, res) => {
  const { code } = req.body;
  const redirectUri = 'https://127.0.0.1';

  if (!code) return res.status(400).json({ error: 'Missing authorization code.' });

  const credentials = `${process.env.SCHWAB_CLIENT_ID}:${process.env.SCHWAB_CLIENT_SECRET}`;
  const encodedAuth = base64.encode(credentials);

  try {
    const tokenRes = await axios.post(
      'https://api.schwabapi.com/v1/oauth/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
      {
        headers: {
          Authorization: `Basic ${encodedAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;
    const expires_at = Math.floor(Date.now() / 1000) + expires_in;

    const user = await User.findById(req.user._id);
    user.schwab_tokens = {
      access_token,
      refresh_token,
      expires_at,
    };
    await user.save();

    res.status(200).json({ message: 'Tokens saved successfully.' });
  } catch (err) {
    console.error('Error exchanging code:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to exchange authorization code for tokens.' });
  }
};




export const refreshSchwabAccessToken =  async (req, res) => {
  const accessToken = await refreshSchwabToken(req.user._id);
  if (accessToken) {
    res.status(200).json({ access_token: accessToken });
  } else {
    res.status(401).json({ error: 'Token refresh failed' });
  }
}