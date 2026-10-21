// A small Markdown to HTML converter for the guide website. It covers what
// the docs use: headings, paragraphs, lists, tables, fenced code, quotes,
// rules, and inline bold, italics, code and links. Every bit of text is
// escaped first, so nothing in a document can turn into markup.

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A heading's id: lowercase words joined by hyphens. */
export function slug(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** Only web, mail and relative links survive; anything else (javascript: and the like) becomes plain text. */
function safeHref(href) {
  return !/^[a-z][a-z0-9+.-]*:/i.test(href) || /^(https?|mailto):/i.test(href);
}

/** Inline markup, on text that is already escaped. `links` maps a doc path to its guide page. */
export function inline(text, links = {}) {
  const codes = [];
  let s = escape(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (_, url) => `<a href="${url}">${url}</a>`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, href) => {
    const raw = href.replace(/&amp;/g, '&');
    const [path, hash] = raw.split('#');
    const mapped = links[path] ? links[path] + (hash ? `#${hash}` : '') : raw;
    return safeHref(mapped) ? `<a href="${escape(mapped)}">${label}</a>` : label;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^\w*])\*([^*\s][^*]*)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w])_([^_\s][^_]*)_(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/**
 * Convert a document. Returns { html, headings }, where headings lists the
 * level-2 headings ({ id, text }) for the page's table of contents.
 */
export function markdownToHtml(md, { links = {} } = {}) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const headings = [];
  const used = new Map();
  let i = 0;
  const isBlockStart = (l) => /^(#{1,6} |```|> ?|\s*[-*] |\s*\d+\. |\|)/.test(l) || /^(-{3,}|\*{3,})\s*$/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    let m;
    if ((m = /^(#{1,6}) (.*)$/.exec(line))) {
      const level = m[1].length;
      const html = inline(m[2].trim(), links);
      let id = slug(html) || 'section';
      const n = used.get(id) ?? 0;
      used.set(id, n + 1);
      if (n) id += `-${n + 1}`;
      if (level === 2) headings.push({ id, text: html.replace(/<[^>]+>/g, '') });
      out.push(`<h${level} id="${id}">${html}</h${level}>`);
      i++;
    } else if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const body = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++;
      out.push(`<pre${lang ? ` data-lang="${escape(lang)}"` : ''}><code>${escape(body.join('\n'))}</code></pre>`);
    } else if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      out.push('<hr>');
      i++;
    } else if (line.startsWith('>')) {
      const body = [];
      while (i < lines.length && lines[i].startsWith('>')) body.push(lines[i++].replace(/^> ?/, ''));
      out.push(`<blockquote>${markdownToHtml(body.join('\n'), { links }).html}</blockquote>`);
    } else if (line.startsWith('|') && /^\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(cells(lines[i++]));
      out.push(
        '<div class="table"><table><thead><tr>' +
          head.map((c) => `<th scope="col">${inline(c, links)}</th>`).join('') +
          '</tr></thead><tbody>' +
          rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, links)}</td>`).join('')}</tr>`).join('') +
          '</tbody></table></div>',
      );
    } else if ((m = /^\s*([-*]|\d+\.) /.exec(line))) {
      const ordered = /\d/.test(m[1]);
      const items = [];
      while (i < lines.length && lines[i].trim()) {
        const item = /^\s*([-*]|\d+\.) (.*)$/.exec(lines[i]);
        if (item) items.push(item[2]);
        else items[items.length - 1] += ` ${lines[i].trim()}`; // a wrapped line continues the item
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t, links)}</li>`).join('')}</${tag}>`);
    } else {
      const para = [];
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) para.push(lines[i++].trim());
      if (!para.length) para.push(lines[i++].trim());
      out.push(`<p>${inline(para.join(' '), links)}</p>`);
    }
  }
  return { html: out.join('\n'), headings };
}
