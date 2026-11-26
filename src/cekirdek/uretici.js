// Sentetik veri üreticisi: bir günün arızalarını ve planlı bakımlarını üretir.
//
// Saf fonksiyondur: yalnız tarihe, kataloğa ve senaryo ayarına bakar; veritabanı okumaz.
// Bu yüzden:
//   - Aynı gün tekrar üretilirse aynı kayıtlar çıkar (tohum = senaryo tohumu + tarih).
//   - 6 aylık geçmiş tek komutla doldurulur; günlerin sırası önemli değildir.
//   - "Ekipmanın durumu" (yaşı, bakımın gecikip gecikmediği, kimin izinde olduğu) da tarihten hesaplanır.
//
// Desenler rastgele değil, kurallıdır (senaryo.json): yaşlanan ekipman daha sık bozulur, aşınan türler bakım
// yaklaştıkça (ve bakım gecikince) sıklaşır, ayar türleri bakımdan hemen sonra bozulur, RT-03 cuma günleri hidrolik sorunu çıkarır, sorter'ı Murat Kaya bilir ve o izindeyken onarım uzar,
// forkliftlerde otonom bakım başladıktan sonra büyük arızalar azalır, kasım-aralık yoğunluğu arızayı artırır.
//
// Kullanım (surum 4): ekipman her vardiyanın tamamında çalışmaz. Vardiyada kaç dakika kullanıldığı sezona, haftanın gününe
// ve vardiyaya göre değişir (kullanimDk). Arıza olasılığı kullanılan süreyle orantılıdır ve aşınma, bakımdan beri geçen
// GÜNE değil, bakımdan beri ÇALIŞILAN SÜREYE göre artar (kullanim sayacı). Bu yüzden kasım-aralıkta ekipman bakım
// periyodunun aynı gününde daha "yaşlıdır": takvime göre bakım, yoğun dönemde geç kalır. Nabız V3 bunu gösterir.
import { ARIZA_TURLERI, EKIPMANLAR, KISILER, PLANLI_BAKIM, TIPLER, VARDIYALAR, planliKod } from './katalog.js';
import { ozet32, uretec } from './rastgele.js';
import { anMs, ay, gunEkle, gunFarki, haftaGunu } from './zaman.js';
import varsayilanSenaryo from './senaryo.json' with { type: 'json' };

export { varsayilanSenaryo };

const VARDIYA_DK = 480;
const VARDIYA_SIRASI = [3, 1, 2]; // bir takvim gününde vardiyaların sırası (3. vardiya 00-08)
const kullanimBellek = new Map();

/**
 * Ekipmanın o gün o vardiyada kaç dakika kullanıldığı (planlı üretim süresi). Vardiyada çalışmıyorsa 0.
 * doluluk × sezon × haftanın günü × (gece) ± %10, en çok 480 dk. Saf ve bellekli: aynı girdi hep aynı sonuç.
 */
export function kullanimDk(ekipman, gun, vardiya, senaryo = varsayilanSenaryo) {
  if (!TIPLER[ekipman.tip].vardiyalar.includes(vardiya)) return 0;
  const a = `${senaryo.tohum}|${senaryo.surum}|${ekipman.kod}|${gun}|${vardiya}`;
  let v = kullanimBellek.get(a);
  if (v == null) {
    if (kullanimBellek.size > 200_000) kullanimBellek.clear();
    const k = senaryo.kullanim;
    const oran = k.doluluk * (senaryo.sezon[String(ay(gun))] ?? 1) * (senaryo.gunCarpani[String(haftaGunu(gun))] ?? 1) * (vardiya === 3 ? senaryo.geceCarpani : 1);
    const gurultu = 1 + (uretec(`${senaryo.tohum}:${ekipman.kod}:${gun}:${vardiya}:kullanim`).sayi() - 0.5) * 2 * k.oynama;
    v = Math.round(Math.min(VARDIYA_DK, VARDIYA_DK * oran * gurultu));
    kullanimBellek.set(a, v);
  }
  return v;
}

/** Bir tipin ortalama günlük kullanımı (dk): bir yıllık referans takvimin ortalaması. Aşınmada "bir periyot" ölçüsü. */
const nominalBellek = new Map();
export function nominalGunlukDk(ekipman, senaryo = varsayilanSenaryo) {
  const a = `${senaryo.tohum}|${senaryo.surum}|${ekipman.kod}`;
  if (!nominalBellek.has(a)) {
    let t = 0;
    for (let i = 0; i < 364; i++) { const g = gunEkle('2025-01-01', i); for (const v of VARDIYA_SIRASI) t += kullanimDk(ekipman, g, v, senaryo); }
    nominalBellek.set(a, t / 364);
  }
  return nominalBellek.get(a);
}

/**
 * Bakımdan beri çalışılan süre (dk), verilen vardiyanın ortasına kadar. Bakım günü bakım 9'da yapılır:
 * o günün 3. vardiyası önceki döngüdedir, 1. vardiyanın bakımdan sonraki kısmı (~%85) ve 2. vardiya yeni döngüdedir.
 */
export function bakimdanBeriKullanimDk(ekipman, sonBakim, gun, vardiya, senaryo = varsayilanSenaryo) {
  if (!sonBakim) return null;
  let t = 0;
  for (let d = sonBakim; d <= gun; d = gunEkle(d, 1)) {
    for (const v of VARDIYA_SIRASI) {
      if (d === sonBakim && v === 3) continue;
      const k = kullanimDk(ekipman, d, v, senaryo) * (d === sonBakim && v === 1 ? 0.85 : 1);
      if (d === gun && v === vardiya) return t + k / 2;
      t += k;
    }
  }
  return t;
}

/** Ekipmanın o güne göre bakım durumu: son bakım, sıradaki plan, gecikme. */
export function bakimDurumu(ekipman, gun, senaryo = varsayilanSenaryo) {
  const { referans, gecikmeOlasiligi, gecikmeGun } = senaryo.bakim;
  const periyot = TIPLER[ekipman.tip].bakimGun;
  const ofset = ozet32(`${senaryo.tohum}:${ekipman.kod}:ofset`) % periyot;
  const plan = (k) => gunEkle(referans, ofset + k * periyot);
  const gecikme = (k) => {
    const r = uretec(`${senaryo.tohum}:${ekipman.kod}:bakim:${k}`);
    return r.sayi() < gecikmeOlasiligi ? r.tam(gecikmeGun[0], gecikmeGun[1]) : 0;
  };
  const yapilan = (k) => gunEkle(plan(k), gecikme(k));
  const nominal = nominalGunlukDk(ekipman, senaryo);

  const fark = gunFarki(referans, gun) - ofset;
  const k = Math.floor(fark / periyot); // bu döngünün planı bugün ya da daha önce
  // Döngü k'nın bakımı henüz yapılmadıysa (gecikmedeyse) son bakım k-1'dir.
  const kYapildi = k >= 0 && yapilan(k) <= gun;
  const sonK = kYapildi ? k : k - 1;
  const bekleyenK = kYapildi ? k + 1 : k;
  const sonBakim = sonK >= 0 ? yapilan(sonK) : null;
  const sonrakiPlan = plan(Math.max(0, bekleyenK));
  const gecikmede = bekleyenK >= 0 && plan(bekleyenK) <= gun;
  return {
    periyotGun: periyot,
    sonBakim,
    sonrakiPlan,
    gecikmede,
    gecikmeGun: gecikmede ? gunFarki(plan(bekleyenK), gun) : 0,
    bugunBakim: kYapildi && yapilan(k) === gun,
    bakimdanBeriGun: sonBakim ? gunFarki(sonBakim, gun) : null,
    // Sayaç: bakımdan beri çalışılan saat (günün sonuna kadar) ve bir periyodun ortalama çalışma saati
    bakimdanBeriSaat: sonBakim ? Math.round(bakimdanBeriKullanimDk(ekipman, sonBakim, gun, 2, senaryo) / 60) : null,
    periyotSaat: Math.round((periyot * nominal) / 60),
  };
}

/** Kişinin o gün izinde olup olmadığı: her çeyrekte bir kez, tohumdan türeyen tarih ve uzunlukta. */
export function izinde(kisi, gun, senaryo = varsayilanSenaryo) {
  const yil = Number(gun.slice(0, 4));
  const ceyrek = Math.floor((ay(gun) - 1) / 3);
  const r = uretec(`${senaryo.tohum}:${kisi.kod}:izin:${yil}:${ceyrek}`);
  const ceyrekBasi = `${yil}-${String(ceyrek * 3 + 1).padStart(2, '0')}-01`;
  const baslangic = gunEkle(ceyrekBasi, r.tam(3, 70));
  const uzunluk = r.tam(senaryo.izin.ceyrekBasinaGun[0], senaryo.izin.ceyrekBasinaGun[1]);
  return gun >= baslangic && gun < gunEkle(baslangic, uzunluk);
}

/** Bir ekipmanın arıza olasılığını büyüten/küçülten, türden bağımsız çarpanlar (açıklama için de kullanılır). */
export function carpanlar(ekipman, gun, senaryo = varsayilanSenaryo) {
  const yas = Math.max(0, gunFarki(ekipman.devreye, gun) / 365);
  return {
    yas: 1 + yas * senaryo.yasCarpaniYil,
    sezon: senaryo.sezon[String(ay(gun))] ?? 1,
    gun: senaryo.gunCarpani[String(haftaGunu(gun))] ?? 1,
    bakimDurumu: bakimDurumu(ekipman, gun, senaryo),
  };
}

/**
 * Aşınma çarpanı: bakımdan sonra ÇALIŞILAN sürenin (bir periyodun ortalama çalışmasına oranı x) Weibull yoğunluğu, ortalaması 1 olacak biçimde:
 *   m(x) = β · x^(β-1)      (0 ≤ x ≤ 1 aralığında ortalaması tam 1'dir; bakım gecikirse x > 1 ve aşınan türde m büyür)
 * β > 1: bakım yaklaştıkça arıza artar (aşınma) · β < 1: bakımdan hemen sonra yüksek (erken dönem) · β tanımsız: 1 (rastgele).
 * Planlı bakım sayacı sıfırlar; arıza onarımı sıfırlamaz ("minimal onarım": ekipman bakımdan önceki yaşına döner).
 */
export function asinmaCarpani(tur, bakim, senaryo = varsayilanSenaryo) {
  if (!tur.asinma || bakim.bakimdanBeriGun == null) return 1;
  // x: döngüdeki konum. Varsa çalışma sayacı (bakımdan beri çalışılan dk / bir periyodun ortalama çalışması), yoksa gün.
  const x = bakim.kullanimX ?? (bakim.bakimdanBeriGun + 0.5) / bakim.periyotGun;
  const [alt, ust] = senaryo.asinmaSinir;
  return Math.min(ust, Math.max(alt, tur.asinma * x ** (tur.asinma - 1)));
}

const operatorler = (vardiya) => KISILER.filter((k) => k.rol === 'operator' && k.vardiya === vardiya);
const sef = (vardiya) => KISILER.find((k) => k.rol === 'sef' && k.vardiya === vardiya);
const teknisyenler = KISILER.filter((k) => k.rol === 'teknisyen');

/**
 * Arızayı kimin çözeceği: uzmanlık³ ağırlığıyla seçilir; vardiyadaki teknisyen öne çıkar, uzman gerekirse vardiya dışından
 * çağrılır (bekleme süresi eklenir). İzindeki kişi seçilmez. Uzmanlığı düşük biri çözerse onarım uzar.
 */
function cozenSec(r, uzmanlik, vardiya, gun, senaryo) {
  const c = senaryo.cozum;
  const adaylar = teknisyenler
    .filter((t) => !izinde(t, gun, senaryo))
    .map((t) => {
      const u = t.uzmanlik[uzmanlik] ?? 0.1;
      return [t, u ** c.uzmanlikUssu * (t.vardiya === vardiya ? 1 : c.vardiyaDisiAgirlik)];
    });
  const kisi = r.agirlikli(adaylar);
  const u = kisi.uzmanlik[uzmanlik] ?? 0.1;
  return {
    kisi,
    carpan: u < c.zayifEsik ? c.zayifCarpan : u < c.ortaEsik ? c.ortaCarpan : 1,
    beklemeDk: kisi.vardiya === vardiya ? 0 : c.vardiyaDisiBeklemeDk,
  };
}

/** Onarım süresi: log-normal dağılım (çoğu kısa, arada çok uzun olanlar), 3-600 dakika arası. */
const sureDk = (r, medyan, carpan, bekleme) => Math.round(Math.min(600, Math.max(3, medyan * Math.exp(0.5 * r.normal()) * carpan + bekleme)));

/**
 * Bir günün kayıtlarını üretir (sentetik). Sıra sabittir: vardiya → ekipman → tür; böylece tohum aynıysa çıktı aynıdır.
 * @returns {Array<object>} kayıtlar, başlangıç saatine göre sıralı
 */
export function gunuUret(gun, senaryo = varsayilanSenaryo) {
  const r = uretec(`${senaryo.tohum}:${gun}`);
  const kayitlar = [];
  const ekle = (k) => kayitlar.push({ ...k, gun, kaynak: 'sentetik' });

  // Planlı bakımlar: bakım günü gelen ekipman 1. vardiyada bakıma alınır.
  for (const e of EKIPMANLAR) {
    const b = bakimDurumu(e, gun, senaryo);
    if (!b.bugunBakim) continue;
    const { kisi, beklemeDk } = cozenSec(r, e.tip === 'sorter' ? 'sorter' : 'mekanik', 1, gun, senaryo);
    const bas = anMs(gun, 9, r.tam(0, 90));
    const sure = sureDk(r, PLANLI_BAKIM.mttr, 1, beklemeDk);
    ekle({
      ekipman: e.kod, tur: planliKod(e.tip), kayip: 'planli', vardiya: 1, baslangic: bas, bitis: bas + sure * 60_000, sure_dk: sure,
      bildiren: sef(1).kod, cozen: kisi.kod, islem: r.sec(PLANLI_BAKIM.islemler), onem: PLANLI_BAKIM.onem,
    });
  }

  for (const v of VARDIYALAR) {
    for (const e of EKIPMANLAR) {
      const tip = TIPLER[e.tip];
      if (!tip.vardiyalar.includes(v.no)) continue;
      const c = carpanlar(e, gun, senaryo);
      // Bakım günü sabah 9'da yapılır: aynı günün 3. vardiyası (00-08) hâlâ önceki döngüdedir.
      if (v.no === 3 && c.bakimDurumu.bugunBakim) {
        const once = bakimDurumu(e, gunEkle(gun, -1), senaryo);
        c.bakimDurumu = { ...once, bakimdanBeriGun: once.bakimdanBeriGun == null ? null : once.bakimdanBeriGun + 1 };
      }
      // Kullanım: arıza olasılığı çalışılan süreyle orantılı (sezon, hafta günü ve gece artık kullanım üzerinden etkiler)
      const kDk = kullanimDk(e, gun, v.no, senaryo);
      if (!kDk) continue;
      const kullanimCarpani = kDk / (VARDIYA_DK * senaryo.kullanim.doluluk);
      const sb = c.bakimDurumu.sonBakim;
      c.bakimDurumu = { ...c.bakimDurumu, kullanimX: sb ? bakimdanBeriKullanimDk(e, sb, gun, v.no, senaryo) / (c.bakimDurumu.periyotGun * nominalGunlukDk(e, senaryo)) : null };
      const am = senaryo.otonomBakim.find((a) => a.tip === e.tip && gun >= a.baslangic);

      for (const t of ARIZA_TURLERI) {
        if (t.tip !== e.tip) continue;
        const amCarpani = !am ? 1 : t.kayip === 'ariza' ? am.arizaCarpani : t.kayip === 'kucuk_durus' ? am.kucukDurusCarpani : 1;
        let ortalama = t.oran * senaryo.yogunluk * c.yas * asinmaCarpani(t, c.bakimDurumu, senaryo) * kullanimCarpani * amCarpani;
        // Sabah açılış kaybı yalnız günün ilk çalışan vardiyasında olur.
        if (t.kayip === 'baslangic' && v.no !== 1) ortalama = 0;
        let adet = r.poisson(ortalama);
        // Tekrarlayan sorun (senaryo.tekrarlayan): belirli ekipman, belirli gün.
        for (const tk of senaryo.tekrarlayan) {
          if (tk.ekipman === e.kod && tk.tur === t.kod && tk.haftaGunu === haftaGunu(gun)
            && tk.vardiyalar.includes(v.no) && r.sayi() < tk.olasilik) adet += 1;
        }
        for (let i = 0; i < adet; i++) {
          const bildiren = r.sec(operatorler(v.no));
          // Basit duruşları (akü, sıkışma, film) operatör kendisi giderir; diğerlerine teknisyen gelir.
          const { kisi, carpan, beklemeDk } = t.operator ? { kisi: bildiren, carpan: 1, beklemeDk: 0 } : cozenSec(r, t.uzmanlik, v.no, gun, senaryo);
          const bas = anMs(gun, v.basSaat, r.tam(0, Math.max(10, kDk - 20)));
          const sure = sureDk(r, t.mttr, carpan, beklemeDk);
          ekle({
            ekipman: e.kod, tur: t.kod, kayip: t.kayip, vardiya: v.no, baslangic: bas, bitis: bas + sure * 60_000, sure_dk: sure,
            bildiren: bildiren.kod, cozen: kisi.kod, islem: r.sec(t.islemler), onem: t.onem,
          });
        }
      }
    }
  }

  kayitlar.sort((a, b) => a.baslangic - b.baslangic || a.ekipman.localeCompare(b.ekipman));
  const ek = gun.replaceAll('-', '');
  kayitlar.forEach((k, i) => { k.id = `S-${ek}-${String(i + 1).padStart(3, '0')}`; });
  return kayitlar;
}

/**
 * Vardiya üretimi (OEE için): her ekipman ve çalıştığı her vardiya için planlı süre, duruş, iş adedi ve hatalı adet.
 * Duruş o vardiyada BAŞLAYAN arızaların toplamıdır (planlı bakım hariç; planlı bakım planlı süreden düşülür).
 * Performans: ideal hızın %68-88'i (bekleme, yol, arama: depo ekipmanında ideal hıza nadiren çıkılır); o vardiyada "hız" kaybı varsa ayrıca düşer. Kalite: binde 4 + her "kalite" arızası için %1.
 * Saf fonksiyon: aynı gün aynı kayıtlarla hep aynı sonuç.
 */
export function vardiyaUretimi(gun, kayitlar, senaryo = varsayilanSenaryo) {
  const r = uretec(`${senaryo.tohum}:${gun}:uretim`);
  const satirlar = [];
  for (const v of VARDIYALAR) {
    for (const e of EKIPMANLAR) {
      const tip = TIPLER[e.tip];
      if (!tip.vardiyalar.includes(v.no)) continue;
      const bu = kayitlar.filter((k) => k.ekipman === e.kod && k.vardiya === v.no);
      const planliBakimDk = bu.filter((k) => k.kayip === 'planli').reduce((t, k) => t + k.sure_dk, 0);
      // Planlı üretim süresi = ekipmanın o vardiyada kullanıldığı süre (boşta beklediği süre OEE'ye girmez)
      const planliDk = Math.max(0, kullanimDk(e, gun, v.no, senaryo) - planliBakimDk);
      const durusDk = Math.min(planliDk, bu.filter((k) => k.kayip !== 'planli').reduce((t, k) => t + k.sure_dk, 0));
      const hizKaybi = bu.filter((k) => k.kayip === 'hiz').length;
      const kaliteKaybi = bu.filter((k) => k.kayip === 'kalite').length;
      const performans = (0.68 + r.sayi() * 0.2) * 0.85 ** hizKaybi;
      const uretilen = Math.round((tip.idealHiz / 60) * (planliDk - durusDk) * performans);
      const hatali = Math.min(uretilen, Math.round(uretilen * (0.004 + 0.01 * kaliteKaybi) * (0.6 + r.sayi() * 0.8)));
      satirlar.push({ gun, vardiya: v.no, ekipman: e.kod, planli_dk: planliDk, durus_dk: durusDk, uretilen, hatali, kaynak: 'sentetik' });
    }
  }
  return satirlar;
}
