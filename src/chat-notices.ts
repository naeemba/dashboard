import { clockTime } from './chat-status';
import { isRecord } from './is-record';

// What Claude Code prints in a terminal when a request is retried or a plan limit is near or hit, said
// as a notice line in the thread. Everything else these two messages carry says nothing worth a line.

const LIMIT_NAMES: Record<string, string> = {
  five_hour: 'five-hour',
  seven_day: 'seven-day',
  seven_day_opus: 'seven-day Opus',
  seven_day_sonnet: 'seven-day Sonnet',
  overage: 'extra usage',
};

// A retried request: why it failed, when it goes again and how many tries it has left. A status of
// null is a connection that never answered.
export function retryNotice(message: Record<string, unknown>): string {
  const cause = typeof message.error_status === 'number' ? `API error ${message.error_status}` : 'Connection error';
  const seconds = Math.max(1, Math.round(Number(message.retry_delay_ms) / 1000) || 1);
  return `${cause}, retrying in ${seconds}s (attempt ${String(message.attempt)} of ${String(message.max_retries)}).`;
}

// A limit nearing or reached. An event that says the plan is fine, which most of them do, is no line.
// The reset arrives as seconds since the epoch. The session sends one each time the rounded
// percentage moves, so the line leaves the percentage out and the same line is shown once.
export function rateLimitNotice(message: Record<string, unknown>): string | null {
  const info = message.rate_limit_info;
  if (!isRecord(info)) return null;
  const { status, rateLimitType, resetsAt } = info;
  if (status !== 'allowed_warning' && status !== 'rejected') return null;
  const name = LIMIT_NAMES[String(rateLimitType)] ?? 'usage';
  const reset = typeof resetsAt === 'number' ? clockTime(new Date(resetsAt * 1000).toISOString()) : null;
  const resets = reset ? `, resets ${reset}` : '';
  return status === 'rejected' ? `You have hit your ${name} limit${resets}.` : `Approaching your ${name} limit${resets}.`;
}
