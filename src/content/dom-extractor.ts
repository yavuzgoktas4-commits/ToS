/**
 * Optimized DOM Text Extractor inspired by Alibaba page-agent and Readability algorithms.
 * Cleans boilerplate, hidden elements, ads, and navigation while strictly preserving
 * verbatim clause text for zero-hallucination quote verification.
 */

export interface ExtractedDocument {
  title: string;
  url: string;
  rawText: string;
  cleanedText: string;
  wordCount: number;
  characterCount: number;
  headings: string[];
  extractionTimestamp: string;
}

export interface ExtractorOptions {
  maxCharacters?: number;
  preserveHeadings?: boolean;
}

const DEFAULT_EXTRACTOR_OPTIONS: ExtractorOptions = {
  maxCharacters: 120_000, // ~30k tokens max safe window for ToS documents
  preserveHeadings: true,
};

// Tags that contain non-textual or non-content elements
const IGNORED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'IFRAME',
  'SVG',
  'CANVAS',
  'AUDIO',
  'VIDEO',
  'SOURCE',
  'TRACK',
  'OBJECT',
  'EMBED',
  'SELECT',
  'OPTION',
  'BUTTON',
  'FORM',
  'INPUT',
  'TEXTAREA',
]);

// Structural tags that represent navigation, cookies, or footers
const NOISE_ROLES_AND_CLASSES = [
  'nav',
  'header',
  'footer',
  'aside',
  'cookie',
  'banner',
  'advertisement',
  'modal',
  'popup',
  'newsletter',
];

/**
 * Checks if an element is hidden via CSS or HTML attributes.
 */
function isElementVisible(el: Element): boolean {
  if (el.hasAttribute('aria-hidden') && el.getAttribute('aria-hidden') === 'true') {
    return false;
  }
  if (el.hasAttribute('hidden')) {
    return false;
  }

  // In real browser context, use window.getComputedStyle
  const win = el.ownerDocument.defaultView;
  if (win && typeof win.getComputedStyle === 'function') {
    try {
      const style = win.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0'
      ) {
        return false;
      }
    } catch {
      // Fallback if styling cannot be read
    }
  }

  return true;
}

/**
 * Checks if element is boilerplate noise (navigation, cookie banner, footer)
 */
function isNoiseElement(el: Element): boolean {
  const tagName = el.tagName.toLowerCase();
  if (['nav', 'footer', 'aside'].includes(tagName)) {
    return true;
  }

  const role = el.getAttribute('role')?.toLowerCase() || '';
  if (['navigation', 'banner', 'contentinfo', 'complementary'].includes(role)) {
    return true;
  }

  const classAndId = `${el.className || ''} ${el.id || ''}`.toLowerCase();
  for (const noise of NOISE_ROLES_AND_CLASSES) {
    if (classAndId.includes(noise)) {
      // Avoid false positive on 'privacy-cookie-policy' or 'legal-footer-terms' if it's the main container
      if (classAndId.includes('policy') || classAndId.includes('terms')) {
        continue;
      }
      return true;
    }
  }

  return false;
}

/**
 * Finds the candidate root element with the highest density of legal text
 */
function findBestContentRoot(doc: Document): Element {
  // Check standard semantic content containers
  const semanticCandidates = [
    'main',
    'article',
    '[role="main"]',
    '#content',
    '#main-content',
    '.terms-container',
    '.legal-content',
    '.policy-content',
    '.tos-content',
  ];

  for (const selector of semanticCandidates) {
    const el = doc.querySelector(selector);
    if (el && (el.textContent?.trim().length || 0) > 400) {
      return el;
    }
  }

  return doc.body || doc.documentElement;
}

/**
 * Recursively extracts clean text nodes while preserving exact phrasing and paragraph spacing.
 */
function traverseAndExtractText(
  node: Node,
  collectedLines: string[],
  headings: string[]
): void {
  // 3 = Node.TEXT_NODE, 1 = Node.ELEMENT_NODE
  if (node.nodeType === 3) {
    const text = node.textContent || '';
    const trimmed = text.replace(/[\r\n\t]+/g, ' ').trim();
    if (trimmed.length > 0) {
      collectedLines.push(trimmed);
    }
    return;
  }

  if (node.nodeType !== 1) {
    return;
  }

  const el = node as Element;
  const tagName = el.tagName.toUpperCase();

  if (IGNORED_TAGS.has(tagName)) {
    return;
  }

  if (!isElementVisible(el)) {
    return;
  }

  if (isNoiseElement(el)) {
    return;
  }

  const isHeading = /^H[1-6]$/.test(tagName);
  if (isHeading) {
    const headingText = el.textContent?.trim() || '';
    if (headingText) {
      headings.push(headingText);
      collectedLines.push(`\n### ${headingText}\n`);
    }
    return;
  }

  const isBlock = /^(P|DIV|SECTION|ARTICLE|LI|TR|BLOCKQUOTE|PRE)$/.test(tagName);
  const beforeLen = collectedLines.length;

  for (let i = 0; i < el.childNodes.length; i++) {
    traverseAndExtractText(el.childNodes[i], collectedLines, headings);
  }

  // Add paragraph break after block elements if new content was added
  if (isBlock && collectedLines.length > beforeLen) {
    collectedLines.push('\n');
  }
}

/**
 * Main DOM extraction entry point.
 * Works both in browser content script and in JSDOM unit tests.
 */
export function extractPageDocument(
  doc: Document,
  options: ExtractorOptions = {}
): ExtractedDocument {
  const opts = { ...DEFAULT_EXTRACTOR_OPTIONS, ...options };
  const targetRoot = findBestContentRoot(doc);

  const collectedLines: string[] = [];
  const headings: string[] = [];

  traverseAndExtractText(targetRoot, collectedLines, headings);

  // Join lines while preserving sentence integrity
  const assembled = collectedLines
    .join(' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ ]{2,}/g, ' ')
    .trim();

  // If assembled text is too short, fallback to body textContent
  const rawText = assembled.length > 200 ? assembled : (doc.body?.textContent || '').trim();

  // Truncate safely if exceeding maximum character window
  const finalCleaned =
    opts.maxCharacters && rawText.length > opts.maxCharacters
      ? rawText.slice(0, opts.maxCharacters)
      : rawText;

  const words = finalCleaned.split(/\s+/).filter(Boolean);

  return {
    title: doc.title || 'Untitled Document',
    url: doc.location?.href || '',
    rawText: finalCleaned,
    cleanedText: finalCleaned,
    wordCount: words.length,
    characterCount: finalCleaned.length,
    headings,
    extractionTimestamp: new Date().toISOString(),
  };
}
