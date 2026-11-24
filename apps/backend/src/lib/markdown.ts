import MarkdownIt from 'markdown-it';

/**
 * Texts of a campaign are written as Markdown in the admin and turned into HTML
 * here. Raw HTML in the source is escaped (html: false), pictures are off (they
 * would load from other servers), and links open in a new tab without referrer.
 * The browser never sends HTML (WAF) and never receives unchecked HTML.
 */
const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true });
md.disable(['image']);

// Only web and mail links; markdown-it already refuses javascript: and friends.
const SAFE_LINK = /^(https?:|mailto:)/i;

const defaultLinkOpen = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const href = String(token.attrGet('href') ?? '');
  if (!SAFE_LINK.test(href)) token.attrSet('href', '#');
  token.attrSet('target', '_blank');
  token.attrSet('rel', 'noopener noreferrer');
  return defaultLinkOpen(tokens, idx, options, env, self);
};

export function renderMarkdown(source: string | null | undefined): string | null {
  const text = source?.trim();
  return text ? md.render(text) : null;
}
