// Üretim zamanlayıcısı: sunucu açılırken ve her saat başı "eksik gün var mı?" diye bakar.
// Ayrı bir cron yerine sunucunun içinde çalışır: sunucu bir gece kapalı kalsa bile açıldığında eksik günler tamamlanır,
// aynı gün iki kez üretilmez (uretim tablosu), sunucu dışında ayar gerekmez.
//   - Geçmiş: bugünden geriye gecmisGun gün (ilk kurulumda tek seferde dolar)
//   - Bugün ve yarın: yarın önceden yazılır; API saati gelmeyen kaydı göstermez
//   - Sürüm: senaryo.json'daki "surum" değişince saklanan günler yeni kurallarla yeniden üretilir
//   - Temizlik: saklama süresini aşan sentetik kayıtlar aylık özete aktarılıp silinir
import { gunuUret, vardiyaUretimi, varsayilanSenaryo } from '../src/cekirdek/uretici.js';
import { gunEkle, istanbulGunu } from '../src/cekirdek/zaman.js';

/**
 * @returns {{ uretilenGun: number, kayit: number, silinen: number }}
 */
export function uretimiTamamla({ store, simdi = Date.now(), gecmisGun = 180, senaryo = varsayilanSenaryo, yeniden = false, log = () => {} }) {
  const bugun = istanbulGunu(simdi);
  const varolan = yeniden ? new Map() : store.uretilenGunler();
  let uretilenGun = 0, kayit = 0;
  for (let i = -gecmisGun; i <= 1; i++) {
    const gun = gunEkle(bugun, i);
    // Üretici sürümü değiştiyse (senaryo.json "surum") gün yeniden üretilir; gerçek kayıtlara dokunulmaz.
    if (varolan.get(gun) === senaryo.surum) continue;
    const kayitlar = gunuUret(gun, senaryo);
    kayit += store.gunuYaz(gun, kayitlar, senaryo.surum, simdi, vardiyaUretimi(gun, kayitlar, senaryo));
    uretilenGun++;
  }
  const silinen = store.temizle(gunEkle(bugun, -senaryo.saklamaGun));
  if (uretilenGun || silinen) log(`Üretim: ${uretilenGun} gün, ${kayit} kayıt yazıldı${silinen ? `; ${silinen} eski kayıt özetlenip silindi` : ''}.`);
  return { uretilenGun, kayit, silinen };
}
