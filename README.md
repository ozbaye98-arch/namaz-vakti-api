# 🕌 Namaz Vakti API - Türkiye

Türkiye'deki **973 ilçe** için güncel namaz vakitleri sağlayan profesyonel REST API.

## ✨ Özellikler

- 🌍 **973 İlçe Desteği** - Tüm Türkiye kapsamı
- 🇹🇷 **Türkçe Karakter Desteği** - Tam Unicode uyumlu
- 🚀 **Hızlı Performans** - Index tabanlı arama
- 💾 **Akıllı Önbellek** - 3 katmanlı cache sistemi
- 📅 **3 Ay İleri Veri** - Hızlı ve verimli
- 🎨 **Modern Web Arayüzü** - Kullanıcı dostu arama
- ⚡ **Otomatik Güncelleme** - Aylık veri yenileme

## 📦 Kurulum

```bash
# Repoyu klonla
git clone https://github.com/ozbaye98-arch/namaz-vakti-api.git
cd namaz-vakti-api

# Bağımlılıkları yükle
npm install

# Sunucuyu başlat
npm start
```

## 🚀 Kullanım

### 1. Web Arayüzü

Tarayıcıda aç: `http://localhost:3000`

- İlçe/şehir adı yazın
- Canlı önerilerden seçin
- Güncel namaz vakitlerini görün

### 2. API Endpoints

#### 📍 Namaz Vakitlerini Al
```http
GET /vakitler/{ilce_adi}
```

**Örnek:**
```bash
curl http://localhost:3000/vakitler/BAYRAMPAŞA
```

**Yanıt:**
```json
{
  "success": true,
  "source": "monthly_data",
  "data": {
    "timings": {
      "Fajr": "05:47",
      "Sunrise": "07:18",
      "Dhuhr": "12:31",
      "Asr": "15:13",
      "Maghrib": "17:43",
      "Isha": "19:10"
    },
    "location": {
      "ilce": "BAYRAMPAŞA",
      "sehir": "İSTANBUL",
      "coordinates": {
        "latitude": 41.0345549,
        "longitude": 28.9118417
      }
    }
  }
}
```

#### 🔍 İlçe Ara
```http
GET /ara/{arama_terimi}
```

#### 📋 Tüm İlçeleri Listele
```http
GET /ilceler
```

#### 🏥 Sunucu Durumu
```http
GET /health
```

## 🔄 Veri Güncelleme Sistemi

### Manuel Güncelleme

**3 ay ileri veri çek (hızlı & verimli):**
```bash
node fetcher.js
```

Bu işlem:
- Mevcut ay + gelecek 2 ay = 3 ay veri çeker
- Her ilçe için ayrı dosya oluşturur (`aylik_veri/` klasöründe)
- Dosya formatı: `{ilce_adi}_{yil}_{ay}.json`
- **Toplam:** 973 ilçe × 3 ay = 2,919 dosya
- **Süre:** ~73 dakika (12 ay yerine %75 daha hızlı!)
- 2026 yılı geçişini otomatik destekler ✅

**Örnek dosya adları:**
- `bayrampaşa_2025_11.json` (Kasım 2025)
- `bayrampaşa_2025_12.json` (Aralık 2025)
- `bayrampaşa_2026_01.json` (Ocak 2026)

### Otomatik Güncelleme

**Auto-update servisini başlat:**
```bash
node auto-update.js
```

Bu servis:
- ✅ Her ayın **1. günü saat 02:00**'de otomatik çalışır
- ✅ 3 ay ileriye yeni veriler çeker (sürekli güncel kalır)
- ✅ HTTP endpoint ile manuel tetiklenebilir
- ✅ Log tutar (`auto-update.log`)

**Manuel tetikleme:**
```bash
curl http://localhost:3001/trigger-update
```

**Durum kontrolü:**
```bash
curl http://localhost:3001/status
```

## 📊 Cache Stratejisi

Server 3 katmanlı önbellek kullanır:

1. **Günlük Cache** (`cache/` klasörü)
   - Bugün için çekilen veriler
   - Her gün otomatik temizlenir

2. **Aylık Veri** (`aylik_veri/` klasörü)
   - Fetcher tarafından önceden çekilmiş
   - 3 ay ileri kapsama (yeterli buffer)
   - En hızlı kaynak ⚡

3. **Canlı API** (Aladhan API)
   - Aylık veri yoksa kullanılır
   - Otomatik retry mekanizması

## 📁 Klasör Yapısı

```
namaz-vakti-sunucusu/
├── server.js              # Ana API sunucusu
├── fetcher.js             # 3 aylık veri çekici (hızlı)
├── auto-update.js         # Otomatik güncelleme servisi
├── package.json           # Bağımlılıklar
├── data/
│   └── ilceler_koordinatli.json  # 973 ilçe koordinatları
├── cache/                 # Günlük cache (otomatik oluşur)
├── aylik_veri/            # 3 aylık veriler (fetcher oluşturur)
└── basarisiz_ilceler.log  # Hata logları
```

## 🛠️ Geliştirme

### Bağımlılıklar

```json
{
  "express": "^5.1.0",
  "axios": "^1.7.7",
  "node-schedule": "^2.1.1"
}
```

### Port Ayarları

- **API Server**: `3000` (PORT env değişkeni ile değiştirilebilir)
- **Auto-update**: `3001`

## 🌟 Özellik Detayları

### Türkçe Karakter Desteği ✅

Tüm Türkçe karakterler desteklenir:
- ğ, ü, ş, ı, ö, ç, İ
- URL encoding otomatik
- Normalizasyon fonksiyonları

### 2026 Yıl Geçişi ✅

**Bugün: 7 Kasım 2025**

Fetcher çalıştırıldığında:
- Kasım 2025 (mevcut ay)
- Aralık 2025 (gelecek ay)
- Ocak 2026 ✅ (yıl geçişi otomatik)

**Auto-update ile sürekli güncel:**
- Aralık ayında: Aralık 2025, Ocak 2026, Şubat 2026
- Ocak ayında: Ocak 2026, Şubat 2026, Mart 2026
- Sürekli 3 ay ilerisi hazır! 🔄

### API Rate Limiting

- Her istek arası **1.5 saniye** bekleme
- 3 retry denemesi
- Exponential backoff
- 429 (rate limit) hatalarını otomatik yönetim

## 📝 Lisans

ISC

## 👤 Geliştirici

- **GitHub**: [@ozbaye98-arch](https://github.com/ozbaye98-arch)
- **Repo**: [namaz-vakti-api](https://github.com/ozbaye98-arch/namaz-vakti-api)

## 🤝 Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing`)
3. Commit edin (`git commit -m 'Add amazing feature'`)
4. Push edin (`git push origin feature/amazing`)
5. Pull Request açın

## 🐛 Sorun Bildirme

GitHub Issues: https://github.com/ozbaye98-arch/namaz-vakti-api/issues

## 📞 Destek

Sorularınız için issue açın veya pull request gönderin!

---

**Not:** Bu proje [Aladhan API](https://aladhan.com/prayer-times-api) kullanmaktadır.
