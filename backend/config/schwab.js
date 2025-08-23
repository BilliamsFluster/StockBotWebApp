import axios from 'axios';
import base64 from 'base-64';
import User from '../models/User.js';

const STOCKBOT_URL = process.env.STOCKBOT_URL;

/**
 * 🔐 Update Schwab tokens securely while preserving app_key/app_secret.
 */
async function updateSchwabTokens(user, updates) {
  const decrypted = user.getDecryptedTokens();
  const { app_key, app_secret } = decrypted.schwab_tokens;

  // Trim any stray whitespace from stored credentials
  const trimmedKey = app_key?.trim();
  const trimmedSecret = app_secret?.trim();

  user.schwab_tokens = {
    app_key: trimmedKey,
    app_secret: trimmedSecret,
    access_token: updates.access_token || decrypted.schwab_tokens.access_token,
    refresh_token: updates.refresh_token || decrypted.schwab_tokens.refresh_token,
    expires_at: updates.expires_at || decrypted.schwab_tokens.expires_at
  };

  await user.save();

  // 🔁 Sync with STOCKBOT
  try {
    await axios.post(`${STOCKBOT_URL}/api/jarvis/authorize`, {
      user_id: user._id,
      access_token: updates.access_token || decrypted.schwab_tokens.access_token,
      refresh_token: updates.refresh_token || decrypted.schwab_tokens.refresh_token,
      expires_at: updates.expires_at || decrypted.schwab_tokens.expires_at,
    });
  } catch (err) {
    console.error('⚠ Failed to sync tokens with bot:', err.response?.data || err.message);
  }
}

/**
 * ♻ Refresh Schwab access token if expired
 */
export async function refreshSchwabAccessTokenInternal(userId) {
  const user = await User.findById(userId);
  if (!user || !user.schwab_tokens) return null;

  const decrypted = user.getDecryptedTokens();
  const { app_key, app_secret, refresh_token, access_token, expires_at } = decrypted.schwab_tokens;
  const now = Math.floor(Date.now() / 1000);

  // ✅ If still valid, reuse
  if (expires_at && now < expires_at - 60) {
    return access_token;
  }

  const redirectUri = 'https://127.0.0.1';
  const authString = `${app_key?.trim()}:${app_secret?.trim()}`;
  const encodedAuth = base64.encode(authString);

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

    const { access_token: newAccessToken, refresh_token: newRefreshToken, expires_in } = res.data;
    const newExpiresAt = now + expires_in;

    await updateSchwabTokens(user, {
      access_token: newAccessToken,
      refresh_token: newRefreshToken || refresh_token,
      expires_at: newExpiresAt
    });

    return newAccessToken;
  } catch (err) {
    console.error('🔴 Token refresh failed:', err.response?.data || err.message);
    return null;
  }
}

/**
 * 🔑 Exchange OAuth code for Schwab tokens
 */
export async function exchangeCodeForTokensInternal(code, userId) {
  const user = await User.findById(userId);
  if (!user || !user.schwab_tokens) return null;

  const decrypted = user.getDecryptedTokens();
  const { app_key, app_secret } = decrypted.schwab_tokens;

  const redirectUri = 'https://127.0.0.1';
  const authString = `${app_key?.trim()}:${app_secret?.trim()}`;
  const encodedAuth = base64.encode(authString);

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

    await updateSchwabTokens(user, {
      access_token,
      refresh_token,
      expires_at
    });

    return { access_token, refresh_token, expires_at };
  } catch (err) {
    console.error('🔴 Failed to exchange code:', err.response?.data || err.message);
    throw err;
  }
}
