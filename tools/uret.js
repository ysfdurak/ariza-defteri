// Elle üretim (sunucu zaten saatlik kendisi üretir; bu araç yeniden üretmek ya da denemek içindir).
//   node tools/uret.js                      eksik günleri tamamla (geçmiş 180 gün + bugün + yarın)
//   node tools/uret.js --gun 30 --yeniden   son 30 günü + bugün + yarını baştan üret (senaryo.json değiştiyse)
//   node tools/uret.js --goster 2026-11-27  bir günü veritabanına yazmadan ekrana dök
// Sunucuda: sudo docker exec ariza-defteri node --disable-warning=ExperimentalWarning tools/uret.js --gun 30 --yeniden
import { mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadConfig } from '../server/config.js';
import { openStore } from '../server/store.js';
import { uretimiTamamla } from '../server/zamanlayici.js';
import { gunuUret } from '../src/cekirdek/uretici.js';
import { gecerliGun, isoTr } from '../src/cekirdek/zaman.js';

const { values } = parseArgs({ options: { gun: { type: 'string' }, yeniden: { type: 'boolean' }, goster: { type: 'string' } } });

if (values.goster) {
  if (!gecerliGun(values.goster)) throw new Error('--goster YYYY-AA-GG olmalı');
  for (const k of gunuUret(values.goster)) console.log(`${isoTr(k.baslangic).slice(11, 16)}  ${k.ekipman}  ${k.tur.padEnd(7)} ${String(k.sure_dk).padStart(3)} dk  ${k.cozen}`);
  process.exit(0);
}

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });
const store = openStore(config.dbFile);
const gecmisGun = values.gun != null ? Math.max(0, Math.min(360, Number(values.gun) || 0)) : config.gecmisGun;
const s = uretimiTamamla({ store, gecmisGun, yeniden: !!values.yeniden, log: console.log });
console.log(`Tamam: ${s.uretilenGun} gün, ${s.kayit} kayıt.`);
store.close();
