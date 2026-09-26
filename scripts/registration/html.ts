/**
 * A small, tolerant HTML reader for the ironman.com race and registration pages: just
 * enough of a DOM to tell which text a visitor actually sees.
 *
 * Those pages ship a section for every state a race can be in ("OPENING SOON", "SOLD OUT",
 * the prices…) and hide all but the current one with CSS classes (Cohesion's
 * `coh-style-hidden`). Reading the raw text therefore finds stale states; reading only the
 * visible elements does not. No dependency: the pages are server-rendered and only
 * `class`, `style` and `hidden` decide what shows.
 */

export interface HtmlElement {
  tag: string;
  attrs: ReadonlyMap<string, string>;
  classes: ReadonlySet<string>;
  children: HtmlNode[];
  parent: HtmlElement | null;
  /** Hidden by its own markup (its ancestors are not counted; see isHidden). */
  hiddenSelf: boolean;
}

/** An element, or a text node (entities decoded, whitespace as in the source). */
export type HtmlNode = HtmlElement | string;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  euro: '€',
  pound: '£',
  yen: '¥',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  reg: '®',
  copy: '©',
  trade: '™',
};

/** Decode character references (&amp; &#039; &#x2013; &euro; …); unknown ones are kept as written. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? m;
  });
}

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);
/** Elements whose content is not markup: skipped up to their end tag. */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript']);
/** Elements never rendered as page content. */
const NOT_RENDERED = new Set([...RAW_TEXT, 'head', 'template']);
/** Start tags that close an open <p> (HTML's "close a p element"). */
const CLOSES_P = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'details',
  'div',
  'dl',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
]);
/** Elements a search for an open <p> or <li> does not look past. */
const SCOPE = new Set(['html', 'table', 'td', 'th', 'caption', 'button', 'template', 'object', 'marquee', 'applet']);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
/** Elements that flow inside a line: no word break around them. */
const INLINE = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'cite',
  'code',
  'data',
  'dfn',
  'em',
  'i',
  'kbd',
  'mark',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
]);

/**
 * Classes that hide an element on these pages: Cohesion's `coh-style-hidden`, the
 * screen-reader-only `visually-hidden`, and the usual utility classes.
 */
const HIDDEN_CLASSES = ['coh-style-hidden', 'visually-hidden', 'hidden', 'd-none', 'sr-only', 'is-hidden'];

function hiddenByMarkup(tag: string, attrs: ReadonlyMap<string, string>, classes: ReadonlySet<string>): boolean {
  if (NOT_RENDERED.has(tag) || attrs.has('hidden')) return true;
  const style = (attrs.get('style') ?? '').replace(/\s+/g, '').toLowerCase();
  if (/(^|;)display:none/.test(style) || /(^|;)visibility:hidden/.test(style)) return true;
  if (HIDDEN_CLASSES.some((c) => classes.has(c))) return true;
  // Cohesion's per-breakpoint visibility (coh-hidden-sm, coh-visible-xl…): hidden only
  // when it is hidden at some breakpoint and visible at none.
  const list = [...classes];
  return list.some((c) => c.startsWith('coh-hidden-')) && !list.some((c) => c.startsWith('coh-visible-'));
}

const TOKEN =
  /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\?[^>]*>|<\/([a-zA-Z][^\s/>]*)[^>]*>|<([a-zA-Z][^\s/>]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function element(tag: string, rawAttrs: string, parent: HtmlElement | null): HtmlElement {
  const attrs = new Map<string, string>();
  for (const m of rawAttrs.matchAll(ATTR)) {
    const name = m[1]!.toLowerCase();
    if (!attrs.has(name)) attrs.set(name, decodeEntities(m[2] ?? m[3] ?? m[4] ?? ''));
  }
  const classes = new Set((attrs.get('class') ?? '').split(/\s+/).filter(Boolean));
  return { tag, attrs, classes, children: [], parent, hiddenSelf: hiddenByMarkup(tag, attrs, classes) };
}

/** Parse a whole page into a tree under a synthetic `#root` element. Never throws. */
export function parseHtml(html: string): HtmlElement {
  const root: HtmlElement = {
    tag: '#root',
    attrs: new Map(),
    classes: new Set(),
    children: [],
    parent: null,
    hiddenSelf: false,
  };
  const stack: HtmlElement[] = [root];
  const top = () => stack[stack.length - 1]!;
  const text = (s: string) => {
    if (s) top().children.push(decodeEntities(s));
  };
  /** Close the nearest open `tag` above any scope boundary (and whatever is open inside it). */
  const closeInScope = (tags: ReadonlySet<string>, stopAt: ReadonlySet<string> = SCOPE) => {
    for (let i = stack.length - 1; i > 0; i--) {
      const t = stack[i]!.tag;
      if (tags.has(t)) {
        stack.length = i;
        return;
      }
      if (stopAt.has(t)) return;
    }
  };

  let last = 0;
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(html); m; m = TOKEN.exec(html)) {
    text(html.slice(last, m.index));
    last = TOKEN.lastIndex;
    const [token, endName, startName, rawAttrs = ''] = m;
    if (endName) {
      const tag = endName.toLowerCase();
      // Pop to the nearest open element of that name; a stray end tag is ignored.
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i]!.tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    if (!startName) continue; // comment, doctype, processing instruction
    const tag = startName.toLowerCase();
    if (CLOSES_P.has(tag)) closeInScope(new Set(['p']));
    if (tag === 'li') closeInScope(new Set(['li']), new Set([...SCOPE, 'ul', 'ol']));
    if ((tag === 'dt' || tag === 'dd') && ['dt', 'dd'].includes(top().tag)) stack.pop();
    if (HEADINGS.has(tag) && HEADINGS.has(top().tag)) stack.pop();
    const el = element(tag, rawAttrs.replace(/\/\s*$/, ''), top());
    top().children.push(el);
    if (RAW_TEXT.has(tag)) {
      // Skip the content up to the matching end tag (script bodies may contain "<div>").
      const close = new RegExp(`</${tag}[\\s>]`, 'i');
      const rest = close.exec(html.slice(last));
      const end = rest ? last + rest.index : html.length;
      el.children.push(decodeEntities(html.slice(last, end)));
      const after = rest ? html.indexOf('>', end) : -1;
      last = after >= 0 ? after + 1 : html.length;
      TOKEN.lastIndex = last;
      continue;
    }
    if (VOID.has(tag) || /\/\s*>$/.test(token)) continue;
    stack.push(el);
  }
  text(html.slice(last));
  return root;
}

/** Whether the element or any of its ancestors is hidden. */
export function isHidden(el: HtmlElement): boolean {
  for (let e: HtmlElement | null = el; e; e = e.parent) if (e.hiddenSelf) return true;
  return false;
}

/** Every element below `root` (depth first, in document order) that `test` accepts. */
export function findAll(
  root: HtmlElement,
  test: (el: HtmlElement) => boolean,
  { visibleOnly = false }: { visibleOnly?: boolean } = {},
): HtmlElement[] {
  const out: HtmlElement[] = [];
  const walk = (el: HtmlElement) => {
    for (const child of el.children) {
      if (typeof child === 'string') continue;
      if (visibleOnly && child.hiddenSelf) continue; // nothing below a hidden element shows
      if (test(child)) out.push(child);
      walk(child);
    }
  };
  if (!(visibleOnly && isHidden(root))) walk(root);
  return out;
}

/** The text a visitor sees in the element: hidden descendants left out, whitespace collapsed. */
export function visibleText(el: HtmlElement): string {
  if (isHidden(el)) return '';
  const parts: string[] = [];
  const walk = (e: HtmlElement) => {
    for (const child of e.children) {
      if (typeof child === 'string') parts.push(child);
      else if (!child.hiddenSelf) {
        walk(child);
        // Block boundaries separate words ("SOLD OUT</h3><p>Individual"); inline ones do not.
        if (!INLINE.has(child.tag)) parts.push(' ');
      }
    }
  };
  walk(el);
  return parts.join('').replace(/\s+/g, ' ').trim();
}

/** Whether the element, or one of its ancestors, is inside an element that `test` accepts. */
export function closest(el: HtmlElement, test: (e: HtmlElement) => boolean): HtmlElement | null {
  for (let e: HtmlElement | null = el; e; e = e.parent) if (test(e)) return e;
  return null;
}
