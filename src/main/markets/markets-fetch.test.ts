import { describe, expect, it } from 'vitest';
import { readMarket } from './markets-fetch';

describe('readMarket', () => {
  it('throws for a card that is not one of the four, before any request', async () => {
    await expect(readMarket('nope', 'Tehran')).rejects.toThrow('No market card called "nope"');
    await expect(readMarket('toString', 'Tehran')).rejects.toThrow('No market card called');
  });
});
