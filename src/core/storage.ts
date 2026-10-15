import { LLMConfig, LLMProviderType } from './llm/types';

export interface UserSettings {
  activeProvider: LLMProviderType;
  apiKeys: {
    openai: string;
    anthropic: string;
    gemini: string;
  };
  models: {
    openai: string;
    anthropic: string;
    gemini: string;
  };
  customEndpoints: {
    openai: string;
    anthropic: string;
    gemini: string;
  };
  autoAnalyze: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  activeProvider: 'openai',
  apiKeys: {
    openai: '',
    anthropic: '',
    gemini: '',
  },
  models: {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-sonnet-20241022',
    gemini: 'gemini-3.8-flash',
  },
  customEndpoints: {
    openai: '',
    anthropic: '',
    gemini: '',
  },
  autoAnalyze: false,
};

/**
 * Normalizes stored Gemini model names (removes duplicate 'models/' prefix and maps legacy/deprecated aliases)
 */
export function normalizeStoredGeminiModel(model?: string): string {
  let cleaned = (model || 'gemini-3.8-flash').trim().replace(/^models\//, '');
  if (cleaned === 'gemini-2.0-flash' || cleaned === 'gemini-2.5-flash') cleaned = 'gemini-3.8-flash';
  if (cleaned === 'gemini-1.5-flash') cleaned = 'gemini-1.5-flash-latest';
  if (cleaned === 'gemini-1.5-pro') cleaned = 'gemini-1.5-pro-latest';
  return cleaned;
}

/**
 * Loads user settings from chrome.storage.sync (or localStorage fallback in test environments)
 */
export async function loadSettings(): Promise<UserSettings> {
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    return new Promise((resolve) => {
      chrome.storage.sync.get('tos_guard_settings', (result) => {
        if (result && result.tos_guard_settings) {
          const rawModels = result.tos_guard_settings.models || {};
          const loadedGemini = normalizeStoredGeminiModel(rawModels.gemini || DEFAULT_SETTINGS.models.gemini);

          resolve({
            ...DEFAULT_SETTINGS,
            ...result.tos_guard_settings,
            apiKeys: { ...DEFAULT_SETTINGS.apiKeys, ...(result.tos_guard_settings.apiKeys || {}) },
            models: {
              ...DEFAULT_SETTINGS.models,
              ...rawModels,
              gemini: loadedGemini,
            },
            customEndpoints: {
              ...DEFAULT_SETTINGS.customEndpoints,
              ...(result.tos_guard_settings.customEndpoints || {}),
            },
          });
        } else {
          resolve(DEFAULT_SETTINGS);
        }
      });
    });
  }

  // Fallback for Node / test environments
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem('tos_guard_settings');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const rawModels = parsed.models || {};
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          models: {
            ...DEFAULT_SETTINGS.models,
            ...rawModels,
            gemini: normalizeStoredGeminiModel(rawModels.gemini || DEFAULT_SETTINGS.models.gemini),
          },
        };
      } catch {
        // fallback
      }
    }
  }

  return DEFAULT_SETTINGS;
}

/**
 * Saves user settings to chrome.storage.sync (or localStorage fallback)
 */
export async function saveSettings(settings: UserSettings): Promise<void> {
  const sanitizedSettings: UserSettings = {
    ...settings,
    models: {
      ...settings.models,
      gemini: normalizeStoredGeminiModel(settings.models.gemini),
    },
  };

  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ tos_guard_settings: sanitizedSettings }, () => {
        resolve();
      });
    });
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('tos_guard_settings', JSON.stringify(sanitizedSettings));
  }
}

/**
 * Resolves active LLMConfig from stored user settings
 */
export async function getActiveLLMConfig(): Promise<LLMConfig> {
  const settings = await loadSettings();
  const provider = settings.activeProvider;
  const apiKey = settings.apiKeys[provider] || '';
  let model = settings.models[provider] || DEFAULT_SETTINGS.models[provider];

  if (provider === 'gemini') {
    model = normalizeStoredGeminiModel(model);
  }

  const customEndpoint = settings.customEndpoints[provider] || undefined;

  return {
    provider,
    apiKey,
    model,
    customEndpoint: customEndpoint?.trim() || undefined,
    temperature: 0.0,
  };
}
