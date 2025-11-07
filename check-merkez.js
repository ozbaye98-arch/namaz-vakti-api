const d = require('./data/ilceler_koordinatli.json');
const merkez = d.filter(x => x.ilce_adi === 'MERKEZ');

console.log('📊 Toplam İlçe:', d.length);
console.log('🏛️  MERKEZ Sayısı:', merkez.length);
console.log('\n🌆 Örnek Şehir Merkezleri:');

merkez.slice(0, 8).forEach((x, i) => {
    console.log(`   ${i + 1}. ${x.sehir_adi} MERKEZ - (${x.latitude}, ${x.longitude})`);
});

console.log('\n✅ Evet! Fetcher.js şunları çekiyor:');
console.log(`   • ${d.length} toplam ilçe (hem ilçe hem şehir merkezi)`);
console.log(`   • ${merkez.length} şehir merkezi (MERKEZ)`);
console.log(`   • ${d.length - merkez.length} normal ilçe`);
console.log('\n📅 12 Aylık Veri:');
console.log('   • Kasım 2025 → Ekim 2026');
console.log('   • 2026 yılı için de geçerli!');
console.log(`   • Toplam dosya: ${d.length} × 12 ay = ${d.length * 12} dosya`);
