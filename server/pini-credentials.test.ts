import { describe, it, expect } from 'vitest';

describe('PINI Credentials', () => {
  it('should have PINI_USER configured', () => {
    expect(process.env.PINI_USER).toBeDefined();
    expect(process.env.PINI_USER).not.toBe('');
    expect(process.env.PINI_USER).toContain('@');
  });

  it('should have PINI_PASS configured', () => {
    expect(process.env.PINI_PASS).toBeDefined();
    expect(process.env.PINI_PASS).not.toBe('');
    expect(process.env.PINI_PASS!.length).toBeGreaterThan(3);
  });
});
