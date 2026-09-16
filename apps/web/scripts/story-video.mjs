/**
 * Karşılama ekranının anlatı videosunu hazırlar.
 *
 *     node scripts/story-video.mjs ~/Downloads/hf
 *
 * --------------------------------------------------------------------------
 * NEDEN YENİDEN KODLANIYOR
 * --------------------------------------------------------------------------
 * Video kendi kendine oynamıyor; kaydırma yüzdesi doğrudan `currentTime`e
 * yazılıyor (bkz. `components/Scrollytelling.tsx`). Bu, sıradan bir mp4 ile
 * çalışmıyor.
 *
 * Normal bir mp4'te anahtar kareler 2-3 saniyede bir. Tarayıcı ara bir
 * saniyeye atlamak istediğinde en yakın anahtar kareye düşüp oradan
 * çözümlüyor — kaydırma yukarı gittiğinde bu, görünür bir takılma demek.
 * `-g 1` her kareyi anahtar kare yapıyor: her konuma doğrudan atlanabiliyor.
 *
 * Bedeli dosya boyutu: aynı görüntü yaklaşık üç kat yer kaplıyor. Çözünürlük
 * 1280 genişliğe ve kare hızı 24'e düşürülerek dengeleniyor — tam ekran arka
 * plan olduğu için keskinlik zaten ikinci planda, üstünde perde ve yazı var.
 *
 * --------------------------------------------------------------------------
 * SES YOK
 * --------------------------------------------------------------------------
 * `-an`: video sessiz. Kullanıcının başlatmadığı bir sesin çalması kabul
 * edilemez ve `muted` olmayan bir video iOS'ta zaten hiç yüklenmiyor. Ses
 * parçasını atmak dosyayı da küçültüyor.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ffmpeg from "ffmpeg-static";

const SRC = process.argv[2];
const OUT_DIR = "public/video";
const OUT = join(OUT_DIR, "story.mp4");

if (!SRC) {
  console.error("Kullanım: node scripts/story-video.mjs <segment-klasörü>");
  process.exit(1);
}

/** Dosya adındaki sıra numarası. `seg-10` `seg-2`den sonra gelmeli. */
function segmentNumber(name) {
  const match = name.match(/\d+/);
  return match === null ? 0 : Number(match[0]);
}

/** `seg-1.mp4`, `seg-2.mp4`, ... sırayla. */
const segments = readdirSync(SRC)
  .filter((name) => /^seg-\d+\.mp4$/.test(name))
  .sort((a, b) => segmentNumber(a) - segmentNumber(b))
  .map((name) => resolve(SRC, name));

if (segments.length === 0) {
  console.error(`${SRC} içinde seg-*.mp4 yok.`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

/* Birleştirme listesi. `concat` demuxer'ı seçildi çünkü segmentler aynı
   kodlayıcıdan çıkıyor ve filtre grafiği kurmaya gerek yok; zaten hepsi
   yeniden kodlanacak. */
const listFile = join(OUT_DIR, "_concat.txt");
writeFileSync(
  listFile,
  segments.map((path) => `file '${path.replace(/\\/g, "/")}'`).join("\n"),
);

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
  // 1152 genişlik ve 20 kare/sn: her kare anahtar kare olduğu için dosya
  // normalin ~3 katı büyüyor ve bu iki değer onu dengeliyor. Tam ekran
  // arka plan; üstünde perde ve yazı var, keskinlik ikinci planda.
  "scale=1152:-2,fps=20",
  "-c:v",
  "libx264",
  // Her kare anahtar kare: kaydırmayla ileri geri atlamanın tek yolu.
  "-g",
  "1",
  "-keyint_min",
  "1",
  "-sc_threshold",
  "0",
  "-preset",
  "slow",
  "-crf",
  "28",
  "-pix_fmt",
  "yuv420p",
  // `faststart`: moov atom başa alınıyor, video tamamı inmeden oynatılabilir
  // hâle geliyor.
  "-movflags",
  "+faststart",
  OUT,
];

console.log(`${segments.length} segment birleştiriliyor…`);
execFileSync(ffmpeg, args, { stdio: ["ignore", "ignore", "inherit"] });

rmSync(listFile, { force: true });

const kb = Math.round(statSync(OUT).size / 1024);
console.log(`${OUT}  ${kb} KB`);
