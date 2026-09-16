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
 * --------------------------------------------------------------------------
 * KAYDIRMA VİDEONUN ZAMANI
 * --------------------------------------------------------------------------
 * Video kendi kendine OYNAMIYOR. Kaydırma yüzdesi doğrudan `currentTime`e
 * yazılıyor: kullanıcı ne kadar indiyse video o kadar ilerliyor, yukarı
 * çıkınca geri sarıyor. Anlatının hızını kullanıcı belirliyor.
 *
 * Üç şey bunu pürüzsüz yapıyor:
 *
 * 1. **`scrub: 0.6`** — ham kaydırma değeri değil, yumuşatılmış hâli.
 *    Doğrudan bağlamak tekerlek adımlarını videoya aynen geçiriyor ve
 *    görüntü zıplıyor.
 * 2. **Yoğun anahtar kare** — video her karede anahtar kare olacak şekilde
 *    yeniden kodlanıyor (`scripts/story-video.mjs`). Normal bir mp4'te
 *    anahtar kareler 2-3 saniyede bir; aradaki bir saniyeye atlamak
 *    tarayıcıyı en yakın anahtar kareye düşürüyor ve geri sarma
 *    takılıyor.
 * 3. **`requestAnimationFrame` yerine doğrudan yazma** — `currentTime`
 *    ataması zaten kare sınırında uygulanıyor; araya bir çerçeve daha
 *    koymak gecikme ekliyor.
 *
 * --------------------------------------------------------------------------
 * VİDEO YOKSA
 * --------------------------------------------------------------------------
 * Dosya `public/video/story.mp4`de duruyor ve olmayabilir. O durumda
 * bileşen dört fotoğraf karesine düşüyor — ekran yine çalışıyor, yalnızca
 * hareket yok. Aynı ilke `Photo` bileşeninde de geçerli.
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
    to: 0.26,
  },
  {
    photo: "story-gym",
    eyebrow: "Rafın başında",
    title: "Kaç kilo kaldıracağın yazıyor",
    body: "Her set için somut bir sayı. Geçen sefer ilerlediysen ağırlık artıyor, tıkandıysan deload öneriyor. Tahmin yok.",
    from: 0.3,
    to: 0.55,
  },
  {
    photo: "story-meal",
    eyebrow: "Sonrasında",
    title: "Kalan kalorin tek sayı",
    body: "Ne yediğini yazıyorsun, geriye ne kaldığını söylüyor. Makro tablosu isteyince açılıyor, istemeyince görünmüyor.",
    from: 0.59,
    to: 0.8,
  },
  {
    photo: "story-phone",
    eyebrow: "Haftalar sonra",
    title: "Ne kazandığın görünür oluyor",
    body: "Kaç ton kaldırdın, hangi kas geride kaldı, hangi gün rekor kırdın. Hepsi birikiyor.",
    from: 0.84,
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

/** Anlatının kapladığı kaydırma yüksekliği. Ekran boyu cinsinden. */
const SCROLL_SCREENS = 5;

export function Scrollytelling() {
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);

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
  /** Video dosyası gerçekten yüklendi mi? Yoksa fotoğraf karelerine düşüyor. */
  const [hasVideo, setHasVideo] = useState(false);
  /** Hangi fazın metni görünüyor. */
  const [active, setActive] = useState(0);

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
      if (cancelled || root.current === null) return;

      gsap.registerPlugin(ScrollTrigger);

      const context = gsap.context(() => {
        /**
         * Kaydırma ilerlemesini tek bir yerde topla.
         *
         * Hem videonun zamanını hem hangi metnin görüneceğini aynı değer
         * sürüyor; iki ayrı tetikleyici kurulsaydı ikisi bir kare kayabilir
         * ve metin yanlış sahnenin üstünde görünürdü.
         */
        const state = { progress: 0 };

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
            const element = video.current;
            if (element !== null && Number.isFinite(element.duration)) {
              // `duration - 0.05`: tam sona yazmak bazı tarayıcılarda
              // `ended` tetikleyip son kareyi boşaltıyor.
              element.currentTime = Math.min(
                state.progress * element.duration,
                element.duration - 0.05,
              );
            }

            const index = PHASES.findIndex(
              (phase) => state.progress >= phase.from && state.progress <= phase.to,
            );
            // Aralıkların arasına düşen kaydırma konumunda son faz kalıyor:
            // metin bir an kaybolup geri gelmiyor.
            if (index !== -1) setActive(index);
          },
        });
      }, root);

      cleanup = () => context.revert();
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [reduced]);

  if (reduced !== false) {
    return (
      /* `data-story`: testlerin sahneyi bulma kancası. Önce `.sticky`ye
         bakılıyordu ama giriş ekranındaki yapışkan üst çubuk da o sınıfı
         taşıyor ve "sahne yapışkan değil" kontrolü yanlış öğeyi buluyordu. */
      <div data-story className="flex flex-col gap-2">
        {PHASES.map((phase) => (
          <FlatCard key={phase.photo} phase={phase} />
        ))}
      </div>
    );
  }

  return (
    <div data-story ref={root} style={{ height: `${SCROLL_SCREENS * 100}vh` }}>
      <div className="sticky top-0 h-dvh overflow-hidden bg-[oklch(12%_0.01_115)]">
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
          className="absolute inset-0 size-full object-cover"
          style={{ opacity: hasVideo ? 1 : 0 }}
        >
          <source src="/video/story.mp4" type="video/mp4" />
        </video>

        {/* Video yoksa fotoğraf karesi. Aynı ilke `Photo` bileşeninde de
            geçerli: dosya eksikken ekran bozulmuyor. */}
        {!hasVideo && (
          <div className="absolute inset-0">
            <Photo slug={PHASES[active]!.photo} fill className="size-full" />
          </div>
        )}

        {/* Perde İKİ YÖNLÜ.
            Alttan yukarı olan tek başına yetmiyordu: anlatı ilerledikçe
            sahneler değişiyor ve bazıları (ahşap masa, kahvaltı) tam
            metnin durduğu yerde parlak. Soldan sağa ikinci bir geçiş, yazının
            zeminini sahneden bağımsız hâle getiriyor. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
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
            {PHASES.map((phase, index) => (
              <div
                key={phase.photo}
                className="col-start-1 row-start-1 self-end"
                style={{
                  opacity: index === active ? 1 : 0,
                  pointerEvents: index === active ? "auto" : "none",
                  transition: "opacity var(--dur-long) var(--ease-out)",
                }}
              >
                <Caption phase={phase} />
              </div>
            ))}
          </div>
        </div>

        <ProgressDots count={PHASES.length} active={active} />
      </div>
    </div>
  );
}

/** Kaç sahne var ve hangisindeyiz. Kaydırmanın sonu olduğunu da söylüyor. */
function ProgressDots({ count, active }: { count: number; active: number }) {
  return (
    <div
      aria-hidden
      className="absolute top-1/2 right-6 flex -translate-y-1/2 flex-col gap-2"
    >
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="h-6 w-[2px] transition-colors"
          style={{
            background:
              index === active ? "var(--color-accent)" : "oklch(99% 0 0 / 0.3)",
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
