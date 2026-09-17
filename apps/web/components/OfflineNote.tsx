"use client";

/**
 * Çevrimdışı uyarısı.
 *
 * Salonun bodrumunda bağlantı düşüyor ve uygulama o anda sessizce
 * çalışmamaya başlıyordu: "Seti kaydet" bir hata kutusu döndürüyor, kullanıcı
 * hatanın kendinde mi ağda mı olduğunu bilmiyordu. Çubuk yalnızca bağlantı
 * yokken görünüyor ve tek şey söylüyor: sorun sende değil.
 *
 * Antrenman ekranındaki set taslakları TARAYICIDA duruyor (bkz.
 * `app/workout/page.tsx`), yani yazdığın değerler kaybolmuyor; sadece
 * sunucuya gitmiyor. Cümle bunu söylüyor, yoksa insanlar ekranı kapatmaktan
 * korkuyor.
 *
 * `navigator.onLine` yanılabilir (ağ var ama internet yok). Yine de yanlış
 * negatif ucuz: çubuk görünmez, her şey eskisi gibi çalışır.
 */

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function OfflineNote() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    // Sunucuda çevrimiçi sayılıyor: ilk boyamada çubuk çıkıp hemen
    // kaybolması, olmamasından kötü.
    () => true,
  );

  if (online) return null;

  return (
    <div
      role="status"
      className="glass fixed inset-x-4 bottom-4 mx-auto flex max-w-[26rem] items-center gap-3 px-4 py-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2"
      style={{ zIndex: "var(--z-modal)" }}
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ background: "var(--color-warning)" }}
      />
      <p className="text-sm" style={{ color: "var(--color-on-night)" }}>
        Bağlantı yok. Yazdıkların bu cihazda duruyor ama sunucuya gitmiyor —
        internet gelince tekrar dene.
      </p>
    </div>
  );
}
