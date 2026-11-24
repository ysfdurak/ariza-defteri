# Sunucu kurulumu (ariza.ysfdurak.com)

Ortak altyapı (VPS, Docker, Caddy, `web` ağı) hazırsa kurulum tek komuttur. Ortak altyapının kendisi: [ysfdurak.com → sunucu/README.md](https://github.com/ysfdurak/ysfdurak.com/blob/main/sunucu/README.md).

1. **Cloudflare:** DNS'te `ariza` için A kaydı aç (sunucu IP'si, proxy açık).
2. **Sunucuda:**
   ```bash
   ssh yusuf@SUNUCU_IP
   bash ~/ysfdurak.com/sunucu/kurulum-ariza.sh
   ```
   Betik kodu çeker ve `.env`'i yazma ile MCP anahtarlarıyla üretir (yalnız sen okuyabilirsin). Ardından konteyneri kurar ve Caddy'yi yeniden başlatır. İlk açılışta 360 günlük geçmiş üretilir (birkaç saniye sürer).
3. **Kontrol:** `https://ariza.ysfdurak.com` açılmalı. `curl -sI https://ariza.ysfdurak.com | grep -i content-security` CSP başlığını göstermeli.

## Güncelleme

Aynı betiği tekrar çalıştır. Kodu çeker ve yeniden derler, `.env`'e ve veriye dokunmaz.

## Sık kullanılanlar

| İş | Komut |
| --- | --- |
| Kayıtlar | `sudo docker logs --tail 50 ariza-defteri` |
| Son 30 günü baştan üret (senaryo değiştiyse) | `sudo docker exec ariza-defteri node --disable-warning=ExperimentalWarning tools/uret.js --gun 30 --yeniden` |
| Anahtarları gör | `grep ANAHTAR ~/ariza-defteri/.env` |
| Nabız'ın iç adresi | `http://ariza-defteri:8080/v1/...` (aynı `web` ağı, internete çıkmaz) |

## Veri ve yedek

Veri `ariza-defteri_ariza-data` biriminde (`/data/ariza-defteri.db`) durur. Sentetik veri tarihten aynen yeniden üretilebildiği için gece yedeğine eklenmedi. Nabız gerçek kayıt yazmaya başladığında yedek betiğine eklenmelidir.

## Kurum içi kurulum

Docker olan herhangi bir sunucuda `deploy/docker-compose.ortak.yml` kullanılabilir. `web` ağı yoksa `docker network create web` ile oluşturulur. Gerçek veriyle kullanırken `.env` içinde `SENTETIK=false` yap.
