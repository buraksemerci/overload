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
