// Arıza Defteri MCP kapısı: servis katmanındaki okuma sorgularını MCP araçları olarak sunar.
//
// İkili yapı:  çekirdek (src/cekirdek: katalog, üretici, analiz) + servis (server/servis.js)
//                ├─ web kapısı: /v1/...  (arayüz ve Nabız, Usta, Emanet gibi uygulamalar)
//                └─ MCP kapısı: /mcp     (Claude ve diğer MCP istemcileri)
// Bu dosya kural İÇERMEZ. Araçların hepsi salt okumadır; yazma yalnız /v1 üzerinden, yazma anahtarıyla.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { KuralHatasi } from './servis.js';

const OKUMA = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const gun = (varsayilan) => z.number().int().min(1).max(365).optional().describe(`Kaç günlük dönem (bugün dahil). Varsayılan ${varsayilan}.`);

export const MCP_ARAC_ADLARI = ['durum', 'ana_veriler', 'arizalari_listele', 'ekipman_ozeti', 'ekipman_detayi', 'pareto', 'kim_cozuyor', 'bulgular', 'vardiya_uretimi'];

const TALIMAT = `Arıza Defteri, Yıldız Ev & Yaşam deposundaki ekipmanın (forklift, reach truck, konveyör, sorter, streç makinesi) arıza ve planlı bakım kayıtlarıdır.
Veri SENTETİKTİR: hikâyeli desenlerle her gün üretilir. Cevaplarda bunu belirt.
Kodlar: ekipman FL-01, RT-03, SR-01…; arıza türü FL-HID, SR-OKU…; kişi K-MKAYA… Adlar için ana_veriler.
Göstergeler: MTTR (ortalama onarım, dk), MTBF (arızalar arası ortalama, saat), kullanılabilirlik (0-1). Planlı bakım arıza sayılmaz.
"Neden" sorularında önce bulgular ve pareto araçlarına bak; kim_cozuyor tek kişiye bağımlılığı gösterir.`;

export function createMcpHandler({ servis, log = () => {} }) {
  const ARACLAR = [
    ['durum', 'Verinin durumu: son üretim, kayıt sayısı, bugünün tarihi.', {}, () => servis.durum()],
    ['ana_veriler', 'Ekipman, arıza türü, kişi ve kayıp sınıfı listeleri (kodlar ve adlar).', {}, () => servis.anaVeriler()],
    ['arizalari_listele', 'Arıza ve bakım kayıtlarını listeler (yeniden eskiye). Filtreler isteğe bağlı.', {
      gun: gun(7),
      ekipman: z.string().max(10).optional().describe('Ekipman kodu, ör. RT-03.'),
      tur: z.string().max(10).optional().describe('Arıza türü kodu, ör. RT-HID.'),
      acik: z.boolean().optional().describe('Yalnız şu an açık (onarımı süren) arızalar.'),
      limit: z.number().int().min(1).max(200).optional().describe('En fazla kaç kayıt. Varsayılan 50.'),
    }, (a) => servis.arizalar({ gun: a.gun, ekipman: a.ekipman, tur: a.tur, acik: a.acik, limit: a.limit ?? 50 })],
    ['ekipman_ozeti', 'Her ekipman için arıza sayısı, toplam duruş, MTTR, MTBF, kullanılabilirlik, en sık arıza ve bakım durumu.', { gun: gun(30) },
      (a) => { const o = servis.ozet({ gun: a.gun }); return { donemGun: o.donemGun, ekipmanlar: o.ekipmanlar }; }],
    ['ekipman_detayi', 'Tek ekipmanın özeti, arıza Pareto\'su ve son kayıtları.', {
      kod: z.string().max(10).describe('Ekipman kodu, ör. RT-03.'), gun: gun(30),
    }, (a) => servis.ekipmanDetayi(a.kod, { gun: a.gun })],
    ['pareto', 'Arıza türleri duruş süresine göre (büyükten küçüğe, kümülatif pay) ve 6 büyük kayba göre dağılım.', {
      gun: gun(30),
      tip: z.enum(['forklift', 'reach_truck', 'konveyor', 'sorter', 'strec']).optional().describe('Yalnız bu ekipman tipi.'),
      ekipman: z.string().max(10).optional().describe('Yalnız bu ekipman.'),
    }, (a) => { const o = servis.ozet({ gun: a.gun, tip: a.tip, ekipman: a.ekipman }); return { donemGun: o.donemGun, pareto: o.pareto, kayiplar: o.kayiplar }; }],
    ['kim_cozuyor', 'Ekipman tipi başına arızaları hangi teknisyenin çözdüğü, payı ve ortalama süresi; tek kişiye bağımlılık riski.', { gun: gun(90) },
      (a) => servis.cozenler({ gun: a.gun })],
    ['vardiya_uretimi', 'Biten vardiyalar için ekipman başına planlı süre, duruş, iş adedi, hatalı adet ve tipin ideal hızı (OEE girdisi).', {
      gun: gun(7), ekipman: z.string().max(10).optional().describe('Ekipman kodu, ör. SR-01.'),
    }, (a) => servis.uretim({ gun: a.gun, ekipman: a.ekipman })],
    ['bulgular', 'Veriden çıkan kural tabanlı bulgular: belli bir günde tekrarlayan arıza, tek kişiye bağımlılık, geciken bakım.', { gun: gun(90) },
      (a) => servis.bulgular({ gun: a.gun })],
  ];

  /** Her istek için yeni sunucu (stateless): istekler arasında durum tutulmaz. */
  function buildServer() {
    const server = new McpServer({ name: 'ariza-defteri', version: '0.1.0' }, { instructions: TALIMAT });
    for (const [name, description, inputSchema, calistir] of ARACLAR) {
      server.registerTool(name, { description, inputSchema, annotations: OKUMA }, async (args) => {
        try {
          return { content: [{ type: 'text', text: JSON.stringify(calistir(args), null, 2) }] };
        } catch (err) {
          if (err instanceof KuralHatasi) return { isError: true, content: [{ type: 'text', text: err.message }] };
          log(`MCP hatası (${name}): ${err?.stack || err}`);
          return { isError: true, content: [{ type: 'text', text: 'İstek işlenemedi.' }] };
        }
      });
    }
    return server;
  }

  async function handle(req, res, body) {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  return { handle };
}
