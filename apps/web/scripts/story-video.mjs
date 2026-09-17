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
 *
 * --------------------------------------------------------------------------
 * SON BÖLÜM İŞLENMİŞ
 * --------------------------------------------------------------------------
 * `seg-3` (bardaki öğün → telefon) son kareye ulaşmak için yolun sonunda
 * BAŞKA BİR KİŞİYE geçiyordu: model başlangıç ve bitiş karesindeki iki farklı
 * eli birbirine eritti ve telefon bir elden diğerine ışınlandı. Segment
 * erimenin başladığı kareden önce kesildi ve `seg-4` tam o kareden başlayıp
 * telefona yaklaşıyor.
 *
 * İkisi doğrudan birleştirilmiyor: `scripts/story-screen.py` önce telefon
 * ekranına giriş formunun bulanık görüntüsünü yerleştiriyor, telefon
 * kalkarken odağı ele çekiyor ve telefonu dikleştiriyor; sonucu `son.mp4`.
 * Kırpma da orada, kare sayısıyla yapılıyor — zamanla kırpmak B-kareli bir
 * kaynakta bir iki kare kaydırabiliyordu ve bir kare fazlası erimenin ilk
 * karesi.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
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

/**
 * Sırayla birleştirilen parçalar. `son.mp4` işlenmiş son bölüm (yukarıya bakın);
 * `seg-3` ve `seg-4` onun girdisi, burada KULLANILMIYOR.
 */
const SEGMENTS = ["seg-1.mp4", "seg-2.mp4", "son.mp4"];

/** Kaynağın çözünürlüğü. Her segment birleşmeden önce buna getiriliyor. */
const SOURCE = { width: 2560, height: 1440 };

const segments = SEGMENTS.filter((name) => existsSync(resolve(SRC, name)));
if (segments.length !== SEGMENTS.length) {
  const missing = SEGMENTS.filter((name) => !segments.includes(name));
  console.error(`${SRC} içinde eksik: ${missing.join(", ")}`);
  if (missing.includes("son.mp4")) {
    console.error("Önce: python scripts/story-screen.py <klasör> <ekran.png>");
  }
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

/**
 * Her segment aynı biçime getirilip uç uca ekleniyor: aynı çözünürlük,
 * 24 fps, sıfırdan başlayan zaman damgaları. Üretilen bir segment kaynaktan
 * birkaç piksel farklı çıkarsa `concat` süzgeci birleştirmeyi reddediyor.
 */
const filter = [
  ...segments.map(
    (_, index) =>
      `[${index}:v]setpts=PTS-STARTPTS,fps=24,` +
      `scale=${SOURCE.width}:${SOURCE.height}:flags=lanczos,setsar=1,format=yuv420p[s${index}]`,
  ),
  `${segments.map((_, index) => `[s${index}]`).join("")}concat=n=${segments.length}:v=1:a=0[story]`,
].join(";");

for (const rendition of RENDITIONS) {
  const out = join(OUT_DIR, rendition.name);
  const args = [
    "-y",
    ...segments.flatMap((name) => ["-i", resolve(SRC, name)]),
    "-filter_complex",
    `${filter};[story]scale=${rendition.width}:-2:flags=lanczos[out]`,
    "-map",
    "[out]",
    "-an",
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
