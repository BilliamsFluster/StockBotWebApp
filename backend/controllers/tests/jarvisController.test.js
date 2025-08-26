import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleJarvisPrompt } from './jarvisController.js';

vi.mock('axios', () => ({
  default: { post: vi.fn() }
}));
import axios from 'axios';

vi.mock('../config/schwab.js', () => ({
  refreshSchwabAccessTokenInternal: vi.fn()
}));
import { refreshSchwabAccessTokenInternal } from '../config/schwab.js';

function createRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
}

describe('handleJarvisPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STOCKBOT_URL = 'http://stockbot';
  });

  it('returns 400 when required fields are missing', async () => {
    const req = { body: { prompt: 'hi' } };
    const res = createRes();
    await handleJarvisPrompt(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing required fields.' });
  });

  it('returns 401 when token refresh fails', async () => {
    const req = { body: { prompt: 'hi', model: 'm', format: 'f' }, user: { _id: 'u1' } };
    const res = createRes();
    refreshSchwabAccessTokenInternal.mockResolvedValue(null);
    await handleJarvisPrompt(req, res);
    expect(refreshSchwabAccessTokenInternal).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to refresh Schwab token.' });
  });

  it('forwards prompt to Stockbot and returns response', async () => {
    const req = { body: { prompt: 'hi', model: 'm', format: 'f' }, user: { _id: 'u1' } };
    const res = createRes();
    refreshSchwabAccessTokenInternal.mockResolvedValue('token');
    axios.post.mockResolvedValue({ data: { response: 'ok' } });
    await handleJarvisPrompt(req, res);
    expect(axios.post).toHaveBeenCalledWith('http://stockbot/api/jarvis/chat/ask', {
      prompt: 'hi',
      model: 'm',
      format: 'f',
      access_token: 'token',
    });
    expect(res.json).toHaveBeenCalledWith({ response: 'ok' });
  });

  it('returns 500 when Stockbot call fails', async () => {
    const req = { body: { prompt: 'hi', model: 'm', format: 'f' }, user: { _id: 'u1' } };
    const res = createRes();
    refreshSchwabAccessTokenInternal.mockResolvedValue('token');
    axios.post.mockRejectedValue(new Error('fail'));
    await handleJarvisPrompt(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get response from Jarvis.' });
  });
});