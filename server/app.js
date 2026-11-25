// HTTP katmanı: okuma API'si (/v1, herkese açık), yazma API'si (/v1, anahtarla), MCP kapısı (/mcp, anahtarla) ve arayüz.
// Kural içermez: isteği servise iletir, hatayı HTTP'ye çevirir, güvenlik başlıklarını ve sınırları uygular.
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { gercekIp } from './gercek-ip.js';
import { KuralHatasi, servisOlustur } from './servis.js';
import { createMcpHandler } from './mcp.js';

const TURLER = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };
const GOVDE_SINIRI = 8 * 1024;
// Arayüz kendi dosyalarını ve kendi API'sini kullanır; tek dış adres ortak ölçüm servisi (olcum.ysfdurak.com),
// betiği de yalnız resmî demo adresinde yüklenir (web/app.js). Dış yazı tipi yok.
const CSP = "default-src 'self'; script-src 'self' https://olcum.ysfdurak.com; style-src 'self'; img-src 'self' data:; connect-src 'self' https://olcum.ysfdurak.com; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

/**
 * @param {object} o
 * @param {ReturnType<import('./config.js').loadConfig>} o.config
 * @param {ReturnType<import('./store.js').openStore>} o.store
 */
export function createApp({ config, store, log = () => {}, simdi = Date.now }) {
  const servis = servisOlustur({ store, simdi });
  const ozet = (v) => createHash('sha256').update(String(v)).digest();
  const yazmaAnahtarlari = config.yazmaAnahtarlari.map(ozet);
  const mcpAnahtarlari = config.mcpAnahtarlari.map(ozet);
  const mcp = config.mcpEnabled ? createMcpHandler({ servis, log }) : null;
  const tuz = store.tuz();
  const appOrigin = new URL(config.appUrl).origin;

  // Arayüz dosyaları açılışta belleğe alınır; yalnız web/ klasöründeki bilinen türler sunulur (dizin gezme olmaz).
  const dosyalar = new Map();
  for (const ad of readdirSync(config.webDir)) {
    if (TURLER[extname(ad)]) dosyalar.set('/' + ad, { tur: TURLER[extname(ad)], icerik: readFileSync(join(config.webDir, ad)) });
  }

  /** Ziyaretçi anahtarı: IP'nin tuzlu özeti, yalnız bellekte (hız sınırı için). IP hiçbir yere yazılmaz. */
  const ziyaretci = (req) => ozet(tuz + gercekIp(req)).toString('base64url').slice(0, 22);
  const istekler = new Map();
  function hizSiniri(kim) {
    const an = simdi();
    const k = istekler.get(kim);
    if (!k || an - k.baslangic > 60_000) {
      istekler.set(kim, { baslangic: an, sayi: 1 });
      return true;
    }
    return ++k.sayi <= config.dakikalikIstek;
  }

  /** "Authorization: Bearer <anahtar>" sabit sürede karşılaştırılır; anahtarlar bellekte yalnız özet olarak durur. */
  function yetkili(req, liste, yedek = '') {
    const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''));
    const sunulan = m?.[1] || yedek;
    if (!sunulan || !liste.length) return false;
    const h = ozet(sunulan);
    return liste.some((a) => timingSafeEqual(a, h));
  }

  function basliklar(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    res.setHeader('Content-Security-Policy', CSP);
  }

  function json(res, durum, veri) {
    res.statusCode = durum;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(veri));
  }

  function readJson(req) {
    return new Promise((resolve, reject) => {
      if (Number(req.headers['content-length'] || 0) > GOVDE_SINIRI) {
        reject(new KuralHatasi('İstek çok büyük.', { durum: 413 }));
        req.resume();
        return;
      }
      let boyut = 0;
      const parcalar = [];
      req.on('data', (p) => {
        boyut += p.length;
        if (boyut > GOVDE_SINIRI) {
          reject(new KuralHatasi('İstek çok büyük.', { durum: 413 }));
          req.destroy();
        } else parcalar.push(p);
      });
      req.on('end', () => {
        try {
          const metin = Buffer.concat(parcalar).toString('utf8');
          const veri = metin ? JSON.parse(metin) : {};
          if (!veri || typeof veri !== 'object' || Array.isArray(veri)) throw new Error('nesne değil');
          resolve(veri);
        } catch {
          reject(new KuralHatasi('İstek gövdesi geçerli JSON nesnesi olmalı.'));
        }
      });
      req.on('error', reject);
    });
  }

  async function v1(req, res, path, sorgu) {
    const q = Object.fromEntries(sorgu);
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (path === '/v1/durum') return json(res, 200, servis.durum());
      if (path === '/v1/ana-veriler') return json(res, 200, servis.anaVeriler());
      if (path === '/v1/ekipman') return json(res, 200, { ekipmanlar: servis.ekipmanlar() });
      if (path === '/v1/arizalar') return json(res, 200, servis.arizalar(q));
      if (path.startsWith('/v1/arizalar/')) return json(res, 200, servis.ariza(path.slice('/v1/arizalar/'.length)));
      if (path === '/v1/ozet') return json(res, 200, servis.ozet(q));
      if (path.startsWith('/v1/ekipman/')) return json(res, 200, servis.ekipmanDetayi(path.slice('/v1/ekipman/'.length), q));
      if (path === '/v1/cozenler') return json(res, 200, servis.cozenler(q));
      if (path === '/v1/bulgular') return json(res, 200, servis.bulgular(q));
      if (path === '/v1/pano') return json(res, 200, servis.pano());
      if (path === '/v1/uretim') return json(res, 200, servis.uretim(q));
      return json(res, 404, { hata: 'Bulunamadı.' });
    }
    if (req.method !== 'POST') return json(res, 405, { hata: 'Yöntem desteklenmiyor.' });
    // Yazma: tarayıcıdan başka bir siteden gelen istek reddedilir; sunucudan sunucuya istekte Origin olmaz, anahtar yeter.
    const origin = req.headers.origin;
    if (origin && origin !== appOrigin) return json(res, 403, { hata: 'İstek kaynağı reddedildi.' });
    if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) return json(res, 403, { hata: 'İstek kaynağı reddedildi.' });
    if (!yetkili(req, yazmaAnahtarlari)) return json(res, 401, { hata: 'Yazma için geçerli bir anahtar gerekli (Authorization: Bearer ...).' });
    const govde = await readJson(req);
    if (path === '/v1/arizalar') return json(res, 201, servis.arizaBildir(govde));
    const m = /^\/v1\/arizalar\/([^/]+)\/kapat$/.exec(path);
    if (m) return json(res, 200, servis.arizaKapat(m[1], govde));
    return json(res, 404, { hata: 'Bulunamadı.' });
  }

  async function handle(req, res) {
    basliklar(res);
    let url;
    try {
      url = new URL(req.url, 'http://x');
      decodeURIComponent(url.pathname);
    } catch {
      return json(res, 400, { hata: 'Geçersiz adres.' });
    }
    const path = url.pathname;
    try {
      if (path === '/healthz') return json(res, 200, { ok: true });
      if (!hizSiniri(ziyaretci(req))) {
        res.setHeader('Retry-After', '60');
        return json(res, 429, { hata: 'Çok hızlı istek gönderiyorsun. Bir dakika sonra tekrar dene.' });
      }

      if (path === '/mcp' || path.startsWith('/mcp/')) {
        if (!mcp) return json(res, 404, { hata: 'MCP kapısı bu kurulumda kapalı.' });
        if (!yetkili(req, mcpAnahtarlari, path.slice('/mcp/'.length))) return json(res, 401, { hata: 'Geçerli bir MCP erişim anahtarı gerekli.' });
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST');
          return json(res, 405, { hata: 'Yöntem desteklenmiyor.' });
        }
        return await mcp.handle(req, res, await readJson(req));
      }

      if (path.startsWith('/v1/')) return await v1(req, res, path, url.searchParams);

      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { hata: 'Yöntem desteklenmiyor.' });
      const dosya = dosyalar.get(path === '/' ? '/index.html' : path);
      if (!dosya) return json(res, 404, { hata: 'Bulunamadı.' });
      res.statusCode = 200;
      res.setHeader('Content-Type', dosya.tur);
      res.setHeader('Cache-Control', dosya.tur.startsWith('text/html') ? 'no-cache' : 'public, max-age=300');
      return res.end(req.method === 'HEAD' ? undefined : dosya.icerik);
    } catch (err) {
      if (res.headersSent) return res.end();
      if (err instanceof KuralHatasi) return json(res, err.durum, { hata: err.message, kod: err.kod });
      log(`Beklenmeyen hata: ${err?.stack || err}`);
      return json(res, 500, { hata: 'İstek işlenemedi.' });
    }
  }

  /** Saatlik: hız sınırı kayıtlarını temizler. */
  function bakim() {
    for (const [kim, k] of istekler) if (simdi() - k.baslangic > 60_000) istekler.delete(kim);
  }

  return { handle, bakim, servis };
}
