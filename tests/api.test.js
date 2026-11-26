// HTTP: okuma açık, yazma anahtarla, güvenlik başlıkları, sınırlar, MCP kapısı.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../server/config.js';
import { openStore } from '../server/store.js';
import { createApp } from '../server/app.js';
import { uretimiTamamla } from '../server/zamanlayici.js';
import { anMs } from '../src/cekirdek/zaman.js';

const YAZMA = 'y'.repeat(40);
const MCP = 'm'.repeat(40);
const SIMDI = anMs('2026-11-24', 14, 30);

async function kur(ek = {}) {
  const dizin = mkdtempSync(join(tmpdir(), 'ariza-api-'));
  mkdirSync(dizin, { recursive: true });
  const config = loadConfig({ DATA_DIR: dizin, APP_URL: 'https://ariza.ornek.test/', YAZMA_ANAHTARLARI: YAZMA, MCP_ENABLED: 'true', MCP_ANAHTARLARI: MCP, ...ek });
  assert.deepEqual(config.errors, []);
  const store = openStore(config.dbFile);
  uretimiTamamla({ store, simdi: SIMDI, gecmisGun: 185 }) // bulgular 180 günle çalışır;
  let an = SIMDI;
  const app = createApp({ config, store, simdi: () => an });
  const server = createServer(app.handle);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const kok = `http://127.0.0.1:${server.address().port}`;
  const iste = (yol, o = {}) => fetch(kok + yol, o).then(async (r) => ({ durum: r.status, basliklar: r.headers, govde: await r.json().catch(() => null) }));
  return { kok, iste, kapat: () => new Promise((r) => server.close(r)), saat: (ms) => { an = ms; } };
}

test('okuma API\'si: durum, liste, tek kayıt, pano, güvenlik başlıkları', async () => {
  const { kok, iste, kapat } = await kur();
  try {
    const d = await iste('/v1/durum');
    assert.equal(d.durum, 200);
    assert.equal(d.govde.bugun, '2026-11-24');
    for (const b of ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy']) assert.ok(d.basliklar.get(b), b);
    assert.equal(d.basliklar.get('cache-control'), 'no-store');

    const l = await iste('/v1/arizalar?gun=7&limit=500'); // gerçek sıklıkta günde 1-3 kayıt
    assert.equal(l.durum, 200);
    assert.ok(l.govde.kayitlar.length > 0);
    assert.ok(l.govde.kayitlar.every((k) => k.baslangic <= '2026-11-24T14:30:00+03:00'), 'gelecek kayıt sızmamalı');
    const tek = await iste('/v1/arizalar/' + l.govde.kayitlar[0].id);
    assert.equal(tek.govde.id, l.govde.kayitlar[0].id);

    const p = await iste('/v1/pano');
    assert.equal(p.durum, 200);
    assert.equal(p.govde.ekipmanlar30.length, 18);
    assert.ok(p.govde.bulgular180.some((b) => b.ekipman === 'RT-03'));

    for (const yol of ['/v1/uretim?gun=3', '/v1/ozet?gun=7', '/v1/cozenler', '/v1/bulgular', '/v1/ana-veriler', '/v1/ekipman', '/v1/ekipman/RT-03']) assert.equal((await iste(yol)).durum, 200, yol);

    const u = await iste('/v1/uretim?gun=1');
    assert.ok(u.govde.satirlar.length > 0);
    assert.ok(u.govde.satirlar.every((r) => r.vardiya === 3), '14:30 itibarıyla yalnız 3. vardiya (00-08) bitti');
    const sayfa = await fetch(kok + '/');
    assert.equal(sayfa.status, 200);
    assert.match(sayfa.headers.get('content-type'), /text\/html/);
    assert.match(sayfa.headers.get('content-security-policy'), /default-src 'self'/);
    assert.match(await sayfa.text(), /Arıza Defteri/);
  } finally { await kapat(); }
});

test('hatalı girdi 400, bilinmeyen 404, gelecekteki kayıt 404, beklenmeyen hata ayrıntısı sızmaz', async () => {
  const { iste, kapat } = await kur();
  try {
    assert.equal((await iste('/v1/arizalar?gun=0')).durum, 400);
    assert.equal((await iste('/v1/arizalar?gun=abc')).durum, 400);
    assert.equal((await iste('/v1/arizalar?ekipman=XX-99')).durum, 400);
    assert.equal((await iste('/v1/arizalar?bas=2026-02-30')).durum, 400);
    assert.equal((await iste('/v1/arizalar/../../etc/passwd')).durum, 404);
    assert.equal((await iste('/v1/arizalar/S-20261125-001')).durum, 404, 'yarının kaydı görünmez');
    assert.equal((await iste('/v1/yok')).durum, 404);
    assert.equal((await iste('/%E0%A4%A')).durum, 400);
  } finally { await kapat(); }
});

test('yazma: anahtarsız 401, yabancı kaynak 403, büyük gövde 413, anahtarla bildir ve kapat', async () => {
  const { iste, kapat, saat } = await kur();
  const json = (govde, ek = {}) => ({ method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${YAZMA}`, ...ek }, body: JSON.stringify(govde) });
  try {
    assert.equal((await iste('/v1/arizalar', { ...json({}), headers: { 'content-type': 'application/json' } })).durum, 401);
    assert.equal((await iste('/v1/arizalar', json({}, { authorization: `Bearer ${MCP}` }))).durum, 401, 'MCP anahtarı yazamaz');
    assert.equal((await iste('/v1/arizalar', json({ ekipman: 'FL-01', tur: 'FL-HID' }, { origin: 'https://kotu.test' }))).durum, 403);
    assert.equal((await iste('/v1/arizalar', json({ aciklama: 'x'.repeat(9000) }))).durum, 413);
    assert.equal((await iste('/v1/arizalar', json({ ekipman: 'FL-01', tur: 'SR-OKU' }))).durum, 400, 'tür ekipmana ait değil');
    assert.equal((await iste('/v1/arizalar', json({ ekipman: 'FL-01', tur: 'FL-HID', aciklama: 'a\u0000b' }))).durum, 400);
    assert.equal((await iste('/v1/arizalar', json({ ekipman: 'FL-01', tur: 'FL-HID', baslangic: '2026-12-30T10:00:00+03:00' }))).durum, 400, 'gelecek');

    const b = await iste('/v1/arizalar', json({ ekipman: 'FL-01', tur: 'FL-HID', bildiren: 'K-O01', aciklama: 'Sol silindirden yağ damlıyor' }, { origin: 'https://ariza.ornek.test' }));
    assert.equal(b.durum, 201);
    assert.match(b.govde.id, /^G-20261124-[0-9a-f]{8}$/);
    assert.equal(b.govde.durum, 'acik');
    assert.equal(b.govde.kaynak, 'gercek');

    saat(SIMDI + 45 * 60_000);
    assert.equal((await iste(`/v1/arizalar/${b.govde.id}/kapat`, json({ cozen: 'Ahmet' , islem: 'x' }))).durum, 400, 'kişi kodu olmalı');
    const k = await iste(`/v1/arizalar/${b.govde.id}/kapat`, json({ cozen: 'K-SAYDIN', islem: 'Hortum değiştirildi' }));
    assert.equal(k.durum, 200);
    assert.equal(k.govde.sure_dk, 45);
    assert.equal((await iste(`/v1/arizalar/${b.govde.id}/kapat`, json({ cozen: 'K-SAYDIN', islem: 'tekrar' }))).durum, 409);
    assert.equal((await iste('/v1/arizalar/S-20261124-001/kapat', json({ cozen: 'K-SAYDIN', islem: 'x' }))).durum, 400, 'sentetik kapatılamaz');
    const liste = await iste('/v1/arizalar?gun=1&kaynak=gercek');
    assert.equal(liste.govde.kayitlar.length, 1);
  } finally { await kapat(); }
});

test('hız sınırı 429', async () => {
  const { iste, kapat } = await kur({ DAKIKALIK_ISTEK: '5' });
  try {
    const sonuclar = [];
    for (let i = 0; i < 7; i++) sonuclar.push((await iste('/v1/durum')).durum);
    assert.deepEqual(sonuclar.slice(-2), [429, 429]);
    assert.equal((await iste('/healthz')).durum, 200, 'sağlık denetimi sınırsız');
  } finally { await kapat(); }
});

test('MCP: anahtarsız 401, araç listesi ve salt okuma çağrısı', async () => {
  const { iste, kapat } = await kur();
  const rpc = (govde, anahtar = MCP) => iste('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(anahtar ? { authorization: `Bearer ${anahtar}` } : {}) }, body: JSON.stringify(govde) });
  try {
    assert.equal((await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, null)).durum, 401);
    assert.equal((await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, YAZMA)).durum, 401);
    await rpc({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
    const l = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    assert.equal(l.durum, 200);
    const adlar = l.govde.result.tools.map((t) => t.name);
    assert.deepEqual(adlar.sort(), ['ana_veriler', 'arizalari_listele', 'bulgular', 'durum', 'ekipman_detayi', 'ekipman_ozeti', 'kim_cozuyor', 'pareto', 'vardiya_uretimi']);
    assert.ok(l.govde.result.tools.every((t) => t.annotations.readOnlyHint === true));
    const c = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'bulgular', arguments: {} } }); // varsayılan 180 gün
    const veri = JSON.parse(c.govde.result.content[0].text);
    assert.ok(veri.bulgular.some((b) => b.ekipman === 'RT-03'));
    const h = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'ekipman_detayi', arguments: { kod: 'YOK-1' } } });
    assert.equal(h.govde.result.isError, true);
  } finally { await kapat(); }
});

test('MCP kapalıyken 404; zayıf anahtar ayarı reddedilir', async () => {
  assert.ok(loadConfig({ YAZMA_ANAHTARLARI: 'kisa' }).errors.length);
  assert.ok(loadConfig({ MCP_ENABLED: 'true' }).errors.length);
  const { iste, kapat } = await kur({ MCP_ENABLED: 'false', MCP_ANAHTARLARI: '' });
  try {
    assert.equal((await iste('/mcp', { method: 'POST', body: '{}' })).durum, 404);
  } finally { await kapat(); }
});
