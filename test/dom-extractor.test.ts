import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { extractPageDocument } from '../src/content/dom-extractor';

describe('Optimized DOM Text Extractor (page-agent architecture)', () => {
  it('extracts clean text from main content while pruning noise, scripts, and navigation', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Example Corp - Terms and Conditions</title>
          <style>body { font-family: sans-serif; }</style>
          <script>console.log("analytics tracking script");</script>
        </head>
        <body>
          <nav role="navigation">
            <a href="/">Home</a>
            <a href="/products">Products</a>
            <a href="/pricing">Pricing</a>
          </nav>
          
          <div class="cookie-banner" id="cookieNotice">
            We use cookies to improve your experience. Click Accept.
          </div>

          <main class="terms-container">
            <h1>Terms of Service</h1>
            <p>Welcome to Example Corp. Please read these terms carefully before using our software.</p>
            
            <h2>1. Binding Arbitration</h2>
            <p>You agree that any dispute between you and Company will be resolved by binding individual arbitration.</p>
            
            <h2>2. Auto-Renewal</h2>
            <p>Your subscription will automatically renew at the end of each billing cycle unless cancelled at least 24 hours prior.</p>

            <div aria-hidden="true">
              This text is marked as aria-hidden and should not be extracted.
            </div>

            <div hidden>
              This text is hidden with HTML hidden attribute.
            </div>
          </main>

          <footer>
            <p>&copy; 2025 Example Corp. All rights reserved.</p>
          </footer>
        </body>
      </html>
    `;

    const dom = new JSDOM(html, { url: 'https://example.com/terms' });
    const extracted = extractPageDocument(dom.window.document);

    // Title and URL check
    expect(extracted.title).toBe('Example Corp - Terms and Conditions');
    expect(extracted.url).toBe('https://example.com/terms');

    // Noise elements should be filtered out
    expect(extracted.rawText).not.toContain('analytics tracking script');
    expect(extracted.rawText).not.toContain('Home Products Pricing');
    expect(extracted.rawText).not.toContain('We use cookies to improve your experience');
    expect(extracted.rawText).not.toContain('aria-hidden and should not be extracted');
    expect(extracted.rawText).not.toContain('This text is hidden with HTML hidden');

    // Essential verbatim clauses must be preserved exactly
    const arbitrationClause =
      'You agree that any dispute between you and Company will be resolved by binding individual arbitration.';
    expect(extracted.rawText).toContain(arbitrationClause);

    const renewalClause =
      'Your subscription will automatically renew at the end of each billing cycle unless cancelled at least 24 hours prior.';
    expect(extracted.rawText).toContain(renewalClause);

    // Headings preservation
    expect(extracted.headings).toContain('Terms of Service');
    expect(extracted.headings).toContain('1. Binding Arbitration');
  });

  it('handles empty document gracefully with fallback', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    const extracted = extractPageDocument(dom.window.document);

    expect(extracted.wordCount).toBe(0);
    expect(extracted.rawText).toBe('');
  });
});
