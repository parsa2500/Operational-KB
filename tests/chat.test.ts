import { describe, expect, it } from 'vitest';
import { answer } from '../src/chat.js';
import { queryTerms } from '../src/retrieve.js';

describe('grounding', () => {
  it('abstains without evidence', async () => {
    const result = await answer('پرداخت آفلاین کجاست؟', []);
    expect(result.unknown).toBe(true);
    expect(result.citations).toEqual([]);
  });
  it('expands Persian operational terms', () => {
    expect(queryTerms('تایید پرداخت آفلاین مشتری')).toEqual(expect.arrayContaining(['approve','payment','offline','customer']));
  });
});
