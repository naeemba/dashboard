import { describe, expect, it } from 'vitest';
import { paneReading, type ScreenReading } from './pane-reading';

const shell = { lastPrintedAt: 100, tail: () => ['$ make'], lastLine: () => '$ make' };

describe('paneReading', () => {
  it('reads a pane with no screen off its terminal', () => {
    const reading = paneReading(undefined, shell);
    expect(reading.answers).toBe('character');
    expect(reading.lastPrintedAt).toBe(100);
    expect(reading.tail()).toEqual(['$ make']);
    expect(reading.lastPrinted()).toBe('$ make');
  });

  it('reads a screen worker off its screen, its age from the last session event', () => {
    const screen: ScreenReading = {
      rowKeys: () => 'digit', question: () => 'Run tests?', questionLines: () => ['Run tests?', '1. Yes'], lastEventAt: () => 500,
    };
    const reading = paneReading(screen, shell);
    expect(reading.answers).toBe('digit');
    expect(reading.lastPrintedAt).toBe(500);
    expect(reading.tail()).toEqual(['Run tests?', '1. Yes']);
    expect(reading.lastPrinted()).toBe('Run tests?');
  });

  it('prints nothing for a screen with no question open', () => {
    const screen: ScreenReading = { rowKeys: () => 'none', question: () => null, questionLines: () => [], lastEventAt: () => 0 };
    expect(paneReading(screen, shell).lastPrinted()).toBe('');
  });
});
