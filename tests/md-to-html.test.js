import { markdownToHtml, shouldConvertMarkdown } from '../src/utils/md-to-html.js';

describe('shouldConvertMarkdown', () => {
  test('returns false for non-text types', () => {
    expect(shouldConvertMarkdown({ type: 'code' })).toBe(false);
    expect(shouldConvertMarkdown({ type: 'mermaid' })).toBe(false);
  });

  test('returns false for markdown mime', () => {
    expect(shouldConvertMarkdown({ type: 'text', mime: 'text/markdown' })).toBe(false);
  });

  test('returns true for text notes', () => {
    expect(shouldConvertMarkdown({ type: 'text' })).toBe(true);
  });
});

describe('markdownToHtml', () => {
  test('passes through non-string input', () => {
    expect(markdownToHtml(null)).toBe(null);
  });

  test('converts basic markdown', () => {
    expect(markdownToHtml('**bold**', { type: 'text' })).toContain('<strong>bold</strong>');
  });
});

describe('markdownToHtml - todo list CKEditor', () => {
  const html = markdownToHtml('- [ ] aperto\n- [x] chiuso con **bold**', { type: 'text' });

  test('emits the todo-list class Trilium expects', () => {
    expect(html).toContain('<ul class="todo-list">');
  });

  test('wraps items in the CKEditor label/description structure', () => {
    expect(html).toContain('<label class="todo-list__label">');
    expect(html).toContain('<span class="todo-list__label__description">');
  });

  test('propagates the checked state', () => {
    expect(html).toContain('checked="checked"');
    expect(html.match(/checked="checked"/g)).toHaveLength(1);
  });

  test('renders inline formatting inside items', () => {
    expect(html).toContain('chiuso con <strong>bold</strong>');
  });

  test('does not duplicate the checkbox input inside the description', () => {
    expect(html).not.toMatch(/__description"><input/);
  });

  test('leaves plain lists untouched', () => {
    const plain = markdownToHtml('- uno\n- due', { type: 'text' });
    expect(plain).not.toContain('todo-list');
    expect(plain).toContain('<li>uno</li>');
  });

  test('leaves ordered lists untouched', () => {
    expect(markdownToHtml('1. uno', { type: 'text' })).toContain('<ol>');
  });
});

describe('markdownToHtml - collapsible round-trip', () => {
  test('rebuilds the details/summary block emitted by htmlToMarkdown', () => {
    const md = '<details class="trilium-collapsible">\n<summary>Titolo</summary>\n\ncorpo con **bold**\n\n</details>';
    const html = markdownToHtml(md, { type: 'text' });
    expect(html).toContain('<details class="trilium-collapsible">');
    expect(html).toContain('<summary>Titolo</summary>');
    expect(html).toContain('<strong>bold</strong>');
  });
});

describe('markdownToHtml - task state (Trilium 0.104)', () => {
  const html = markdownToHtml('- [ ] niente\n- [/] in corso\n- [x] fatto\n- [?] forse\n- [-] annullato', { type: 'text' });

  test('maps the doing symbol to its state id', () => {
    expect(html).toContain('data-trilium-task-state="doing"');
  });

  test('maps the maybe symbol to its state id', () => {
    expect(html).toContain('data-trilium-task-state="maybe"');
  });

  test('maps the cancelled symbol to its state id', () => {
    expect(html).toContain('data-trilium-task-state="cancelled"');
  });

  test('keeps done as a plain checked item without a state attribute', () => {
    expect(html).toMatch(/<li><label class="todo-list__label"><input type="checkbox" checked="checked"/);
  });

  test('strips the state symbol from the visible text', () => {
    expect(html).not.toMatch(/>\[[/?\-x ]\]/);
    expect(html).toContain('>in corso<');
  });

  test('keeps every item in a single todo-list', () => {
    expect(html.match(/<ul class="todo-list">/g)).toHaveLength(1);
  });

  test('does not turn ordered lists into todo lists', () => {
    expect(markdownToHtml('1. [/] alfa', { type: 'text' })).not.toContain('todo-list');
  });
});
