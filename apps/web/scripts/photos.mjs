/**
 * Fotoğraf hazırlama betiği.
 *
 *     node scripts/photos.mjs ~/Downloads
 *
 * --------------------------------------------------------------------------
 * NEDEN BİR BETİK, NEDEN ELLE DEĞİL
 * --------------------------------------------------------------------------
 * Unsplash'ten indirilen dosyalar 0.6-3.8 MB ve 5000 pikselden geniş; oldukları
 * gibi kullanılamazlar. Elle kırpmak da işe yaramıyor çünkü her yuvanın
 * **kendi oranı** var: gezinme paneli 4/5 dikey, giriş hero'su 3/4, boş durum
 * şeridi 21/9. Yanlış orandaki bir fotoğraf `object-fit: cover` ile kırpılıyor
 * ve önemli bölge kadrajdan çıkıyor.
 *
 * Hedef boyutlar ekranda kaplanan alana göre: panel fotoğrafı ~420px
 * genişliğinde duruyor, yani 2x ekran için 840 yeterli. Daha büyüğü yalnızca
 * bant genişliği harcıyor.
 *
 * `sharp` Next.js ile birlikte zaten kurulu; ayrı bir bağımlılık eklenmedi.
 * Betik `apps/web` içinden koşmak ZORUNDA (modül çözümlemesi buradan yapılıyor).
 *
 * Yeni bir fotoğraf eklerken: `JOBS` listesine bir satır ekle, dosyayı
 * indirme klasörüne koy, betiği çalıştır. Lisans notları
 * `public/photos/README.md` içinde.
 */

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const SRC = process.argv[2];
const OUT = "public/photos";

if (!SRC) {
  console.error("Kullanım: node scripts/photos.mjs <kaynak-klasör>");
  process.exit(1);
}

/**
 * Her yuva için kaynak dosya, hedef boyut ve kırpma konumu.
 *
 * `position` önemli: `cover` kırpması varsayılan olarak merkezden kesiyor ve
 * bazı karelerde konu kenarda duruyor.
 */
const JOBS = [
  // --- Gezinme panelleri: 4/5 dikey ---------------------------------------
  {
    slug: "nav-antrenman",
    file: "tyler-raye-Xb1d-N04Quc-unsplash.jpg",
    width: 900,
    height: 1125,
    position: "center",
  },
  {
    slug: "nav-beslenme",
    file: "maahid-photos-DQVH7P46g0Y-unsplash.jpg",
    width: 900,
    height: 1125,
    // Kahvaltı tabağı sağda; merkez kırpımda yumurta kadrajdan çıkıyor.
    position: "right",
  },
  {
    slug: "nav-vucut",
    file: "tyler-raye-eiAHNFufvDA-unsplash.jpg",
    width: 900,
    height: 1125,
    position: "center",
  },
  {
    slug: "nav-asistan",
    file: "samuel-girven-2e4lbLTqPIo-unsplash.jpg",
    width: 900,
    height: 1125,
    position: "center",
  },

  // --- Giriş ekranı hero'su: 3/4 ------------------------------------------
  {
    slug: "hero-login",
    file: "tyler-raye-gnJqUTCPzzg-unsplash.jpg",
    width: 1000,
    height: 1333,
    position: "center",
  },

  // --- Boş durum şeridi: 21/9, tam genişlik -------------------------------
  {
    slug: "empty-workout",
    file: "clark-douglas-VepJDAuitQ4-unsplash.jpg",
    width: 1800,
    height: 771,
    position: "center",
  },
];

await mkdir(OUT, { recursive: true });

let total = 0;
for (const job of JOBS) {
  const out = join(OUT, `${job.slug}.jpg`);
  try {
    const info = await sharp(join(SRC, job.file))
      .resize(job.width, job.height, { fit: "cover", position: job.position })
      // mozjpeg: aynı görsel kalitede belirgin biçimde küçük dosya.
      .jpeg({ quality: 80, mozjpeg: true, progressive: true })
      .toFile(out);

    const kb = Math.round(info.size / 1024);
    total += kb;
    console.log(
      `${job.slug.padEnd(16)} ${info.width}x${info.height}  ${String(kb).padStart(4)} KB`,
    );
  } catch (error) {
    // Eksik bir kaynak dosya betiği durdurmuyor: diğerleri yine üretilsin.
    console.warn(`${job.slug.padEnd(16)} ATLANDI — ${job.file} okunamadı`);
  }
}
console.log(`${"toplam".padEnd(16)} ${String(total).padStart(14)} KB`);
