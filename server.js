const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware'ler
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS desteği
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    next();
});

// Request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url} - IP: ${req.ip}`);
    next();
});

// Koordinatlı ilçe verilerini sunucu başlarken bir kere belleğe alalım.
const ilcelerDataPath = path.join(__dirname, 'data', 'ilceler_koordinatli.json');
let ilceler = [];
let ilceIndex = new Map(); // Hızlı arama için index

try {
    ilceler = JSON.parse(fs.readFileSync(ilcelerDataPath, 'utf-8'));
    
    // Hızlı arama için index oluştur
    ilceler.forEach(ilce => {
        const normalizedName = normalizeString(ilce.ilce_adi);
        ilceIndex.set(normalizedName, ilce);
        
        // Alternatif aramalar için ek indexler
        ilceIndex.set(ilce.ilce_adi.toLowerCase(), ilce);
        ilceIndex.set(ilce.ilce_adi.toUpperCase(), ilce);
    });
    
    console.log(`✓ ${ilceler.length} ilçe koordinatı başarıyla yüklendi.`);
    console.log(`✓ İlçe arama indexi oluşturuldu.`);
} catch (error) {
    console.error("HATA: ilceler_koordinatli.json dosyası okunamadı!", error);
    process.exit(1); // Dosya yoksa sunucu başlamasın.
}

// Türkçe karakter normalizasyonu için yardımcı fonksiyon
function normalizeString(str) {
    if (!str || typeof str !== 'string') return '';
    
    return str
        .toLowerCase()
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/i̇/g, 'i')
        .trim();
}

// URL-safe string oluşturma fonksiyonu
function createUrlSafeString(str) {
    if (!str || typeof str !== 'string') return '';
    
    return str
        .replace(/ğ/g, 'g')
        .replace(/Ğ/g, 'G')
        .replace(/ü/g, 'u')
        .replace(/Ü/g, 'U')
        .replace(/ş/g, 's')
        .replace(/Ş/g, 'S')
        .replace(/ı/g, 'i')
        .replace(/I/g, 'I')
        .replace(/ö/g, 'o')
        .replace(/Ö/g, 'O')
        .replace(/ç/g, 'c')
        .replace(/Ç/g, 'C')
        .replace(/i̇/g, 'i')
        .replace(/İ/g, 'I')
        .replace(/\s+/g, '%20') // Boşlukları URL encoding
        .trim();
}

// Axios ile API çağrısı (redirect desteği ile)
async function fetchPrayerTimes(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'NamazVaktiSunucusu/2.0'
            },
            timeout: 10000,
            maxRedirects: 5 // Redirect'leri takip et
        });
        
        console.log(`[API Response] Status: ${response.status}, Data available: ${!!response.data}`);
        
        return {
            ok: response.status === 200,
            statusCode: response.status,
            json: response.data
        };
    } catch (error) {
        console.log(`[API Error] ${error.message}`);
        if (error.response) {
            console.log(`[API Error] Response status: ${error.response.status}`);
            console.log(`[API Error] Response data: ${JSON.stringify(error.response.data).substring(0, 200)}`);
        }
        throw error;
    }
}

// İlçe adından koordinatları bulan gelişmiş fonksiyon
function getCoords(ilceAdi) {
    if (!ilceAdi || typeof ilceAdi !== 'string') {
        return null;
    }
    
    const normalizedInput = normalizeString(ilceAdi);
    
    // Önce index'ten ara
    let found = ilceIndex.get(normalizedInput);
    if (found) return found;
    
    // Index'te bulamazsa alternatif aramalar
    found = ilceIndex.get(ilceAdi.toLowerCase());
    if (found) return found;
    
    found = ilceIndex.get(ilceAdi.toUpperCase());
    if (found) return found;
    
    // Son çare: manuel arama
    return ilceler.find(ilce => {
        const normalizedIlce = normalizeString(ilce.ilce_adi);
        return normalizedIlce === normalizedInput ||
               ilce.ilce_adi.toLowerCase() === ilceAdi.toLowerCase() ||
               ilce.ilce_adi.toUpperCase() === ilceAdi.toUpperCase();
    });
}

// Cache temizleme fonksiyonu
function cleanOldCache() {
    const cacheFolderPath = path.join(__dirname, 'cache');
    if (!fs.existsSync(cacheFolderPath)) return;
    
    const files = fs.readdirSync(cacheFolderPath);
    const today = new Date().toDateString();
    
    files.forEach(file => {
        const filePath = path.join(cacheFolderPath, file);
        const stats = fs.statSync(filePath);
        const fileDate = new Date(stats.mtime).toDateString();
        
        if (fileDate !== today) {
            fs.unlinkSync(filePath);
            console.log(`[Cache] Eski cache dosyası silindi: ${file}`);
        }
    });
}

// Ana API rotamız: /vakitler/:ilceAdi
app.get("/vakitler/:ilceAdi", async (req, res) => {
    try {
        // URL decode işlemi
        const ilceAdiParam = decodeURIComponent(req.params.ilceAdi);
        console.log(`[Request] İstenen ilçe: "${ilceAdiParam}"`);
        
        // Önbellek için klasör yolu
        const cacheFolderPath = path.join(__dirname, 'cache');
        const cacheFileName = normalizeString(ilceAdiParam) + '.json';
        const filePath = path.join(cacheFolderPath, cacheFileName);

        // Cache klasörü yoksa oluştur
        if (!fs.existsSync(cacheFolderPath)) {
            fs.mkdirSync(cacheFolderPath, { recursive: true });
        }

        // 1. ÖNBELLEK KONTROLÜ
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            const fileDate = new Date(stats.mtime).toDateString();
            const todayDate = new Date().toDateString();

            if (fileDate === todayDate) {
                console.log(`[Cache] ${ilceAdiParam} verisi önbellekten okunuyor.`);
                const data = fs.readFileSync(filePath, 'utf-8');
                const parsedData = JSON.parse(data);
                
                return res.json({
                    success: true,
                    source: 'cache',
                    ilce: ilceAdiParam,
                    data: parsedData
                });
            }
        }

        // 2. İLÇE BİLGİSİ BULMA
        const ilceBilgisi = getCoords(ilceAdiParam);

        if (!ilceBilgisi || !ilceBilgisi.latitude || !ilceBilgisi.longitude) {
            console.log(`[Error] İlçe bulunamadı: "${ilceAdiParam}"`);
            return res.status(404).json({ 
                success: false,
                error: "İlçe bulunamadı veya koordinatları eksik.",
                searchedFor: ilceAdiParam,
                suggestion: "İlçe adını kontrol ediniz. Türkçe karakterler desteklenmektedir."
            });
        }

        console.log(`[Found] İlçe bulundu: ${ilceBilgisi.ilce_adi}, ${ilceBilgisi.sehir_adi}`);
        console.log(`[Coordinates] Lat: ${ilceBilgisi.latitude}, Lng: ${ilceBilgisi.longitude}`);

        // 3. API URL OLUŞTURMA (Türkçe karakter problemini çöz)
        const urlSafeCity = createUrlSafeString(ilceBilgisi.ilce_adi);
        const urlSafeCountry = 'Turkey';
        
        // Aladhan API için optimize edilmiş URL
        const apiUrl = `https://api.aladhan.com/v1/timings?latitude=${ilceBilgisi.latitude}&longitude=${ilceBilgisi.longitude}&method=13&tune=0,0,0,0,0,0,0`;
        
        console.log(`[API] URL: ${apiUrl}`);

        // 4. VERİYİ API'DEN ÇEKME
        console.log(`[API] ${ilceAdiParam} verisi Aladhan'dan çekiliyor...`);
        
        const apiResponse = await fetchPrayerTimes(apiUrl);
        
        if (!apiResponse.ok) {
            throw new Error(`API Response Error: ${apiResponse.statusCode || 'Unknown'}`);
        }

        const json = apiResponse.json;
        
        if (!json.data || !json.data.timings) {
            throw new Error('API response format is invalid');
        }

        // 5. VERİYİ KAYDETME VE DÖNDÜRME
        const responseData = {
            ...json.data,
            location: {
                ilce: ilceBilgisi.ilce_adi,
                sehir: ilceBilgisi.sehir_adi,
                coordinates: {
                    latitude: ilceBilgisi.latitude,
                    longitude: ilceBilgisi.longitude
                }
            },
            source: 'api',
            cachedAt: new Date().toISOString()
        };

        fs.writeFileSync(filePath, JSON.stringify(responseData, null, 2), 'utf-8');
        console.log(`[Save] ${ilceAdiParam} verisi başarıyla önbelleğe kaydedildi.`);
        
        res.json({
            success: true,
            source: 'api',
            ilce: ilceAdiParam,
            data: responseData
        });

    } catch (error) {
        console.error("API işleminde hata:", error);
        
        // Detaylı hata mesajı
        let errorMessage = "Bilinmeyen bir hata oluştu.";
        let statusCode = 500;
        
        if (error.message.includes('fetch')) {
            errorMessage = "Dış API'ye ulaşılamıyor. İnternet bağlantınızı kontrol ediniz.";
            statusCode = 503;
        } else if (error.message.includes('timeout')) {
            errorMessage = "API yanıt süresi aşıldı. Lütfen tekrar deneyiniz.";
            statusCode = 408;
        } else if (error.message.includes('API Response Error')) {
            errorMessage = "Dış API'den geçersiz yanıt alındı.";
            statusCode = 502;
        }
        
        res.status(statusCode).json({ 
            success: false,
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
    }
});

// İlçe listesi endpoint'i
app.get("/ilceler", (req, res) => {
    try {
        const ilceListesi = ilceler.map(ilce => ({
            ilce_adi: ilce.ilce_adi,
            sehir_adi: ilce.sehir_adi,
            normalized_name: normalizeString(ilce.ilce_adi)
        }));
        
        res.json({
            success: true,
            count: ilceListesi.length,
            data: ilceListesi
        });
    } catch (error) {
        console.error("İlçe listesi getirme hatası:", error);
        res.status(500).json({ 
            success: false,
            error: "İlçe listesi alınamadı." 
        });
    }
});

// İlçe arama endpoint'i
app.get("/ara/:arama", (req, res) => {
    try {
        const arama = decodeURIComponent(req.params.arama);
        const normalizedArama = normalizeString(arama);
        
        const bulunanlar = ilceler.filter(ilce => {
            const normalizedIlce = normalizeString(ilce.ilce_adi);
            const normalizedSehir = normalizeString(ilce.sehir_adi);
            
            return normalizedIlce.includes(normalizedArama) || 
                   normalizedSehir.includes(normalizedArama) ||
                   ilce.ilce_adi.toLowerCase().includes(arama.toLowerCase()) ||
                   ilce.sehir_adi.toLowerCase().includes(arama.toLowerCase());
        });
        
        res.json({
            success: true,
            searchTerm: arama,
            count: bulunanlar.length,
            data: bulunanlar.slice(0, 50) // İlk 50 sonuç
        });
    } catch (error) {
        console.error("Arama hatası:", error);
        res.status(500).json({ 
            success: false,
            error: "Arama işlemi başarısız." 
        });
    }
});

// Health check endpoint'i
app.get("/health", (req, res) => {
    res.json({
        success: true,
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        ilceCount: ilceler.length
    });
});

// Ana sayfa - Web Arayüzü
app.get("/", (req, res) => {
    const htmlContent = `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Namaz Vakti API - Türkiye</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(45deg, #2193b0, #6dd5ed);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        
        .header p {
            font-size: 1.2em;
            opacity: 0.9;
        }
        
        .search-section {
            padding: 40px;
            text-align: center;
        }
        
        .search-box {
            position: relative;
            max-width: 600px;
            margin: 0 auto 30px;
        }
        
        #searchInput {
            width: 100%;
            padding: 20px 60px 20px 20px;
            font-size: 18px;
            border: 3px solid #e0e0e0;
            border-radius: 50px;
            outline: none;
            transition: all 0.3s ease;
            background: #f8f9fa;
        }
        
        #searchInput:focus {
            border-color: #667eea;
            box-shadow: 0 0 20px rgba(102, 126, 234, 0.2);
            background: white;
        }
        
        .search-btn {
            position: absolute;
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
            background: linear-gradient(45deg, #667eea, #764ba2);
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 25px;
            cursor: pointer;
            font-size: 16px;
            transition: all 0.3s ease;
        }
        
        .search-btn:hover {
            transform: translateY(-50%) scale(1.05);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }
        
        .suggestions {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            max-height: 300px;
            overflow-y: auto;
            display: none;
        }
        
        .suggestion {
            padding: 15px 20px;
            border-bottom: 1px solid #f0f0f0;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .suggestion:hover {
            background: #f8f9fa;
            transform: translateX(5px);
        }
        
        .suggestion:last-child {
            border-bottom: none;
        }
        
        .ilce-name {
            font-weight: 600;
            color: #333;
        }
        
        .sehir-name {
            color: #666;
            font-size: 0.9em;
        }
        
        .result-section {
            padding: 40px;
            display: none;
        }
        
        .prayer-card {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            padding: 30px;
            border-radius: 20px;
            margin-bottom: 30px;
            text-align: center;
            box-shadow: 0 15px 35px rgba(240, 147, 251, 0.3);
        }
        
        .prayer-card h2 {
            font-size: 2em;
            margin-bottom: 10px;
        }
        
        .prayer-times {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-top: 30px;
        }
        
        .prayer-time {
            background: white;
            color: #333;
            padding: 25px;
            border-radius: 15px;
            text-align: center;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            transition: transform 0.3s ease;
        }
        
        .prayer-time:hover {
            transform: translateY(-5px);
        }
        
        .prayer-name {
            font-weight: 600;
            color: #667eea;
            font-size: 1.2em;
            margin-bottom: 10px;
        }
        
        .prayer-clock {
            font-size: 2em;
            font-weight: bold;
            color: #333;
        }
        
        .loading {
            text-align: center;
            padding: 40px;
            display: none;
        }
        
        .spinner {
            width: 50px;
            height: 50px;
            border: 5px solid #f3f3f3;
            border-top: 5px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .error {
            background: linear-gradient(135deg, #ff6b6b, #ee5a52);
            color: white;
            padding: 20px;
            border-radius: 15px;
            margin: 20px 0;
            text-align: center;
            display: none;
        }
        
        .stats {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #666;
        }
        
        .api-info {
            background: #e8f4fd;
            padding: 30px;
            margin-top: 30px;
            border-radius: 15px;
            border-left: 5px solid #667eea;
        }
        
        .endpoint {
            background: #2d3748;
            color: #68d391;
            padding: 10px 15px;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            margin: 10px 0;
            font-size: 0.9em;
        }
        
        @media (max-width: 768px) {
            .container {
                margin: 10px;
                border-radius: 15px;
            }
            
            .header {
                padding: 20px;
            }
            
            .header h1 {
                font-size: 2em;
            }
            
            .search-section {
                padding: 20px;
            }
            
            .prayer-times {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🕌 Namaz Vakti API</h1>
            <p>Türkiye'nin tüm ilçeleri için güncel namaz vakitleri</p>
        </div>
        
        <div class="search-section">
            <div class="search-box">
                <input 
                    type="text" 
                    id="searchInput" 
                    placeholder="İlçe veya şehir adı yazın... (örn: Beyoğlu, İstanbul)"
                    autocomplete="off"
                >
                <button class="search-btn" onclick="searchPrayerTimes()">🔍 Ara</button>
            </div>
            
            <div id="suggestions" class="suggestions"></div>
            
            <div id="loading" class="loading">
                <div class="spinner"></div>
                <p>Namaz vakitleri getiriliyor...</p>
            </div>
            
            <div id="error" class="error"></div>
        </div>
        
        <div id="results" class="result-section">
            <!-- Sonuçlar buraya gelecek -->
        </div>
        
        <div class="api-info">
            <h3>📋 API Kullanımı</h3>
            <p><strong>Toplam İlçe Sayısı:</strong> ${ilceler.length}</p>
            <div class="endpoint">GET /vakitler/{ilce_adi}</div>
            <div class="endpoint">GET /ara/{arama_terimi}</div>
            <div class="endpoint">GET /ilceler</div>
            <p style="margin-top: 15px;"><em>Türkçe karakterler desteklenmektedir.</em></p>
        </div>
        
        <div class="stats">
            <p>🚀 Server v2.0.0 | 📊 ${ilceler.length} İlçe | 🔄 Günlük Cache | ⚡ Hızlı Arama</p>
        </div>
    </div>

    <script>
        let searchTimeout;
        const searchInput = document.getElementById('searchInput');
        const suggestions = document.getElementById('suggestions');
        const loading = document.getElementById('loading');
        const error = document.getElementById('error');
        const results = document.getElementById('results');

        // Arama input'una yazılırken
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            const query = this.value.trim();
            
            if (query.length < 2) {
                suggestions.style.display = 'none';
                return;
            }
            
            searchTimeout = setTimeout(() => {
                searchSuggestions(query);
            }, 300);
        });

        // Enter tuşu ile arama
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchPrayerTimes();
            }
        });

        // Önerileri getir
        async function searchSuggestions(query) {
            try {
                const response = await fetch(\`/ara/\${encodeURIComponent(query)}\`);
                const data = await response.json();
                
                if (data.success && data.data.length > 0) {
                    showSuggestions(data.data.slice(0, 10));
                } else {
                    suggestions.style.display = 'none';
                }
            } catch (err) {
                console.error('Öneri arama hatası:', err);
                suggestions.style.display = 'none';
            }
        }

        // Önerileri göster
        function showSuggestions(items) {
            suggestions.innerHTML = '';
            
            items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'suggestion';
                div.innerHTML = \`
                    <span class="ilce-name">\${item.ilce_adi}</span>
                    <span class="sehir-name">\${item.sehir_adi}</span>
                \`;
                
                div.addEventListener('click', () => {
                    searchInput.value = item.ilce_adi;
                    suggestions.style.display = 'none';
                    searchPrayerTimes();
                });
                
                suggestions.appendChild(div);
            });
            
            suggestions.style.display = 'block';
        }

        // Namaz vakitlerini ara
        async function searchPrayerTimes() {
            const query = searchInput.value.trim();
            
            if (!query) {
                showError('Lütfen bir ilçe veya şehir adı girin.');
                return;
            }
            
            suggestions.style.display = 'none';
            hideError();
            showLoading();
            
            try {
                const response = await fetch(\`/vakitler/\${encodeURIComponent(query)}\`);
                const data = await response.json();
                
                hideLoading();
                
                if (data.success) {
                    showResults(data);
                } else {
                    showError(data.error || 'Namaz vakitleri alınamadı.');
                }
                
            } catch (err) {
                hideLoading();
                showError('Bağlantı hatası. Lütfen tekrar deneyin.');
                console.error('API hatası:', err);
            }
        }

        // Sonuçları göster
        function showResults(data) {
            const timings = data.data.timings;
            const location = data.data.location;
            
            const prayerNames = {
                'Fajr': 'İmsak',
                'Sunrise': 'Güneş',
                'Dhuhr': 'Öğle', 
                'Asr': 'İkindi',
                'Maghrib': 'Akşam',
                'Isha': 'Yatsı'
            };
            
            const priorityPrayers = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
            
            let prayerTimesHtml = '';
            priorityPrayers.forEach(prayer => {
                if (timings[prayer]) {
                    prayerTimesHtml += \`
                        <div class="prayer-time">
                            <div class="prayer-name">\${prayerNames[prayer] || prayer}</div>
                            <div class="prayer-clock">\${timings[prayer]}</div>
                        </div>
                    \`;
                }
            });
            
            results.innerHTML = \`
                <div class="prayer-card">
                    <h2>📍 \${location.ilce}, \${location.sehir}</h2>
                    <p>📅 \${new Date().toLocaleDateString('tr-TR', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                    })}</p>
                    <p>🕐 Son güncelleme: \${new Date(data.data.cachedAt).toLocaleTimeString('tr-TR')}</p>
                </div>
                
                <div class="prayer-times">
                    \${prayerTimesHtml}
                </div>
                
                <div style="text-align: center; margin-top: 30px; color: #666;">
                    <p>📡 Kaynak: \${data.source === 'cache' ? 'Önbellek' : 'Aladhan API'}</p>
                    <p>🌍 Koordinatlar: \${location.coordinates.latitude.toFixed(4)}, \${location.coordinates.longitude.toFixed(4)}</p>
                </div>
            \`;
            
            results.style.display = 'block';
            results.scrollIntoView({ behavior: 'smooth' });
        }

        // Loading göster/gizle
        function showLoading() {
            loading.style.display = 'block';
            results.style.display = 'none';
        }

        function hideLoading() {
            loading.style.display = 'none';
        }

        // Hata göster/gizle  
        function showError(message) {
            error.textContent = message;
            error.style.display = 'block';
            results.style.display = 'none';
        }

        function hideError() {
            error.style.display = 'none';
        }

        // Sayfa dışına tıklandığında önerileri gizle
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.search-box')) {
                suggestions.style.display = 'none';
            }
        });
    </script>
</body>
</html>
    `;
    
    res.send(htmlContent);
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "Endpoint bulunamadı",
        path: req.path,
        method: req.method,
        availableEndpoints: ["/", "/vakitler/:ilceAdi", "/ilceler", "/ara/:arama", "/health"]
    });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error("Global hata:", error);
    res.status(500).json({
        success: false,
        error: "Sunucu hatası",
        timestamp: new Date().toISOString()
    });
});

// Sunucu başlatma
app.listen(PORT, () => {
    console.log(`🚀 Namaz vakti sunucusu çalışıyor: http://localhost:${PORT}`);
    console.log(`📊 Toplam ilçe sayısı: ${ilceler.length}`);
    console.log(`🕒 Sunucu başlama zamanı: ${new Date().toLocaleString('tr-TR')}`);
    console.log(`💾 Memory kullanımı: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
    
    // Başlangıçta eski cache dosyalarını temizle
    cleanOldCache();
    
    console.log("✅ Sunucu hazır!");
});