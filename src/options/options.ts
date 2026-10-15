import { loadSettings, saveSettings, UserSettings, DEFAULT_SETTINGS } from '../core/storage';
import { LLMProviderType } from '../core/llm/types';
import { OpenAIAdapter } from '../core/llm/openai-adapter';
import { AnthropicAdapter } from '../core/llm/anthropic-adapter';
import { GeminiAdapter } from '../core/llm/gemini-adapter';

// Elements
const tabButtons = document.querySelectorAll('.provider-tab-btn') as NodeListOf<HTMLButtonElement>;
const panelOpenAI = document.getElementById('panelOpenAI') as HTMLDivElement;
const panelAnthropic = document.getElementById('panelAnthropic') as HTMLDivElement;
const panelGemini = document.getElementById('panelGemini') as HTMLDivElement;

const openaiKeyInput = document.getElementById('openaiKey') as HTMLInputElement;
const openaiModelSelect = document.getElementById('openaiModel') as HTMLSelectElement;
const openaiEndpointInput = document.getElementById('openaiEndpoint') as HTMLInputElement;
const testOpenAiBtn = document.getElementById('testOpenAiBtn') as HTMLButtonElement;

const anthropicKeyInput = document.getElementById('anthropicKey') as HTMLInputElement;
const anthropicModelSelect = document.getElementById('anthropicModel') as HTMLSelectElement;
const anthropicEndpointInput = document.getElementById('anthropicEndpoint') as HTMLInputElement;
const testAnthropicBtn = document.getElementById('testAnthropicBtn') as HTMLButtonElement;

const geminiKeyInput = document.getElementById('geminiKey') as HTMLInputElement;
const geminiModelSelect = document.getElementById('geminiModel') as HTMLSelectElement;
const geminiEndpointInput = document.getElementById('geminiEndpoint') as HTMLInputElement;
const testGeminiBtn = document.getElementById('testGeminiBtn') as HTMLButtonElement;

const saveSettingsBtn = document.getElementById('saveSettingsBtn') as HTMLButtonElement;
const toastMessage = document.getElementById('toastMessage') as HTMLDivElement;

let activeProvider: LLMProviderType = 'openai';

function showToast(text: string, type: 'success' | 'error'): void {
  toastMessage.textContent = text;
  toastMessage.className = `alert-box alert-${type}`;
  toastMessage.style.display = 'block';

  setTimeout(() => {
    toastMessage.style.display = 'none';
  }, 4500);
}

function updateTabUI(provider: LLMProviderType): void {
  activeProvider = provider;
  tabButtons.forEach((btn) => {
    if (btn.dataset.provider === provider) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  panelOpenAI.style.display = provider === 'openai' ? 'flex' : 'none';
  panelAnthropic.style.display = provider === 'anthropic' ? 'flex' : 'none';
  panelGemini.style.display = provider === 'gemini' ? 'flex' : 'none';
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const p = btn.dataset.provider as LLMProviderType;
    if (p) updateTabUI(p);
  });
});

// Load settings into form
async function initForm(): Promise<void> {
  const settings = await loadSettings();
  activeProvider = settings.activeProvider || DEFAULT_SETTINGS.activeProvider;
  updateTabUI(activeProvider);

  openaiKeyInput.value = settings.apiKeys.openai || '';
  openaiModelSelect.value = settings.models.openai || DEFAULT_SETTINGS.models.openai;
  openaiEndpointInput.value = settings.customEndpoints.openai || '';

  anthropicKeyInput.value = settings.apiKeys.anthropic || '';
  anthropicModelSelect.value = settings.models.anthropic || DEFAULT_SETTINGS.models.anthropic;
  anthropicEndpointInput.value = settings.customEndpoints.anthropic || '';

  geminiKeyInput.value = settings.apiKeys.gemini || '';
  const loadedGeminiModel = (settings.models.gemini || DEFAULT_SETTINGS.models.gemini).replace(/^models\//, '');
  if (loadedGeminiModel === 'gemini-2.0-flash' || loadedGeminiModel === 'gemini-2.5-flash') {
    geminiModelSelect.value = 'gemini-3.8-flash';
  } else if (loadedGeminiModel === 'gemini-1.5-flash') {
    geminiModelSelect.value = 'gemini-1.5-flash-latest';
  } else if (loadedGeminiModel === 'gemini-1.5-pro') {
    geminiModelSelect.value = 'gemini-1.5-pro-latest';
  } else {
    geminiModelSelect.value = loadedGeminiModel;
  }
  if (!geminiModelSelect.value) {
    geminiModelSelect.value = 'gemini-3.8-flash';
  }
  geminiEndpointInput.value = settings.customEndpoints.gemini || '';
}

// Save form values
saveSettingsBtn.addEventListener('click', async () => {
  const cleanGeminiModel = (geminiModelSelect.value || 'gemini-3.8-flash').replace(/^models\//, '');
  const newSettings: UserSettings = {
    activeProvider,
    apiKeys: {
      openai: openaiKeyInput.value.trim(),
      anthropic: anthropicKeyInput.value.trim(),
      gemini: geminiKeyInput.value.trim(),
    },
    models: {
      openai: openaiModelSelect.value,
      anthropic: anthropicModelSelect.value,
      gemini: cleanGeminiModel,
    },
    customEndpoints: {
      openai: openaiEndpointInput.value.trim(),
      anthropic: anthropicEndpointInput.value.trim(),
      gemini: geminiEndpointInput.value.trim(),
    },
    autoAnalyze: false,
  };

  await saveSettings(newSettings);
  showToast('Ayarlar başarıyla kaydedildi!', 'success');
});

// Test Connection Buttons
testOpenAiBtn.addEventListener('click', async () => {
  const key = openaiKeyInput.value.trim();
  if (!key) {
    showToast('Lütfen önce bir OpenAI API anahtarı girin.', 'error');
    return;
  }
  testOpenAiBtn.disabled = true;
  testOpenAiBtn.textContent = 'Test Ediliyor...';

  const adapter = new OpenAIAdapter();
  const res = await adapter.validateApiKey(key);
  testOpenAiBtn.disabled = false;
  testOpenAiBtn.textContent = 'Bağlantıyı Test Et';

  showToast(res.message, res.valid ? 'success' : 'error');
});

testAnthropicBtn.addEventListener('click', async () => {
  const key = anthropicKeyInput.value.trim();
  if (!key) {
    showToast('Lütfen önce bir Anthropic API anahtarı girin.', 'error');
    return;
  }
  testAnthropicBtn.disabled = true;
  testAnthropicBtn.textContent = 'Test Ediliyor...';

  const adapter = new AnthropicAdapter();
  const res = await adapter.validateApiKey(key);
  testAnthropicBtn.disabled = false;
  testAnthropicBtn.textContent = 'Bağlantıyı Test Et';

  showToast(res.message, res.valid ? 'success' : 'error');
});

testGeminiBtn.addEventListener('click', async () => {
  const key = geminiKeyInput.value.trim();
  if (!key) {
    showToast('Lütfen önce bir Google Gemini API anahtarı girin.', 'error');
    return;
  }
  testGeminiBtn.disabled = true;
  testGeminiBtn.textContent = 'Test Ediliyor...';

  const adapter = new GeminiAdapter();
  const cleanModel = (geminiModelSelect.value || 'gemini-3.8-flash').replace(/^models\//, '');
  const res = await adapter.validateApiKey(key, cleanModel);
  testGeminiBtn.disabled = false;
  testGeminiBtn.textContent = 'Bağlantıyı Test Et';

  showToast(res.message, res.valid ? 'success' : 'error');
});

initForm();
