const { spawn } = require('child_process');
const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');

// === AYARLAR ===
// Her ayın 1. günü saat 02:00'de çalıştır (gece yoğunluk az)
const CRON_ZAMANI = '0 2 1 * *'; // Dakika Saat Gün Ay HaftanınGünü

const LOG_DOSYASI = path.join(__dirname, 'auto-update.log');

// Log yazma fonksiyonu
function logYaz(mesaj) {
    const timestamp = new Date().toISOString();
    const logMesaj = `[${timestamp}] ${mesaj}\n`;
    
    console.log(logMesaj.trim());
    fs.appendFileSync(LOG_DOSYASI, logMesaj, 'utf-8');
}

// Fetcher'ı çalıştır
function fetcherCalistir() {
    return new Promise((resolve, reject) => {
        logYaz('🚀 Fetcher.js başlatılıyor...');
        
        const fetcher = spawn('node', ['fetcher.js'], {
            cwd: __dirname,
            stdio: 'inherit' // Terminal çıktısını göster
        });
        
        fetcher.on('close', (code) => {
            if (code === 0) {
                logYaz('✅ Fetcher başarıyla tamamlandı.');
                resolve();
            } else {
                logYaz(`❌ Fetcher hata kodu ile çıktı: ${code}`);
                reject(new Error(`Fetcher failed with code ${code}`));
            }
        });
        
        fetcher.on('error', (error) => {
            logYaz(`❌ Fetcher başlatılamadı: ${error.message}`);
            reject(error);
        });
    });
}

// Manuel tetikleme için HTTP endpoint (opsiyonel)
const express = require('express');
const app = express();
const PORT = 3001;

app.get('/trigger-update', async (req, res) => {
    logYaz('🔧 Manuel güncelleme tetiklendi (HTTP)');
    
    res.json({
        success: true,
        message: 'Güncelleme başlatıldı. Tamamlanması uzun sürebilir.',
        timestamp: new Date().toISOString()
    });
    
    try {
        await fetcherCalistir();
        logYaz('✅ Manuel güncelleme tamamlandı.');
    } catch (error) {
        logYaz(`❌ Manuel güncelleme başarısız: ${error.message}`);
    }
});

app.get('/status', (req, res) => {
    const logIcerik = fs.existsSync(LOG_DOSYASI) 
        ? fs.readFileSync(LOG_DOSYASI, 'utf-8').split('\n').slice(-50).join('\n')
        : 'Henüz log yok';
    
    res.json({
        success: true,
        nextRun: job.nextInvocation(),
        lastLogs: logIcerik
    });
});

app.listen(PORT, () => {
    logYaz(`📡 Auto-update kontrolcü çalışıyor: http://localhost:${PORT}`);
    logYaz(`   Manuel tetikleme: http://localhost:${PORT}/trigger-update`);
    logYaz(`   Durum kontrolü: http://localhost:${PORT}/status`);
});

// Zamanlanmış görev
logYaz('╔═══════════════════════════════════════════════════╗');
logYaz('║     Namaz Vakti Otomatik Güncelleme Servisi      ║');
logYaz('╚═══════════════════════════════════════════════════╝');
logYaz(`📅 Zamanlama: ${CRON_ZAMANI} (Her ayın 1. günü saat 02:00)`);
logYaz(`📁 Log dosyası: ${LOG_DOSYASI}`);

const job = schedule.scheduleJob(CRON_ZAMANI, async () => {
    logYaz('⏰ Zamanlanmış güncelleme başlıyor...');
    
    try {
        await fetcherCalistir();
        logYaz('✅ Zamanlanmış güncelleme başarılı.');
    } catch (error) {
        logYaz(`❌ Zamanlanmış güncelleme başarısız: ${error.message}`);
    }
});

logYaz(`✅ Scheduler aktif. Sonraki çalışma: ${job.nextInvocation()}`);

// Graceful shutdown
process.on('SIGINT', () => {
    logYaz('🛑 Auto-update servisi durduruluyor...');
    job.cancel();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logYaz('🛑 Auto-update servisi durduruluyor...');
    job.cancel();
    process.exit(0);
});
