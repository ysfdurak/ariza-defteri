"""Tarayıcı duman testi: pano açılır, veri dolar, CSP ihlali ve konsol hatası yok. Ekran görüntüsü docs/ekranlar/'a.
Kullanım: python3 tests/tarayici/duman_test.py [chrome-yolu] [adres]
Sunucu önceden çalışıyor olmalı (npm run start:dev)."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

chrome = sys.argv[1] if len(sys.argv) > 1 else None
adres = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8080/"
cikti = Path(__file__).resolve().parents[2] / "docs" / "ekranlar"
cikti.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    tarayici = p.chromium.launch(executable_path=chrome) if chrome else p.chromium.launch()
    hatalar = []
    for ad, boyut, koyu in [("pano", {"width": 1280, "height": 900}, False), ("pano-koyu", {"width": 1280, "height": 900}, True), ("pano-telefon", {"width": 390, "height": 844}, False)]:
        sayfa = tarayici.new_page(viewport=boyut, color_scheme="dark" if koyu else "light")
        sayfa.on("console", lambda m: hatalar.append(f"{ad}: {m.text}") if m.type in ("error", "warning") else None)
        sayfa.on("pageerror", lambda e: hatalar.append(f"{ad}: {e}"))
        sayfa.goto(adres)
        sayfa.wait_for_selector("#akis li")
        sayfa.wait_for_selector("#ekipman tr")
        assert sayfa.locator("#k-adet").inner_text() != "–", "KPI dolmadı"
        assert sayfa.locator("#ekipman tr").count() == 18, "ekipman tablosu eksik"
        assert sayfa.locator("#pareto li").count() > 0, "pareto boş"
        sayfa.screenshot(path=str(cikti / f"{ad}.png"), full_page=True)
        sayfa.close()
    tarayici.close()
    if hatalar:
        print("\n".join(hatalar))
        sys.exit(1)
    print("Duman testi geçti; ekran görüntüleri:", cikti)
