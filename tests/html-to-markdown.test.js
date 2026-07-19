import { htmlToMarkdown, isHtmlContent } from '../src/utils/html-to-markdown.js';

describe('isHtmlContent', () => {
  test('returns true for text/html mime', () => {
    expect(isHtmlContent('<p>x</p>', { mime: 'text/html' })).toBe(true);
  });

  test('returns true for text type with tags', () => {
    expect(isHtmlContent('<p>x</p>', { type: 'text' })).toBe(true);
  });

  test('returns false for plain text', () => {
    expect(isHtmlContent('just text', { type: 'text', mime: 'text/plain' })).toBe(false);
  });

  test('returns false for non-string', () => {
    expect(isHtmlContent(null)).toBe(false);
    expect(isHtmlContent(new ArrayBuffer(8))).toBe(false);
  });
});

describe('htmlToMarkdown', () => {
  test('passes through non-HTML strings unchanged', () => {
    expect(htmlToMarkdown('hello', { mime: 'text/plain' })).toBe('hello');
  });

  test('converts headings', () => {
    const md = htmlToMarkdown('<h1>Titolo</h1><h2>Sub</h2>', { mime: 'text/html' });
    expect(md).toContain('# Titolo');
    expect(md).toContain('## Sub');
  });

  test('converts bold and italic', () => {
    const md = htmlToMarkdown('<p><strong>bold</strong> and <em>italic</em></p>', { mime: 'text/html' });
    expect(md).toContain('**bold**');
    expect(md).toContain('_italic_');
  });

  test('converts lists', () => {
    const md = htmlToMarkdown('<ul><li>a</li><li>b</li></ul>', { mime: 'text/html' });
    expect(md).toMatch(/^- {1,3}a$/m);
    expect(md).toMatch(/^- {1,3}b$/m);
  });

  test('converts code blocks', () => {
    const md = htmlToMarkdown('<pre><code>const x = 1;</code></pre>', { mime: 'text/html' });
    expect(md).toContain('```');
    expect(md).toContain('const x = 1;');
  });

  test('strips empty paragraphs', () => {
    const md = htmlToMarkdown('<p>x</p><p></p><p>y</p>', { mime: 'text/html' });
    expect(md).not.toMatch(/\n{3,}/);
    expect(md).toContain('x');
    expect(md).toContain('y');
  });

  test('preserves table structure (GFM)', () => {
    const html = '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>';
    const md = htmlToMarkdown(html, { mime: 'text/html' });
    expect(md).toMatch(/\|\s*A\s*\|\s*B\s*\|/);
    expect(md).toMatch(/\|\s*1\s*\|\s*2\s*\|/);
    expect(md).toMatch(/\|[-: ]+\|[-: ]+\|/);
  });

  test('preserves strikethrough (GFM)', () => {
    const md = htmlToMarkdown('<p><del>old</del></p>', { mime: 'text/html' });
    expect(md).toContain('~~old~~');
  });

  test('returns non-string input untouched', () => {
    const buf = new ArrayBuffer(8);
    expect(htmlToMarkdown(buf)).toBe(buf);
  });
});

describe('htmlToMarkdown - collapsible blocks (Trilium 0.104)', () => {
  const html = '<p>prima</p><details class="trilium-collapsible"><summary>Il titolo</summary><p>corpo con <strong>bold</strong>.</p></details><p>dopo</p>';
  const md = htmlToMarkdown(html, { mime: 'text/html' });

  test('preserves the details wrapper with the Trilium class', () => {
    expect(md).toContain('<details class="trilium-collapsible">');
    expect(md).toContain('</details>');
  });

  test('keeps the summary as the block title', () => {
    expect(md).toContain('<summary>Il titolo</summary>');
  });

  test('converts the body to markdown', () => {
    expect(md).toContain('corpo con **bold**.');
  });

  test('does not leak the internal summary sentinel', () => {
    expect(md).not.toContain('@@TRILIUM_SUMMARY@@');
  });

  test('leaves surrounding content intact', () => {
    expect(md).toContain('prima');
    expect(md).toContain('dopo');
  });
});

describe('htmlToMarkdown - task state (Trilium 0.104)', () => {
  const li = (state, text, checked) =>
    `<li${state ? ` data-trilium-task-state="${state}"` : ''}><label class="todo-list__label"><input type="checkbox"${checked ? ' checked="checked"' : ''} disabled="disabled"><span class="todo-list__label__description">${text}</span></label></li>`;
  const md = htmlToMarkdown(
    `<ul class="todo-list">${li(null, 'niente')}${li('doing', 'in corso')}${li(null, 'fatto', true)}${li('maybe', 'forse')}${li('cancelled', 'annullato')}</ul>`,
    { mime: 'text/html' },
  );

  test('renders each state with its markdown symbol', () => {
    expect(md).toMatch(/-\s+\[ \] niente/);
    expect(md).toMatch(/-\s+\[\/\] in corso/);
    expect(md).toMatch(/-\s+\[x\] fatto/);
    expect(md).toMatch(/-\s+\[\?\] forse/);
    expect(md).toMatch(/-\s+\[-\] annullato/);
  });

  test('does not leak the state attribute into the markdown', () => {
    expect(md).not.toContain('data-trilium-task-state');
  });
});
