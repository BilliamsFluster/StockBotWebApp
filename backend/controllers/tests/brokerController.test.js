import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getActiveBrokerPortfolio } from './brokerController.js';

vi.mock('axios', () => ({
  default: { post: vi.fn() }
}));
import axios from 'axios';

vi.mock('../models/User.js', () => ({
  default: { findById: vi.fn() }
}));
import User from '../models/User.js';

vi.mock('../config/getBrokerCredentials.js', () => ({
  getBrokerCredentials: vi.fn()
}));
import { getBrokerCredentials } from '../config/getBrokerCredentials.js';

function createRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
}

describe('getActiveBrokerPortfolio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STOCKBOT_URL = 'http://stockbot';
  });

  it('returns 404 when user not found', async () => {
    User.findById.mockResolvedValue(null);
    const req = { user: { id: 'u1' } };
    const res = createRes();
    await getActiveBrokerPortfolio(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
  });

  it('returns 400 when no active broker set', async () => {
    User.findById.mockResolvedValue({ preferences: {} });
    const req = { user: { id: 'u1' } };
    const res = createRes();
    await getActiveBrokerPortfolio(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'No active broker set' });
  });

  it('returns 400 when credentials missing', async () => {
    User.findById.mockResolvedValue({ preferences: { activeBroker: 'alpaca' } });
    getBrokerCredentials.mockResolvedValue(null);
    const req = { user: { id: 'u1' } };
    const res = createRes();
    await getActiveBrokerPortfolio(req, res);
    expect(getBrokerCredentials).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'No credentials found for active broker' });
  });

  it('returns portfolio data on success', async () => {
    User.findById.mockResolvedValue({ preferences: { activeBroker: 'alpaca' } });
    getBrokerCredentials.mockResolvedValue({ token: 't' });
    axios.post.mockResolvedValue({ data: { portfolio: [] } });
    const req = { user: { id: 'u1' } };
    const res = createRes();
    await getActiveBrokerPortfolio(req, res);
    expect(axios.post).toHaveBeenCalledWith('http://stockbot/api/stockbot/broker/portfolio', {
      broker: 'alpaca',
      credentials: { token: 't' },
    });
    expect(res.json).toHaveBeenCalledWith({ portfolio: [] });
  });

  it('returns 500 when Stockbot call fails', async () => {
    User.findById.mockResolvedValue({ preferences: { activeBroker: 'alpaca' } });
    getBrokerCredentials.mockResolvedValue({ token: 't' });
    axios.post.mockRejectedValue(new Error('fail'));
    const req = { user: { id: 'u1' } };
    const res = createRes();
    await getActiveBrokerPortfolio(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch portfolio' });
  });
});