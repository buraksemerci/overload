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
 * Bu kural uzun süre YALNIZCA bu yorumda yazılıydı. `defaultCache`in bir
 * kuralı başka kökene giden her GET'i "cross-origin" önbelleğine bir saatliğine
 * yazıyor ve API başka kökende: profil, beslenme günlüğü, kilo kayıtları
 * tarayıcının Cache Storage'ında duruyordu — çıkış yapıldıktan sonra da. Ağ
 * düştüğünde aynı tarayıcıdaki bir sonraki hesaba öncekinin verisi
 * dönebilirdi. İlerleme fotoğraflarının R2 bağlantıları da aynı kurala
 * takılıyordu.
 *
 * Başka kökene giden istekler artık servis worker'a HİÇ girmiyor (aşağıdaki
 * dinleyici). `NetworkOnly` bir kural yazmak yetmezdi: isteği yine worker
 * yapardı ve tarayıcının kendi yolu — CORS, kimlik bilgisi, uçtan uca
 * testlerdeki istek taklidi — devre dışı kalırdı.
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

// Serwist'in dinleyicisinden ÖNCE kaydediliyor: `stopImmediatePropagation`
// sonraki dinleyicileri durduruyor ve `respondWith` çağrılmadığı için istek
// tarayıcının normal yolundan gidiyor.
self.addEventListener("fetch", (event) => {
  if (new URL(event.request.url).origin !== self.location.origin) {
    event.stopImmediatePropagation();
  }
});

// Eski sürümün doldurduğu önbellek siliniyor: kural kalktı ama içindeki
// kişisel yanıtlar kendiliğinden gitmiyor.
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.delete("cross-origin"));
});

serwist.addEventListeners();
