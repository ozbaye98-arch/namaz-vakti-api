const fs = require('fs');
const path = require('path');
const axios = require('axios');

// --- AYARLAR ---
const ILCELER_DOSYA_YOLU = path.join(__dirname, 'data', 'ilceler_koordinatli.json');
const CIKTI_KLASORU = path.join(__dirname, 'aylik_veri');
const HATA_LOG_DOSYASI = path.join(__dirname, 'basarisiz_ilceler.log');
const BEKLEME_SURESI_MS = 1500; // Her istek arası 1.5 saniye bekle (API'yi yormamak için)
const MAX_RETRY = 3; // Başarısız olursa tekrar deneme sayısı
const REQUEST_TIMEOUT = 10000; // 10 saniye timeout

// Çıktı klasörü yoksa oluştur
if (!fs.existsSync(CIKTI_KLASORU)) {
    fs.mkdirSync(CIKTI_KLASORU, { recursive: true });
}

// İlçeleri yükle
let ilceler = [];
try {
    const dosyaIcerik = fs.readFileSync(ILCELER_DOSYA_YOLU, 'utf-8');
    ilceler = JSON.parse(dosyaIcerik);
    
    if (!Array.isArray(ilceler) || ilceler.length === 0) {
        throw new Error('İlçeler listesi boş veya geçersiz format!');
    }
    
    console.log(`✓ ${ilceler.length} ilçe başarıyla yüklendi.`);
} catch (error) {
    console.error(`HATA: ${ILCELER_DOSYA_YOLU} dosyası okunamadı!`);
    console.error(`Detay: ${error.message}`);
    process.exit(1);
}

// Progress bar gösterimi
function progressBar(current, total) {
    const percentage = Math.floor((current / total) * 100);
    const filled = Math.floor(percentage / 2);
    const empty = 50 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    process.stdout.write(`\r[${bar}] ${percentage}% (${current}/${total})`);
}

// Axios ile GET (timeout ve basit hata raporlama)
async function axiosGet(url, timeout = REQUEST_TIMEOUT) {
    try {
        const response = await axios.get(url, {
            timeout,
            headers: {
                Accept: 'application/json',
                'User-Agent': 'namaz-vakti-fetcher/2.0'
            },
            maxRedirects: 5
        });

        return response; // axios already parses JSON to response.data
    } catch (error) {
        // normalize axios error shape
        throw error;
    }
}

// API'den gelen veriyi doğrula
function veriDogrula(data) {
    if (!data || !Array.isArray(data)) {
        return false;
    }
    
    // En az bir günlük veri olmalı ve gerekli alanlar mevcut olmalı
    if (data.length === 0) {
        return false;
    }
    
    const ilkGun = data[0];
    return ilkGun.timings && 
           ilkGun.timings.Fajr && 
           ilkGun.timings.Dhuhr && 
           ilkGun.timings.Asr && 
           ilkGun.timings.Maghrib && 
           ilkGun.timings.Isha;
}

// Aladhan API'den veri çeken fonksiyon
async function takvimiGetir(ilce, ay, yil) {
    const { latitude, longitude, ilce_adi } = ilce;

    if (!latitude || !longitude) {
        console.log(`[UYARI] ${ilce_adi} için koordinat bulunamadı, atlanıyor.`);
        return null;
    }

    const apiUrl = `https://api.aladhan.com/v1/calendar/${yil}/${String(ay).padStart(2, '0')}?latitude=${latitude}&longitude=${longitude}&method=13`;

    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
        try {
            const response = await axiosGet(apiUrl, REQUEST_TIMEOUT);

            const status = response.status;
            if (status === 200 && response.data) {
                const json = response.data;

                // API'nin beklenen schema'sı { code: ..., status: 'OK', data: [...] }
                const payload = json.data || json;

                if (veriDogrula(payload)) {
                    return payload;
                } else {
                    console.error(`[HATA] ${ilce_adi} için geçersiz veri formatı alındı.`);
                    basarisizLogla(ilce, 'Geçersiz veri formatı');
                    return null;
                }
            }

            if (status === 429) {
                console.error(`[HATA] ${ilce_adi} için rate limit aşıldı. (Deneme ${attempt})`);
                // Uzun bir bekleme uygula
                await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
                continue;
            }

            console.error(`[HATA] ${ilce_adi} için HTTP ${status} kodu alındı. (Deneme ${attempt})`);

        } catch (error) {
            // Axios error handling
            if (error.code === 'ECONNABORTED') {
                console.error(`[HATA] ${ilce_adi} için timeout (${REQUEST_TIMEOUT}ms) aşıldı. (Deneme ${attempt})`);
            } else if (error.response) {
                console.error(`[HATA] ${ilce_adi} için HTTP ${error.response.status} - ${JSON.stringify(error.response.data).substring(0,200)} (Deneme ${attempt})`);
            } else {
                console.error(`[HATA] ${ilce_adi} için istek başarısız: ${error.message} (Deneme ${attempt})`);
            }

            basarisizLogla(ilce, `Istek hatasi: ${error.message}`);
        }

        // Exponential backoff before retry
        if (attempt < MAX_RETRY) {
            const waitMs = 2000 * attempt;
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }
    }

    return null;
}

// Başarısız ilçeleri logla
function basarisizLogla(ilce, sebep) {
    const logMesaj = `[${new Date().toISOString()}] ${ilce.ilce_adi}, ${ilce.sehir_adi} - Sebep: ${sebep}\n`;
    fs.appendFileSync(HATA_LOG_DOSYASI, logMesaj, 'utf-8');
}

// 12 ay listesi oluştur (mevcut ay + gelecek 11 ay)
function gelecek3AyListesi() {
    const aylar = [];
    const bugun = new Date();
    
    // Sadece 3 ay: Mevcut ay + 2 gelecek ay
    for (let i = 0; i < 3; i++) {
        const tarih = new Date(bugun.getFullYear(), bugun.getMonth() + i, 1);
        aylar.push({
            ay: tarih.getMonth() + 1,
            yil: tarih.getFullYear(),
            label: `${String(tarih.getMonth() + 1).padStart(2, '0')}/${tarih.getFullYear()}`
        });
    }
    
    return aylar;
}

// Ana fonksiyon
async function main() {
    console.log("╔═══════════════════════════════════════════════════╗");
    console.log("║  Aylık Namaz Vakti Veri Çekici v3.0              ║");
    console.log("║  🔄 3 Aylık Veri Toplama (Hızlı & Verimli)       ║");
    console.log("╚═══════════════════════════════════════════════════╝\n");
    
    const ayListesi = gelecek3AyListesi();
    
    console.log(`📅 Çekilecek Aylar:`);
    ayListesi.forEach((ayInfo, idx) => {
        console.log(`   ${idx + 1}. ${ayInfo.label}`);
    });
    console.log(`\n📍 Her ay için ${ilceler.length} ilçe işlenecek...`);
    console.log(`⏱️  Tahmini süre: ${((ilceler.length * ayListesi.length * BEKLEME_SURESI_MS) / 1000 / 60).toFixed(0)} dakika\n`);
    
    // Önceki hata logunu temizle
    if (fs.existsSync(HATA_LOG_DOSYASI)) {
        fs.unlinkSync(HATA_LOG_DOSYASI);
    }
    
    const baslangicZamani = Date.now();
    const toplamIslem = ilceler.length * ayListesi.length;
    let tamamlananIslem = 0;
    let toplamBasarili = 0;
    let toplamBasarisiz = 0;
    const basarisizIlceler = [];
    
    // Her ay için işlem yap
    for (const ayInfo of ayListesi) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📆 ${ayInfo.label} ayı işleniyor...`);
        console.log('='.repeat(60));
        
        let ayBasarili = 0;
        let ayBasarisiz = 0;
        
        for (let i = 0; i < ilceler.length; i++) {
            const ilce = ilceler[i];
            const ilceAdi = ilce.ilce_adi
                .toLowerCase()
                .replace(/ı/g, 'i')
                .replace(/ğ/g, 'g')
                .replace(/ü/g, 'u')
                .replace(/ş/g, 's')
                .replace(/ö/g, 'o')
                .replace(/ç/g, 'c')
                .replace(/i̇/g, 'i')
                .replace(/\s+/g, '_');
            
            // Dosya formatı: {ilce_adi}_{yil}_{ay}.json
            const dosyaAdi = `${ilceAdi}_${ayInfo.yil}_${String(ayInfo.ay).padStart(2, '0')}.json`;
            const dosyaYolu = path.join(CIKTI_KLASORU, dosyaAdi);
            
            // Eğer dosya zaten varsa atla (yeniden çekme)
            if (fs.existsSync(dosyaYolu)) {
                tamamlananIslem++;
                ayBasarili++;
                toplamBasarili++;
                progressBar(tamamlananIslem, toplamIslem);
                process.stdout.write(` | ✓ Var: ${ilce.ilce_adi} (${ayInfo.label})`);
                continue;
            }
            
            progressBar(tamamlananIslem, toplamIslem);
            process.stdout.write(` | ⏳ ${ilce.ilce_adi} (${ayInfo.label})`);
            
            const data = await takvimiGetir(ilce, ayInfo.ay, ayInfo.yil);
            
            if (data) {
                try {
                    fs.writeFileSync(dosyaYolu, JSON.stringify(data, null, 2), 'utf-8');
                    ayBasarili++;
                    toplamBasarili++;
                } catch (writeError) {
                    console.error(`\n[HATA] ${ilce.ilce_adi} (${ayInfo.label}) dosyası yazılamadı: ${writeError.message}`);
                    basarisizIlceler.push(`${ilce.ilce_adi} (${ayInfo.label})`);
                    basarisizLogla(ilce, `${ayInfo.label} - Dosya yazma hatası: ${writeError.message}`);
                    ayBasarisiz++;
                    toplamBasarisiz++;
                }
            } else {
                basarisizIlceler.push(`${ilce.ilce_adi} (${ayInfo.label})`);
                basarisizLogla(ilce, `${ayInfo.label} - API'den veri alınamadı`);
                ayBasarisiz++;
                toplamBasarisiz++;
            }
            
            tamamlananIslem++;
            
            // API limitlerine takılmamak için her istekten sonra bekle
            if (i < ilceler.length - 1 || ayInfo !== ayListesi[ayListesi.length - 1]) {
                await new Promise(resolve => setTimeout(resolve, BEKLEME_SURESI_MS));
            }
        }
        
        console.log(`\n✅ ${ayInfo.label}: Başarılı ${ayBasarili}, Başarısız ${ayBasarisiz}`);
    }
    
    progressBar(toplamIslem, toplamIslem);
    console.log('\n');
    
    const bitisZamani = Date.now();
    const sure = (bitisZamani - baslangicZamani) / 1000 / 60;
    
    console.log("\n╔═══════════════════════════════════════════════════╗");
    console.log("║              İŞLEM TAMAMLANDI!                    ║");
    console.log("╚═══════════════════════════════════════════════════╝");
    console.log(`⏱️  Toplam Süre: ${sure.toFixed(2)} dakika`);
    console.log(`✅ Toplam Başarılı: ${toplamBasarili}`);
    console.log(`❌ Toplam Başarısız: ${toplamBasarisiz}`);
    console.log(`📁 Veriler "${CIKTI_KLASORU}" klasörüne kaydedildi.`);
    console.log(`📊 Toplam dosya: ${toplamBasarili} (12 ay × ${ilceler.length} ilçe)`);
    
    if (toplamBasarisiz > 0) {
        console.log(`\n⚠️  Başarısız işlemler "${HATA_LOG_DOSYASI}" dosyasına kaydedildi.`);
        console.log(`\nBaşarısız İlçeler (${basarisizIlceler.length}):`);
        basarisizIlceler.slice(0, 20).forEach((ilce, idx) => {
            console.log(`  ${idx + 1}. ${ilce}`);
        });
        if (basarisizIlceler.length > 20) {
            console.log(`  ... ve ${basarisizIlceler.length - 20} tane daha`);
        }
    }
    
    // Özet istatistikler
    const basariOrani = ((toplamBasarili / toplamIslem) * 100).toFixed(1);
    console.log(`\n📊 Başarı Oranı: %${basariOrani}`);
    console.log(`📅 Kapsam: ${ayListesi[0].label} - ${ayListesi[ayListesi.length - 1].label}`);
}

// Hata yakalama
process.on('unhandledRejection', (error) => {
    console.error('\n[KRİTİK HATA] İşlenmeyen Promise reddi:', error);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('\n[KRİTİK HATA] Yakalanmamış istisna:', error);
    process.exit(1);
});

main().catch(error => {
    console.error('\n[KRİTİK HATA] Ana fonksiyon hatası:', error);
    process.exit(1);
});