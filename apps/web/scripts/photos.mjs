/**
 * Fotoğraf hazırlama betiği.
 *
 *     node scripts/photos.mjs ~/Downloads
 *
 * --------------------------------------------------------------------------
 * NEDEN BİR BETİK, NEDEN ELLE DEĞİL
 * --------------------------------------------------------------------------
 * İndirilen dosyalar 0.6-6.9 MB ve 7000 piksele kadar; oldukları gibi
 * kullanılamazlar. Elle kırpmak da işe yaramıyor çünkü her yuvanın **kendi
 * işi** var ve iki farklı kip gerekiyor:
 *
 *   cover  — kutuyu doldur, taşanı kes. Kart ve şerit gibi ölçüsü sabit
 *            yerlerde. `position` ile konunun kadrajda kalacağı taraf
 *            seçiliyor.
 *   inside — hiç kırpma, kutuya sığdır. Gezinme panelinde fotoğrafın TAMAMI
 *            görünmek zorunda; orada kırpmak istenmiyor.
 *
 * Hedef boyutlar ekranda kaplanan alana göre. Daha büyüğü yalnızca bant
 * genişliği harcıyor.
 *
 * `sharp` devDependency; betik `apps/web` içinden koşmak ZORUNDA.
 * Lisans notları `public/photos/README.md` içinde.
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
 * Yuva tanımları.
 *
 * `fit: "inside"` olanlarda `height` üst sınır; oran korunuyor ve dosya
 * kaynağın oranında çıkıyor.
 */
const JOBS = [
  // --- Gezinme panelleri ---------------------------------------------------
  // Fotoğraf panelin sol 3/4'ünü KAPLIYOR: sol kenara dayalı, dikey boşluk
  // yok. Bu yüzden kutu geniş (≈2.3) ve kırpma `cover`.
  //
  // `position` her kare için ayrı seçildi: konunun kadrajda kalması bu
  // orandaki kırpmada tek tek karar gerektiriyor. Hepsi YATAY kaynak;
  // dikey bir kare bu kutuda konuyu tamamen kaybediyor.
  // "Vücut" bölümü için sırt karesi: bölümün adını birebir karşılıyor.

  // --- Giriş ekranı --------------------------------------------------------
  { slug: "hero-login", file: "squat.jpg", fit: "cover", width: 1000, height: 1333, position: "center" },

  // --- Boş durumlar: geniş şerit -------------------------------------------
  // Supplement listesi boşken. Hap kutusu fotoğrafı elde yok; günün masası
  // "her gün tekrarlanan bir şey" fikrini daha iyi taşıyor.

  // --- Program şablonları: 3/4 DİKEY kart -----------------------------------
  // Kartın içeriği (ad, özet, iki düğme) fotoğrafın üstünde duruyor; yatay
  // bir kart o metni taşıyacak yüksekliği bırakmıyordu.
  //
  // Aktif program kartı aynı dosyaları 21/9 olarak kullanıyor: `cover` orada
  // dikey kareyi yatay şeride kırpıyor ve konu ortada kaldığı için çalışıyor.

  // --- Ekipman kartları: 3/2 -----------------------------------------------
  // Kettlebell ve direnç bandı KASITLI olarak boş: elde o ekipmanın fotoğrafı
  // yok ve yanlış bir görsel koymak, hiç koymamaktan kötü. O kartlar nötr
  // dokuyla çalışıyor.

  // --- Antrenman bitiş ekranı ----------------------------------------------

  // --- Antrenman başlangıcı ------------------------------------------------
  // Başlamadan önceki tek ekran. Fotoğraf burada "motivasyon süsü" değil:
  // ekranda başka hiçbir şey yok ve boş bir kart kullanıcıyı bekletiyordu.

  // --- Geçmiş: birikim bandı -----------------------------------------------
  // Toplam tonajın zemini. Plakalı bir raf, sayının ne olduğunu tek bakışta
  // söylüyor — grafik ya da ikon yapmaya gerek kalmadan.

  // --- Karşılama ekranı: anlatının dört durağı -----------------------------
  // Higgsfield ile üretildi. Dördü de AYNI salonun içinde: kamera kapıdan
  // giriyor, zemini geçiyor, bardaki kişiye varıyor, telefona yaklaşıyor.
  // Video (`public/video/story-1080.mp4`, `story-1440.mp4`) bu dört karenin arasını dolduruyor;
  // buradaki dosyalar videonun yüklenemediği durumdaki yedek.
  //
  // Tam ekran arka plan oldukları için diğerlerinden büyükler (1920 geniş) —
  // bir kart değil, ekranın tamamı.
  //
  // `~/Downloads/hf2` altında duruyorlar; betiğe ikinci bir kaynak klasör
  // vermek yerine yol doğrudan yazıldı çünkü bu dört dosya üretilmiş içerik
  // ve indirilen fotoğraflarla aynı yerde durmuyor.
  { slug: "story-entry", file: "hf2/story-1.png", fit: "cover", width: 1920, height: 1080, position: "center" },
  { slug: "story-gym", file: "hf2/story-2.png", fit: "cover", width: 1920, height: 1080, position: "center" },
  { slug: "story-meal", file: "hf2/story-3.png", fit: "cover", width: 1920, height: 1080, position: "center" },
  { slug: "story-phone", file: "hf2/story-4.png", fit: "cover", width: 1920, height: 1080, position: "center" },
];

await mkdir(OUT, { recursive: true });

let total = 0;
for (const job of JOBS) {
  const out = join(OUT, `${job.slug}.jpg`);
  try {
    const pipeline = sharp(join(SRC, job.file)).resize(job.width, job.height, {
      fit: job.fit,
      ...(job.fit === "cover" ? { position: job.position } : {}),
      // `inside` kipinde kaynak hedeften küçükse büyütme.
      withoutEnlargement: job.fit === "inside",
    });

    // mozjpeg: aynı görsel kalitede belirgin biçimde küçük dosya.
    const info = await pipeline
      .jpeg({ quality: 80, mozjpeg: true, progressive: true })
      .toFile(out);

    const kb = Math.round(info.size / 1024);
    total += kb;
    console.log(
      `${job.slug.padEnd(24)} ${String(info.width).padStart(4)}x${String(info.height).padEnd(4)} ${String(kb).padStart(4)} KB`,
    );
  } catch {
    // Eksik bir kaynak dosya betiği durdurmuyor: diğerleri yine üretilsin.
    console.warn(`${job.slug.padEnd(24)} ATLANDI — "${job.file}" okunamadı`);
  }
}
console.log(`${"toplam".padEnd(24)} ${String(total).padStart(14)} KB`);
