import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('axios', () => ({
  default: { post: vi.fn(), isAxiosError: () => false }
}));

vi.mock('../../config/schwab.js', () => ({
  refreshSchwabAccessTokenInternal: vi.fn()
}));

vi.mock('../../utils/logger.js', () => ({
  log: vi.fn()
}));

import axios from 'axios';
import { refreshSchwabAccessTokenInternal } from '../../config/schwab.js';

process.env.MASTER_ENCRYPTION_KEY = '0'.repeat(64);
process.env.STOCKBOT_URL = 'http://stockbot';
const { handleJarvisPrompt } = await import('../jarvisController.js');

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