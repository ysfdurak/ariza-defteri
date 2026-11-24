# Arıza Defteri MCP

Claude ve diğer MCP istemcileri arıza verisine soru sorabilir. Araçların hepsi **salt okumadır**. Yazma yalnız `/v1` API'si ve ayrı bir anahtarla yapılır.

## Açma

`.env` dosyasında: `MCP_ENABLED=true` ve `MCP_ANAHTARLARI=<openssl rand -hex 32>`. Kurulum betiği ikisini de kendisi üretir.

## Bağlama

Adres: `https://ariza.ysfdurak.com/mcp`. Başlık: `Authorization: Bearer <anahtar>`. Başlık eklenemeyen istemcide adres `https://ariza.ysfdurak.com/mcp/<anahtar>` olur. Bu biçimde anahtar adreste durduğu için adresi kimseyle paylaşma.

## Araçlar

| Araç | Ne döner |
| --- | --- |
| `durum` | Son üretim, kayıt sayısı, bugün |
| `ana_veriler` | Ekipman, arıza türü, kişi kodları |
| `arizalari_listele` | Kayıtlar (gün, ekipman, tür, açık, limit) |
| `ekipman_ozeti` | Ekipman başına MTTR, MTBF, kullanılabilirlik, bakım |
| `ekipman_detayi` | Tek ekipmanın özeti, Pareto'su, son kayıtları |
| `pareto` | Arıza türleri duruşa göre, 6 büyük kayıp |
| `kim_cozuyor` | Teknisyen payları, tek kişiye bağımlılık |
| `vardiya_uretimi` | Biten vardiyaların planlı süresi, duruşu, iş adedi, hatalısı (OEE girdisi) |
| `bulgular` | Tekrarlayan gün, tek kişi, geciken bakım |

## Örnek sorular

- "Bu ay en çok duran ekipman hangisi, neden?"
- "RT-03'ün arızalarında bir desen var mı?"
- "Murat Kaya iki hafta izne çıkarsa hangi ekipman risk altında?"
- "Bakımı geciken ekipman var mı?"
