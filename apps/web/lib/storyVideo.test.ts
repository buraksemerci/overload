import { describe, expect, it } from "vitest";
import { chooseRendition, createSeeker, type Seekable } from "./storyVideo";

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
