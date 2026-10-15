import { LLMClient } from '../core/llm/client';
import { getActiveLLMConfig } from '../core/storage';
import { VerifiedAnalysisReport } from '../core/schema';
import { ExtractedDocument } from '../content/dom-extractor';

const llmClient = new LLMClient();

// In-memory cache for analyzed tabs
const analysisCache = new Map<number, VerifiedAnalysisReport>();
const extractedDocCache = new Map<number, ExtractedDocument>();

// Setup Side Panel behavior for Chrome 114+
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch(() => {
        // Fallback or ignore if unsupported in current chrome version
      });
  }
});

/**
 * Extracts DOM text from the given tab, injecting content script if needed.
 */
async function extractDOMFromTab(tabId: number): Promise<ExtractedDocument> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_DOM' }, async (response) => {
      if (chrome.runtime.lastError || !response) {
        // Content script might not be injected yet; inject programmatically
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js'],
          });
          // Retry message after injection
          chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_DOM' }, (retryResponse) => {
            if (chrome.runtime.lastError || !retryResponse || !retryResponse.success) {
              reject(new Error(retryResponse?.error || 'Sayfa içeriği okunamadı. Lütfen sayfayı yenileyin.'));
            } else {
              extractedDocCache.set(tabId, retryResponse.data);
              resolve(retryResponse.data);
            }
          });
        } catch (injectionError: any) {
          reject(new Error(`Script enjeksiyon hatası: ${injectionError.message}`));
        }
      } else if (response.success) {
        extractedDocCache.set(tabId, response.data);
        resolve(response.data);
      } else {
        reject(new Error(response.error || 'DOM çıkarma işlemi başarısız.'));
      }
    });
  });
}

// Message handler for Side Panel and Content Script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 1. Legal page indicator notification from content script
  if (message.type === 'LEGAL_PAGE_DETECTED') {
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.action.setBadgeText({ tabId, text: 'ToS' });
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#3b82f6' });
    }
    sendResponse({ acknowledged: true });
    return false;
  }

  // 2. Request cached analysis
  if (message.type === 'GET_CACHED_ANALYSIS') {
    const tabId = message.tabId;
    sendResponse({
      analysis: analysisCache.get(tabId) || null,
      extractedDoc: extractedDocCache.get(tabId) || null,
    });
    return false;
  }

  // 3. Request full analysis pipeline
  if (message.type === 'ANALYZE_TAB') {
    const tabId = message.tabId;

    (async () => {
      try {
        const config = await getActiveLLMConfig();
        if (!config.apiKey) {
          throw new Error('API anahtarı bulunamadı. Lütfen sağ üstteki ayarlar simgesinden API anahtarınızı girin.');
        }

        const docData = await extractDOMFromTab(tabId);

        if (!docData.rawText || docData.rawText.length < 50) {
          throw new Error('Sayfada analiz edilecek yeterli metin bulunamadı.');
        }

        const report = await llmClient.analyzeDocument(docData.rawText, config, {
          sourceUrl: docData.url,
        });

        // Store in cache
        analysisCache.set(tabId, report);

        // Update badge with risk score
        const scoreColor =
          report.risk_score >= 70 ? '#ef4444' : report.risk_score >= 40 ? '#f59e0b' : '#10b981';
        chrome.action.setBadgeText({ tabId, text: `${report.risk_score}` });
        chrome.action.setBadgeBackgroundColor({ tabId, color: scoreColor });

        sendResponse({ success: true, report, docData });
      } catch (err: any) {
        console.error('[Background Service Worker] Analiz Hatası:', err);
        sendResponse({ success: false, error: err.message || 'Bilinmeyen bir hata oluştu.' });
      }
    })();

    return true; // async sendResponse
  }

  // 4. Highlight quote in tab
  if (message.type === 'FORWARD_HIGHLIGHT') {
    const { tabId, quote } = message;
    chrome.tabs.sendMessage(tabId, { type: 'HIGHLIGHT_QUOTE', quote }, (res) => {
      sendResponse(res);
    });
    return true;
  }

  return false;
});
