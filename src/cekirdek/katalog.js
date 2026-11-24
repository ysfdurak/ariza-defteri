// Ana veriler: Yıldız Ev & Yaşam deposunun ekipmanı, kişileri ve arıza türleri.
// Hepsi kurgusaldır. Üretici bu listeyi okur; Nabız, Usta ve Emanet aynı kodları kullanır.
// Bir kod değişirse eski kayıtlar o koda bağlı kalır: kod silmek yerine yeni kod eklenir.

/** TPM'in 6 büyük kaybı + planlı bakım (kayıp sayılmaz, ayrı tutulur). */
export const KAYIPLAR = {
  ariza: 'Ekipman arızası',
  ayar: 'Kurulum ve ayar',
  kucuk_durus: 'Küçük duruşlar',
  hiz: 'Hız düşüklüğü',
  kalite: 'Hata ve hasar',
  baslangic: 'Başlangıç kayıpları',
  planli: 'Planlı bakım',
};

/** Vardiyalar (Türkiye saati). 3. vardiya aynı takvim gününün sabahıdır. */
export const VARDIYALAR = [
  { no: 1, ad: '1. vardiya', basSaat: 8, bitSaat: 16 },
  { no: 2, ad: '2. vardiya', basSaat: 16, bitSaat: 24 },
  { no: 3, ad: '3. vardiya', basSaat: 0, bitSaat: 8 },
];

/**
 * Ekipman tipleri.
 * bakimGun: planlı bakım periyodu · vardiyalar: hangi vardiyalarda çalışır · kullanim: vardiya içinde ortalama kullanım oranı
 * idealHiz: saatte en iyi koşulda iş adedi (OEE performansının paydası) · birim: o işin adı
 */
export const TIPLER = {
  forklift: { ad: 'Forklift', bakimGun: 30, vardiyalar: [1, 2, 3], kullanim: 0.75, idealHiz: 24, birim: 'palet hareketi' },
  reach_truck: { ad: 'Reach truck', bakimGun: 30, vardiyalar: [1, 2, 3], kullanim: 0.7, idealHiz: 18, birim: 'palet hareketi' },
  konveyor: { ad: 'Konveyör hattı', bakimGun: 45, vardiyalar: [1, 2, 3], kullanim: 0.85, idealHiz: 900, birim: 'koli' },
  sorter: { ad: 'Sorter', bakimGun: 30, vardiyalar: [1, 2], kullanim: 0.9, idealHiz: 2400, birim: 'koli' },
  strec: { ad: 'Streç makinesi', bakimGun: 60, vardiyalar: [1, 2], kullanim: 0.6, idealHiz: 30, birim: 'palet' },
};

/** Ekipman listesi. devreye: ilk çalışma tarihi (yaş hesabı). */
export const EKIPMANLAR = [
  { kod: 'FL-01', tip: 'forklift', ad: 'Forklift 1', bolge: 'Mal kabul', devreye: '2017-03-01' },
  { kod: 'FL-02', tip: 'forklift', ad: 'Forklift 2', bolge: 'Mal kabul', devreye: '2018-06-15' },
  { kod: 'FL-03', tip: 'forklift', ad: 'Forklift 3', bolge: 'Mal kabul', devreye: '2021-02-01' },
  { kod: 'FL-04', tip: 'forklift', ad: 'Forklift 4', bolge: 'Sevkiyat', devreye: '2019-09-10' },
  { kod: 'FL-05', tip: 'forklift', ad: 'Forklift 5', bolge: 'Sevkiyat', devreye: '2022-04-01' },
  { kod: 'FL-06', tip: 'forklift', ad: 'Forklift 6', bolge: 'Sevkiyat', devreye: '2023-11-20' },
  { kod: 'FL-07', tip: 'forklift', ad: 'Forklift 7', bolge: 'Ana depo', devreye: '2016-08-01' },
  { kod: 'FL-08', tip: 'forklift', ad: 'Forklift 8', bolge: 'Ana depo', devreye: '2024-05-06' },
  { kod: 'RT-01', tip: 'reach_truck', ad: 'Reach truck 1', bolge: 'Yüksek raf', devreye: '2019-01-15' },
  { kod: 'RT-02', tip: 'reach_truck', ad: 'Reach truck 2', bolge: 'Yüksek raf', devreye: '2020-07-01' },
  { kod: 'RT-03', tip: 'reach_truck', ad: 'Reach truck 3', bolge: 'Yüksek raf', devreye: '2018-03-12' },
  { kod: 'RT-04', tip: 'reach_truck', ad: 'Reach truck 4', bolge: 'Yüksek raf', devreye: '2023-02-01' },
  { kod: 'KV-01', tip: 'konveyor', ad: 'Konveyör hattı 1 (mal kabul)', bolge: 'Mal kabul', devreye: '2018-01-10' },
  { kod: 'KV-02', tip: 'konveyor', ad: 'Konveyör hattı 2 (toplama)', bolge: 'Ana depo', devreye: '2018-01-10' },
  { kod: 'KV-03', tip: 'konveyor', ad: 'Konveyör hattı 3 (sevkiyat)', bolge: 'Sevkiyat', devreye: '2022-09-01' },
  { kod: 'SR-01', tip: 'sorter', ad: 'Sorter', bolge: 'Sevkiyat', devreye: '2021-10-01' },
  { kod: 'ST-01', tip: 'strec', ad: 'Streç makinesi 1', bolge: 'Sevkiyat', devreye: '2020-02-01' },
  { kod: 'ST-02', tip: 'strec', ad: 'Streç makinesi 2', bolge: 'Sevkiyat', devreye: '2024-01-15' },
];

/**
 * Arıza türleri (tip başına).
 * oran: çalışılan bir vardiyada görülme olasılığı (yaş, bakım, sezon çarpanlarından önce)
 * mttr: tipik onarım süresi, dakika (medyan) · uzmanlik: çözmek için gereken alan
 * operator: true ise operatör kendisi giderir (otonom bakımın konusu), teknisyen çağrılmaz
 * asinma: GİZLİ Weibull şekil parametresi β (bakımdan sonra geçen süreye göre arıza yoğunluğu). β > 1 aşınma (zamanla artar),
 *   β = 1 rastgele (yok sayılır), β < 1 erken dönem (bakımdan hemen sonra yüksek, ayar bozulması gibi). API'de verilmez:
 *   Nabız Analiz bunu veriden kör tahmin eder; testler tahminin gerçeğe yakın çıktığını denetler.
 */
export const ARIZA_TURLERI = [
  { kod: 'FL-AKU', operator: true, tip: 'forklift', ad: 'Akü şarjı bitti / bağlantı gevşek', kayip: 'kucuk_durus', oran: 0.022, mttr: 15, uzmanlik: 'aku', onem: 'dusuk',
    islemler: ['Akü değiştirildi', 'Şarj soketi temizlendi ve sıkıldı', 'Akü şarja alındı, yedek akü takıldı'] },
  { kod: 'FL-HID', tip: 'forklift', ad: 'Hidrolik kaçak', kayip: 'ariza', oran: 0.009, mttr: 75, asinma: 1.6, uzmanlik: 'hidrolik', onem: 'yuksek',
    islemler: ['Hidrolik hortum değiştirildi', 'Rakor sıkıldı, yağ tamamlandı', 'Silindir contası değiştirildi'] },
  { kod: 'FL-LAS', tip: 'forklift', ad: 'Lastik hasarı', kayip: 'ariza', oran: 0.006, mttr: 60, asinma: 1.8, uzmanlik: 'mekanik', onem: 'orta',
    islemler: ['Lastik değiştirildi', 'Jant somunları sıkıldı, lastik kontrol edildi'] },
  { kod: 'FL-FRN', tip: 'forklift', ad: 'Fren ayarı bozuk', kayip: 'ayar', oran: 0.005, mttr: 35, asinma: 1.4, uzmanlik: 'mekanik', onem: 'yuksek',
    islemler: ['Fren balatası ayarlandı', 'Fren hidroliği havası alındı'] },
  { kod: 'FL-SNS', tip: 'forklift', ad: 'Uyarı ışığı / sensör hatası', kayip: 'kucuk_durus', oran: 0.012, mttr: 20, uzmanlik: 'elektrik', onem: 'dusuk',
    islemler: ['Sensör temizlendi', 'Hata kodu silindi, test edildi', 'Sensör kablosu değiştirildi'] },
  { kod: 'FL-CAT', tip: 'forklift', ad: 'Çatal hasarı / yükte hasar', kayip: 'kalite', oran: 0.004, mttr: 45, uzmanlik: 'mekanik', onem: 'orta',
    islemler: ['Çatal değiştirildi', 'Çatal ayarı yapıldı, hasarlı palet ayrıldı'] },

  { kod: 'RT-HID', tip: 'reach_truck', ad: 'Hidrolik kaçak / basınç düşük', kayip: 'ariza', oran: 0.010, mttr: 90, asinma: 1.5, uzmanlik: 'hidrolik', onem: 'yuksek',
    islemler: ['Hidrolik pompa contası değiştirildi', 'Hidrolik hortum değiştirildi', 'Basınç valfi ayarlandı'] },
  { kod: 'RT-AKU', operator: true, tip: 'reach_truck', ad: 'Akü şarjı bitti / bağlantı gevşek', kayip: 'kucuk_durus', oran: 0.018, mttr: 15, uzmanlik: 'aku', onem: 'dusuk',
    islemler: ['Akü değiştirildi', 'Şarj soketi temizlendi'] },
  { kod: 'RT-MAS', tip: 'reach_truck', ad: 'Direk zinciri / kaldırma sorunu', kayip: 'ariza', oran: 0.005, mttr: 120, asinma: 2.5, uzmanlik: 'mekanik', onem: 'yuksek',
    islemler: ['Direk zinciri gerildi ve yağlandı', 'Zincir makarası değiştirildi'] },
  { kod: 'RT-SNS', tip: 'reach_truck', ad: 'Yükseklik sensörü hatası', kayip: 'kucuk_durus', oran: 0.010, mttr: 25, uzmanlik: 'elektrik', onem: 'orta',
    islemler: ['Sensör temizlendi ve kalibre edildi', 'Sensör değiştirildi'] },
  { kod: 'RT-AYR', tip: 'reach_truck', ad: 'Kaldırma yüksekliği ayarı', kayip: 'ayar', oran: 0.004, mttr: 30, asinma: 0.7, uzmanlik: 'elektrik', onem: 'dusuk',
    islemler: ['Yükseklik limitleri yeniden ayarlandı'] },

  { kod: 'KV-BNT', tip: 'konveyor', ad: 'Bant kayması', kayip: 'kucuk_durus', oran: 0.020, mttr: 20, uzmanlik: 'mekanik', onem: 'dusuk',
    islemler: ['Bant gerginliği ayarlandı', 'Bant hizalandı'] },
  { kod: 'KV-SIK', operator: true, tip: 'konveyor', ad: 'Koli sıkışması', kayip: 'kucuk_durus', oran: 0.035, mttr: 8, uzmanlik: 'mekanik', onem: 'dusuk',
    islemler: ['Sıkışan koli alındı, hat yeniden başlatıldı'] },
  { kod: 'KV-FTS', tip: 'konveyor', ad: 'Fotosel arızası', kayip: 'kucuk_durus', oran: 0.010, mttr: 25, uzmanlik: 'elektrik', onem: 'orta',
    islemler: ['Fotosel temizlendi', 'Fotosel değiştirildi', 'Fotosel hizalandı'] },
  { kod: 'KV-MTR', tip: 'konveyor', ad: 'Motor / redüktör arızası', kayip: 'ariza', oran: 0.003, mttr: 150, asinma: 2.2, uzmanlik: 'elektrik', onem: 'yuksek',
    islemler: ['Motor değiştirildi', 'Redüktör yağı değiştirildi, rulman yenilendi'] },
  { kod: 'KV-HIZ', tip: 'konveyor', ad: 'Hat yavaş çalışıyor', kayip: 'hiz', oran: 0.008, mttr: 40, uzmanlik: 'elektrik', onem: 'orta',
    islemler: ['Sürücü (inverter) ayarı düzeltildi', 'Makaralar yağlandı'] },

  { kod: 'SR-OKU', tip: 'sorter', ad: 'Barkod okuyucu hatası (yanlış oluk)', kayip: 'kalite', oran: 0.030, mttr: 25, uzmanlik: 'sorter', onem: 'orta',
    islemler: ['Okuyucu camı temizlendi', 'Okuyucu yeniden kalibre edildi', 'Okuyucu değiştirildi'] },
  { kod: 'SR-SIK', operator: true, tip: 'sorter', ad: 'Sıkışma', kayip: 'kucuk_durus', oran: 0.040, mttr: 12, uzmanlik: 'sorter', onem: 'dusuk',
    islemler: ['Sıkışma giderildi, hat yeniden başlatıldı'] },
  { kod: 'SR-TRY', tip: 'sorter', ad: 'Tray / klape arızası', kayip: 'ariza', oran: 0.012, mttr: 70, asinma: 2.0, uzmanlik: 'sorter', onem: 'yuksek',
    islemler: ['Klape motoru değiştirildi', 'Tray mekanizması ayarlandı'] },
  { kod: 'SR-PLC', tip: 'sorter', ad: 'PLC / yazılım hatası', kayip: 'ariza', oran: 0.006, mttr: 90, uzmanlik: 'sorter', onem: 'yuksek',
    islemler: ['PLC yeniden başlatıldı, parametreler kontrol edildi', 'Yazılım yaması yüklendi'] },
  { kod: 'SR-ACL', tip: 'sorter', ad: 'Açılışta ısınma / test turu uzun sürdü', kayip: 'baslangic', oran: 0.025, mttr: 20, uzmanlik: 'sorter', onem: 'dusuk',
    islemler: ['Açılış testi tamamlandı', 'Isınma programı tekrar çalıştırıldı'] },

  { kod: 'ST-FLM', operator: true, tip: 'strec', ad: 'Film kopması', kayip: 'kucuk_durus', oran: 0.030, mttr: 6, uzmanlik: 'mekanik', onem: 'dusuk',
    islemler: ['Film yeniden takıldı'] },
  { kod: 'ST-AYR', tip: 'strec', ad: 'Gerginlik ayarı bozuk', kayip: 'ayar', oran: 0.010, mttr: 20, asinma: 0.6, uzmanlik: 'mekanik', onem: 'dusuk',
    islemler: ['Ön gerdirme ayarlandı'] },
  { kod: 'ST-MTR', tip: 'strec', ad: 'Döner tabla motoru arızası', kayip: 'ariza', oran: 0.003, mttr: 110, asinma: 2.0, uzmanlik: 'elektrik', onem: 'orta',
    islemler: ['Motor kömürleri değiştirildi', 'Motor değiştirildi'] },
];

/** Planlı bakım kaydı da aynı tabloya düşer; kayıp sayılmaz. */
export const PLANLI_BAKIM = { ad: 'Planlı bakım', kayip: 'planli', mttr: 120, onem: 'dusuk', islemler: ['Periyodik bakım yapıldı', 'Periyodik bakım ve yağlama yapıldı'] };
export const planliKod = (tip) => `${tip === 'reach_truck' ? 'RT' : tip === 'konveyor' ? 'KV' : tip === 'sorter' ? 'SR' : tip === 'strec' ? 'ST' : 'FL'}-PLN`;

/**
 * Kişiler. Teknisyenlerin uzmanlıkları 0-1 arası (1 = tam hâkim). Murat Kaya sorter'ı neredeyse tek başına bilir:
 * Emanet bu bağımlılığı gösterir, Usta çağrıyı ona yönlendirir; o izindeyken onarımlar uzar.
 */
export const KISILER = [
  { kod: 'K-MKAYA', ad: 'Murat Kaya', rol: 'teknisyen', vardiya: 1, uzmanlik: { sorter: 1, elektrik: 0.9, mekanik: 0.5 } },
  { kod: 'K-SAYDIN', ad: 'Serkan Aydın', rol: 'teknisyen', vardiya: 1, uzmanlik: { hidrolik: 1, mekanik: 0.9, aku: 0.7 } },
  { kod: 'K-ECELIK', ad: 'Emre Çelik', rol: 'teknisyen', vardiya: 2, uzmanlik: { aku: 1, elektrik: 0.8, hidrolik: 0.5, mekanik: 0.6 } },
  { kod: 'K-HYILDIZ', ad: 'Hakan Yıldız', rol: 'teknisyen', vardiya: 2, uzmanlik: { mekanik: 1, hidrolik: 0.6, elektrik: 0.5, sorter: 0.3 } },
  { kod: 'K-ODEMIR', ad: 'Oğuz Demir', rol: 'teknisyen', vardiya: 3, uzmanlik: { mekanik: 0.8, elektrik: 0.7, aku: 0.8, hidrolik: 0.4, sorter: 0.2 } },
  { kod: 'K-BSAHIN', ad: 'Burak Şahin', rol: 'teknisyen', vardiya: 1, uzmanlik: { mekanik: 0.6, aku: 0.6, elektrik: 0.4 } },
  { kod: 'K-AKOC', ad: 'Ayşe Koç', rol: 'sef', vardiya: 1, uzmanlik: {} },
  { kod: 'K-TOZTURK', ad: 'Tolga Öztürk', rol: 'sef', vardiya: 2, uzmanlik: {} },
  { kod: 'K-SARSLAN', ad: 'Selin Arslan', rol: 'sef', vardiya: 3, uzmanlik: {} },
  ...[
    ['Ali Yılmaz', 1], ['Mehmet Kurt', 1], ['Fatma Doğan', 1], ['Kemal Aksoy', 1], ['Zeynep Polat', 1],
    ['Cem Öz', 2], ['Hüseyin Kılıç', 2], ['Gülay Erdem', 2], ['Volkan Şen', 2], ['Derya Tekin', 2],
    ['İsmail Uçar', 3], ['Rıza Bulut', 3], ['Sibel Avcı', 3], ['Okan Güler', 3],
  ].map(([ad, vardiya], i) => ({ kod: `K-O${String(i + 1).padStart(2, '0')}`, ad, rol: 'operator', vardiya, uzmanlik: {} })),
];

export const ekipmanBul = (kod) => EKIPMANLAR.find((e) => e.kod === kod);
export const turBul = (kod) => ARIZA_TURLERI.find((t) => t.kod === kod)
  || (/^(FL|RT|KV|SR|ST)-PLN$/.test(kod) ? { kod, ...PLANLI_BAKIM, tip: null } : undefined);
export const kisiBul = (kod) => KISILER.find((k) => k.kod === kod);
