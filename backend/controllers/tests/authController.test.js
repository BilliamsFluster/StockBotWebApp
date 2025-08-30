import { describe, it, expect } from 'vitest';
import { validationResult } from 'express-validator';

process.env.MASTER_ENCRYPTION_KEY = '0'.repeat(64);
const { registerValidation } = await import('../authController.js');

const runValidations = async (req, validations) => {
  for (const v of validations) {
    await v.run(req);
  }
};

describe('registerValidation', () => {
  it('rejects short passwords', async () => {
    const req = { body: { username: 'u', email: 'user@example.com', password: '123' } };
    await runValidations(req, registerValidation);
    const errors = validationResult(req);
    expect(errors.isEmpty()).toBe(false);
  });
});

