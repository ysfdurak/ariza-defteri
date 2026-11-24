// SQLite deposu (Node'un yerleşik node:sqlite modülü; ek paket gerekmez). SQL'lerin hepsi parametrelidir.
//   ariza      : arıza ve planlı bakım kayıtları (sentetik ve gerçek aynı tabloda, "kaynak" sütunuyla ayrılır)
//   uretim     : hangi gün, ne zaman, hangi üretici sürümüyle üretildi (iki kez üretimi ve boşlukları izlemek için)
//   vardiya_uretim : vardiya başına planlı süre, duruş, iş adedi, hatalı (OEE'nin girdisi; yalnız biten vardiya görünür)
//   aylik_ozet : saklama süresini aşan sentetik kayıtların ay/ekipman/tür özeti (silinmeden önce)
//   meta       : küçük ayarlar
//
// GÖRÜNÜRLÜK KURALI: Üretici ertesi günü önceden yazar. Okuma sorguları yalnız "başlangıcı şimdiden önce" olan kayıtları
// döndürür; başlamış ama bitişi gelmemiş arıza "açık" görünür (bitiş, süre, çözen ve işlem gizlenir).
// Böylece uygulama gün içinde canlı görünür, arkada sürekli çalışan bir süreç gerekmez.
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';

const SUTUNLAR = 'id, gun, kaynak, ekipman, tur, kayip, vardiya, baslangic, bitis, sure_dk, bildiren, cozen, islem, aciklama, onem';

export function openStore(dosya) {
  const db = new DatabaseSync(dosya);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS meta (anahtar TEXT PRIMARY KEY, deger TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ariza (
      id TEXT PRIMARY KEY, gun TEXT NOT NULL, kaynak TEXT NOT NULL CHECK (kaynak IN ('sentetik', 'gercek')),
      ekipman TEXT NOT NULL, tur TEXT NOT NULL, kayip TEXT NOT NULL, vardiya INTEGER,
      baslangic INTEGER NOT NULL, bitis INTEGER, sure_dk INTEGER,
      bildiren TEXT, cozen TEXT, islem TEXT, aciklama TEXT, onem TEXT NOT NULL, olusturma INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS ariza_baslangic ON ariza (baslangic);
    CREATE INDEX IF NOT EXISTS ariza_gun_kaynak ON ariza (gun, kaynak);
    CREATE INDEX IF NOT EXISTS ariza_ekipman ON ariza (ekipman, baslangic);
    CREATE TABLE IF NOT EXISTS uretim (gun TEXT PRIMARY KEY, zaman INTEGER NOT NULL, kayit INTEGER NOT NULL, surum TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS vardiya_uretim (
      gun TEXT NOT NULL, vardiya INTEGER NOT NULL, ekipman TEXT NOT NULL, kaynak TEXT NOT NULL,
      planli_dk INTEGER NOT NULL, durus_dk INTEGER NOT NULL, uretilen INTEGER NOT NULL, hatali INTEGER NOT NULL,
      PRIMARY KEY (gun, vardiya, ekipman, kaynak));
    CREATE TABLE IF NOT EXISTS aylik_ozet (
      ay TEXT NOT NULL, kaynak TEXT NOT NULL, ekipman TEXT NOT NULL, tur TEXT NOT NULL, adet INTEGER NOT NULL, durus_dk INTEGER NOT NULL,
      PRIMARY KEY (ay, kaynak, ekipman, tur));
  `);

  const ekle = db.prepare(`INSERT INTO ariza (${SUTUNLAR}, olusturma) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const satirEkle = (k, zaman) => ekle.run(k.id, k.gun, k.kaynak, k.ekipman, k.tur, k.kayip, k.vardiya ?? null, k.baslangic, k.bitis ?? null,
    k.sure_dk ?? null, k.bildiren ?? null, k.cozen ?? null, k.islem ?? null, k.aciklama ?? null, k.onem, zaman);

  /** Zamanı gelmemiş bilgiyi gizler: bitişi gelecekteyse kayıt açık görünür. */
  const gorunur = (satir, simdi) => (satir.bitis != null && satir.bitis > simdi
    ? { ...satir, bitis: null, sure_dk: null, cozen: null, islem: null }
    : { ...satir });

  function islem(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const sonuc = fn();
      db.exec('COMMIT');
      return sonuc;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  return {
    /** Bir günün sentetik kayıtlarını yazar. Aynı gün yeniden yazılırsa önce o günün sentetik kayıtları silinir (çift kayıt olmaz). */
    gunuYaz(gun, kayitlar, surum, zaman = Date.now(), uretimSatirlari = []) {
      return islem(() => {
        db.prepare("DELETE FROM ariza WHERE gun = ? AND kaynak = 'sentetik'").run(gun);
        db.prepare("DELETE FROM vardiya_uretim WHERE gun = ? AND kaynak = 'sentetik'").run(gun);
        for (const k of kayitlar) satirEkle(k, zaman);
        const u = db.prepare('INSERT INTO vardiya_uretim (gun, vardiya, ekipman, kaynak, planli_dk, durus_dk, uretilen, hatali) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (const x of uretimSatirlari) u.run(x.gun, x.vardiya, x.ekipman, x.kaynak, x.planli_dk, x.durus_dk, x.uretilen, x.hatali);
        db.prepare('INSERT INTO uretim (gun, zaman, kayit, surum) VALUES (?, ?, ?, ?) ON CONFLICT(gun) DO UPDATE SET zaman = excluded.zaman, kayit = excluded.kayit, surum = excluded.surum')
          .run(gun, zaman, kayitlar.length, surum);
        return kayitlar.length;
      });
    },

    /** gün → üretici sürümü (sürüm değişince o gün yeniden üretilir). */
    uretilenGunler() {
      return new Map(db.prepare('SELECT gun, surum FROM uretim').all().map((r) => [r.gun, r.surum]));
    },

    /** Biten vardiyaların üretim satırları (bas/bit: gün, bit dahil). bitenler: [gun, vardiya] çiftinin bittiğini söyleyen fonksiyon. */
    vardiyaUretimi({ bas, bit, ekipman }, bitti) {
      const k = ['gun >= ?', 'gun <= ?'];
      const d = [bas, bit];
      if (ekipman) { k.push('ekipman = ?'); d.push(ekipman); }
      return db.prepare(`SELECT gun, vardiya, ekipman, kaynak, planli_dk, durus_dk, uretilen, hatali FROM vardiya_uretim WHERE ${k.join(' AND ')} ORDER BY gun, vardiya, ekipman`)
        .all(...d).filter((r) => bitti(r.gun, r.vardiya));
    },

    sonUretim() {
      return db.prepare('SELECT gun, zaman, kayit, surum FROM uretim ORDER BY zaman DESC, gun DESC LIMIT 1').get() ?? null;
    },

    /**
     * Görünür kayıtlar. Filtreler isteğe bağlı. simdi: görünürlük sınırı (varsayılan şimdi).
     * @param {{ bas?: number, bit?: number, ekipman?: string, tur?: string, kaynak?: string, acik?: boolean, limit?: number, simdi?: number, yeniEnUstte?: boolean }} f
     */
    kayitlar(f = {}) {
      const simdi = f.simdi ?? Date.now();
      const kosul = ['baslangic <= ?'];
      const deger = [simdi];
      if (f.bas != null) { kosul.push('baslangic >= ?'); deger.push(f.bas); }
      if (f.bit != null) { kosul.push('baslangic < ?'); deger.push(f.bit); }
      if (f.ekipman) { kosul.push('ekipman = ?'); deger.push(f.ekipman); }
      if (f.tur) { kosul.push('tur = ?'); deger.push(f.tur); }
      if (f.kaynak) { kosul.push('kaynak = ?'); deger.push(f.kaynak); }
      if (f.acik) { kosul.push('(bitis IS NULL OR bitis > ?)'); deger.push(simdi); }
      const sira = f.yeniEnUstte === false ? 'ASC' : 'DESC';
      const limit = Math.min(Math.max(1, f.limit ?? 100_000), 100_000);
      return db.prepare(`SELECT ${SUTUNLAR} FROM ariza WHERE ${kosul.join(' AND ')} ORDER BY baslangic ${sira}, id ${sira} LIMIT ${limit}`)
        .all(...deger).map((s) => gorunur(s, simdi));
    },

    kayitBul(id, simdi = Date.now()) {
      const s = db.prepare(`SELECT ${SUTUNLAR} FROM ariza WHERE id = ? AND baslangic <= ?`).get(id, simdi);
      return s ? gorunur(s, simdi) : null;
    },

    /** Gerçek kayıt (Nabız gibi yazma anahtarı olan istemciden). */
    gercekEkle(k, zaman = Date.now()) {
      const id = `G-${k.gun.replaceAll('-', '')}-${randomBytes(4).toString('hex')}`;
      satirEkle({ ...k, id, kaynak: 'gercek' }, zaman);
      return id;
    },

    /** Açık gerçek kaydı kapatır. Sentetik kayıtlar kapatılamaz. Döner: güncellenen satır sayısı. */
    gercekKapat(id, { bitis, cozen, islem: yapilan }) {
      const s = db.prepare("SELECT baslangic FROM ariza WHERE id = ? AND kaynak = 'gercek' AND bitis IS NULL").get(id);
      if (!s) return 0;
      const sure = Math.max(1, Math.round((bitis - s.baslangic) / 60_000));
      return Number(db.prepare("UPDATE ariza SET bitis = ?, sure_dk = ?, cozen = ?, islem = ? WHERE id = ? AND kaynak = 'gercek' AND bitis IS NULL")
        .run(bitis, sure, cozen, yapilan, id).changes);
    },

    /** Saklama süresini aşan sentetik kayıtları aylık özete aktarıp siler. "uretim" satırları kalır; o günler yeniden üretilmez. */
    temizle(sinirGun) {
      return islem(() => {
        db.prepare(`INSERT INTO aylik_ozet (ay, kaynak, ekipman, tur, adet, durus_dk)
          SELECT substr(gun, 1, 7), kaynak, ekipman, tur, COUNT(*), COALESCE(SUM(sure_dk), 0) FROM ariza
          WHERE gun < ? AND kaynak = 'sentetik' GROUP BY substr(gun, 1, 7), kaynak, ekipman, tur
          ON CONFLICT(ay, kaynak, ekipman, tur) DO UPDATE SET adet = adet + excluded.adet, durus_dk = durus_dk + excluded.durus_dk`).run(sinirGun);
        db.prepare("DELETE FROM vardiya_uretim WHERE gun < ? AND kaynak = 'sentetik'").run(sinirGun);
        return Number(db.prepare("DELETE FROM ariza WHERE gun < ? AND kaynak = 'sentetik'").run(sinirGun).changes);
      });
    },

    aylikOzet() {
      return db.prepare('SELECT ay, kaynak, ekipman, tur, adet, durus_dk FROM aylik_ozet ORDER BY ay, ekipman, tur').all();
    },

    sayilar(simdi = Date.now()) {
      return db.prepare(`SELECT
        SUM(CASE WHEN baslangic <= ? THEN 1 ELSE 0 END) AS gorunur,
        SUM(CASE WHEN baslangic > ? THEN 1 ELSE 0 END) AS bekleyen,
        SUM(CASE WHEN kaynak = 'gercek' THEN 1 ELSE 0 END) AS gercek,
        MIN(gun) AS ilkGun FROM ariza`).get(simdi, simdi);
    },

    /** Ziyaretçi kimliği özetlenirken kullanılan gizli tuz (IP'nin kendisi hiçbir yerde saklanmaz). */
    tuz() {
      const s = db.prepare("SELECT deger FROM meta WHERE anahtar = 'tuz'").get();
      if (s) return s.deger;
      const deger = randomBytes(24).toString('base64url');
      db.prepare("INSERT INTO meta (anahtar, deger) VALUES ('tuz', ?)").run(deger);
      return deger;
    },

    close: () => db.close(),
  };
}
