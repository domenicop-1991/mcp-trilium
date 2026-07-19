import TurndownService from 'turndown';
import { gfm } from '@joplin/turndown-plugin-gfm';
import { symbolForStateId } from './task-states.js';

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

const SUMMARY_MARK = '@@TRILIUM_SUMMARY@@';

const closestListItem = (node) => {
  let current = node;
  while (current && current.nodeName !== 'LI') current = current.parentNode;
  return current;
};

turndown.addRule('triliumTaskState', {
  filter: (node) => {
    if (node.nodeName !== 'INPUT' || node.getAttribute('type') !== 'checkbox') return false;
    const li = closestListItem(node);
    return Boolean(li && li.getAttribute('data-trilium-task-state'));
  },
  replacement: (content, node) => {
    const state = closestListItem(node).getAttribute('data-trilium-task-state');
    return `[${symbolForStateId(state) ?? ' '}] `;
  },
});

turndown.addRule('collapsibleSummary', {
  filter: 'summary',
  replacement: (content) => `${SUMMARY_MARK}${content.trim()}${SUMMARY_MARK}`,
});

turndown.addRule('collapsibleBlock', {
  filter: 'details',
  replacement: (content) => {
    const parts = content.split(SUMMARY_MARK);
    const title = parts.length >= 3 ? parts[1].trim() : '';
    const body = (parts.length >= 3 ? parts.slice(2).join('') : content).trim();
    return `\n\n<details class="trilium-collapsible">\n<summary>${title}</summary>\n\n${body}\n\n</details>\n\n`;
  },
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
