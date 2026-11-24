# Arıza Defteri API (v1)

Temel adres: `https://ariza.ysfdurak.com` (iç ağdan: `http://ariza-defteri:8080`). Yanıtlar JSON, saatler Türkiye saatiyle ISO 8601 (`2026-11-24T14:05:00+03:00`). Okuma herkese açıktır, ziyaretçi başına dakikada 60 istek sınırı vardır (aşılırsa `429`).

## Görünürlük kuralı

Üretici ertesi günü önceden yazar. API yalnız başlangıcı geçmiş kaydı döndürür. Başlamış ama bitmemiş kayıt `durum: "acik"` döner, `bitis`, `sure_dk`, `cozen` ve `islem` alanları `null` olur.

## Kayıt biçimi

```json
{
  "id": "S-20261124-010", "kaynak": "sentetik", "durum": "kapali",
  "ekipman": { "kod": "KV-02", "ad": "Konveyör hattı 2 (toplama)", "tip": "konveyor" },
  "tur": { "kod": "KV-FTS", "ad": "Fotosel arızası" },
  "kayip": { "kod": "kucuk_durus", "ad": "Küçük duruşlar" },
  "vardiya": 2, "baslangic": "2026-11-24T16:51:00+03:00", "bitis": "2026-11-24T17:21:00+03:00", "sure_dk": 30,
  "bildiren": { "kod": "K-O08", "ad": "Gülay Erdem" },
  "cozen": { "kod": "K-HYILDIZ", "ad": "Hakan Yıldız", "rol": "teknisyen" },
  "islem": "Fotosel değiştirildi", "aciklama": null, "onem": "orta"
}
```

`kaynak`: `sentetik` (üretici) ya da `gercek` (yazma API'si). Kimlikler: `S-YYYYAAGG-NNN` ve `G-YYYYAAGG-xxxxxxxx`.

## Okuma

| Yol | Parametreler | Döner |
| --- | --- | --- |
| `GET /v1/durum` | – | api sürümü, üretici sürümü, bugün, son üretim, kayıt sayıları |
| `GET /v1/ana-veriler` | – | ekipmanlar, arıza türleri, kişiler, kayıp sınıfları |
| `GET /v1/ekipman` | – | ekipmanlar ve bugünkü bakım durumu |
| `GET /v1/ekipman/{kod}` | `gun` (30) | tek ekipmanın özeti, Pareto'su, son 20 kaydı |
| `GET /v1/arizalar` | `gun` (7) ya da `bas`/`bit` (YYYY-AA-GG), `ekipman`, `tur`, `kaynak`, `acik=1`, `limit` (200, en çok 2000) | `{ kayitlar: [...] }` yeniden eskiye |
| `GET /v1/arizalar/{id}` | – | tek kayıt (saati gelmemişse 404) |
| `GET /v1/ozet` | `gun` (30), `tip`, `ekipman` | ekipman başına arıza, duruş, MTTR, MTBF, kullanılabilirlik, bakım; Pareto; 6 büyük kayıp |
| `GET /v1/uretim` | `gun` (30), `ekipman` | biten vardiyalar: `planli_dk`, `durus_dk`, `uretilen`, `hatali`; tiplerin `idealHiz` ve `birim` değeri |
| `GET /v1/cozenler` | `gun` (90) | ekipman tipi başına teknisyen payları ve risk (`yuksek` ≥ %70, `orta` ≥ %50) |
| `GET /v1/bulgular` | `gun` (90) | tekrarlayan gün, tek kişiye bağımlılık, geciken bakım |
| `GET /v1/pano` | – | arayüzün tek isteği (dakikada bir hesaplanır) |

`gun` 1-365 arasında olmalıdır, aksi hâlde `400` döner.

## Yazma (anahtar gerekir)

`Authorization: Bearer <YAZMA_ANAHTARLARI'ndan biri>`. Tarayıcıdan başka bir siteden gelen istek (`Origin` ya da `Sec-Fetch-Site`) `403` alır. Gövde en fazla 8 KB olabilir (`413`).

```http
POST /v1/arizalar
{ "ekipman": "FL-01", "tur": "FL-HID", "bildiren": "K-O01", "aciklama": "Sol silindirden yağ damlıyor", "baslangic": "2026-11-24T14:05:00+03:00" }
→ 201 + kayıt (durum: "acik")

POST /v1/arizalar/G-20261124-1a2b3c4d/kapat
{ "cozen": "K-SAYDIN", "islem": "Hortum değiştirildi", "bitis": "2026-11-24T14:50:00+03:00" }
→ 200 + kayıt (sure_dk hesaplanır) · zaten kapalıysa 409
```

Kurallar: Tür ekipmanın tipine ait olmalı. Kişi alanları kişi kodu olmalı (`/v1/ana-veriler`). Metinler en fazla 300 karakter olabilir ve kontrol karakteri içeremez. Zaman 7 günden eski ya da gelecekte olamaz. Sentetik kayıt kapatılamaz.
