/**
 * Giriş ekranının anlatı videosunu hazırlar — iki çözünürlükte.
 *
 *     node scripts/story-video.mjs ~/Downloads/hf2
 *
 * Çıktı:
 *     public/video/story-1080.mp4   1920×1080
 *     public/video/story-1440.mp4   2560×1440  (kaynağın kendi çözünürlüğü)
 *
 * Hangisinin yükleneceğine tarayıcı karar veriyor (`lib/storyVideo.ts`).
 *
 * --------------------------------------------------------------------------
 * KAYNAK
 * --------------------------------------------------------------------------
 * Higgsfield `minimax_h3` segmentleri: 2560×1440, 24 fps, 5-10 Mbit/sn.
 *
 * Önceki sürüm bunu 1152×648 / 20 fps / CRF 28'e indiriyordu: dosya 5 MB'a
 * düşüyordu ama kaynağa göre SSIM 0,936 — büyük ekranda gözle görülür
 * yumuşama ve kare atlaması. Kare hızını düşürmek ayrıca kaydırırken
 * hareketi kesik gösteriyordu.
 *
 * --------------------------------------------------------------------------
 * HER KARE ANAHTAR KARE — ÖLÇÜLEREK SEÇİLDİ
 * --------------------------------------------------------------------------
 * Video kendi kendine oynamıyor; kaydırma yüzdesi `currentTime`e yazılıyor.
 * Her arama, en yakın önceki anahtar kareden hedefe kadar bütün kareleri
 * çözmek demek. Kısa bir GOP dosyayı küçültüyor ama her aramayı pahalılaştırıyor.
 *
 * Headless Chromium'da (yazılım çözücü, en kötü durum) 2 saniyelik sürekli
 * kaydırmada ekrana basılan kare sayısı (120 = kusursuz 60 fps):
 *
 *     1920, her kare anahtar, CRF 23   21 MB   SSIM 0,985   112 kare
 *     1920, 6 karede bir,     CRF 23   12 MB   SSIM 0,987    75 kare
 *     2560, her kare anahtar, CRF 24   30 MB   SSIM 0,989    83 kare
 *     2560, 3 karede bir,     CRF 22   27 MB   SSIM 0,992    60 kare
 *     2560, 6 karede bir,     CRF 23   19 MB   SSIM 0,992    53 kare
 *
 * (SSIM, 2560 genişliğe büyütülüp kaynakla karşılaştırılarak ölçüldü: büyük
 * ekrandaki izleyicinin gördüğü şey. 1920 sürümü 1080p ekranda kaynaktan
 * ayırt edilemiyor.)
 *
 * Kısa GOP'lar kaliteyi binde üç artırıp akıcılığı üçte bir düşürüyor. Bu
 * sahnenin tek vaadi kesintisiz olması; 0,989 ile 0,992 arasındaki fark,
 * üstüne perde ve yazı binmiş bir arka planda görülmüyor. Her kare anahtar.
 *
 * --------------------------------------------------------------------------
 * DİĞER AYARLAR
 * --------------------------------------------------------------------------
 * - 24 fps — kaynağın kendisi. Düşürmek kaydırırken hareketi kesik yapıyor.
 * - `-tune film` — gerçek çekim görüntüsünde dokuyu koruyor.
 * - `-an` — ses yok. `muted` olmayan video iOS'ta hiç yüklenmiyor.
 * - `+faststart` — moov başta; dosya inmeden aranabilir.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ffmpeg from "ffmpeg-static";

const SRC = process.argv[2];
const OUT_DIR = "public/video";

if (!SRC) {
  console.error("Kullanım: node scripts/story-video.mjs <segment-klasörü>");
  process.exit(1);
}

/** Çözünürlük başına kodlama. CRF'ler yukarıdaki ölçümden. */
const RENDITIONS = [
  { name: "story-1080.mp4", width: 1920, crf: 23 },
  { name: "story-1440.mp4", width: 2560, crf: 24 },
];

/** Dosya adındaki sıra numarası. `seg-10` `seg-2`den sonra gelmeli. */
function segmentNumber(name) {
  const match = name.match(/\d+/);
  return match === null ? 0 : Number(match[0]);
}

const segments = readdirSync(SRC)
  .filter((name) => /^seg-\d+\.mp4$/.test(name))
  .sort((a, b) => segmentNumber(a) - segmentNumber(b))
  .map((name) => resolve(SRC, name));

if (segments.length === 0) {
  console.error(`${SRC} içinde seg-*.mp4 yok.`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const listFile = join(OUT_DIR, "_concat.txt");
writeFileSync(
  listFile,
  segments.map((path) => `file '${path.replace(/\\/g, "/")}'`).join("\n"),
);

try {
  for (const rendition of RENDITIONS) {
    const out = join(OUT_DIR, rendition.name);
    const args = [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-an",
      "-vf",
      `scale=${rendition.width}:-2:flags=lanczos`,
      "-r",
      "24",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-tune",
      "film",
      "-crf",
      String(rendition.crf),
      // Her kare anahtar kare: kaydırmayla ileri geri atlarken tek kare çözülüyor.
      "-g",
      "1",
      "-keyint_min",
      "1",
      "-sc_threshold",
      "0",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      out,
    ];

    console.log(`${rendition.name} kodlanıyor…`);
    execFileSync(ffmpeg, args, { stdio: ["ignore", "ignore", "inherit"] });
    console.log(`  ${Math.round(statSync(out).size / 1024)} KB`);
  }
} finally {
  rmSync(listFile, { force: true });
}
