import { describe, it, expect, vi } from 'vitest';
import { getPreferences } from './userController.js';

vi.mock('../models/User.js', () => ({
  default: { findById: vi.fn() }
}));
import User from '../models/User.js';

function createRes() {
  return {
    json: vi.fn(),
    status: vi.fn().mockReturnThis(),
  };
}

describe('getPreferences', () => {
  it('returns defaults when user has no preferences', async () => {
    const req = { user: { _id: '123' } };
    User.findById.mockResolvedValue({ preferences: null });
    const res = createRes();

    await getPreferences(req, res);

    expect(res.json).toHaveBeenCalledWith({
      preferences: {
        model: 'qwen3:8b',
        format: 'markdown',
        voiceEnabled: false,
        activeBroker: 'alpaca',
      },
    });
  });

  it('merges user preferences with defaults', async () => {
    const req = { user: { _id: '123' } };
    User.findById.mockResolvedValue({ preferences: { toObject: () => ({ voiceEnabled: true }) } });
    const res = createRes();

    await getPreferences(req, res);

    expect(res.json).toHaveBeenCalledWith({
      preferences: {
        model: 'qwen3:8b',
        format: 'markdown',
        voiceEnabled: true,
        activeBroker: 'alpaca',
      },
    });
  });
});
