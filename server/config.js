// Ayarlar: hepsi ortam değişkeninden okunur (.env.example). Hatalar toplu döner; sunucu eksik ayarla başlamaz.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sayi = (v, varsayilan, alt, ust) => Math.min(ust, Math.max(alt, Number.isFinite(Number(v)) && v !== '' && v != null ? Math.round(Number(v)) : varsayilan));

/** "a,b,c" → anahtar listesi; her biri en az 32 karakter, yalnız güvenli karakterler. */
function anahtarlar(deger, ad, errors) {
  const liste = String(deger || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (liste.some((a) => a.length < 32 || !/^[A-Za-z0-9_-]+$/.test(a))) {
    errors.push(`${ad}: her anahtar en az 32 karakter olmalı ve yalnızca harf, rakam, tire, alt çizgi içermeli (üretmek için: openssl rand -hex 32).`);
  }
  return liste;
}

export function loadConfig(env = process.env) {
  const errors = [];
  let appUrl = String(env.APP_URL || 'http://localhost:8080/').trim();
  if (!appUrl.endsWith('/')) appUrl += '/';
  try {
    new URL(appUrl);
  } catch {
    errors.push('APP_URL geçerli bir adres olmalı (ör. https://ariza.ysfdurak.com/).');
  }

  const yazmaAnahtarlari = anahtarlar(env.YAZMA_ANAHTARLARI, 'YAZMA_ANAHTARLARI', errors);
  const mcpEnabled = env.MCP_ENABLED === 'true';
  const mcpAnahtarlari = anahtarlar(env.MCP_ANAHTARLARI, 'MCP_ANAHTARLARI', errors);
  if (mcpEnabled && !mcpAnahtarlari.length) errors.push('MCP_ENABLED=true için MCP_ANAHTARLARI gerekli (anahtarsız MCP kapısı açılmaz).');

  const dataDir = resolve(env.DATA_DIR || join(kok, 'tmp', 'data'));
  return {
    errors,
    appUrl,
    port: sayi(env.PORT, 8080, 1, 65535),
    host: env.HOST || '0.0.0.0',
    dataDir,
    dbFile: join(dataDir, 'ariza-defteri.db'),
    webDir: join(kok, 'web'),
    // Gerçek veriyle kurum içi kullanımda SENTETIK=false: üretici hiç çalışmaz, yalnız gerçek kayıtlar tutulur.
    sentetik: env.SENTETIK !== 'false',
    gecmisGun: sayi(env.GECMIS_GUN, 360, 0, 360),
    // Okuma API'si herkese açık (veri sentetik); ziyaretçi başına dakikada bu kadar istek.
    dakikalikIstek: sayi(env.DAKIKALIK_ISTEK, 60, 5, 1000),
    yazmaAnahtarlari,
    mcpEnabled,
    mcpAnahtarlari,
  };
}
