import { describe, it, expect } from 'vitest';
import { registerValidation } from './authController.js';
import { validationResult } from 'express-validator';

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

