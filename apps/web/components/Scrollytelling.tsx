"use client";

/**
 * Giriş ekranının anlatı bölümü — kaydırmaya bağlı video.
 *
 * --------------------------------------------------------------------------
 * NEREDE DURUYOR VE NEDEN ORADA
 * --------------------------------------------------------------------------
 * Önce panelde (`/`) duruyordu. Yanlış yerdi: anlatı "bu uygulama ne işe
 * yarıyor" sorusunu cevaplıyor ve o soruyu zaten kullanan biri aylar önce
 * bir kez sordu. Her gün açtığı ekranda beş ekran boyu videoyu geçmek
 * zorunda kalıyordu.
 *
 * O soru YALNIZCA giriş ekranında canlı: oraya gelen kişinin ya hesabı yok
 * ya da uygulamayı yeni duydu. Anlatı taşındı, panel günlük işine döndü.
 *
 * --------------------------------------------------------------------------
 * NE ANLATIYOR
 * --------------------------------------------------------------------------
 * Tek kesintisiz çekim, tek mekân: kamera kapıdan içeri giren kişinin
 * yanından geçiyor, salonun zeminini boydan boya kat ediyor, rafların
 * arasında çalışan birinin yanından geçip dipteki bara varıyor, orada
 * öğününü yiyen kişi telefonu eline alınca ekrana yaklaşıyor. Uygulamanın
 * ne işe yaradığını anlatmanın en kısa yolu bu — özellik listesi değil,
 * bir gün.
 *
 * Kesme YOK. Dört kare Higgsfield'da aynı salon tarif edilerek üretildi ve
 * aralarındaki geçişler `start_image` + `end_image` ile zincirlendi; bu
 * yüzden video ilerlerken mekân değişmiyor, yalnızca kamera ilerliyor.
 *
 * Son geçiş bir kez bu vaadi bozdu: bitiş karesi başka birinin eliydi ve
 * model ikisini birbirine erittiği için telefon bir elden ötekine
 * ışınlanıyordu. O segment erimeden önce kesildi ve telefona yaklaşan yeni bir
 * segment tam o kareden başlatıldı (`scripts/story-video.mjs`).
 *
 * --------------------------------------------------------------------------
 * FİNAL: FORM TELEFONUN EKRANINDA
 * --------------------------------------------------------------------------
 * Kadın telefonu eline aldığı andan itibaren ekranda giriş formunun BULANIK
 * görüntüsü var (`scripts/story-screen.py` her kareye yerleştiriyor). Video
 * telefon ekranı ortada biterken duruyor ve çağıranın verdiği içerik (giriş
 * formu) o görüntünün tam üstüne oturup netleşiyor. Videoda okunur yazı yok:
 * uygulama başka bir dile çevrildiğinde video Türkçe, form başka dilde
 * kalmasın. Ekranın karedeki yeri bir kez ölçüldü (`PHONE`);
 * sayfadaki yeri her pencere boyutu için hesaplanıyor çünkü `object-cover`
 * pencerenin oranına göre farklı kırpıyor. Telefon formu taşıyamayacak kadar
 * küçük kalıyorsa sahne biraz daha yakınlaşıyor (`lib/storyVideo.ts`).
 *
 * --------------------------------------------------------------------------
 * KAYDIRMA VİDEONUN ZAMANI
 * --------------------------------------------------------------------------
 * Video kendi kendine OYNAMIYOR. Kaydırma yüzdesi doğrudan `currentTime`e
 * yazılıyor: kullanıcı ne kadar indiyse video o kadar ilerliyor, yukarı
 * çıkınca geri sarıyor. Anlatının hızını kullanıcı belirliyor.
 *
 * Dört şey bunu pürüzsüz yapıyor:
 *
 * 1. **`scrub: 0.6`** — ham kaydırma değeri değil, yumuşatılmış hâli.
 *    Doğrudan bağlamak tekerlek adımlarını videoya aynen geçiriyor ve
 *    görüntü zıplıyor.
 * 2. **Her kare anahtar kare** — normal bir mp4'te anahtar kareler 2-3
 *    saniyede bir; aradaki bir saniyeye atlamak tarayıcıyı o kareden
 *    itibaren her şeyi çözmeye zorluyor. Ayrıntılı ölçüm
 *    `scripts/story-video.mjs`de.
 * 3. **Arama zamanlayıcısı** — süren bir aramanın üstüne yenisi
 *    başlatılmıyor; en son hedef arama bitince uygulanıyor. Kaynak
 *    kalitesindeki dosyada bu olmadan kaydırırken görüntü donuyordu
 *    (`lib/storyVideo.ts`).
 * 4. **Ekrana göre dosya** — 1080p ya da kaynağın kendi 1440p'si. 1080p
 *    bir ekrana 30 MB'lık dosya indirmenin görünür bir karşılığı yok.
 *
 * --------------------------------------------------------------------------
 * GÖRÜNTÜ KALİTESİ
 * --------------------------------------------------------------------------
 * Önceki dosya 1152×648 / 20 fps'e indirilmişti: 5 MB ama kaynağa göre SSIM
 * 0,936 — büyük ekranda gözle görülür yumuşama, kaydırırken kesik hareket.
 * Şimdi kaynağın çözünürlüğü ve kare hızı korunuyor (SSIM 0,989).
 *
 * --------------------------------------------------------------------------
 * VİDEO YOKSA
 * --------------------------------------------------------------------------
 * Dosyalar `public/video/` altında duruyor ve olmayabilir. O durumda bileşen
 * dört fotoğraf karesine düşüyor — ekran yine çalışıyor, yalnızca hareket
 * yok. Aynı ilke `Photo` bileşeninde de geçerli.
 *
 * --------------------------------------------------------------------------
 * HAREKET AZALTMA
 * --------------------------------------------------------------------------
 * `prefers-reduced-motion` açıksa kaydırma bağlaması hiç kurulmuyor ve dört
 * faz alt alta düz kartlar olarak akıyor. Sıkıştırılmış bir sahnede zorunlu
 * kaydırma, hareket duyarlılığı olan kullanıcı için kullanılamaz bir
 * deneyim.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Photo } from "@/components/Photo";
import {
  applyZoom,
  chooseRendition,
  coverBox,
  createSeeker,
  FINALE_OPTIONS,
  finaleZoom,
  frameToPage,
  partialZoom,
  visiblePart,
  type Box,
  type FrameRect,
  type Rendition,
  type Zoom,
} from "@/lib/storyVideo";

interface Phase {
  /** Video yokken kullanılan kare. */
  photo: string;
  eyebrow: string;
  title: string;
  body: string;
  /** Anlatının hangi bölümünde görünüyor (0-1 arası kaydırma ilerlemesi). */
  from: number;
  to: number;
}

/**
 * Aralıklar video zamanına oranla. Her faz aynı KAREDE başlayıp bitiyor —
 * video uzadıkça (son segment eklendi) oranlar değişti, sahneler değişmedi:
 * giriş 0-97, salon 112-205, bar 219-298, telefon 312-465. kare.
 *
 * Metinler HENÜZ HESABI OLMAYAN birine yazılmış.
 *
 * Önce panelde duruyorlardı ve "aktif programın hangi günde olduğunu biliyor"
 * gibi cümleler kuruyorlardı — zaten kullanan birine uygulamayı anlatmak.
 * Burada okuyan kişi uygulamayı hiç görmemiş olabilir; her faz bir SORUYA
 * cevap veriyor: ne zaman, ne kadar, ne yedim, ne kazandım.
 *
 * Faz başına düğme YOK. Dördü de aynı yere ("hesap aç") gitmek zorunda
 * olurdu ve aynı çağrıyı dört kez tekrarlamak onu davet olmaktan çıkarıp
 * gürültüye çeviriyor. Çağrı bir tane ve anlatının sonunda.
 */
const PHASES: readonly Phase[] = [
  {
    photo: "story-entry",
    eyebrow: "Salona girerken",
    title: "Bugün ne yapacağını bilerek gir",
    body: "Programın hangi günde olduğunu uygulama hatırlıyor. Kapıdan girdiğinde karar verilmiş oluyor.",
    from: 0,
    to: 0.209,
  },
  {
    photo: "story-gym",
    eyebrow: "Rafın başında",
    title: "Kaç kilo kaldıracağın yazıyor",
    body: "Her set için somut bir sayı. Geçen sefer ilerlediysen ağırlık artıyor, tıkandıysan deload öneriyor. Tahmin yok.",
    from: 0.241,
    to: 0.441,
  },
  {
    photo: "story-meal",
    eyebrow: "Sonrasında",
    title: "Kalan kalorin tek sayı",
    body: "Ne yediğini yazıyorsun, geriye ne kaldığını söylüyor. Makro tablosu isteyince açılıyor, istemeyince görünmüyor.",
    from: 0.471,
    to: 0.641,
  },
  {
    photo: "story-phone",
    eyebrow: "Haftalar sonra",
    title: "Ne kazandığın görünür oluyor",
    body: "Kaç ton kaldırdın, hangi kas geride kaldı, hangi gün rekor kırdın. Hepsi birikiyor.",
    from: 0.671,
    to: 1,
  },
];

/* --- Hareket azaltma tercihi --------------------------------------------- */

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const subscribeReducedMotion = (onChange: () => void): (() => void) => {
  const query = window.matchMedia(MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

const getReduced = (): boolean => window.matchMedia(MOTION_QUERY).matches;

/** Sunucuda bilinemiyor: `null` "henüz bilinmiyor" demek. */
const getServerReduced = (): boolean | null => null;

/* --- Hangi video dosyası ----------------------------------------------------- */

/** Kaynağın kare hızı. Yarım kareden küçük aramalar bununla eleniyor. */
const FPS = 24;

let rendition: Rendition | null = null;

/**
 * Ekrana göre dosya — BİR KEZ seçiliyor.
 *
 * Pencere boyutu değişince yeniden seçmek, kullanıcı kaydırırken videoyu
 * baştan yükletmek olurdu. İlk açılıştaki ekran yeterli bir tahmin.
 */
const getRendition = (): Rendition => {
  if (rendition === null) {
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    rendition = chooseRendition({
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      saveData:
        connection?.saveData === true ||
        ["slow-2g", "2g", "3g"].includes(connection?.effectiveType ?? ""),
    });
  }
  return rendition;
};

const NEVER = () => () => {};

/** Sunucuda ekran yok: dosya istemcide seçiliyor. */
const getServerRendition = (): Rendition | null => null;

/**
 * Anlatının kapladığı kaydırma yüksekliği. Ekran boyu cinsinden.
 *
 * Video 15,5 saniyeden 19,4 saniyeye uzayınca bu da uzadı: aynı kaydırma
 * mesafesinde daha uzun video, sahnelerin daha hızlı geçmesi demekti.
 */
const SCROLL_SCREENS = 7.5;

/**
 * Kaydırmanın hangi noktasında video bitiyor.
 *
 * Sonrası FİNAL: video son karesinde (telefon ekranı) duruyor ve çağıranın
 * verdiği içerik o karenin üstüne çıkıyor. Faz aralıkları (`PHASES`) video
 * zamanına göre yazılı; kaydırma ilerlemesi bu değerle ölçekleniyor.
 */
const VIDEO_END = 0.8;

/**
 * Sahnenin ek yakınlaşmasının başladığı nokta — videonun kendi yakınlaşması
 * yavaşlarken. İkisi üst üste biniyor ki kamera bir an durup sonra yeniden
 * yürümüş gibi görünmesin.
 */
const ZOOM_FROM = 0.74;

/** Yakınlaşma bittiği anda form beliriyor. */
const FINALE_FROM = 0.88;

/** Videonun oranı. Sahne `object-cover` ile kırpılıyor. */
const VIDEO_ASPECT = 16 / 9;

/**
 * Son karede telefon ekranı — ölçüldü, kareye oranla.
 *
 * `~/Downloads/hf2/story-4.png` (işlenmiş videonun son karesi, 2560×1440):
 * ekran 943-1563 × 75-1311 piksel, çentik 1131-1375 × 75-118. Köşe yarıçapı
 * ekranın alt kenarındaki eğriden hesaplandı (~54 px). Video yeniden
 * işlenirse bu değerler YENİDEN ölçülmeli: form ekranın dışına taşar.
 */
const PHONE = {
  screen: {
    x: 943 / 2560,
    y: 75 / 1440,
    width: 621 / 2560,
    height: 1237 / 1440,
  },
  notch: { x: 1131 / 2560, y: 75 / 1440, width: 245 / 2560, height: 44 / 1440 },
  /** Ekran genişliğine oranla. */
  radius: 54 / 620,
} satisfies { screen: FrameRect; notch: FrameRect; radius: number };

/**
 * Telefon ekranının TASARIM genişliği, CSS pikseli.
 *
 * Form bu genişlikte bir "uygulama ekranına" dizilip telefonun gerçek boyuna
 * ölçekleniyor — pencereye göre değil. Önce doğrudan telefon ekranının
 * kutusuna yerleşiyordu ve formun ekrana oranı pencereye göre değişiyordu:
 * 1080p'de ekranın %80'i, 1440p'de %60'ı. Videodaki telefon ekranında bu
 * formun BULANIK bir görüntüsü var (`scripts/story-screen.py`); form belirince
 * bulanık görüntünün tam üstüne oturması için ikisinin aynı tasarımda olması
 * şart.
 */
const DESIGN_WIDTH = 390;
const DESIGN_HEIGHT = (DESIGN_WIDTH * (PHONE.screen.height * 1440)) / (PHONE.screen.width * 2560);

/** Formun telefon ekranındaki yeri — pencere boyutuna göre hesaplanmış. */
interface FinaleLayout {
  /** Yakınlaşma bittiğinde. Kaydırmayla bunun bir kısmı uygulanıyor. */
  zoom: Zoom;
  /** Telefon ekranı, yakınlaşma sonrası. */
  screen: Box;
  notch: Box;
  radius: number;
  /** Tasarım genişliğinden telefonun gerçek boyuna ölçek. */
  scale: number;
  /**
   * Ekranın pencerede görünen, çentiğin altında kalan kısmı — TASARIM
   * biriminde, ekranın sol üstüne göre. Form burada ortalanıyor; alçak bir
   * pencerede ekran taşarsa form görünen kısımda kalıyor.
   */
  content: Box;
}

function finaleLayout(view: { width: number; height: number }): FinaleLayout {
  const media = coverBox(view, VIDEO_ASPECT);
  const screen = frameToPage(media, PHONE.screen);
  const zoom = finaleZoom(view, media, screen);
  const zoomedScreen = applyZoom(screen, zoom);
  const notch = applyZoom(frameToPage(media, PHONE.notch), zoom);
  const scale = zoomedScreen.width / DESIGN_WIDTH;

  const visible = visiblePart(zoomedScreen, view, FINALE_OPTIONS.margin);
  const top = Math.max(visible.top, notch.top + notch.height);
  const bottom = visible.top + visible.height;

  return {
    zoom,
    screen: zoomedScreen,
    notch,
    radius: PHONE.radius * zoomedScreen.width,
    scale,
    content: {
      left: (visible.left - zoomedScreen.left) / scale,
      top: (top - zoomedScreen.top) / scale,
      width: visible.width / scale,
      height: Math.max(bottom - top, 0) / scale,
    },
  };
}

/** Yumuşak başlayıp yumuşak biten geçiş. */
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * Sahnenin ek yakınlaşmasını uygular — React'i DOLAŞMADAN.
 *
 * Kaydırmanın her karesinde çağrılıyor; bir durum güncellemesi her karede
 * bütün sahneyi yeniden çizdirirdi. Dönüşüm doğrudan katmana yazılıyor.
 */
function paintZoom(layer: HTMLElement | null, layout: FinaleLayout | null, t: number): void {
  if (layer === null || layout === null) return;
  const zoom = partialZoom(layout.zoom, t);
  layer.style.transform =
    zoom.scale === 1 && zoom.x === 0 && zoom.y === 0
      ? ""
      : `translate3d(${zoom.x}px, ${zoom.y}px, 0) scale(${zoom.scale})`;
}

interface Props {
  /**
   * Anlatının vardığı yer — videonun son karesinin üstünde duruyor.
   *
   * Giriş ekranında giriş formu. Anlatıdan sonra ayrı, düz bir bölüm olarak
   * durduğunda videodan sonra sönük bir kapanış gibi kalıyordu; son karenin
   * üstünde anlatının kendi sonucu oluyor.
   */
  finale?: React.ReactNode;
  /** Final göründü ya da çekildi. Olay, render değil — GSAP'ten geliyor. */
  onFinaleChange?: (active: boolean) => void;
}

export function Scrollytelling({ finale, onFinaleChange }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const zoomLayer = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const hasFinale = finale !== undefined;

  /** Formun telefon ekranındaki yeri. Pencere boyutu değişince yeniden. */
  const [layout, setLayout] = useState<FinaleLayout | null>(null);
  /* Aynı değerin ref kopyası ve yakınlaşmanın son hâli: kaydırma döngüsü
     bunları her karede okuyor ve bir render beklememeli. */
  const layoutRef = useRef<FinaleLayout | null>(null);
  const zoomT = useRef(0);

  /* Geri çağırmanın güncel hâli bir ref'te: GSAP kurulumu yalnızca hareket
     tercihi değişince yeniden yapılıyor ve çağıranın her render'da yeni bir
     fonksiyon vermesi kaydırma bağlamasını baştan kurdurmamalı. */
  const finaleCallback = useRef(onFinaleChange);
  useEffect(() => {
    finaleCallback.current = onFinaleChange;
  }, [onFinaleChange]);

  /**
   * Hareket azaltma tercihi SUNUCUDA bilinemiyor.
   *
   * `null` = henüz bilinmiyor. `null` iken düz (kaydırmasız) hâl basılıyor
   * çünkü o her koşulda okunur.
   *
   * `useEffect` + `setState` yerine `useSyncExternalStore`: `matchMedia`
   * React dışı bir kaynak ve bu kanca tam olarak onun için var. Aboneliği de
   * kendisi yönetiyor, yani tercih ekran açıkken değişirse (işletim sistemi
   * ayarı) sahne kendiliğinden düz hâle geçiyor.
   */
  const reduced = useSyncExternalStore(subscribeReducedMotion, getReduced, getServerReduced);
  const src = useSyncExternalStore(NEVER, getRendition, getServerRendition);
  /** Video dosyası gerçekten yüklendi mi? Yoksa fotoğraf karelerine düşüyor. */
  const [hasVideo, setHasVideo] = useState(false);
  /** Hangi fazın metni görünüyor. */
  const [active, setActive] = useState(0);
  /** Final görünüyor mu. */
  const [finaleActive, setFinaleActive] = useState(false);

  /* Pencere boyutu değiştikçe telefon ekranının yeri yeniden hesaplanıyor.
     `ResizeObserver` gözlemeye başladığı anda bir kez de kendiliğinden
     çağırıyor: ilk ölçüm için ayrıca bir çağrı gerekmiyor. */
  useEffect(() => {
    if (reduced !== false || !hasFinale || stage.current === null) return;
    const element = stage.current;

    const observer = new ResizeObserver(() => {
      const next = finaleLayout({
        width: element.clientWidth,
        height: element.clientHeight,
      });
      layoutRef.current = next;
      setLayout(next);
      paintZoom(zoomLayer.current, next, zoomT.current);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [reduced, hasFinale]);

  useEffect(() => {
    if (reduced !== false || root.current === null) return;

    let cleanup = () => {};
    let cancelled = false;

    // GSAP dinamik yükleniyor: ScrollTrigger yalnızca bu ekranda gerekiyor
    // ve ilk yüklemeye eklemesinin anlamı yok.
    void (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled || root.current === null || video.current === null) return;

      gsap.registerPlugin(ScrollTrigger);

      // Arama zamanlayıcısı: süren bir aramanın üstüne yenisini başlatmıyor
      // (gerekçe ve ölçüm `lib/storyVideo.ts`de). Kaynak kalitesindeki
      // dosyada her karede `currentTime`e yazmak görüntüyü donduruyordu.
      const seeker = createSeeker(video.current, FPS);

      const context = gsap.context(() => {
        /**
         * Kaydırma ilerlemesini tek bir yerde topla.
         *
         * Hem videonun zamanını hem hangi metnin görüneceğini aynı değer
         * sürüyor; iki ayrı tetikleyici kurulsaydı ikisi bir kare kayabilir
         * ve metin yanlış sahnenin üstünde görünürdü.
         */
        const state = { progress: 0 };
        let lastFinale = false;

        gsap.to(state, {
          progress: 1,
          ease: "none",
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "bottom bottom",
            // Yumuşatma: ham kaydırma değeri tekerlek adımlarını videoya
            // aynen geçiriyor ve görüntü zıplıyor.
            scrub: 0.6,
          },
          onUpdate: () => {
            // Final varsa video kaydırmanın `VIDEO_END`inde bitiyor; kalan
            // kısım son karede duruyor. Final yoksa bütün kaydırma video.
            const end = hasFinale ? VIDEO_END : 1;
            const videoProgress = Math.min(state.progress / end, 1);

            const element = video.current;
            if (element !== null && Number.isFinite(element.duration)) {
              // `duration - 0.05`: tam sona yazmak bazı tarayıcılarda
              // `ended` tetikleyip son kareyi boşaltıyor.
              seeker.seek(Math.min(videoProgress * element.duration, element.duration - 0.05));
            }

            const index = PHASES.findIndex(
              (phase) => videoProgress >= phase.from && videoProgress <= phase.to,
            );
            // Aralıkların arasına düşen kaydırma konumunda son faz kalıyor:
            // metin bir an kaybolup geri gelmiyor.
            if (index !== -1) setActive(index);

            if (hasFinale) {
              const t = Math.min(
                Math.max((state.progress - ZOOM_FROM) / (FINALE_FROM - ZOOM_FROM), 0),
                1,
              );
              zoomT.current = smoothstep(t);
              paintZoom(zoomLayer.current, layoutRef.current, zoomT.current);
            }

            const inFinale = hasFinale && state.progress >= FINALE_FROM;
            if (inFinale !== lastFinale) {
              lastFinale = inFinale;
              setFinaleActive(inFinale);
              finaleCallback.current?.(inFinale);
            }
          },
        });
      }, root);

      cleanup = () => {
        context.revert();
        seeker.dispose();
      };
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [reduced, hasFinale]);

  if (reduced !== false) {
    return (
      /* `data-story`: testlerin sahneyi bulma kancası. Önce `.sticky`ye
         bakılıyordu ama giriş ekranındaki yapışkan üst çubuk da o sınıfı
         taşıyor ve "sahne yapışkan değil" kontrolü yanlış öğeyi buluyordu. */
      <div data-story className="flex flex-col gap-2">
        {PHASES.map((phase) => (
          <FlatCard key={phase.photo} phase={phase} />
        ))}
        {/* Hareket azaltmada da final son karenin üstünde — ama kaydırmaya
            bağlı değil, akışta. Fotoğraf arka planda; içerik kendi
            yüksekliğini alıyor, kırpılmıyor. */}
        {hasFinale && (
          <section className="relative overflow-hidden">
            <div aria-hidden className="absolute inset-0">
              <Photo slug="story-phone" fill scrim className="size-full" />
            </div>
            <div className="relative flex justify-center px-5 py-16 sm:px-8 lg:px-12">
              {/* Burada telefona oturtulmuyor: kart kaydırmaya bağlı değil ve
                  fotoğraf kartın yüksekliğine göre kırpılıyor. Zemini kendi. */}
              <div className="theme-light w-full max-w-sm" style={{ background: "var(--color-ground)" }}>
                {finale}
              </div>
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <div data-story ref={root} style={{ height: `${SCROLL_SCREENS * 100}vh` }}>
      <div ref={stage} className="sticky top-0 h-dvh overflow-hidden bg-[oklch(12%_0.01_115)]">
        {/* Yakınlaşma katmanı: finalde telefon ekranı formu taşıyacak boya
            gelene kadar büyütülüyor. Video ile yedek fotoğraf AYNI katmanda —
            ikisi de aynı kare, aynı yerde durmalı. */}
        <div
          ref={zoomLayer}
          className="absolute inset-0"
          style={{
            transformOrigin: "0 0",
            willChange: hasFinale ? "transform" : undefined,
          }}
        >
          <video
            ref={video}
            // `muted` + `playsInline` ŞART: sessiz olmayan bir video iOS'ta
            // hiç yüklenmiyor, `playsInline` olmadan tam ekrana atlıyor.
            muted
            playsInline
            preload="auto"
            // `autoPlay` YOK: video kendi kendine oynamıyor, zamanını
            // kaydırma sürüyor.
            onLoadedMetadata={() => setHasVideo(true)}
            // Dosya istemcide ekrana göre seçiliyor (1080p ya da kaynağın
            // 1440p'si); sunucuda `src` yok.
            src={src ?? undefined}
            className="absolute inset-0 size-full object-cover"
            style={{ opacity: hasVideo ? 1 : 0 }}
          />

          {/* Video yoksa fotoğraf karesi. Aynı ilke `Photo` bileşeninde de
            geçerli: dosya eksikken ekran bozulmuyor. */}
          {!hasVideo && (
            <div className="absolute inset-0">
              <Photo slug={PHASES[active]!.photo} fill className="size-full" />
            </div>
          )}
        </div>

        {/* Perde İKİ YÖNLÜ.
            Alttan yukarı olan tek başına yetmiyordu: anlatı ilerledikçe
            sahneler değişiyor ve bazıları (ahşap masa, kahvaltı) tam
            metnin durduğu yerde parlak. Soldan sağa ikinci bir geçiş, yazının
            zeminini sahneden bağımsız hâle getiriyor. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            // Finalde perde kalkıyor: yazı yok ve telefonu tutan eli
            // karartmanın bir sebebi kalmıyor.
            opacity: finaleActive ? 0 : 1,
            transition: "opacity var(--dur-long) var(--ease-out)",
            // İki perde üst üste biniyor; sol alt köşede ikisi birden
            // çalışıyor. Değerler o köşeye göre seçildi: tek tek bakıldığında
            // zayıf görünüyorlar ama çarpıldıkları yer yazının durduğu yer.
            background:
              "linear-gradient(to top, oklch(12% 0.01 115 / 0.74) 0%, oklch(12% 0.01 115 / 0.28) 46%, transparent 100%)," +
              "linear-gradient(to right, oklch(12% 0.01 115 / 0.58) 0%, oklch(12% 0.01 115 / 0.2) 36%, transparent 60%)",
          }}
        />

        <div className="absolute inset-0 flex items-end">
          {/* `grid` BU KAPTA olmak zorunda. Dört metin aynı hücreyi
              paylaşıyor ve yalnızca opaklıkları değişiyor; kap ızgara
              olmazsa `col-start-1 row-start-1` hiçbir şey yapmıyor ve
              dördü alt alta diziliyor — görünür olanı ekranın dışına
              itiyor. Bir kez öyle oldu, `e2e/welcome.spec.ts` artık
              görünür metnin ekranda kaldığını ölçüyor. */}
          <div className="mx-auto grid w-full max-w-[84rem] px-5 pb-16 sm:px-8 lg:pb-24">
            {PHASES.map((phase, index) => {
              // Finalde bütün faz metinleri çekiliyor: formun yanında bir
              // anlatı cümlesi durması iki şeyi aynı anda okutuyor.
              const visible = index === active && !finaleActive;
              return (
                <div
                  key={phase.photo}
                  className="col-start-1 row-start-1 self-end"
                  style={{
                    opacity: visible ? 1 : 0,
                    pointerEvents: visible ? "auto" : "none",
                    transition: "opacity var(--dur-long) var(--ease-out)",
                  }}
                >
                  <Caption phase={phase} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Final katmanı: telefonun ekranı uygulamanın giriş ekranına
            dönüşüyor. Zemin ekranın kendi köşe yarıçapıyla ve çentiğiyle
            çiziliyor ki form ekranın ÜSTÜNDE değil İÇİNDE dursun.

            `inert`: görünmezken içindeki alanlar sekmeyle odaklanamıyor ve
            ekran okuyucu onları okumuyor — opaklık tek başına yalnızca gözden
            saklıyor. İçerik kendi içinde kayabiliyor: telefonda klavye
            açılınca sahne kısalıyor ve form taşmamalı. */}
        {hasFinale && layout !== null && (
          <div
            className="pointer-events-none absolute inset-0"
            inert={!finaleActive}
            style={{
              opacity: finaleActive ? 1 : 0,
              transition: "opacity var(--dur-long) var(--ease-out)",
            }}
          >
            <div
              aria-hidden
              data-phone-screen
              className="theme-light absolute"
              style={{
                ...boxStyle(layout.screen),
                borderRadius: layout.radius,
                background: "var(--color-ground)",
              }}
            />
            <div
              aria-hidden
              className="absolute"
              style={{
                ...boxStyle(layout.notch),
                borderBottomLeftRadius: layout.notch.height / 2,
                borderBottomRightRadius: layout.notch.height / 2,
                background: "oklch(8% 0 0)",
              }}
            />
            {/* Tasarım genişliğindeki uygulama ekranı, telefonun boyuna
                ölçeklenmiş. Belirirken bulanıktan nete geçiyor: videodaki
                ekranda aynı formun bulanık görüntüsü var ve form onun
                netleşmesi gibi görünüyor. */}
            <div
              className="theme-light absolute"
              style={{
                left: layout.screen.left,
                top: layout.screen.top,
                width: DESIGN_WIDTH,
                height: DESIGN_HEIGHT,
                transform: `scale(${layout.scale})`,
                transformOrigin: "0 0",
              }}
            >
              <div
                className="absolute overflow-y-auto"
                style={{
                  ...boxStyle(layout.content),
                  pointerEvents: finaleActive ? "auto" : "none",
                  filter: finaleActive ? "blur(0)" : "blur(6px)",
                  transition: "filter var(--dur-long) var(--ease-out)",
                }}
              >
                <div className="flex min-h-full w-full items-center justify-center">{finale}</div>
              </div>
            </div>
          </div>
        )}

        {/* Finalde çekiliyor: dar bir telefonda ekranın kenarına biniyordu ve
            anlatının bittiğini zaten form söylüyor. */}
        <div
          style={{
            opacity: finaleActive ? 0 : 1,
            transition: "opacity var(--dur-short) var(--ease-out)",
          }}
        >
          <ProgressDots count={PHASES.length} active={active} />
        </div>
      </div>
    </div>
  );
}

const boxStyle = (box: Box): React.CSSProperties => ({
  left: box.left,
  top: box.top,
  width: box.width,
  height: box.height,
});

/** Kaç sahne var ve hangisindeyiz. */
function ProgressDots({ count, active }: { count: number; active: number }) {
  return (
    <div aria-hidden className="absolute top-1/2 right-6 flex -translate-y-1/2 flex-col gap-2">
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="h-6 w-[2px] transition-colors"
          style={{
            background: index === active ? "var(--color-accent)" : "oklch(99% 0 0 / 0.3)",
            transitionDuration: "var(--dur-short)",
          }}
        />
      ))}
    </div>
  );
}

function Caption({ phase }: { phase: Phase }) {
  return (
    <div className="max-w-[34rem] self-end">
      <p className="label on-photo-dark" style={{ color: "oklch(88% 0.01 115)" }}>
        {phase.eyebrow}
      </p>
      <h2
        className="display on-photo-dark mt-2 text-2xl lg:text-3xl"
        style={{ color: "oklch(99% 0 0)" }}
      >
        {phase.title}
      </h2>
      <p
        className="on-photo-dark mt-3 text-sm lg:text-base"
        style={{ color: "oklch(90% 0.01 115)" }}
      >
        {phase.body}
      </p>
    </div>
  );
}

/** Hareket azaltma açıkken: aynı içerik, kaydırmaya bağlı olmadan. */
function FlatCard({ phase }: { phase: Phase }) {
  return (
    <section className="card overflow-hidden">
      <Photo slug={phase.photo} ratio="2 / 1" scrim>
        <div className="flex size-full items-end p-6 lg:p-10">
          <Caption phase={phase} />
        </div>
      </Photo>
    </section>
  );
}
