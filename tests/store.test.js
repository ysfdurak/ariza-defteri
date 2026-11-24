// Depo: aynı gün iki kez yazılınca çift kayıt olmaz; saati gelmeyen kayıt görünmez; açık arızanın sonucu gizlenir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../server/store.js';
import { uretimiTamamla } from '../server/zamanlayici.js';
import { gunuUret } from '../src/cekirdek/uretici.js';
import { anMs } from '../src/cekirdek/zaman.js';

const yeniDepo = () => openStore(join(mkdtempSync(join(tmpdir(), 'ariza-')), 'test.db'));

test('gün yeniden yazılırsa çift kayıt olmaz, gerçek kayıtlara dokunulmaz', () => {
  const s = yeniDepo();
  const gun = '2026-11-20';
  s.gunuYaz(gun, gunuUret(gun), '1');
  s.gercekEkle({ gun, ekipman: 'FL-01', tur: 'FL-HID', kayip: 'ariza', vardiya: 1, baslangic: anMs(gun, 10), onem: 'yuksek' });
  s.gunuYaz(gun, gunuUret(gun), '1');
  const hepsi = s.kayitlar({ simdi: anMs(gun, 24) });
  assert.equal(hepsi.filter((k) => k.kaynak === 'sentetik').length, gunuUret(gun).length);
  assert.equal(hepsi.filter((k) => k.kaynak === 'gercek').length, 1);
});

test('görünürlük: gelecekteki kayıt yok, süren arıza açık ve sonucu gizli', () => {
  const s = yeniDepo();
  const gun = '2026-11-20';
  const uretilen = gunuUret(gun);
  s.gunuYaz(gun, uretilen, '1');
  const hedef = uretilen.find((k) => k.sure_dk >= 10);
  const simdi = hedef.baslangic + 5 * 60_000; // arıza başlamış, bitmemiş
  const gorunen = s.kayitlar({ simdi });
  assert.equal(gorunen.length, uretilen.filter((k) => k.baslangic <= simdi).length);
  const acik = gorunen.find((k) => k.id === hedef.id);
  assert.equal(acik.bitis, null);
  assert.equal(acik.cozen, null);
  assert.equal(acik.islem, null);
  assert.equal(s.kayitBul(uretilen.at(-1).id, simdi), null, 'saati gelmemiş kayıt tek tek de okunamaz');
  assert.ok(s.kayitlar({ simdi, acik: true }).some((k) => k.id === hedef.id));
});

test('zamanlayıcı eksik günleri tamamlar, ikinci çalıştırmada bir şey yapmaz; eski kayıtlar özetlenir', () => {
  const s = yeniDepo();
  const simdi = anMs('2026-11-24', 12);
  const ilk = uretimiTamamla({ store: s, simdi, gecmisGun: 10 });
  assert.equal(ilk.uretilenGun, 12); // 10 geçmiş + bugün + yarın
  assert.equal(uretimiTamamla({ store: s, simdi, gecmisGun: 10 }).uretilenGun, 0);
  // 400 gün sonra: hepsi saklama süresini aşar
  const sonra = uretimiTamamla({ store: s, simdi: anMs('2027-12-31', 12), gecmisGun: 0 });
  assert.ok(sonra.silinen > 0);
  assert.ok(s.aylikOzet().length > 0);
  assert.equal(s.kayitlar({ simdi: anMs('2027-12-31', 12), bit: anMs('2026-12-01') }).length, 0);
});
