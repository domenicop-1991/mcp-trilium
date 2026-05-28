import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: false,
  pedantic: false,
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
