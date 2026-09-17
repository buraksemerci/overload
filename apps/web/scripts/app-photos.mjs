/**
 * Uygulama içi ekranların fotoğrafları — giriş bantları ve karolar.
 *
 *     node scripts/app-photos.mjs ~/Downloads/hf-app ~/Downloads/hf2
 *
 * --------------------------------------------------------------------------
 * AYNI SALON
 * --------------------------------------------------------------------------
 * Hepsi giriş ekranının anlatısındaki salondan: ya o videonun kareleri ya da
 * Higgsfield'da (`gpt_image_2_5`) videonun bir karesi referans verilerek
 * üretilmiş sahneler — aynı pencereler, aynı sıcak ışık, aynı beton zemin.
 * Farklı stok fotoğraflar yan yana gelince uygulama bir şablon kataloğu gibi
 * duruyordu; tek mekân bir yer hissi veriyor.
 *
 * Kişiler yüzü görünmeyecek biçimde üretildi (sırt, eller, ayaklar).
 *
 * --------------------------------------------------------------------------
 * BOYUT
 * --------------------------------------------------------------------------
 * Bantlar tam ekran genişliğinde: 2400 px (retina dizüstünde 1200 CSS
 * pikseli ölçeklenmeden dolduruyor), mozjpeg 78. Öğün kartları 1200 px.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";
import sharp from "sharp";

const GENERATED = process.argv[2];
const STORY = process.argv[3];
const OUT = "public/photos";

if (!GENERATED || !STORY) {
  console.error("Kullanım: node scripts/app-photos.mjs <üretilenler> <anlatı-segmentleri>");
  process.exit(1);
}

/** Üretilmiş kareler. `position`: kırpmada korunacak taraf. */
const GENERATED_JOBS = [
  { slug: "app-body", file: "body-back.png", width: 2400, height: 1350, position: "right" },
  { slug: "app-grip", file: "grip.png", width: 2400, height: 1350, position: "right" },
  { slug: "app-plates", file: "plates.png", width: 2400, height: 1350, position: "center" },
  { slug: "app-scale", file: "scale.png", width: 2400, height: 1350, position: "right" },
  { slug: "app-stretch", file: "stretch.png", width: 2400, height: 1350, position: "right" },
  { slug: "app-supplements", file: "supplements.png", width: 2400, height: 1350, position: "right" },
  { slug: "app-dumbbells", file: "dumbbells.png", width: 2400, height: 1350, position: "right" },
  { slug: "app-shoes", file: "shoes.png", width: 2400, height: 1350, position: "center" },
  { slug: "app-review", file: "review.png", width: 2400, height: 1350, position: "right" },
  { slug: "app-chalk", file: "chalk.png", width: 2400, height: 1350, position: "right" },
  // Ekipman karoları: kütüphanede makine ve kablo bölümleri için.
  { slug: "app-machine", file: "machine.png", width: 1344, height: 752, position: "center" },
  { slug: "app-cable", file: "cable.png", width: 1344, height: 752, position: "center" },
  { slug: "meal-breakfast", file: "meal-breakfast.png", width: 1200, height: 800, position: "center" },
  { slug: "meal-lunch", file: "meal-lunch.png", width: 1200, height: 800, position: "center" },
  { slug: "meal-dinner", file: "meal-dinner.png", width: 1200, height: 800, position: "center" },
  { slug: "meal-snack", file: "meal-snack.png", width: 1200, height: 800, position: "center" },
];

/**
 * Anlatı videosundan kareler: (segment, saniye). Kaynak segmentlerden
 * alınıyor, sıkıştırılmış çıktıdan değil.
 */
const FRAME_JOBS = [
  { slug: "app-gym-wide", segment: "seg-1.mp4", time: 2.7 },
  { slug: "app-squat", segment: "seg-2.mp4", time: 0.2 },
  { slug: "app-cafe", segment: "seg-2.mp4", time: 2.9 },
  { slug: "app-meal-bar", segment: "seg-3.mp4", time: 0.6 },
  { slug: "app-entry", segment: "seg-1.mp4", time: 0.5 },
];

mkdirSync(OUT, { recursive: true });

async function write(input, job) {
  const info = await sharp(input)
    .resize(job.width, job.height, { fit: "cover", position: job.position ?? "center" })
    .jpeg({ quality: 78, mozjpeg: true, progressive: true })
    .toFile(join(OUT, `${job.slug}.jpg`));
  console.log(`${job.slug.padEnd(20)} ${info.width}x${info.height} ${Math.round(info.size / 1024)} KB`);
}

for (const job of GENERATED_JOBS) {
  try {
    await write(join(GENERATED, job.file), job);
  } catch {
    console.warn(`${job.slug.padEnd(20)} ATLANDI — ${job.file} okunamadı`);
  }
}

for (const job of FRAME_JOBS) {
  const temp = join(OUT, `_${job.slug}.png`);
  try {
    execFileSync(
      ffmpeg,
      ["-y", "-v", "error", "-ss", String(job.time), "-i", join(STORY, job.segment), "-frames:v", "1", temp],
      { stdio: "inherit" },
    );
    await write(temp, { ...job, width: 2400, height: 1350 });
  } catch {
    console.warn(`${job.slug.padEnd(20)} ATLANDI — ${job.segment} okunamadı`);
  } finally {
    rmSync(temp, { force: true });
  }
}
