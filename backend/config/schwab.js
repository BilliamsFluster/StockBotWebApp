import axios from 'axios';
import base64 from 'base-64';
import User from '../models/User.js';

export async function refreshSchwabToken(userId) {
  const user = await User.findById(userId);
  if (!user?.schwab_tokens) return null;

  const { refresh_token, expires_at } = user.schwab_tokens;
  const now = Math.floor(Date.now() / 1000);

  if (now < expires_at - 60) return user.schwab_tokens.access_token;

  const auth = base64.encode(`${process.env.SCHWAB_CLIENT_ID}:${process.env.SCHWAB_CLIENT_SECRET}`);

  try {
    const res = await axios.post(
      'https://api.schwabapi.com/v1/oauth/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token,
        redirect_uri: 'https://127.0.0.1',
      }),
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const data = res.data;
    data.expires_at = now + data.expires_in;

    user.schwab_tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refresh_token,
      expires_at: data.expires_at,
    };

    await user.save();
    try {
      await axios.post(`${process.env.STOCKBOT_URL}/api/jarvis/authorize`, {
        user_id: user._id,
        access_token: data.access_token,
        refresh_token: data.refresh_token || refresh_token,
        expires_at: data.expires_at,
      });
    } catch (err) {
      console.error('⚠ Failed to sync tokens with bot:', err.response?.data || err.message);
    }
    return data.access_token;

  } catch (err) {
    console.error('Schwab refresh failed:', err.response?.data || err.message);
    return null;
  }
}
 