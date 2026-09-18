/**
 * Küçük boy varyantları — `<slug>-sm.jpg`.
 *
 * Bantların kaynağı 2400 piksel: retina bir dizüstünde tam genişlik fotoğraf
 * için doğru boy. Ama aynı dosya telefonda 390 piksellik bir karoda da
 * iniyordu; panoda sekiz fotoğraf varken bu bir megabaytın üstünde boşa giden
 * veri demek.
 *
 * Bu betik her kareden yarı genişlikte bir varyant üretiyor. `Photo` bileşeni
 * `srcset` ile ikisini birden veriyor, tarayıcı hangisini indireceğine ekran
 * genişliğine bakarak karar veriyor.
 *
 * Betik ayrıca `lib/photo-sm.ts` dosyasını yazıyor: HANGİ karelerin varyantı
 * olduğunun listesi. Liste olmadan bileşen her kare için varyant varsayıyordu
 * ve zaten dar olan dosyalarda (öğün kareleri 1200 piksel) tarayıcı önce
 * olmayan dosyayı isteyip 404 alıyordu — sayfa başına dört boş istek. Liste
 * tazeyse hiç istenmiyor; bayat kalırsa bileşen yine tam boya düşüyor
 * (`onError`), yani "klasöre at, çalışsın" kuralı bozulmuyor.
 *
 *     node scripts/photo-variants.mjs
 */

import { readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const DIR = "public/photos";
/** Üretilen listenin yolu. `Photo` bunu okuyor. */
const LIST = "lib/photo-sm.ts";
/** Varyantın genişliği. Kaynak bundan darsa varyant üretilmiyor. */
const SMALL_WIDTH = 1200;

const files = (await readdir(DIR)).filter(
  (name) => name.endsWith(".jpg") && !name.endsWith("-sm.jpg"),
);

let written = 0;
let savedBytes = 0;

for (const name of files) {
  const source = join(DIR, name);
  const target = join(DIR, name.replace(/\.jpg$/, "-sm.jpg"));
  const meta = await sharp(source).metadata();
  if ((meta.width ?? 0) <= SMALL_WIDTH) continue;

  await sharp(source)
    .resize({ width: SMALL_WIDTH })
    .jpeg({ quality: 76, mozjpeg: true })
    .toFile(target);

  const [before, after] = await Promise.all([stat(source), stat(target)]);
  savedBytes += before.size - after.size;
  written += 1;
  process.stdout.write(
    `${name}: ${(before.size / 1024).toFixed(0)} kB → ${(after.size / 1024).toFixed(0)} kB\n`,
  );
}

/* Liste DİSKTEN okunuyor, bu çalıştırmada üretilenlerden değil: betik iki kez
   koşunca ikincisinde hiçbir dosya yazılmıyor ama varyantlar duruyor. */
const slugs = (await readdir(DIR))
  .filter((name) => name.endsWith("-sm.jpg"))
  .map((name) => name.replace(/-sm\.jpg$/, ""))
  .sort();

await writeFile(
  LIST,
  `/**
 * Küçük varyantı (\`<slug>-sm.jpg\`) olan kareler.
 *
 * ÜRETİLEN DOSYA — elle düzenlenmiyor: \`node scripts/photo-variants.mjs\`.
 *
 * \`Photo\` bileşeni \`srcset\`i yalnızca buradaki kareler için veriyor. Yeni
 * bir fotoğraf klasöre atılıp betik koşulmadıysa liste dışında kalıyor ve tam
 * boy iniyor — ekran bozulmuyor, sadece dosya büyük oluyor.
 */

export const HAS_SMALL: ReadonlySet<string> = new Set([
${slugs.map((slug) => `  "${slug}",`).join("\n")}
]);
`,
  "utf8",
);

process.stdout.write(
  `\n${written} varyant. Dar ekranda kare başına ortalama ${(savedBytes / Math.max(written, 1) / 1024).toFixed(0)} kB tasarruf.\n` +
    `${LIST}: ${slugs.length} kare.\n`,
);
