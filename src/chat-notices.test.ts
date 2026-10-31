import { describe, expect, it } from 'vitest';
import { rateLimitNotice, retryNotice } from './chat-notices';
import { applyMessage, EMPTY_TRANSCRIPT } from './chat-transcript';

describe('retryNotice', () => {
  it('says the status, the wait and the attempt', () => {
    expect(retryNotice({ error_status: 529, retry_delay_ms: 4600, attempt: 2, max_retries: 10 })).toBe('API error 529, retrying in 5s (attempt 2 of 10).');
  });
  it('says a connection error when there was no response', () => {
    expect(retryNotice({ error_status: null, retry_delay_ms: 200, attempt: 1, max_retries: 10 })).toBe('Connection error, retrying in 1s (attempt 1 of 10).');
  });
});

describe('rateLimitNotice', () => {
  const event = (info: Record<string, unknown>) => ({ type: 'rate_limit_event', rate_limit_info: info });
  it('says nothing while the plan is fine', () => expect(rateLimitNotice(event({ status: 'allowed' }))).toBeNull());
  it('warns as a limit nears', () => {
    expect(rateLimitNotice(event({ status: 'allowed_warning', rateLimitType: 'seven_day' }))).toBe('Approaching your seven-day limit.');
  });
  it('says the limit is hit and when it resets', () => {
    const resetsAt = new Date(2026, 10, 1, 15, 30).getTime() / 1000;
    expect(rateLimitNotice(event({ status: 'rejected', rateLimitType: 'five_hour', resetsAt }))).toBe('You have hit your five-hour limit, resets 3:30pm.');
  });
});

describe('notices in the transcript', () => {
  it('adds a line for every retry', () => {
    const retry = { type: 'system', subtype: 'api_retry', error_status: 500, retry_delay_ms: 1000, attempt: 1, max_retries: 3 };
    expect([retry, retry].reduce(applyMessage, EMPTY_TRANSCRIPT).entries).toHaveLength(2);
  });
  it('shows the same limit warning once', () => {
    const warning = { type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning', rateLimitType: 'five_hour' } };
    expect([warning, warning].reduce(applyMessage, EMPTY_TRANSCRIPT).entries).toHaveLength(1);
  });
});
