// Arıza Defteri sunucusu — başlatma.  Kullanım: npm start   (ayarlar: .env.example, docs/SUNUCU_KURULUMU.md)
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { loadConfig } from './config.js';
import { openStore } from './store.js';
import { createApp } from './app.js';
import { uretimiTamamla } from './zamanlayici.js';

const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);
const config = loadConfig();
if (config.errors.length) {
  console.error('Arıza Defteri başlatılamadı, ayarları kontrol et:\n - ' + config.errors.join('\n - '));
  process.exit(1);
}

mkdirSync(config.dataDir, { recursive: true });
const store = openStore(config.dbFile);
const app = createApp({ config, store, log });

// Açılışta eksik günler (ilk kurulumda geçmiş dahil) tamamlanır; sonra her saat bugün ve yarın kontrol edilir.
const uret = () => {
  if (!config.sentetik) return;
  try {
    uretimiTamamla({ store, gecmisGun: config.gecmisGun, log });
  } catch (err) {
    log(`Üretim hatası: ${err?.stack || err}`);
  }
};
uret();
setInterval(() => { uret(); app.bakim(); }, 3600e3).unref();

const server = createServer(app.handle);
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.listen(config.port, config.host, () => {
  log(`Arıza Defteri: ${config.appUrl} (dinlenen ${config.host}:${config.port}) · sentetik: ${config.sentetik ? `açık (geçmiş ${config.gecmisGun} gün)` : 'kapalı'} · yazma: ${config.yazmaAnahtarlari.length ? 'anahtarla' : 'kapalı'} · MCP: ${config.mcpEnabled ? 'açık' : 'kapalı'}`);
});

function shutdown(signal) {
  log(`${signal} alındı, kapanıyor…`);
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
