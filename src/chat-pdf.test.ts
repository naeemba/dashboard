import { describe, expect, it } from 'vitest';
import { PDF_LIMIT, pdfMentions, pdfName, pdfOfTool, pdfRefusal } from './chat-pdf';

describe('pdfMentions', () => {
  it('finds a mention of a PDF, quoted or not, and ends it at punctuation', () => {
    expect(pdfMentions('Read @docs/spec.pdf, then @"My Plan.PDF".')).toEqual(['docs/spec.pdf', 'My Plan.PDF']);
  });

  it('skips a mention of anything else and an address that is not a mention', () => {
    expect(pdfMentions('@src/main.ts and mail me@host.pdf')).toEqual([]);
  });
});

describe('pdfOfTool', () => {
  it('names the PDF a Read call reads and nothing else', () => {
    expect(pdfOfTool('Read', { file_path: '/tmp/a.pdf' })).toBe('/tmp/a.pdf');
    expect(pdfOfTool('Read', { file_path: '/tmp/a.png' })).toBeNull();
    expect(pdfOfTool('Edit', { file_path: '/tmp/a.pdf' })).toBeNull();
  });
});

describe('pdfName', () => {
  it('is the last segment', () => {
    expect(pdfName('docs/spec.pdf')).toBe('spec.pdf');
  });
});

describe('pdfRefusal', () => {
  it('refuses what is not a PDF, is missing, or is too big', () => {
    expect(pdfRefusal('a.txt', 10)).toBe('not a PDF');
    expect(pdfRefusal('a.pdf', null)).toBe('not found');
    expect(pdfRefusal('a.pdf', PDF_LIMIT + 1)).toBe('over 5 MB');
    expect(pdfRefusal('a.pdf', PDF_LIMIT)).toBeNull();
  });
});
