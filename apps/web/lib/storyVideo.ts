/**
 * Kaydırmaya bağlı video için iki yardımcı: hangi dosyanın yükleneceği ve
 * aramanın nasıl yapılacağı.
 *
 * Bileşenden ayrı duruyorlar çünkü ikisi de saf mantık ve ikisi de ölçülerek
 * seçildi — bileşenin içinde kalsalar birim testi yazılamazdı.
 */

/* --- Hangi çözünürlük ------------------------------------------------------ */

export type Rendition = "/video/story-1080.mp4" | "/video/story-1440.mp4";

export interface Screen {
  /** CSS pikseli. */
  width: number;
  height: number;
  devicePixelRatio: number;
  /** Kullanıcı veri tasarrufu istiyor ya da bağlantı yavaş. */
  saveData: boolean;
}

/** Videonun oranı. Sahne `object-cover` ile kırpılıyor. */
const ASPECT = 16 / 9;

/**
 * Ekranı gerçekten dolduracak en küçük dosya.
 *
 * GEREKEN GENİŞLİK, ekran genişliği değil. Sahne `object-cover`: dikey bir
 * telefonda video ekranın YÜKSEKLİĞİNİ dolduracak kadar büyütülüyor ve iki
 * yanı kırpılıyor. 390×844'lük bir telefonda görünen kısım 1500 CSS pikseli
 * genişliğinde bir videonun ortası — piksel yoğunluğuyla çarpınca 1920
 * yetmiyor.
 *
 * Piksel yoğunluğu 2'de kesiliyor: 3x ekranda farkı gözle görmek için
 * telefonu burnuna dayamak gerekiyor, dosya ise değişmiyor.
 *
 * Veri tasarrufunda her zaman küçük dosya: 30 MB'lık bir tanıtımı mobil
 * veriyle zorla indirmek, sayfanın ilk izleniminin faturada kalması demek.
 */
export function chooseRendition(screen: Screen): Rendition {
  if (screen.saveData) return "/video/story-1080.mp4";

  const cssWidth = Math.max(screen.width, screen.height * ASPECT);
  const needed = cssWidth * Math.min(screen.devicePixelRatio, 2);

  return needed > 1920 ? "/video/story-1440.mp4" : "/video/story-1080.mp4";
}

/* --- Arama zamanlayıcısı ---------------------------------------------------- */

/** `HTMLVideoElement`in bu işte kullanılan kısmı. Testte sahtesi veriliyor. */
export interface Seekable {
  currentTime: number;
  readonly seeking: boolean;
  addEventListener(type: "seeked", listener: () => void): void;
  removeEventListener(type: "seeked", listener: () => void): void;
}

/**
 * Arama sürerken YENİ ARAMA BAŞLATMAYAN bir yazıcı.
 *
 * --------------------------------------------------------------------------
 * NEDEN
 * --------------------------------------------------------------------------
 * Kaydırma her karede yeni bir hedef zaman üretiyor (saniyede ~60). Bir
 * arama sürerken `currentTime`e yeniden yazmak, süren çözmeyi iptal edip
 * baştan başlatıyor. Arama bir kareden uzun sürerse HİÇBİRİ bitmiyor:
 * kullanıcı kaydırdıkça görüntü donuyor, durunca atlıyor.
 *
 * Küçük dosyada bu görünmüyordu (arama 6 ms). Kaynak kalitesindeki dosyada
 * ölçüldü — 2560×1440, 2 saniye sürekli kaydırma, ekrana basılan kare:
 *
 *     her karede yaz     24 kare
 *     bu zamanlayıcı     54 kare
 *
 * Şimdi arama sürerken gelen hedef yalnızca HATIRLANIYOR; arama bitince en
 * sonuncusu uygulanıyor. Her arama tamamlanıyor ve ekrana basılıyor, video
 * kaydırmanın gerisinde kalsa bile ona yetişiyor.
 *
 * Yarım kareden küçük farklar yok sayılıyor: kaydırma bir pikseller oynadığında
 * aynı kareyi yeniden çözmenin görünür bir karşılığı yok.
 */
export function createSeeker(video: Seekable, fps: number) {
  const halfFrame = 1 / fps / 2;
  let pending: number | null = null;

  const apply = (time: number) => {
    if (Math.abs(video.currentTime - time) < halfFrame) return;
    video.currentTime = time;
  };

  const onSeeked = () => {
    if (pending === null) return;
    const next = pending;
    pending = null;
    apply(next);
  };

  video.addEventListener("seeked", onSeeked);

  return {
    seek(time: number) {
      if (video.seeking) {
        pending = time;
        return;
      }
      apply(time);
    },
    dispose() {
      video.removeEventListener("seeked", onSeeked);
      pending = null;
    },
  };
}

/* --- Final: telefona yakınlaşma ------------------------------------------------ */

/**
 * Anlatı telefon ekranında bitiyor ve giriş formu O EKRANIN ÜSTÜNE oturuyor.
 *
 * Formu pencerenin ortasına koymak yetmiyor: sahne `object-cover` ile
 * kırpılıyor ve telefonun penceredeki yeri pencerenin oranına göre değişiyor.
 * Dikey bir telefonda videonun iki yanı kesiliyor, geniş bir monitörde üstü
 * ve altı. Telefon ekranının karedeki yeri bir kez ölçülüyor (kareye oranla),
 * gerisi her pencere boyutu için buradan hesaplanıyor.
 *
 * Telefon küçük kalıyorsa (alçak bir pencere, küçük bir telefon) sahne biraz
 * daha yakınlaşıyor — videonun kendi yakınlaşmasının devamı gibi. Form dar
 * bir ekrana sığdırılmak için KÜÇÜLTÜLMÜYOR: yazı okunur kalmalı.
 */

export interface Size {
  width: number;
  height: number;
}

/** Sayfadaki bir kutu, CSS pikseli. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Karedeki bir bölge, karenin genişliğine ve yüksekliğine oranla (0-1). */
export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Sahnenin ek yakınlaşması: `p' = scale · p + (x, y)`, orijin sol üst. */
export interface Zoom {
  scale: number;
  x: number;
  y: number;
}

/** `object-fit: cover` ile basılan görüntünün kutusu. */
export function coverBox(view: Size, aspect: number): Box {
  const width = Math.max(view.width, view.height * aspect);
  const height = width / aspect;
  return {
    left: (view.width - width) / 2,
    top: (view.height - height) / 2,
    width,
    height,
  };
}

/** Karedeki bir bölgenin sayfadaki kutusu. */
export function frameToPage(media: Box, rect: FrameRect): Box {
  return {
    left: media.left + rect.x * media.width,
    top: media.top + rect.y * media.height,
    width: rect.width * media.width,
    height: rect.height * media.height,
  };
}

export function applyZoom(box: Box, zoom: Zoom): Box {
  return {
    left: zoom.scale * box.left + zoom.x,
    top: zoom.scale * box.top + zoom.y,
    width: zoom.scale * box.width,
    height: zoom.scale * box.height,
  };
}

/** Yakınlaşmanın `t` (0-1) kadarı. `t = 0` hiç yakınlaşma yok. */
export function partialZoom(zoom: Zoom, t: number): Zoom {
  return { scale: 1 + (zoom.scale - 1) * t, x: zoom.x * t, y: zoom.y * t };
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export interface FinaleOptions {
  /** Formun rahat okunduğu en dar ekran genişliği. */
  minWidth: number;
  /** Pencere kenarıyla telefon ekranı arasında bırakılan boşluk. */
  margin: number;
  /** Bundan fazla yakınlaşma görüntüyü bulanıklaştırıyor. */
  maxScale: number;
}

export const FINALE_OPTIONS: FinaleOptions = { minWidth: 340, margin: 12, maxScale: 2 };

/**
 * Telefon ekranını formu taşıyacak boya getiren son yakınlaşma.
 *
 * - Ekran zaten yeterince genişse yakınlaşma YOK (`scale = 1`): geniş bir
 *   monitörde sahneyi büyütmek yalnızca videoyu bulanıklaştırır.
 * - Hiçbir zaman uzaklaşmıyor: anlatı bir yaklaşma, geri çekilme değil.
 * - Ekranın ortası pencerenin ortasına taşınıyor — ama görüntü pencereyi
 *   TAMAMEN örtmeye devam edecek kadar. Kenarda koyu bir şerit açılması,
 *   ekranın birkaç piksel kaymasından çok daha görünür.
 */
export function finaleZoom(
  view: Size,
  media: Box,
  screen: Box,
  options: FinaleOptions = FINALE_OPTIONS,
): Zoom {
  const widest = view.width - 2 * options.margin;
  const wanted = Math.min(Math.max(options.minWidth, screen.width), widest);
  const scale = clamp(wanted / screen.width, 1, options.maxScale);

  const centerX = screen.left + screen.width / 2;
  const centerY = screen.top + screen.height / 2;

  return {
    scale,
    x: clamp(
      view.width / 2 - scale * centerX,
      view.width - scale * (media.left + media.width),
      -scale * media.left,
    ),
    y: clamp(
      view.height / 2 - scale * centerY,
      view.height - scale * (media.top + media.height),
      -scale * media.top,
    ),
  };
}

/**
 * Bir kutunun pencerede görünen kısmı.
 *
 * Alçak bir pencerede yakınlaşılmış telefon ekranı üstten ve alttan taşıyor;
 * form ekranın GÖRÜNEN kısmına yerleşmeli, yoksa gönder düğmesi pencerenin
 * altında kalır.
 */
export function visiblePart(box: Box, view: Size, margin: number): Box {
  const left = Math.max(box.left, margin);
  const top = Math.max(box.top, margin);
  const right = Math.min(box.left + box.width, view.width - margin);
  const bottom = Math.min(box.top + box.height, view.height - margin);
  return {
    left,
    top,
    width: Math.max(right - left, 0),
    height: Math.max(bottom - top, 0),
  };
}
