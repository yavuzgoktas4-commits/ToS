import { extractPageDocument, ExtractedDocument } from './dom-extractor';

/**
 * Content Script for DOM text extraction and in-page quote highlighting.
 */

// Notify background worker if current page looks like a legal/ToS document
function checkForLegalPage(): void {
  const url = window.location.href.toLowerCase();
  const title = document.title.toLowerCase();
  const isLegal =
    url.includes('terms') ||
    url.includes('tos') ||
    url.includes('privacy') ||
    url.includes('policy') ||
    url.includes('gizlilik') ||
    url.includes('sozlesme') ||
    url.includes('kullanim') ||
    title.includes('terms') ||
    title.includes('privacy') ||
    title.includes('gizlilik');

  if (isLegal) {
    chrome.runtime.sendMessage({
      type: 'LEGAL_PAGE_DETECTED',
      payload: { url: window.location.href, title: document.title },
    }).catch(() => {
      // Background worker might be idle
    });
  }
}

// Highlight a verbatim quote inside the live DOM
function highlightInPage(quote: string): boolean {
  if (!quote || quote.length < 5) return false;

  // Search through text nodes in the page
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();

  while (currentNode) {
    const text = currentNode.textContent || '';
    if (text.includes(quote.trim())) {
      const parent = currentNode.parentElement;
      if (parent) {
        parent.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Apply a high-visibility animated pulse border and background
        const originalTransition = parent.style.transition;
        const originalOutline = parent.style.outline;
        const originalBackground = parent.style.backgroundColor;

        parent.style.transition = 'all 0.3s ease';
        parent.style.outline = '3px solid #ef4444';
        parent.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';

        setTimeout(() => {
          parent.style.outline = originalOutline;
          parent.style.backgroundColor = originalBackground;
          parent.style.transition = originalTransition;
        }, 3500);

        return true;
      }
    }
    currentNode = walker.nextNode();
  }

  return false;
}

// Listen for commands from side panel or background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'EXTRACT_DOM') {
    try {
      const docData: ExtractedDocument = extractPageDocument(document);
      sendResponse({ success: true, data: docData });
    } catch (err: any) {
      sendResponse({ success: false, error: err.message || 'DOM çıkarma hatası' });
    }
    return true; // async sendResponse
  }

  if (message.type === 'HIGHLIGHT_QUOTE') {
    const found = highlightInPage(message.quote);
    sendResponse({ success: found });
    return true;
  }

  return false;
});

// Run detection after page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkForLegalPage);
} else {
  checkForLegalPage();
}
