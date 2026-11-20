import { describe, expect, it } from 'vitest';
import { pageLog, requestFailure } from './page-log';

describe('pageLog', () => {
  it('keeps the errors a page logged, with where, and nothing quieter', () => {
    const log = pageLog();
    log.console('warning', 'deprecated', '', 0);
    log.console('error', 'Uncaught TypeError: x is undefined', 'https://example.com/app.js', 12);
    log.console('error', 'plain', '', 0);
    expect(log.consoleText(1)).toBe('Uncaught TypeError: x is undefined (https://example.com/app.js:12)\nplain');
  });

  it('keeps only the last few of each', () => {
    const log = pageLog(2);
    for (const path of ['a', 'b', 'c']) log.request('GET', `https://example.com/${path}`, '404');
    expect(log.networkText(1)).toBe('404 GET https://example.com/b\n404 GET https://example.com/c');
  });

  it('says when there is nothing', () => {
    expect(pageLog().consoleText(4)).toBe('tab 4 has logged no error');
    expect(pageLog().networkText(4)).toBe('no request of tab 4 has failed');
  });
});

describe('requestFailure', () => {
  it('is a status the server refused with, or the error a request never answered with', () => {
    expect(requestFailure(404, null)).toBe('404');
    expect(requestFailure(500, null)).toBe('500');
    expect(requestFailure(null, 'net::ERR_CONNECTION_REFUSED')).toBe('net::ERR_CONNECTION_REFUSED');
  });

  it('is none for an answer that worked, or a request the page called off', () => {
    expect(requestFailure(200, null)).toBeNull();
    expect(requestFailure(304, null)).toBeNull();
    expect(requestFailure(null, 'net::ERR_ABORTED')).toBeNull();
  });
});
