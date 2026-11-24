// Arıza Defteri arayüzü. Tek istek (/v1/pano), dakikada bir yenilenir.
// Güvenlik: sayfaya giden her metin textContent ile yazılır; innerHTML kullanılmaz.
'use strict';

const $ = (id) => document.getElementById(id);

/** Küçük DOM yardımcısı: el('li', { class: 'x' }, 'metin', çocukEleman) */
function el(etiket, ozellik = {}, ...cocuklar) {
  const e = document.createElement(etiket);
  for (const [k, v] of Object.entries(ozellik)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else e.setAttribute(k, String(v));
  }
  for (const c of cocuklar.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}

const saat = (iso) => (iso ? iso.slice(11, 16) : '');
const gunSaat = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)} ${iso.slice(11, 16)}` : '');
const sure = (dk) => (dk == null ? '–' : dk >= 120 ? `${(dk / 60).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sa` : `${dk} dk`);
const yuzde = (x, b = 0) => (x == null ? '–' : `%${(x * 100).toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b })}`);
const sayi = (x, b = 0) => (x == null ? '–' : x.toLocaleString('tr-TR', { maximumFractionDigits: b }));
const tarihTr = (g) => (g ? `${g.slice(8, 10)}.${g.slice(5, 7)}.${g.slice(0, 4)}` : '–');
const RISK = { yuksek: 'Yüksek risk', orta: 'Orta', dusuk: 'Dağılmış' };

function bar(oran, sinif = '') {
  const ic = el('span', { class: 'bar-ic ' + sinif });
  ic.style.width = `${Math.max(0, Math.min(1, oran)) * 100}%`; // CSSOM: CSP'nin satır içi stil yasağına takılmaz
  return el('span', { class: 'bar', 'aria-hidden': 'true' }, ic);
}

function akis(kayitlar) {
  $('akis').replaceChildren(...kayitlar.map((k) => el('li', { class: 'akis-satir' + (k.durum === 'acik' ? ' acik' : '') + (k.kayip.kod === 'planli' ? ' planli' : '') },
    el('time', { datetime: k.baslangic, class: 'akis-saat' }, saat(k.baslangic)),
    el('div', { class: 'akis-govde' },
      el('div', { class: 'akis-ust' }, el('strong', {}, k.ekipman.kod), ' ', el('span', {}, k.tur.ad)),
      el('div', { class: 'akis-alt' },
        k.durum === 'acik'
          ? el('span', { class: 'cip cip-acik' }, 'Açık')
          : el('span', { class: 'cip' }, sure(k.sure_dk)),
        ` ${k.kayip.ad}`,
        k.cozen ? ` · ${k.cozen.ad}${k.cozen.rol === 'operator' ? ' (operatör)' : ''}` : '',
        k.islem ? ` · ${k.islem}` : '')))));
}

function bulgular(liste) {
  if (!liste.length) {
    $('bulgular').replaceChildren(el('li', { class: 'bos' }, 'Şu an dikkat çeken bir desen yok.'));
    return;
  }
  const etiket = { tekrarlayan_gun: 'Tekrarlayan gün', tek_kisi: 'Tek kişiye bağımlılık', geciken_bakim: 'Geciken bakım' };
  $('bulgular').replaceChildren(...liste.map((b) => el('li', { class: `bulgu bulgu-${b.onem}` },
    el('span', { class: 'bulgu-tur' }, etiket[b.tur] || b.tur), el('p', {}, b.metin))));
}

function kimler(tipler) {
  $('kimler').replaceChildren(...tipler.map((t) => {
    const ilk = t.kisiler[0];
    return el('li', { class: 'kim' },
      el('div', { class: 'kim-ust' }, el('strong', {}, t.tipAd), el('span', { class: `rozet risk-${t.risk}` }, RISK[t.risk])),
      el('div', { class: 'kim-satir' }, bar(ilk?.pay ?? 0, `risk-${t.risk}`), el('span', { class: 'kim-ad' }, ilk ? `${ilk.ad} ${yuzde(ilk.pay)}` : '–')),
      el('div', { class: 'kim-not' }, t.kisiler.slice(1, 3).map((k) => `${k.ad} ${yuzde(k.pay)}`).join(' · ') || ' '));
  }));
}

function pareto(satirlar, kayiplar) {
  const enBuyuk = satirlar[0]?.durusDk || 1;
  $('pareto').replaceChildren(...satirlar.map((s) => el('li', { class: 'pareto-satir' },
    el('span', { class: 'pareto-ad' }, el('code', {}, s.kod), ' ', s.ad),
    bar(s.durusDk / enBuyuk),
    el('span', { class: 'pareto-deger' }, `${sure(s.durusDk)} · ${s.adet} kez`),
    el('span', { class: 'pareto-kum' }, yuzde(s.kumulatif)))));
  const toplam = kayiplar.reduce((t, k) => t + k.durusDk, 0) || 1;
  $('kayiplar').replaceChildren(el('span', { class: 'kayip-baslik' }, '6 büyük kayıp:'),
    ...kayiplar.filter((k) => k.durusDk > 0).map((k) => el('span', { class: 'kayip' }, `${k.ad} ${yuzde(k.durusDk / toplam)}`)));
}

function ekipman(liste) {
  $('ekipman').replaceChildren(...liste.map((e) => el('tr', {},
    el('th', { scope: 'row' }, el('code', {}, e.kod), el('span', { class: 'ekipman-ad' }, e.ad.replace(/\s*\(.*\)$/, ''))),
    el('td', { class: 'sag' }, e.arizaSayisi + (e.acik ? ` (+${e.acik} açık)` : '')),
    el('td', { class: 'sag' }, sure(e.durusDk)),
    el('td', { class: 'sag' }, e.mttrDk == null ? '–' : `${sayi(e.mttrDk)} dk`),
    el('td', { class: 'sag' }, e.mtbfSaat == null ? '–' : `${sayi(e.mtbfSaat)} sa`),
    el('td', { class: 'sag' }, yuzde(e.kullanilabilirlik, 1)),
    el('td', { class: 'kucuk' }, e.enSikTur ? `${e.enSikTur.ad} (${e.enSikTur.adet})` : '–'),
    el('td', { class: 'kucuk' }, e.bakim.gecikmede
      ? el('span', { class: 'rozet risk-yuksek' }, `${e.bakim.gecikmeGun} gün gecikmede`)
      : `Sonraki ${tarihTr(e.bakim.sonrakiPlan)}`))));
}

async function yukle() {
  try {
    const yanit = await fetch('/v1/pano', { headers: { Accept: 'application/json' } });
    const veri = await yanit.json();
    if (!yanit.ok) throw new Error(veri.hata || 'Veri alınamadı.');
    $('hata').classList.add('gizli');
    $('k-adet').textContent = sayi(veri.son24.adet);
    $('k-acik').textContent = sayi(veri.son24.acik);
    $('k-durus').textContent = sure(veri.son24.durusDk);
    $('k-kul').textContent = yuzde(veri.kullanilabilirlik30, 1);
    $('guncel').textContent = `Güncellendi ${gunSaat(veri.simdi)}`;
    akis(veri.akis);
    bulgular(veri.bulgular90);
    kimler(veri.cozenler90);
    pareto(veri.pareto30, veri.kayiplar30);
    ekipman(veri.ekipmanlar30);
  } catch (err) {
    $('hata').textContent = `Veri alınamadı: ${err.message}. Bir dakika içinde yeniden denenecek.`;
    $('hata').classList.remove('gizli');
  }
}

yukle();
setInterval(yukle, 60_000);
