import { marked } from 'marked';
import { stateIdForSymbol } from './task-states.js';

marked.setOptions({
  gfm: true,
  breaks: false,
  pedantic: false,
});

marked.use({
  renderer: {
    list(token) {
      if (token.ordered) return false;
      const items = (token.items ?? []).map((item) => {
        const content = (item.tokens ?? []).filter((t) => t.type !== 'checkbox');
        const first = content[0];
        let inline = (first?.type === 'text' || first?.type === 'paragraph') && first.tokens
          ? this.parser.parseInline(first.tokens).trim()
          : this.parser.parse(content).replace(/^<p>/, '').replace(/<\/p>\s*$/, '').trim();
        let state = null;
        if (!item.task) {
          const match = inline.match(/^\[(.)\]\s+/);
          const matched = match && stateIdForSymbol(match[1]);
          if (matched) {
            state = matched;
            inline = inline.slice(match[0].length);
          }
        }
        return { isTask: Boolean(item.task || state), checked: item.checked, state, inline };
      });
      if (!items.some((item) => item.isTask)) return false;
      const html = items
        .map((item) => {
          if (!item.isTask) return `<li>${item.inline}</li>`;
          const checked = item.checked ? ' checked="checked"' : '';
          const state = item.state ? ` data-trilium-task-state="${item.state}"` : '';
          return `<li${state}><label class="todo-list__label"><input type="checkbox"${checked} disabled="disabled"><span class="todo-list__label__description">${item.inline}</span></label></li>`;
        })
        .join('');
      return `<ul class="todo-list">${html}</ul>`;
    },
  },
});

export function shouldConvertMarkdown({ type, mime } = {}) {
  if (type && type !== 'text') return false;
  if (mime && /markdown/i.test(mime)) return false;
  return true;
}

export function markdownToHtml(content, opts = {}) {
  if (typeof content !== 'string') return content;
  if (!shouldConvertMarkdown(opts)) return content;
  const html = marked.parse(content);
  return typeof html === 'string' ? html.trim() : content;
}
