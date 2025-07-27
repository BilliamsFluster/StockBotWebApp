import axios from 'axios';
import base64 from 'base-64';
import User from '../models/User.js';
import { env } from './env.js';

const STOCKBOT_URL = env.STOCKBOT_URL;

export async function refreshSchwabAccessTokenInternal(userId) {
  const user = await User.findById(userId);
  if (!user || !user.schwab_tokens) return null;

  const { access_token, refresh_token, expires_at } = user.schwab_tokens;
  const now = Math.floor(Date.now() / 1000);

  if (expires_at && now < expires_at - 60) {
    return access_token;
  }

  const redirectUri = 'https://127.0.0.1';
  const encodedAuth = base64.encode(`${process.env.SCHWAB_CLIENT_ID}:${process.env.SCHWAB_CLIENT_SECRET}`);

  try {
    const res = await axios.post(
      'https://api.schwabapi.com/v1/oauth/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token,
        redirect_uri: redirectUri,
      }),
      {
        headers: {
          Authorization: `Basic ${encodedAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      expires_in,
    } = res.data;

    const newExpiresAt = now + expires_in;

    user.schwab_tokens = {
      access_token: newAccessToken,
      refresh_token: newRefreshToken || refresh_token,
      expires_at: newExpiresAt,
    };
    await user.save();

    // 🔁 Sync with STOCKBOT
    try {
      await axios.post(`${STOCKBOT_URL}/api/jarvis/authorize`, {
        user_id: user._id,
        access_token: newAccessToken,
        refresh_token: newRefreshToken || refresh_token,
        expires_at: newExpiresAt,
      });
    } catch (err) {
      console.error('⚠ Failed to sync tokens with bot:', err.response?.data || err.message);
    }

    return newAccessToken;
  } catch (err) {
    console.error('🔴 Token refresh failed:', err.response?.data || err.message);
    return null;
  }
}
export async function exchangeCodeForTokensInternal(code, userId) {
  const redirectUri = 'https://127.0.0.1';
  const encodedAuth = base64.encode(`${process.env.SCHWAB_CLIENT_ID}:${process.env.SCHWAB_CLIENT_SECRET}`);

  try {
    const res = await axios.post(
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

    const { access_token, refresh_token, expires_in } = res.data;
    const expires_at = Math.floor(Date.now() / 1000) + expires_in;

    const user = await User.findById(userId);
    user.schwab_tokens = {
      access_token,
      refresh_token,
      expires_at,
    };
    await user.save();

    // 🔁 Sync with STOCKBOT
    try {
      await axios.post(`${STOCKBOT_URL}/api/jarvis/authorize`, {
        user_id: userId,
        access_token,
        refresh_token,
        expires_at,
      });
    } catch (err) {
      console.error('⚠ Failed to sync tokens with bot:', err.response?.data || err.message);
    }

    return { access_token, refresh_token, expires_at };
  } catch (err) {
    console.error('🔴 Failed to exchange code:', err.response?.data || err.message);
    throw err;
  }
}
