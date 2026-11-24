// Analiz: kayıtlardan TPM göstergeleri. Saf fonksiyonlar (veritabanı yok), web, MCP ve testler aynı kodu çağırır.
//
//   MTTR (ortalama onarım süresi)       = toplam onarım süresi / arıza sayısı
//   MTBF (arızalar arası ortalama süre) = (planlı çalışma süresi - duruş) / arıza sayısı
//   Kullanılabilirlik                   = (planlı çalışma süresi - duruş) / planlı çalışma süresi
// Planlı bakım duruş sayılmaz (TPM'de planlı süre çalışma süresinden düşülür), arıza sayısına da girmez.
import { ARIZA_TURLERI, EKIPMANLAR, KAYIPLAR, KISILER, TIPLER, VARDIYALAR, ekipmanBul, kisiBul, turBul } from './katalog.js';
import { bakimDurumu } from './uretici.js';
import { haftaGunu, isoTr } from './zaman.js';

const VARDIYA_SAAT = 8;
const yuvarla = (x, b = 1) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** b) / 10 ** b);
const kapali = (k) => k.bitis != null;
const kayipMi = (k) => k.kayip !== 'planli';

/** Ekipmanın bir dönemdeki planlı çalışma süresi (saat): çalıştığı vardiya sayısı × 8 saat × gün. */
export const calismaSaati = (ekipman, gunSayisi) => TIPLER[ekipman.tip].vardiyalar.length * VARDIYA_SAAT * gunSayisi;

/** Bir kaydın dışarıya verilen biçimi: kodların yanında adlar, saatler okunur biçimde. */
export function kayitGorunumu(k) {
  const e = ekipmanBul(k.ekipman), t = turBul(k.tur), b = kisiBul(k.bildiren), c = k.cozen ? kisiBul(k.cozen) : null;
  return {
    id: k.id,
    kaynak: k.kaynak,
    durum: kapali(k) ? 'kapali' : 'acik',
    ekipman: { kod: k.ekipman, ad: e?.ad ?? k.ekipman, tip: e?.tip ?? null },
    tur: { kod: k.tur, ad: t?.ad ?? k.tur },
    kayip: { kod: k.kayip, ad: KAYIPLAR[k.kayip] ?? k.kayip },
    vardiya: k.vardiya,
    baslangic: isoTr(k.baslangic),
    bitis: isoTr(k.bitis),
    sure_dk: k.sure_dk,
    bildiren: k.bildiren ? { kod: k.bildiren, ad: b?.ad ?? k.bildiren } : null,
    cozen: c ? { kod: c.kod, ad: c.ad, rol: c.rol } : k.cozen ? { kod: k.cozen, ad: k.cozen, rol: null } : null,
    islem: k.islem ?? null,
    aciklama: k.aciklama ?? null,
    onem: k.onem,
  };
}

/** Ekipman başına özet (dönem: gunSayisi gün). bugun: bakım durumunun hesaplanacağı gün. */
export function ekipmanOzeti(kayitlar, gunSayisi, bugun) {
  return EKIPMANLAR.map((e) => {
    const kendi = kayitlar.filter((k) => k.ekipman === e.kod);
    const arizalar = kendi.filter(kayipMi);
    const biten = arizalar.filter(kapali);
    const durusDk = biten.reduce((t, k) => t + k.sure_dk, 0);
    const planliDk = kendi.filter((k) => !kayipMi(k) && kapali(k)).reduce((t, k) => t + k.sure_dk, 0);
    const calisma = calismaSaati(e, gunSayisi) - planliDk / 60;
    const turler = {};
    for (const k of arizalar) turler[k.tur] = (turler[k.tur] || 0) + 1;
    const enSik = Object.entries(turler).sort((a, b) => b[1] - a[1])[0];
    const b = bakimDurumu(e, bugun);
    return {
      kod: e.kod, ad: e.ad, tip: e.tip, tipAd: TIPLER[e.tip].ad, bolge: e.bolge,
      arizaSayisi: arizalar.length,
      acik: kendi.filter((k) => !kapali(k)).length,
      durusDk,
      mttrDk: biten.length ? yuvarla(durusDk / biten.length) : null,
      mtbfSaat: arizalar.length ? yuvarla((calisma - durusDk / 60) / arizalar.length) : null,
      kullanilabilirlik: calisma > 0 ? yuvarla(Math.max(0, 1 - durusDk / 60 / calisma), 3) : null,
      enSikTur: enSik ? { kod: enSik[0], ad: turBul(enSik[0])?.ad, adet: enSik[1] } : null,
      bakim: { sonBakim: b.sonBakim, sonrakiPlan: b.sonrakiPlan, gecikmede: b.gecikmede, gecikmeGun: b.gecikmeGun },
    };
  });
}

/** Pareto: arıza türleri duruş süresine göre büyükten küçüğe, kümülatif payıyla. tip verilirse yalnız o ekipman tipi. */
export function pareto(kayitlar, { tip, ekipman } = {}) {
  const gruplar = new Map();
  for (const k of kayitlar) {
    if (!kayipMi(k) || !kapali(k)) continue;
    if (ekipman && k.ekipman !== ekipman) continue;
    if (tip && ekipmanBul(k.ekipman)?.tip !== tip) continue;
    const g = gruplar.get(k.tur) || { kod: k.tur, adet: 0, durusDk: 0 };
    g.adet++;
    g.durusDk += k.sure_dk;
    gruplar.set(k.tur, g);
  }
  const satirlar = [...gruplar.values()].sort((a, b) => b.durusDk - a.durusDk || b.adet - a.adet);
  const toplam = satirlar.reduce((t, s) => t + s.durusDk, 0);
  let kum = 0;
  return satirlar.map((s) => {
    kum += s.durusDk;
    const t = turBul(s.kod);
    return { ...s, ad: t?.ad, kayip: t?.kayip, pay: yuvarla(s.durusDk / toplam, 3), kumulatif: yuvarla(kum / toplam, 3) };
  });
}

/** 6 büyük kayba göre duruş dağılımı. */
export function kayipDagilimi(kayitlar) {
  const t = Object.fromEntries(Object.keys(KAYIPLAR).filter((k) => k !== 'planli').map((k) => [k, { kod: k, ad: KAYIPLAR[k], adet: 0, durusDk: 0 }]));
  for (const k of kayitlar) if (kayipMi(k) && kapali(k) && t[k.kayip]) { t[k.kayip].adet++; t[k.kayip].durusDk += k.sure_dk; }
  return Object.values(t).sort((a, b) => b.durusDk - a.durusDk);
}

/**
 * Kim çözüyor: ekipman tipi başına teknisyen dağılımı (operatörün kendi giderdiği basit duruşlar hariç).
 * Tek kişinin payı yüksekse o kişi ayrılınca/izne çıkınca o ekipman tipinde onarım uzar: Emanet'in risk sinyali.
 */
export function cozenDagilimi(kayitlar) {
  const tipler = {};
  for (const k of kayitlar) {
    if (!kayipMi(k) || !kapali(k) || !k.cozen) continue;
    const kisi = kisiBul(k.cozen);
    if (kisi && kisi.rol !== 'teknisyen') continue;
    const tip = ekipmanBul(k.ekipman)?.tip;
    if (!tip) continue;
    const g = (tipler[tip] ||= { tip, tipAd: TIPLER[tip].ad, toplam: 0, kisiler: {} });
    g.toplam++;
    const kk = (g.kisiler[k.cozen] ||= { kod: k.cozen, ad: kisi?.ad ?? k.cozen, adet: 0, sureDk: 0 });
    kk.adet++;
    kk.sureDk += k.sure_dk;
  }
  return Object.values(tipler).map((g) => {
    const kisiler = Object.values(g.kisiler)
      .map((k) => ({ kod: k.kod, ad: k.ad, adet: k.adet, pay: yuvarla(k.adet / g.toplam, 3), ortSureDk: yuvarla(k.sureDk / k.adet) }))
      .sort((a, b) => b.adet - a.adet);
    const enBuyukPay = kisiler[0]?.pay ?? 0;
    return { tip: g.tip, tipAd: g.tipAd, toplam: g.toplam, kisiler, enBuyukPay, risk: enBuyukPay >= 0.7 ? 'yuksek' : enBuyukPay >= 0.5 ? 'orta' : 'dusuk' };
  }).sort((a, b) => b.enBuyukPay - a.enBuyukPay);
}

const GUN_ADLARI = ['pazar', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi'];

/** Binom kuyruğu: P(X ≥ k), X ~ Bin(n, p). Küçük n için doğrudan toplam yeterli. */
export function binomKuyruk(k, n, p) {
  let toplam = 0;
  let terim = (1 - p) ** n; // P(X = 0)
  for (let i = 0; i <= n; i++) {
    if (i >= k) toplam += terim;
    terim *= ((n - i) / (i + 1)) * (p / (1 - p));
  }
  return Math.min(1, toplam);
}

/**
 * Dikkat çekenler: verinin kendisinden çıkan kural tabanlı bulgular (yapay zekâ yok).
 *  - tekrarlayan gün: bir ekipman + arıza türü belli bir haftanın gününde, deponun genel gün dağılımına göre
 *    tesadüfle açıklanamayacak kadar sık (binom testi; 7 gün × denenen çift sayısı kadar düzeltilmiş, p < 0,01)
 *  - tek kişiye bağımlılık: bir ekipman tipinin onarımlarının %70'inden fazlası tek kişide
 *  - geciken bakım: planlı bakımı geçmiş ekipman
 */
export function bulgular(kayitlar, bugun) {
  const sonuc = [];
  const ciftler = new Map();
  const genel = [0, 0, 0, 0, 0, 0, 0];
  let genelToplam = 0;
  for (const k of kayitlar) {
    if (!kayipMi(k)) continue;
    const hg = haftaGunu(k.gun);
    genel[hg]++;
    genelToplam++;
    const a = `${k.ekipman}|${k.tur}`;
    const g = ciftler.get(a) || { ekipman: k.ekipman, tur: k.tur, toplam: 0, gunler: [0, 0, 0, 0, 0, 0, 0] };
    g.toplam++;
    g.gunler[hg]++;
    ciftler.set(a, g);
  }
  const denenen = [...ciftler.values()].filter((g) => g.toplam >= 8);
  for (const g of denenen) {
    let enIyi = null;
    for (let gun = 0; gun < 7; gun++) {
      const beklenen = genel[gun] / genelToplam;
      if (!beklenen || g.gunler[gun] < 5) continue;
      const p = binomKuyruk(g.gunler[gun], g.toplam, beklenen) * 7 * denenen.length;
      if (p < 0.01 && (!enIyi || p < enIyi.p)) enIyi = { gun, p, adet: g.gunler[gun], beklenen: beklenen * g.toplam };
    }
    if (enIyi) {
      sonuc.push({
        tur: 'tekrarlayan_gun', onem: 'yuksek', ekipman: g.ekipman, arizaTuru: g.tur, haftaGunu: enIyi.gun,
        metin: `${ekipmanBul(g.ekipman)?.ad}: "${turBul(g.tur)?.ad}" arızalarının ${enIyi.adet}/${g.toplam} tanesi ${GUN_ADLARI[enIyi.gun]} günü (beklenen yaklaşık ${Math.round(enIyi.beklenen)}). Bu güne özgü bir neden aranmalı.`,
      });
    }
  }
  for (const c of cozenDagilimi(kayitlar)) {
    if (c.risk === 'yuksek' && c.toplam >= 10) {
      const k = c.kisiler[0];
      sonuc.push({
        tur: 'tek_kisi', onem: 'yuksek', tip: c.tip, kisi: k.kod,
        metin: `${c.tipAd} onarımlarında en büyük pay tek kişide: ${k.ad} (%${Math.round(k.pay * 100)}). Bu kişi izne çıktığında ya da ayrıldığında ekipman uzun süre durabilir; yedek kişi yetiştirilmeli.`,
      });
    }
  }
  for (const e of EKIPMANLAR) {
    const b = bakimDurumu(e, bugun);
    if (b.gecikmede) sonuc.push({ tur: 'geciken_bakim', onem: 'orta', ekipman: e.kod, metin: `${e.ad}: planlı bakım ${b.gecikmeGun} gündür gecikmede (plan: ${b.sonrakiPlan}).` });
  }
  const sira = { tekrarlayan_gun: 0, tek_kisi: 1, geciken_bakim: 2 };
  return sonuc.sort((a, b) => sira[a.tur] - sira[b.tur]);
}

/** Ana veriler (API ve MCP için). */
export const anaVeriler = () => ({
  ekipmanlar: EKIPMANLAR.map((e) => ({ ...e, tipAd: TIPLER[e.tip].ad })),
  // oran ve asinma gizlidir: üreticinin "gerçeği"; Nabız Analiz bunları veriden tahmin eder.
  arizaTurleri: ARIZA_TURLERI.map(({ islemler, oran, asinma, ...t }) => ({ ...t, kayipAd: KAYIPLAR[t.kayip] })),
  kisiler: KISILER.map(({ kod, ad, rol, vardiya, uzmanlik }) => ({ kod, ad, rol, vardiya, uzmanlik })),
  kayiplar: KAYIPLAR,
  tipler: Object.fromEntries(Object.entries(TIPLER).map(([k, t]) => [k, { ad: t.ad, vardiyalar: t.vardiyalar, bakimGun: t.bakimGun, idealHiz: t.idealHiz, birim: t.birim }])),
  vardiyalar: VARDIYALAR,
});
