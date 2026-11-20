import { describe, expect, it } from 'vitest';
import { addressUrl, isBrowsable } from './address';

describe('isBrowsable', () => {
  it('lets a web page and the empty page through', () => {
    expect(isBrowsable('https://example.com/')).toBe(true);
    expect(isBrowsable('http://localhost:5173/')).toBe(true);
    expect(isBrowsable('about:blank')).toBe(true);
  });

  it('keeps out files, scripts and internal pages', () => {
    expect(isBrowsable('file:///etc/passwd')).toBe(false);
    expect(isBrowsable('javascript:alert(1)')).toBe(false);
    expect(isBrowsable('chrome://settings')).toBe(false);
    expect(isBrowsable('devtools://devtools/bundled/inspector.html')).toBe(false);
  });
});

describe('addressUrl', () => {
  it('keeps an address that names its scheme', () => {
    expect(addressUrl('http://example.com/a')).toBe('http://example.com/a');
  });

  it('adds https to a bare host, and http to this machine', () => {
    expect(addressUrl(' github.com/owner/repo ')).toBe('https://github.com/owner/repo');
    expect(addressUrl('localhost:5173')).toBe('http://localhost:5173');
    expect(addressUrl('127.0.0.1:8080/admin')).toBe('http://127.0.0.1:8080/admin');
  });

  it('adds http to a dev server on any address it prints', () => {
    for (const host of ['0.0.0.0:3000', '192.168.1.20:5173', '10.0.0.4', '172.20.1.1:80', 'app.localhost:8080', '[::1]:4000']) {
      expect(addressUrl(host)).toBe(`http://${host}`);
    }
  });

  it('keeps https for public addresses that only look close', () => {
    expect(addressUrl('172.32.0.1')).toBe('https://172.32.0.1');
    expect(addressUrl('localhost.example.com')).toBe('https://localhost.example.com');
  });

  it('refuses what is not a web address', () => {
    expect(addressUrl('file:///etc/passwd')).toEqual({ refused: 'file:///etc/passwd is not a web page' });
    expect(addressUrl('how to centre a div')).toHaveProperty('refused');
    expect(addressUrl('intranet')).toHaveProperty('refused');
    expect(addressUrl('')).toEqual({ refused: 'Nothing is not a web address' });
  });
});
