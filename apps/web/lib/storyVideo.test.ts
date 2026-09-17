import { describe, expect, it } from "vitest";
import {
  applyZoom,
  chooseRendition,
  coverBox,
  createSeeker,
  finaleZoom,
  frameToPage,
  partialZoom,
  visiblePart,
  type Seekable,
} from "./storyVideo";

describe("chooseRendition", () => {
  it("1080p dizüstünde küçük dosya", () => {
    expect(
      chooseRendition({ width: 1920, height: 1080, devicePixelRatio: 1, saveData: false }),
    ).toBe("/video/story-1080.mp4");
  });

  it("retina ekranda kaynak çözünürlüğü", () => {
    // 1440 CSS × 2 = 2880 fiziksel piksel.
    expect(
      chooseRendition({ width: 1440, height: 900, devicePixelRatio: 2, saveData: false }),
    ).toBe("/video/story-1440.mp4");
  });

  it("dikey telefonda yükseklik belirleyici", () => {
    // Genişlik yalnızca 390 ama `object-cover` videoyu 844 yüksekliğe
    // büyütüyor: görünen kısım 1500 CSS pikselinin ortası.
    expect(
      chooseRendition({ width: 390, height: 844, devicePixelRatio: 3, saveData: false }),
    ).toBe("/video/story-1440.mp4");
  });

  it("veri tasarrufunda her zaman küçük dosya", () => {
    expect(
      chooseRendition({ width: 1440, height: 900, devicePixelRatio: 2, saveData: true }),
    ).toBe("/video/story-1080.mp4");
  });
});

/**
 * Tarayıcının arama davranışını taklit eden sahte video: `currentTime`e
 * yazmak `seeking`i hemen açıyor, `finishSeek()` çağrılana kadar açık
 * kalıyor — gerçek elementte çözme bitene kadar olduğu gibi.
 */
function fakeVideo() {
  let time = 0;
  let seeking = false;
  const listeners = new Set<() => void>();
  const writes: number[] = [];

  const video: Seekable & { finishSeek(): void; writes: number[] } = {
    get currentTime() {
      return time;
    },
    set currentTime(value: number) {
      time = value;
      seeking = true;
      writes.push(value);
    },
    get seeking() {
      return seeking;
    },
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    finishSeek() {
      seeking = false;
      for (const listener of [...listeners]) listener();
    },
    writes,
  };
  return video;
}

describe("createSeeker", () => {
  it("arama sürerken gelen hedefler çözmeyi yeniden başlatmıyor", () => {
    const video = fakeVideo();
    const seeker = createSeeker(video, 24);

    seeker.seek(1);
    // Kaydırma devam ediyor, arama henüz bitmedi.
    seeker.seek(1.1);
    seeker.seek(1.2);
    seeker.seek(1.3);

    // Her karede yazsaydı dört arama başlar, hiçbiri bitmezdi.
    expect(video.writes).toEqual([1]);
  });

  it("arama bitince EN SON hedef uygulanıyor", () => {
    const video = fakeVideo();
    const seeker = createSeeker(video, 24);

    seeker.seek(1);
    seeker.seek(1.1);
    seeker.seek(1.5);
    video.finishSeek();

    // Aradaki 1,1 atlanıyor: video kaydırmaya yetişiyor, geçmişi yeniden
    // oynamıyor.
    expect(video.writes).toEqual([1, 1.5]);
  });

  it("yarım kareden küçük fark aramıyor", () => {
    const video = fakeVideo();
    const seeker = createSeeker(video, 24);

    seeker.seek(2);
    video.finishSeek();
    // 24 fps'te bir kare ~41 ms; 10 ms'lik fark aynı kare.
    seeker.seek(2.01);

    expect(video.writes).toEqual([2]);
  });

  it("dispose sonrası bekleyen hedef uygulanmıyor", () => {
    const video = fakeVideo();
    const seeker = createSeeker(video, 24);

    seeker.seek(1);
    seeker.seek(3);
    seeker.dispose();
    video.finishSeek();

    expect(video.writes).toEqual([1]);
  });
});

describe("final yakınlaşması", () => {
  // Ölçüye yakın bir telefon ekranı: karenin ortasında, dar ve uzun.
  const SCREEN = { x: 0.38, y: 0.06, width: 0.24, height: 0.84 };

  it("cover kutusu pencereyi örtüyor", () => {
    const portrait = coverBox({ width: 390, height: 844 }, 16 / 9);
    expect(portrait.height).toBe(844);
    expect(portrait.width).toBeCloseTo(1500.4, 0);
    expect(portrait.left).toBeCloseTo(-555.2, 0);

    const wide = coverBox({ width: 2560, height: 1080 }, 16 / 9);
    expect(wide.width).toBe(2560);
    expect(wide.top).toBeLessThan(0);
  });

  it("geniş ekranda yakınlaşmıyor", () => {
    const view = { width: 1920, height: 1080 };
    const media = coverBox(view, 16 / 9);
    const screen = frameToPage(media, SCREEN);
    // 0,24 × 1920 = 461 px: form rahat sığıyor.
    expect(finaleZoom(view, media, screen).scale).toBe(1);
  });

  it("dar kalan ekranı formun sığacağı kadar büyütüyor", () => {
    const view = { width: 1280, height: 720 };
    const media = coverBox(view, 16 / 9);
    const screen = frameToPage(media, SCREEN);
    const zoom = finaleZoom(view, media, screen);

    expect(zoom.scale).toBeGreaterThan(1);
    expect(applyZoom(screen, zoom).width).toBeCloseTo(340, 0);
  });

  it("küçük telefonda pencereden geniş olacak kadar büyütmüyor", () => {
    const view = { width: 320, height: 568 };
    const media = coverBox(view, 16 / 9);
    const screen = frameToPage(media, SCREEN);
    const zoomed = applyZoom(screen, finaleZoom(view, media, screen));

    expect(zoomed.width).toBeLessThanOrEqual(320 - 24 + 0.01);
  });

  it("yakınlaştıktan sonra görüntü pencereyi hâlâ örtüyor", () => {
    // Telefon karenin kenarına yakın olsa bile ortalamak için kaydırmak koyu
    // bir şerit açmamalı.
    for (const view of [
      { width: 1280, height: 720 },
      { width: 1366, height: 768 },
      { width: 360, height: 640 },
    ]) {
      const media = coverBox(view, 16 / 9);
      const screen = frameToPage(media, { ...SCREEN, x: 0.02 });
      const covered = applyZoom(media, finaleZoom(view, media, screen));

      expect(covered.left).toBeLessThanOrEqual(0.01);
      expect(covered.top).toBeLessThanOrEqual(0.01);
      expect(covered.left + covered.width).toBeGreaterThanOrEqual(view.width - 0.01);
      expect(covered.top + covered.height).toBeGreaterThanOrEqual(view.height - 0.01);
    }
  });

  it("hiçbir zaman uzaklaşmıyor", () => {
    const view = { width: 390, height: 844 };
    const media = coverBox(view, 16 / 9);
    const huge = { left: 0, top: 0, width: 600, height: 900 };
    expect(finaleZoom(view, media, huge).scale).toBe(1);
  });

  it("yakınlaşmanın bir kısmı aradaki değer", () => {
    const zoom = { scale: 2, x: -100, y: -40 };
    expect(partialZoom(zoom, 0.5)).toEqual({ scale: 1.5, x: -50, y: -20 });
    expect(partialZoom(zoom, 0).scale).toBe(1);
  });

  it("görünen kısım pencereyle kesişim", () => {
    expect(
      visiblePart(
        { left: 10, top: -100, width: 340, height: 900 },
        { width: 360, height: 640 },
        12,
      ),
    ).toEqual({ left: 12, top: 12, width: 336, height: 616 });
  });
});
