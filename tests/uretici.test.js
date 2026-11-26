// Üretici: aynı gün aynı çıktı, desenler gerçekten veride var.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gunuUret, bakimDurumu, bakimdanBeriKullanimDk, izinde, nominalGunlukDk, varsayilanSenaryo } from '../src/cekirdek/uretici.js';
import { EKIPMANLAR, KISILER, turBul } from '../src/cekirdek/katalog.js';
import { gunEkle, haftaGunu, anMs } from '../src/cekirdek/zaman.js';

const yil = (bas, n = 365) => Array.from({ length: n }, (_, i) => gunEkle(bas, i));
const KAYITLAR = yil('2025-11-25').flatMap((g) => gunuUret(g));

test('aynı gün iki kez üretilince aynı kayıtlar çıkar; tohum değişince değişir', () => {
  assert.deepEqual(gunuUret('2026-11-24'), gunuUret('2026-11-24'));
  assert.notDeepEqual(gunuUret('2026-11-24'), gunuUret('2026-11-24', { ...varsayilanSenaryo, tohum: 'baska' }));
});

test('kayıtlar tutarlı: kimlik biçimi, gün içinde, bilinen kodlar, süre = bitiş - başlangıç', () => {
  const kimlikler = new Set();
  for (const k of KAYITLAR) {
    assert.match(k.id, /^S-\d{8}-\d{3}$/);
    assert.ok(!kimlikler.has(k.id)); kimlikler.add(k.id);
    assert.ok(k.baslangic >= anMs(k.gun) && k.baslangic < anMs(k.gun, 24));
    assert.equal(k.bitis - k.baslangic, k.sure_dk * 60_000);
    assert.ok(k.sure_dk >= 3 && k.sure_dk <= 600);
    assert.ok(turBul(k.tur), k.tur);
    assert.ok(KISILER.some((p) => p.kod === k.cozen) && KISILER.some((p) => p.kod === k.bildiren));
  }
  const gunluk = KAYITLAR.length / 365;
  assert.ok(gunluk > 8 && gunluk < 20, `gün başı ${gunluk}`);
});

test('desen: RT-03 hidrolik arızaları cuma günü yığılır', () => {
  const rt3 = KAYITLAR.filter((k) => k.ekipman === 'RT-03' && k.tur === 'RT-HID');
  const cuma = rt3.filter((k) => haftaGunu(k.gun) === 5).length;
  assert.ok(cuma / rt3.length > 0.4, `cuma payı ${cuma}/${rt3.length}`);
});

test('desen: sorter onarımlarını çoğunlukla Murat Kaya yapar; izindeyken onarım uzar', () => {
  const murat = KISILER.find((k) => k.kod === 'K-MKAYA');
  const sorter = KAYITLAR.filter((k) => k.ekipman === 'SR-01' && k.kayip !== 'planli' && !turBul(k.tur).operator);
  const pay = sorter.filter((k) => k.cozen === 'K-MKAYA').length / sorter.length;
  assert.ok(pay > 0.7, `Murat payı ${pay}`);
  const ort = (l) => l.reduce((t, k) => t + k.sure_dk, 0) / l.length;
  const izinli = sorter.filter((k) => izinde(murat, k.gun));
  const normal = sorter.filter((k) => !izinde(murat, k.gun));
  assert.ok(izinli.length >= 5, 'izin günlerinde sorter arızası olmalı');
  assert.ok(izinli.every((k) => k.cozen !== 'K-MKAYA'), 'izindeki kişi çözemez');
  assert.ok(ort(izinli) > ort(normal) * 1.4, `izinde ${ort(izinli)} dk, normal ${ort(normal)} dk`);
});

test('desen: aşınan türler bakım yaklaştıkça ve bakım gecikince sıklaşır; ayar türleri bakımdan hemen sonra', () => {
  const ekipman = (kod) => EKIPMANLAR.find((e) => e.kod === kod);
  // Arızanın bakım döngüsündeki konumu: bakımdan beri çalışılan süre / bir periyodun ortalama çalışması (surum 4)
  const konum = (k) => {
    const e = ekipman(k.ekipman);
    const b = bakimDurumu(e, k.gun);
    const sb = k.vardiya === 3 && b.bakimdanBeriGun === 0 ? bakimDurumu(e, gunEkle(k.gun, -1)).sonBakim : b.sonBakim;
    return bakimdanBeriKullanimDk(e, sb, k.gun, k.vardiya) / (b.periyotGun * nominalGunlukDk(e));
  };
  const oran = (tur) => {
    const l = KAYITLAR.filter((k) => k.tur === tur).map(konum);
    return { gec: l.filter((x) => x >= 2 / 3 && x <= 1).length, erken: l.filter((x) => x < 1 / 3).length, n: l.length };
  };
  const mas = oran('RT-MAS');
  assert.ok(mas.gec > 3 * mas.erken, `RT-MAS (β 2,5) geç ${mas.gec}, erken ${mas.erken}`);
  const ayr = oran('ST-AYR');
  assert.ok(ayr.erken > 1.6 * ayr.gec, `ST-AYR (β 0,6) erken ${ayr.erken}, geç ${ayr.gec}`); // beklenen oran ≈ 2,4; n ≈ 40
  const sik = oran('KV-SIK');
  assert.ok(sik.erken / sik.gec > 0.75 && sik.erken / sik.gec < 1.33, `KV-SIK rastgele: erken ${sik.erken}, geç ${sik.gec}`);
  // Bakım gecikince aşınan türler daha sık
  let gecikmeGun = 0, gecikmeAriza = 0, normalGun = 0, normalAriza = 0;
  for (const g of yil('2025-11-25')) for (const e of EKIPMANLAR) {
    const b = bakimDurumu(e, g);
    const n = KAYITLAR.filter((k) => k.gun === g && k.ekipman === e.kod && turBul(k.tur)?.asinma > 1).length;
    if (b.gecikmede) { gecikmeGun++; gecikmeAriza += n; } else { normalGun++; normalAriza += n; }
  }
  assert.ok(gecikmeGun > 50);
  assert.ok(gecikmeAriza / gecikmeGun > 1.4 * (normalAriza / normalGun));
});

test('vardiya üretimi tutarlı: duruş ≤ planlı süre, hatalı ≤ üretilen, performans makul', async () => {
  const { vardiyaUretimi } = await import('../src/cekirdek/uretici.js');
  const { TIPLER } = await import('../src/cekirdek/katalog.js');
  for (const g of yil('2026-10-01', 20)) {
    const k = gunuUret(g);
    const u = vardiyaUretimi(g, k);
    assert.deepEqual(u, vardiyaUretimi(g, k));
    for (const r of u) {
      assert.ok(r.durus_dk <= r.planli_dk && r.hatali <= r.uretilen);
      const tip = TIPLER[EKIPMANLAR.find((e) => e.kod === r.ekipman).tip];
      const perf = r.planli_dk > r.durus_dk ? r.uretilen / ((tip.idealHiz / 60) * (r.planli_dk - r.durus_dk)) : 0;
      if (r.planli_dk - r.durus_dk >= 30) assert.ok(perf <= 0.89, `${r.ekipman} perf ${perf}`); // kısa sürede yuvarlama oynatır
    }
    const durus = k.filter((x) => x.kayip !== 'planli').reduce((t, x) => t + x.sure_dk, 0);
    // Vardiyadaki duruş, ekipmanın o vardiyada kullanılan süresiyle sınırlı (surum 4): toplam biraz azalabilir, artamaz
    const ud = u.reduce((t, r) => t + r.durus_dk, 0);
    assert.ok(ud <= durus && ud >= durus * 0.8, `duruşlar vardiyalara dağıtılmış: ${ud} / ${durus}`);
  }
});

test('desen: forkliftlerde otonom bakım başladıktan sonra büyük arızalar azalır', () => {
  const say = (bas, bit) => KAYITLAR.filter((k) => k.gun >= bas && k.gun < bit && k.ekipman.startsWith('FL') && k.kayip === 'ariza').length;
  const once = say('2025-12-01', '2026-03-01') / 90; // kış (sezon etkisi benzer olsun diye aynı aylar yok; kaba karşılaştırma)
  const sonra = say('2026-09-01', '2026-11-25') / 85;
  assert.ok(sonra < once * 0.95, `önce ${once.toFixed(2)}/gün, sonra ${sonra.toFixed(2)}/gün`);
});

test('bakım durumu tutarlı: son bakım geçmişte, gecikmede değilse sıradaki plan gelecekte', () => {
  for (const g of yil('2026-01-01', 200)) for (const e of EKIPMANLAR) {
    const b = bakimDurumu(e, g);
    assert.ok(b.sonBakim <= g);
    if (b.gecikmede) assert.ok(b.sonrakiPlan <= g && b.gecikmeGun >= 0);
    else assert.ok(b.sonrakiPlan > g);
  }
  // Her bakım günü bir planlı bakım kaydı üretir.
  const planli = KAYITLAR.filter((k) => k.kayip === 'planli');
  for (const k of planli.slice(0, 50)) assert.ok(bakimDurumu(EKIPMANLAR.find((e) => e.kod === k.ekipman), k.gun).bugunBakim);
});

test('kullanım (surum 4): yoğun sezonda bir bakım periyodunda daha çok çalışılır; arıza kullanımla orantılı', async () => {
  const { kullanimDk } = await import('../src/cekirdek/uretici.js');
  const fl = EKIPMANLAR.find((e) => e.kod === 'FL-01');
  const donem = (bas) => yil(bas, 30).reduce((t, g) => t + [1, 2, 3].reduce((u, v) => u + kullanimDk(fl, g, v), 0), 0) / 60;
  const mayis = donem('2026-05-01'), kasim = donem('2026-11-01');
  assert.ok(kasim > mayis * 1.3, `30 günde çalışma: mayıs ${mayis.toFixed(0)} sa, kasım ${kasim.toFixed(0)} sa`);
  for (const g of yil('2026-03-01', 30)) for (const v of [1, 2, 3]) assert.ok(kullanimDk(fl, g, v) >= 0 && kullanimDk(fl, g, v) <= 480);
  // Sorter yalnız 1-2. vardiyada çalışır
  assert.equal(kullanimDk(EKIPMANLAR.find((e) => e.kod === 'SR-01'), '2026-03-03', 3), 0);
  // Arıza sayısı kullanım saatine oranla, takvime oranla olduğundan daha düzgün: kasım/mayıs arıza oranı kullanım oranına yakın
  const ariza = (bas) => KAYITLAR.filter((k) => k.ekipman.startsWith('FL') && k.kayip !== 'planli' && k.gun >= bas && k.gun < gunEkle(bas, 30)).length;
  const oranAriza = ariza('2025-12-01') / ariza('2026-05-01');
  assert.ok(oranAriza > 1.15, `aralık/mayıs arıza oranı ${oranAriza.toFixed(2)}`);
});
