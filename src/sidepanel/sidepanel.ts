import { VerifiedAnalysisReport } from '../core/schema';

let currentTabId: number | null = null;

// DOM Elements
const pageTitleEl = document.getElementById('pageTitle') as HTMLDivElement;
const pageMetaEl = document.getElementById('pageMeta') as HTMLDivElement;
const analyzeBtn = document.getElementById('analyzeBtn') as HTMLButtonElement;
const btnText = document.getElementById('btnText') as HTMLSpanElement;
const btnIcon = document.getElementById('btnIcon') as HTMLSpanElement;
const statusMessageEl = document.getElementById('statusMessage') as HTMLDivElement;
const resultsSection = document.getElementById('resultsSection') as HTMLDivElement;
const scoreBadge = document.getElementById('scoreBadge') as HTMLDivElement;
const summaryTrEl = document.getElementById('summaryTr') as HTMLDivElement;
const gatekeeperStatsEl = document.getElementById('gatekeeperStats') as HTMLSpanElement;
const riskCountEl = document.getElementById('riskCount') as HTMLSpanElement;
const risksListEl = document.getElementById('risksList') as HTMLDivElement;
const uncertaintiesListEl = document.getElementById('uncertaintiesList') as HTMLUListElement;
const injectionAlertEl = document.getElementById('injectionAlert') as HTMLDivElement;
const openSettingsBtn = document.getElementById('openSettingsBtn') as HTMLButtonElement;

// Open settings page on button click
openSettingsBtn.addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('options/index.html'));
  }
});

// Query active tab information
async function initTabInfo(): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  if (!activeTab || !activeTab.id) {
    pageTitleEl.textContent = 'Aktif sekme bulunamadı';
    analyzeBtn.disabled = true;
    return;
  }

  currentTabId = activeTab.id;
  pageTitleEl.textContent = activeTab.title || 'Aktif Sayfa';
  pageMetaEl.textContent = activeTab.url ? new URL(activeTab.url).hostname : '';

  // Check if there is already cached analysis for this tab
  chrome.runtime.sendMessage(
    { type: 'GET_CACHED_ANALYSIS', tabId: currentTabId },
    (response) => {
      if (response && response.analysis) {
        renderReport(response.analysis);
      }
    }
  );
}

// Render the Verified Analysis Report in UI
function renderReport(report: VerifiedAnalysisReport): void {
  resultsSection.classList.remove('hidden');

  // 1. Injection Alert
  if (report.injection_detected) {
    injectionAlertEl.classList.remove('hidden');
  } else {
    injectionAlertEl.classList.add('hidden');
  }

  // 2. Risk Score
  scoreBadge.textContent = `${report.risk_score} / 100`;
  scoreBadge.className = 'score-badge';
  if (report.risk_score >= 70) {
    scoreBadge.classList.add('score-high');
  } else if (report.risk_score >= 40) {
    scoreBadge.classList.add('score-med');
  } else {
    scoreBadge.classList.add('score-low');
  }

  // 3. Summary
  summaryTrEl.textContent = report.summary_tr;

  // 4. Quote Gatekeeper Verification Stats
  gatekeeperStatsEl.textContent = `Doğrulanan Kanıt: ${report.claims_verified}/${report.claims_total} (${
    report.claims_rejected === 0
      ? 'Sıfır Halüsinasyon: Tüm alıntılar orijinal metinle harfiyen eşleşti'
      : `${report.claims_rejected} uydurma/hatalı alıntı elendi`
  })`;

  // 5. Risks List
  riskCountEl.textContent = `${report.risks.length}`;
  risksListEl.innerHTML = '';

  if (report.risks.length === 0) {
    risksListEl.innerHTML = `
      <div style="padding: 16px; text-align: center; color: #10b981; background: rgba(16, 185, 129, 0.08); border-radius: 8px;">
        Kritik bir sözleşme riski veya tüketici aleyhine madde tespit edilmedi.
      </div>
    `;
  } else {
    for (const risk of report.risks) {
      const card = document.createElement('div');
      card.className = `risk-card severity-${risk.severity}`;

      card.innerHTML = `
        <div class="risk-card-header">
          <div class="badge-group">
            <span class="category-tag">${escapeHtml(risk.category)}</span>
            <span class="severity-pill">${risk.severity}</span>
            ${risk.is_ambiguous ? '<span class="ambiguity-tag">Muğlak İfade</span>' : ''}
          </div>
          <span style="font-size: 11px; color: #10b981; font-weight: 600;">✓ Doğrulandı</span>
        </div>
        <div class="risk-explanation">${escapeHtml(risk.explanation_tr)}</div>
        <div class="quote-box">
          <div class="quote-header">
            <span>Orijinal Madde Alıntısı:</span>
            <button class="quote-highlight-btn" data-quote="${escapeAttribute(risk.verbatim_quote)}">
              🔍 Sayfada Göster
            </button>
          </div>
          <div>"${escapeHtml(risk.verbatim_quote)}"</div>
        </div>
      `;

      // Highlight button event listener
      const highlightBtn = card.querySelector('.quote-highlight-btn') as HTMLButtonElement;
      if (highlightBtn) {
        highlightBtn.addEventListener('click', () => {
          if (currentTabId) {
            chrome.runtime.sendMessage({
              type: 'FORWARD_HIGHLIGHT',
              tabId: currentTabId,
              quote: risk.verbatim_quote,
            });
          }
        });
      }

      risksListEl.appendChild(card);
    }
  }

  // 6. Uncertainties
  uncertaintiesListEl.innerHTML = '';
  if (report.uncertainties.length === 0) {
    uncertaintiesListEl.innerHTML = '<li>Belirsiz veya muğlak bir gri alan tespit edilmedi.</li>';
  } else {
    for (const item of report.uncertainties) {
      const li = document.createElement('li');
      li.textContent = item;
      uncertaintiesListEl.appendChild(li);
    }
  }
}

// Start analysis handler
analyzeBtn.addEventListener('click', async () => {
  if (!currentTabId) return;

  analyzeBtn.disabled = true;
  btnIcon.innerHTML = '<div class="spinner"></div>';
  btnText.textContent = 'Analiz Ediliyor...';
  statusMessageEl.textContent = 'Sayfa DOM metni çıkarılıyor ve LLM güvenlik filtresinden geçiriliyor...';

  chrome.runtime.sendMessage(
    { type: 'ANALYZE_TAB', tabId: currentTabId },
    (response) => {
      analyzeBtn.disabled = false;
      btnIcon.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      `;
      btnText.textContent = 'Yeniden Analiz Et';

      if (!response || !response.success) {
        statusMessageEl.style.color = '#ef4444';
        statusMessageEl.textContent = response?.error || 'Analiz sırasında bir hata oluştu.';
        return;
      }

      statusMessageEl.style.color = '#10b981';
      statusMessageEl.textContent = 'Analiz tamamlandı ve alıntılar doğrulandı.';
      renderReport(response.report);
    }
  );
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttribute(str: string): string {
  return str.replace(/"/g, '&quot;');
}

// Initialize on load
initTabInfo();
