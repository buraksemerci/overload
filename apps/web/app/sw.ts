/// <reference lib="webworker" />

/**
 * Servis worker — offline kabuk ve çevrimdışı dayanıklılık.
 *
 * **Ne önbelleğe alınır, ne alınmaz:**
 * - Uygulama kabuğu (JS/CSS/font/ikon) önbelleğe alınır — salonda zayıf
 *   bağlantıda uygulamanın açılması buna bağlı.
 * - API yanıtları önbelleğe ALINMAZ. Antrenman verisi kişisel ve hızla
 *   bayatlıyor; eski bir "bugünkü antrenman" göstermek, hiç göstermemekten
 *   daha kötü — kullanıcı yanlış ağırlıkla çalışır.
 *
 * `skipWaiting` + `clientsClaim`: yeni sürüm hemen devralır. Uzun yaşayan
 * sekmelerde eski kabuk ile yeni API sözleşmesi çakışabilir; hızlı devralma
 * o penceresi daraltıyor.
 */

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
