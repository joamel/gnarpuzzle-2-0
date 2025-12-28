import { describe, it, expect } from 'vitest';

describe('Basic Syntax Test', () => {
  it('should pass basic test', () => {
    const value = 'hello world';
    expect(value).toBe('hello world');
  });
});