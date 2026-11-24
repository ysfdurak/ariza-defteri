// Servis katmanı: web kapısı (/v1) ve MCP kapısı (/mcp) aynı fonksiyonları çağırır. Kural burada, kapılarda değil.
import { EKIPMANLAR, KISILER, TIPLER, VARDIYALAR, ekipmanBul, kisiBul, planliKod, turBul } from '../src/cekirdek/katalog.js';
import { anaVeriler, bulgular, cozenDagilimi, ekipmanOzeti, kayipDagilimi, kayitGorunumu, pareto } from '../src/cekirdek/analiz.js';
import { bakimDurumu, varsayilanSenaryo } from '../src/cekirdek/uretici.js';
import { GUN_MS, anMs, gecerliGun, gunEkle, isoTr, istanbulGunu } from '../src/cekirdek/zaman.js';

export class KuralHatasi extends Error {
  constructor(mesaj, { durum = 400, kod = 'kural' } = {}) {
    super(mesaj);
    this.durum = durum;
    this.kod = kod;
  }
}

export const API_SURUMU = 'v1';
const METIN_SINIRI = 300;

/** Dönem (gün sayısı): 1-365, varsayılan verilen değer. */
const donem = (v, varsayilan) => {
  if (v == null || v === '') return varsayilan;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 365) throw new KuralHatasi('Dönem 1 ile 365 gün arasında bir tam sayı olmalı.');
  return n;
};

/** Kullanıcı metni: tür, uzunluk, kontrol karakteri denetimi. */
function metin(v, ad, { zorunlu = false } = {}) {
  if (v == null || v === '') {
    if (zorunlu) throw new KuralHatasi(`${ad} gerekli.`);
    return null;
  }
  if (typeof v !== 'string') throw new KuralHatasi(`${ad} metin olmalı.`);
  const t = v.trim();
  if (t.length > METIN_SINIRI) throw new KuralHatasi(`${ad} en fazla ${METIN_SINIRI} karakter olabilir.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(t)) throw new KuralHatasi(`${ad} geçersiz karakter içeriyor.`);
  return t || null;
}

function zamanOku(v, ad, simdi) {
  if (v == null || v === '') return simdi;
  const ms = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v) ? Date.parse(v) : NaN;
  if (!Number.isFinite(ms)) throw new KuralHatasi(`${ad} ISO 8601 biçiminde ve saat dilimiyle olmalı (ör. 2026-11-24T14:05:00+03:00).`);
  if (ms > simdi + 5 * 60_000) throw new KuralHatasi(`${ad} gelecekte olamaz.`);
  if (ms < simdi - 7 * GUN_MS) throw new KuralHatasi(`${ad} en fazla 7 gün geriye girilebilir.`);
  return ms;
}

const kisiKodu = (v, ad, zorunlu) => {
  const k = metin(v, ad, { zorunlu });
  if (k && !kisiBul(k)) throw new KuralHatasi(`${ad} tanınmıyor: kişi kodu olmalı (ör. K-MKAYA). Liste: /v1/ana-veriler`);
  return k;
};

/**
 * @param {object} o
 * @param {ReturnType<import('./store.js').openStore>} o.store
 * @param {() => number} [o.simdi]
 */
export function servisOlustur({ store, simdi = Date.now, senaryo = varsayilanSenaryo }) {
  const bugun = () => istanbulGunu(simdi());
  /** Son n günün (bugün dahil) görünür kayıtları. */
  const donemKayitlari = (gunSayisi, f = {}) => store.kayitlar({ ...f, bas: anMs(gunEkle(bugun(), -(gunSayisi - 1))), simdi: simdi() });

  // Pano, dakikada bir kez hesaplanır (aynı dakikadaki ziyaretçiler aynı sonucu alır).
  let panoOnbellek = { anahtar: null, veri: null };

  return {
    durum() {
      const s = store.sayilar(simdi());
      return {
        api: API_SURUMU,
        ureticiSurumu: senaryo.surum,
        simdi: isoTr(simdi()),
        bugun: bugun(),
        sonUretim: (() => { const u = store.sonUretim(); return u && { ...u, zaman: isoTr(u.zaman) }; })(),
        kayitlar: { gorunur: s.gorunur ?? 0, gercek: s.gercek ?? 0, ilkGun: s.ilkGun },
        not: 'Veri sentetiktir (kaynak=sentetik). Üretici ertesi günü önceden yazar; API yalnız saati gelmiş kayıtları gösterir, bitişi gelmemiş arıza açık görünür.',
      };
    },

    anaVeriler,

    ekipmanlar() {
      const g = bugun();
      return EKIPMANLAR.map((e) => ({ ...e, tipAd: TIPLER[e.tip].ad, bakim: bakimDurumu(e, g, senaryo) }));
    },

    /** Kayıt listesi. gun: son n gün; ya da bas/bit (YYYY-AA-GG, bit dahil). */
    arizalar(q = {}) {
      const f = { simdi: simdi() };
      if (q.bas || q.bit) {
        if (q.bas && !gecerliGun(q.bas)) throw new KuralHatasi('bas YYYY-AA-GG biçiminde olmalı.');
        if (q.bit && !gecerliGun(q.bit)) throw new KuralHatasi('bit YYYY-AA-GG biçiminde olmalı.');
        if (q.bas) f.bas = anMs(q.bas);
        if (q.bit) f.bit = anMs(gunEkle(q.bit, 1));
      } else {
        f.bas = anMs(gunEkle(bugun(), -(donem(q.gun, 7) - 1)));
      }
      if (q.ekipman) { if (!ekipmanBul(q.ekipman)) throw new KuralHatasi('Ekipman kodu tanınmıyor.'); f.ekipman = q.ekipman; }
      if (q.tur) { if (!turBul(q.tur)) throw new KuralHatasi('Arıza türü kodu tanınmıyor.'); f.tur = q.tur; }
      if (q.kaynak) { if (!['sentetik', 'gercek'].includes(q.kaynak)) throw new KuralHatasi('kaynak sentetik ya da gercek olmalı.'); f.kaynak = q.kaynak; }
      if (q.acik === true || q.acik === '1' || q.acik === 'true') f.acik = true;
      const limit = q.limit == null || q.limit === '' ? 200 : Number(q.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 2000) throw new KuralHatasi('limit 1 ile 2000 arasında olmalı.');
      f.limit = limit;
      return { kayitlar: store.kayitlar(f).map(kayitGorunumu) };
    },

    ariza(id) {
      if (typeof id !== 'string' || !/^[SG]-\d{8}-[0-9a-f]{3,8}$/.test(id)) throw new KuralHatasi('Kayıt kimliği geçersiz.');
      const k = store.kayitBul(id, simdi());
      if (!k) throw new KuralHatasi('Kayıt bulunamadı.', { durum: 404, kod: 'yok' });
      return kayitGorunumu(k);
    },

    ozet(q = {}) {
      const n = donem(q.gun, 30);
      const k = donemKayitlari(n);
      return { donemGun: n, ekipmanlar: ekipmanOzeti(k, n, bugun()), pareto: pareto(k, { tip: q.tip, ekipman: q.ekipman }), kayiplar: kayipDagilimi(k) };
    },

    ekipmanDetayi(kod, q = {}) {
      const e = ekipmanBul(kod);
      if (!e) throw new KuralHatasi('Ekipman kodu tanınmıyor.', { durum: 404, kod: 'yok' });
      const n = donem(q.gun, 30);
      const k = donemKayitlari(n);
      return {
        donemGun: n,
        ozet: ekipmanOzeti(k, n, bugun()).find((x) => x.kod === kod),
        pareto: pareto(k, { ekipman: kod }),
        sonKayitlar: k.filter((x) => x.ekipman === kod).slice(0, 20).map(kayitGorunumu),
      };
    },

    cozenler(q = {}) {
      const n = donem(q.gun, 90);
      return { donemGun: n, tipler: cozenDagilimi(donemKayitlari(n)) };
    },

    bulgular(q = {}) {
      const n = donem(q.gun, 90);
      return { donemGun: n, bulgular: bulgular(donemKayitlari(n), bugun()) };
    },

    /**
     * Vardiya üretimi (OEE girdisi): yalnız bitmiş vardiyalar. Nabız OEE'yi bundan hesaplar.
     * Satır: planli_dk (planlı bakım düşülmüş vardiya süresi), durus_dk, uretilen, hatali; tipin ideal hızı ve birimi eklenir.
     */
    uretim(q = {}) {
      const n = donem(q.gun, 30);
      if (q.ekipman && !ekipmanBul(q.ekipman)) throw new KuralHatasi('Ekipman kodu tanınmıyor.');
      const an = simdi();
      const bitti = (gun, v) => anMs(gun, VARDIYALAR.find((x) => x.no === v).bitSaat) <= an;
      const satirlar = store.vardiyaUretimi({ bas: gunEkle(bugun(), -(n - 1)), bit: bugun(), ekipman: q.ekipman || undefined }, bitti);
      return {
        donemGun: n,
        tipler: Object.fromEntries(Object.entries(TIPLER).map(([k, t]) => [k, { idealHiz: t.idealHiz, birim: t.birim }])),
        satirlar: satirlar.map((r) => ({ ...r, tip: ekipmanBul(r.ekipman)?.tip })),
      };
    },

    /** Web arayüzünün tek isteği. */
    pano() {
      const an = simdi();
      const anahtar = Math.floor(an / 60_000);
      if (panoOnbellek.anahtar === anahtar) return panoOnbellek.veri;
      const k90 = donemKayitlari(90);
      const k30 = k90.filter((k) => k.baslangic >= anMs(gunEkle(bugun(), -29)));
      const son24 = k90.filter((k) => k.baslangic >= an - GUN_MS && k.kayip !== 'planli');
      const ozet30 = ekipmanOzeti(k30, 30, bugun());
      const toplamCalisma = ozet30.reduce((t, e) => t + (e.kullanilabilirlik != null ? 1 : 0), 0);
      const veri = {
        simdi: isoTr(an),
        durum: this.durum(),
        son24: {
          adet: son24.length,
          acik: son24.filter((k) => k.bitis == null).length,
          durusDk: son24.filter((k) => k.bitis != null).reduce((t, k) => t + k.sure_dk, 0),
        },
        kullanilabilirlik30: toplamCalisma ? Math.round((ozet30.reduce((t, e) => t + (e.kullanilabilirlik ?? 0), 0) / toplamCalisma) * 1000) / 1000 : null,
        akis: k90.slice(0, 25).map(kayitGorunumu),
        ekipmanlar30: ozet30,
        pareto30: pareto(k30).slice(0, 10),
        kayiplar30: kayipDagilimi(k30),
        cozenler90: cozenDagilimi(k90),
        bulgular90: bulgular(k90, bugun()),
      };
      panoOnbellek = { anahtar, veri };
      return veri;
    },

    /** Gerçek arıza bildirimi (yazma anahtarı gerekir; kapı denetler). */
    arizaBildir(g = {}) {
      const an = simdi();
      const ekipman = metin(g.ekipman, 'ekipman', { zorunlu: true });
      const e = ekipmanBul(ekipman);
      if (!e) throw new KuralHatasi('Ekipman kodu tanınmıyor. Liste: /v1/ana-veriler');
      const turKod = metin(g.tur, 'tur', { zorunlu: true });
      const t = turBul(turKod);
      if (!t || (t.tip && t.tip !== e.tip) || (!t.tip && turKod !== planliKod(e.tip))) throw new KuralHatasi('Arıza türü bu ekipman tipine ait değil.');
      const baslangic = zamanOku(g.baslangic, 'baslangic', an);
      const gun = istanbulGunu(baslangic);
      const saat = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23' }).format(new Date(baslangic)));
      const id = store.gercekEkle({
        gun, ekipman, tur: turKod, kayip: t.kayip, vardiya: saat < 8 ? 3 : saat < 16 ? 1 : 2, baslangic,
        bildiren: kisiKodu(g.bildiren, 'bildiren', false), aciklama: metin(g.aciklama, 'aciklama'), onem: t.onem,
      }, an);
      panoOnbellek.anahtar = null;
      return this.ariza(id);
    },

    arizaKapat(id, g = {}) {
      if (typeof id !== 'string' || !/^G-\d{8}-[0-9a-f]{8}$/.test(id)) throw new KuralHatasi('Yalnız gerçek (G-) kayıtlar kapatılabilir.');
      const an = simdi();
      const bitis = zamanOku(g.bitis, 'bitis', an);
      const cozen = kisiKodu(g.cozen, 'cozen', true);
      const islem = metin(g.islem, 'islem', { zorunlu: true });
      const mevcut = store.kayitBul(id, an);
      if (!mevcut) throw new KuralHatasi('Kayıt bulunamadı.', { durum: 404, kod: 'yok' });
      if (mevcut.bitis != null) throw new KuralHatasi('Kayıt zaten kapalı.', { durum: 409, kod: 'kapali' });
      if (bitis < mevcut.baslangic) throw new KuralHatasi('Bitiş, başlangıçtan önce olamaz.');
      store.gercekKapat(id, { bitis, cozen, islem });
      panoOnbellek.anahtar = null;
      return this.ariza(id);
    },

    kisiler: () => KISILER,
  };
}
