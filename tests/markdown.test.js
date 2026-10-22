import { describe, expect, it } from 'vitest';
import { markdownToHtml, inline, slug } from '../tools/markdown.mjs';

describe('guide markdown', () => {
  it('turns headings into anchored headings and lists the level-2 ones', () => {
    const { html, headings } = markdownToHtml('# Title\n\n## 1. Powers of ten\n\n## Powers of ten');
    expect(html).toContain('<h1 id="title">Title</h1>');
    expect(headings).toEqual([{ id: '1-powers-of-ten', text: '1. Powers of ten' }, { id: 'powers-of-ten', text: 'Powers of ten' }]);
  });

  it('keeps duplicate heading ids unique', () => {
    const { html } = markdownToHtml('## Test\n\n## Test');
    expect(html).toContain('id="test"');
    expect(html).toContain('id="test-2"');
  });

  it('escapes everything, so a document cannot inject markup', () => {
    const { html } = markdownToHtml('A test feeds it an `<img onerror>` payload <script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('<code>&lt;img onerror&gt;</code>');
  });

  it('drops links with unsafe schemes but keeps web and relative ones', () => {
    expect(inline('[x](javascript:alert(1))')).not.toContain('href');
    expect(inline('[x](https://example.org)')).toBe('<a href="https://example.org">x</a>');
    expect(inline('see <https://github.com/x>')).toBe('see <a href="https://github.com/x">https://github.com/x</a>');
  });

  it('points doc links at their guide pages', () => {
    expect(inline('[eq](docs/EQUATIONS.md#2-framing)', { 'docs/EQUATIONS.md': 'equations.html' })).toBe('<a href="equations.html#2-framing">eq</a>');
  });

  it('converts tables, lists, code and inline styles', () => {
    const { html } = markdownToHtml('| A | B |\n|---|---|\n| **1** | `2` |\n\n- one\n- two\n  wraps\n\n1. first\n\n```sh\nnpm test\n```\n\nSome *em* and _em_ here.');
    expect(html).toContain('<th scope="col">A</th>');
    expect(html).toContain('<td><strong>1</strong></td><td><code>2</code></td>');
    expect(html).toContain('<ul><li>one</li><li>two wraps</li></ul>');
    expect(html).toContain('<ol><li>first</li></ol>');
    expect(html).toContain('<pre data-lang="sh"><code>npm test</code></pre>');
    expect(html).toContain('Some <em>em</em> and <em>em</em> here.');
  });

  it('makes heading slugs from words only', () => {
    expect(slug('What’s new & next?')).toBe('whats-new-next');
    expect(markdownToHtml('## What’s `new` & [next](x.md)?').headings).toEqual([{ id: 'whats-new-next', text: 'What’s new &amp; next?' }]);
  });

  it('converts every real doc without leaving raw markdown markers', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['docs/EQUATIONS.md', 'docs/STATE_OF_THE_MODEL.md', 'docs/SECURITY_MODEL.md', 'docs/PUBLISHING.md', 'CHANGELOG.md']) {
      const { html } = markdownToHtml(readFileSync(f, 'utf8'));
      expect(html).not.toMatch(/\*\*|^#|\|---/m);
    }
  });
});
