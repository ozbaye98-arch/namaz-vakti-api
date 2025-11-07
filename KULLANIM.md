# 🚀 Hızlı Başlangıç Kılavuzu

## 📋 Sistem Özeti

### 3 Ana Bileşen

1. **`server.js`** - Ana API sunucusu (Port 3000)
2. **`fetcher.js`** - 12 aylık veri çekici (manuel/otomatik)
3. **`auto-update.js`** - Aylık otomatik güncelleme servisi (Port 3001)

## 🎯 Kullanım Senaryoları

### Senaryo 1: İlk Kurulum ve Başlatma

```bash
# 1. Bağımlılıkları yükle
npm install

# 2. İlk 12 aylık veriyi çek (opsiyonel ama önerilir)
npm run fetch
# ⏱️ Bu işlem ~30-60 dakika sürer (973 ilçe × 12 ay = 11,676 API çağrısı)

# 3. API sunucusunu başlat
npm start
```

### Senaryo 2: Sadece API Kullanımı

```bash
# Fetcher çalıştırmadan direk başlat
npm start

# Server canlı API'den veri çekecek (daha yavaş ama çalışır)
```

### Senaryo 3: Otomatik Güncelleme ile Üretim

```bash
# Terminal 1: API Server
npm start

# Terminal 2: Auto-update servisi
npm run auto-update
```

## 📊 Veri Akışı

```
┌─────────────────────────────────────────────────────────┐
│                    İstek Geldi                          │
│              (örn: /vakitler/BAYRAMPAŞA)               │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │  1. Günlük Cache?   │ ← cache/bayrampaşa.json
        │  (bugün mü?)        │
        └─────────┬───────────┘
                  │ YOK/ESKİ
                  ▼
        ┌─────────────────────┐
        │  2. Aylık Veri?     │ ← aylik_veri/bayrampaşa_2025_11.json
        │  (fetcher dosyası?) │
        └─────────┬───────────┘
                  │ YOK
                  ▼
        ┌─────────────────────┐
        │  3. Canlı API       │ ← https://api.aladhan.com
        │  (Aladhan)          │
        └─────────────────────┘
```

## 🗓️ Otomatik Güncelleme Takvimi

**Auto-update çalışma zamanı:** Her ayın 1. günü saat 02:00

```
Kasım 2025    → 1 Aralık 02:00 → Aralık 2025 - Kasım 2026 verisi çekilir
Aralık 2025   → 1 Ocak 02:00   → Ocak 2026 - Aralık 2026 verisi çekilir
Ocak 2026 ✅  → 1 Şubat 02:00  → Şubat 2026 - Ocak 2027 verisi çekilir
```

## 📁 Dosya Formatı

### Aylık Veri Dosyası
```
aylik_veri/bayrampaşa_2025_11.json
           ├─────────┘ │    │  │
           │           │    │  └─ Ay (01-12)
           │           │    └──── Yıl
           │           └───────── İlçe adı (normalize)
           └───────────────────── Klasör
```

### İçerik Yapısı
```json
[
  {
    "timings": {
      "Fajr": "05:47",
      "Sunrise": "07:18",
      "Dhuhr": "12:31",
      "Asr": "15:13",
      "Maghrib": "17:43",
      "Isha": "19:10"
    },
    "date": {
      "readable": "01 Nov 2025",
      "gregorian": {...}
    }
  },
  // ... 30 gün
]
```

## ⚙️ Konfigürasyon

### fetcher.js Ayarları
```javascript
const BEKLEME_SURESI_MS = 1500;  // İstekler arası bekleme (ms)
const MAX_RETRY = 3;              // Başarısız isteklerde tekrar sayısı
const REQUEST_TIMEOUT = 10000;    // API timeout (ms)
```

### auto-update.js Ayarları
```javascript
const CRON_ZAMANI = '0 2 1 * *'; // Dakika Saat Gün Ay HaftanınGünü
                                  // Her ayın 1'i saat 02:00
```

### server.js Ayarları
```javascript
const PORT = process.env.PORT || 3000; // API portu
```

## 🔧 Sorun Giderme

### Problem 1: Fetcher hiç veri çekemiyorsa

```bash
# Axios kurulu mu kontrol et
npm list axios

# Yoksa yükle
npm install axios

# Test et
node fetcher.js
```

### Problem 2: Server aylık veriyi kullanmıyorsa

```bash
# Aylık veri klasörünü kontrol et
ls aylik_veri/

# Bugünün dosyası var mı?
# Format: {ilce}_{yil}_{ay}.json
# Örnek: bayrampaşa_2025_11.json
```

### Problem 3: 2026 geçişi çalışıyor mu?

```bash
# Test scripti çalıştır
node test-dates.js

# Çıktı 2026 aylarını göstermeli:
# 1. 11/2025
# 2. 12/2025
# 3. 01/2026 ✅
# ...
```

## 📊 Performans Karşılaştırması

| Kaynak | İlk İstek | Cache'li İstek |
|--------|-----------|----------------|
| Aylık Veri (fetcher) | ~5ms | ~1ms |
| Günlük Cache | ~3ms | ~1ms |
| Canlı API | ~500-2000ms | ~3ms |

## 🎯 En İyi Pratikler

1. **✅ İlk kurulumda fetcher çalıştır**
   ```bash
   npm run fetch
   ```

2. **✅ Auto-update'i production'da kullan**
   ```bash
   npm run auto-update &
   npm start
   ```

3. **✅ PM2 ile arka planda çalıştır**
   ```bash
   pm2 start server.js --name "namaz-api"
   pm2 start auto-update.js --name "namaz-updater"
   ```

4. **✅ Log dosyalarını takip et**
   ```bash
   tail -f basarisiz_ilceler.log
   tail -f auto-update.log
   ```

## 🚨 Önemli Notlar

- ⚠️ Fetcher ilk çalıştırmada **30-60 dakika** sürer
- ⚠️ API rate limit: İstekler arası 1.5 saniye bekleme
- ⚠️ Her ay otomatik 12 ay ileri veri çekilir (sürekli kapsam)
- ✅ 2026 yıl geçişi **otomatik** desteklenir
- ✅ Dosya varsa tekrar çekilmez (incremental update)

## 📞 Yardım

Sorularınız için:
- GitHub Issues: https://github.com/ozbaye98-arch/namaz-vakti-api/issues
- README.md: Detaylı dokümantasyon

---

**Hızlı Test:**
```bash
# 1. Server başlat
npm start

# 2. Tarayıcıda aç
http://localhost:3000

# 3. Test et
curl http://localhost:3000/vakitler/istanbul
```
