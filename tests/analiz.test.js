// Analiz: göstergeler doğru hesaplanır; bulgular tasarlanan desenleri bulur, rastgele dalgalanmayı bulmaz.
import test from 'node:test';
import assert from 'node:assert/strict';
import { binomKuyruk, bulgular, cozenDagilimi, ekipmanOzeti, pareto } from '../src/cekirdek/analiz.js';
import { gunuUret } from '../src/cekirdek/uretici.js';
import { gunEkle } from '../src/cekirdek/zaman.js';

const k = (o) => ({ gun: '2026-11-02', kaynak: 'sentetik', kayip: 'ariza', vardiya: 1, baslangic: 0, onem: 'orta', bildiren: 'K-O01', cozen: 'K-SAYDIN', ...o });

test('MTTR, MTBF, kullanılabilirlik elle hesaplananla aynı', () => {
  const kayitlar = [
    k({ id: 'a', ekipman: 'FL-01', tur: 'FL-HID', bitis: 1, sure_dk: 60 }),
    k({ id: 'b', ekipman: 'FL-01', tur: 'FL-LAS', bitis: 1, sure_dk: 120 }),
    k({ id: 'c', ekipman: 'FL-01', tur: 'FL-PLN', kayip: 'planli', bitis: 1, sure_dk: 240 }),
  ];
  const fl1 = ekipmanOzeti(kayitlar, 10, '2026-11-10').find((e) => e.kod === 'FL-01');
  // Planlı çalışma: 3 vardiya × 8 sa × 10 gün = 240 sa; planlı bakım 4 sa düşülür → 236 sa; duruş 3 sa.
  assert.equal(fl1.arizaSayisi, 2);
  assert.equal(fl1.durusDk, 180);
  assert.equal(fl1.mttrDk, 90);
  assert.equal(fl1.mtbfSaat, (236 - 3) / 2);
  assert.equal(fl1.kullanilabilirlik, Math.round((1 - 3 / 236) * 1000) / 1000);
});

test('Pareto büyükten küçüğe, kümülatif 1\'de biter, planlı bakım ve açık arıza girmez', () => {
  const p = pareto([
    k({ ekipman: 'FL-01', tur: 'FL-HID', bitis: 1, sure_dk: 30 }),
    k({ ekipman: 'FL-02', tur: 'FL-LAS', bitis: 1, sure_dk: 90 }),
    k({ ekipman: 'FL-02', tur: 'FL-LAS', bitis: null, sure_dk: null }),
    k({ ekipman: 'FL-02', tur: 'FL-PLN', kayip: 'planli', bitis: 1, sure_dk: 500 }),
  ]);
  assert.deepEqual(p.map((s) => [s.kod, s.durusDk, s.kumulatif]), [['FL-LAS', 90, 0.75], ['FL-HID', 30, 1]]);
});

test('binom kuyruğu', () => {
  assert.ok(Math.abs(binomKuyruk(0, 10, 0.3) - 1) < 1e-12);
  assert.ok(Math.abs(binomKuyruk(10, 10, 0.5) - 1 / 1024) < 1e-12);
  assert.ok(Math.abs(binomKuyruk(2, 3, 0.5) - 0.5) < 1e-12);
});

test('180 günlük veride bulgular yalnız tasarlanan desenleri bulur', () => {
  for (const bitis of ['2026-11-24', '2026-06-30', '2026-03-15']) {
    const kayitlar = Array.from({ length: 180 }, (_, i) => gunEkle(bitis, -i)).flatMap((g) => gunuUret(g));
    const b = bulgular(kayitlar, bitis);
    const tekrar = b.filter((x) => x.tur === 'tekrarlayan_gun');
    assert.deepEqual(tekrar.map((x) => `${x.ekipman}|${x.arizaTuru}|${x.haftaGunu}`), ['RT-03|RT-HID|5'], `${bitis}: ${tekrar.map((x) => x.metin).join(' / ')}`);
    const tek = b.filter((x) => x.tur === 'tek_kisi');
    assert.deepEqual(tek.map((x) => `${x.tip}|${x.kisi}`), ['sorter|K-MKAYA'], bitis);
    assert.equal(cozenDagilimi(kayitlar)[0].tip, 'sorter');
  }
});
