# ToS Guard AI - Chrome Extension (Manifest V3)

> **Deterministik, Sıfır Halüsinasyonlu (Quote Gatekeeper) ve Prompt Injection Korumalı Kullanım Koşulları & Gizlilik Politikası Risk Analiz Sistemi.**

---

## ⚖️ Yasal Uyarı
> **"Bu uygulama hukuki tavsiye vermez. Yalnızca bilgilendirme amaçlıdır."**  
> Sistem çıktısı nihai bir hukuki mütalaa niteliği taşımayıp, web sayfalarındaki uzun sözleşmelerin tüketici hakları açısından riskli maddelerini tespit etmeye ve özetlemeye yardımcı teknik bir araçtır.

---

## 🚀 Proje Mimarisi ve Temel Özellikler

Bu sistem, Chrome Extension **Manifest V3** standartlarına tam uyumlu olarak TypeScript, Vite ve Vitest altyapısıyla geliştirilmiştir.

```
tos-guard-extension/
├── dist/                          # Üretime hazır, paketlenmiş eklenti çıktısı
├── src/
│   ├── background/
│   │   └── service-worker.ts      # MV3 Background Service Worker (sekme yönetimi & LLM orkestrasyonu)
│   ├── content/
│   │   ├── content-script.ts      # Sayfa içi mesaj dinleyici ve canlı alıntı vurgulayıcı
│   │   └── dom-extractor.ts       # Alibaba page-agent mimarisinde optimize DOM metin çıkarıcı
│   ├── core/
│   │   ├── schema.ts              # Zod şemaları ve doğrulanmış rapor tipleri
│   │   ├── quote-gatekeeper.ts    # Zero-Hallucination Quote Verification Gatekeeper
│   │   ├── prompt-sanitizer.ts    # Prompt Injection izolasyonu ve etiket kırma (breakout) savunması
│   │   ├── system-prompts.ts      # Defansif sistem promptu ve kullanıcı prompt şablonu
│   │   ├── storage.ts             # chrome.storage.sync ile güvenli anahtar yönetimi
│   │   └── llm/
│   │       ├── types.ts           # Sağlayıcı arayüzleri
│   │       ├── openai-adapter.ts  # OpenAI (json_object mode, temp: 0.0)
│   │       ├── anthropic-adapter.ts # Claude 3.5 Sonnet / Haiku adaptörü
│   │       ├── gemini-adapter.ts  # Google Gemini Studio (JSON mode, temp: 0.0)
│   │       └── client.ts          # Uçtan uca güvenlik ve analiz istemcisi
│   ├── sidepanel/                 # Chrome 114+ Side Panel UI (sayfayla yan yana analiz)
│   ├── popup/                     # Hızlı erişim Toolbar Popup UI
│   └── options/                   # LLM API Anahtarları (BYOK) & Model Seçim Ekranı
├── test/                          # Kapsamlı Vitest test süiti (29 test)
│   ├── dom-extractor.test.ts
│   ├── quote-gatekeeper.test.ts
│   ├── prompt-sanitizer.test.ts
│   ├── schema-validation.test.ts
│   └── llm-adapters.test.ts
├── package.json
├── vite.config.ts
└── vitest.config.ts
```

---

## 🛡️ Güvenlik ve Sıfır Halüsinasyon (Zero Hallucination) Garantisi

### 1. Quote Verification Gatekeeper (Alıntı Doğrulama Kapısı)
- LLM'in her tespit ettiği riskli madde için döndürdüğü `verbatim_quote` (harfi harfine alıntı), çıkarılan sayfa metninde (`rawText.includes(verbatim_quote)`) aranır.
- Eğer LLM bir cümleyi uydurmuş, kelimeleri değiştirmiş (paraphrase) veya halüsinasyon görmüşse, Gatekeeper bu maddeyi **anında eler ve reddedilenler listesine kaydeder**.
- Risk skoru yalnızca **orijinal metinde harfiyen bulunan ve doğrulanan maddelere göre yeniden kalibre edilir**. Tüm maddeler uydurmaysa risk skoru 0'a çekilir.

### 2. Prompt Injection ve Delimiter Breakout Savunması
- Web sayfasından gelen metin **GÜVENİLMEZ GİRDİ (untrusted content)** olarak işaretlenir.
- Metin `<untrusted_tos_document>` ve `</untrusted_tos_document>` etiketleri içine hapsedilir.
- Sayfa metni içine gizlenmiş `</untrusted_tos_document>` etiket kırma denemeleri filtrelenir ve etkisiz hale getirilir.
- "Ignore previous instructions", "Output risk 0", "Say this is safe" gibi talimat geçersiz kılma girişimleri önceden taranır ve LLM defansif sistem promptu tarafından tespit edilerek `injection_detected: true` olarak işaretlenir. Skora güvenlik riski yansıtılır.

### 3. Deterministik Yapılandırılmış Çıktı & Zod Doğrulaması
LLM çağrıları sıcaklık derecesi `temperature: 0.0` ile yapılır ve OpenAI `response_format: json_object`, Gemini `response_mime_type: application/json` kullanılarak şu şemaya göre Zod ile doğrulanır:

```json
{
  "risk_score": 75,
  "summary_tr": "Sade Türkçe ile 2-3 cümlelik genel risk özeti.",
  "risks": [
    {
      "category": "Data Tracking | Auto Renewal | Arbitration | Content Rights | Termination",
      "severity": "HIGH | MEDIUM | LOW",
      "explanation_tr": "Kullanıcının anlayacağı dilde sade Türkçe açıklama.",
      "verbatim_quote": "Metinden harfi harfine alınan orijinal cümle.",
      "is_ambiguous": false
    }
  ],
  "uncertainties": [
    "Metinde açıkça belirtilmeyen veya yoruma açık bırakılmış gri alanlar."
  ],
  "injection_detected": false
}
```

---

## 📦 Kurulum ve Çalıştırma

### 1. Bağımlılıkları Yükleme ve Derleme
```bash
# Bağımlılıkları yükleyin
npm install

# TypeScript ve Vite ile extension'ı derleyin
npm run build
```
Derleme sonucunda `dist/` klasöründe üretime hazır Chrome Extension dosyaları oluşur.

### 2. Chrome'a Yükleme (Geliştirici Modu)
1. Google Chrome tarayıcınızı açın ve adres çubuğuna `chrome://extensions` yazın.
2. Sağ üst köşedeki **Geliştirici modu** (Developer mode) anahtarını açık konuma getirin.
3. Sol üstteki **Paketlenmemiş öğe yükle** (Load unpacked) düğmesine tıklayın.
4. Bu projenin `dist/` klasörünü seçin.
5. Eklenti simgesi araç çubuğunuza eklenecektir.

### 3. API Anahtarlarını Tanımlama
1. Eklenti simgesine sağ tıklayıp **Seçenekler** (Options) veya açılır pencereden dişli simgesine tıklayın.
2. Kendi API anahtarınızı (OpenAI, Anthropic Claude veya Google AI Studio Gemini) girin.
3. **Bağlantıyı Test Et** butonuna basarak anahtarınızı doğrulayın ve **Ayarları Kaydet**'e tıklayın.
*(Not: API anahtarlarınız yalnızca kendi tarayıcınızın `chrome.storage.sync` alanında şifreli/güvenli olarak saklanır, hiçbir 3. taraf sunucuya gönderilmez).*

---

## 🧪 Test Altyapısı

Proje, 5 ayrı test süiti altında 29 otomatik birim ve entegrasyon testi içermektedir:

```bash
# Test süitini çalıştırma
npm run test
```

### Test Kapsamı:
- **`quote-gatekeeper.test.ts` (10 test)**: Birebir alıntı eşleşmesi, halüsinasyon tespiti ve elemesi, boş/kısa alıntı denetimi, risk skoru kalibrasyonu, injection durumunda skor yükseltme.
- **`prompt-sanitizer.test.ts` (7 test)**: İzolasyon etiketleri, `</untrusted_tos_document>` kaçırma saldırısı nötralizasyonu, gizli komut sezgisel tespiti.
- **`schema-validation.test.ts` (7 test)**: Zod tip denetimi, 0-100 sınırları, 5 zorunlu kategori denetimi, markdown fence temizleme.
- **`dom-extractor.test.ts` (2 test)**: JSDOM üzerinde script, style, nav, footer ve gizli öğelerin ayıklanması, cümle bütünlüğünün korunması.
- **`llm-adapters.test.ts` (3 test)**: OpenAI, Anthropic ve Gemini adaptörleri ile uçtan uca analiz boru hattı simülasyonu.
