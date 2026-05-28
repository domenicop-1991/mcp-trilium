import TurndownService from 'turndown';
import { gfm } from '@joplin/turndown-plugin-gfm';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
  hr: '---',
});

turndown.use(gfm);

turndown.addRule('emptyParagraph', {
  filter: (node) => node.nodeName === 'P' && !node.textContent.trim(),
  replacement: () => '',
});

turndown.addRule('triliumInternalLink', {
  filter: (node) =>
    node.nodeName === 'A' &&
    node.getAttribute('class') &&
    node.getAttribute('class').includes('reference-link'),
  replacement: (content, node) => {
    const href = node.getAttribute('href') || '';
    const noteId = href.replace(/^#?root\/?/, '').split('/').pop();
    return noteId ? `[[${noteId}|${content}]]` : content;
  },
});

export function isHtmlContent(content, { mime, type } = {}) {
  if (typeof content !== 'string') return false;
  if (mime && /html/i.test(mime)) return true;
  if (type === 'text' && /<[a-z][a-z0-9]*\b[^>]*>/i.test(content)) return true;
  return false;
}

export function htmlToMarkdown(content, opts = {}) {
  if (typeof content !== 'string') return content;
  if (!isHtmlContent(content, opts)) return content;
  return turndown.turndown(content).replace(/\n{3,}/g, '\n\n').trim();
}
