import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.js';

describe('renderMarkdown', () => {
  it('renders paragraphs, emphasis and lists', () => {
    const html = renderMarkdown('**Danke!**\n\n- Lager\n- Material')!;
    expect(html).toContain('<strong>Danke!</strong>');
    expect(html).toContain('<li>Lager</li>');
  });

  it('escapes raw HTML instead of passing it on', () => {
    const html = renderMarkdown('<script>alert(1)</script><img src=x onerror=alert(1)>')!;
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('refuses javascript links and opens others in a new tab', () => {
    // markdown-it does not make a link of it at all; it stays escaped text.
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('href="javascript');
    const html = renderMarkdown('[Cevi](https://example.ch)')!;
    expect(html).toContain('href="https://example.ch"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('does not load pictures from elsewhere', () => {
    expect(renderMarkdown('![Bild](https://example.ch/a.png)')).not.toContain('<img');
  });

  it('returns null for empty text', () => {
    expect(renderMarkdown('  ')).toBeNull();
    expect(renderMarkdown(null)).toBeNull();
  });
});
