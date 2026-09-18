"use client";

/**
 * Yükleniyor / hata / boş durum bileşenleri.
 *
 * Üçü de her ekranda tekrarlanıyor; tek yerde tutmak tutarlılığı sağlıyor.
 *
 * **Boş durum mesajları eylem içerir.** "Veri yok" demek kullanıcıyı çıkmaza
 * sokar; "ilk kilonu gir" demek ne yapacağını söyler.
 */

import { Photo } from "@/components/Photo";

/**
 * Yükleniyor — yazı değil, gelecek içeriğin iskeleti.
 *
 * "Yükleniyor…" satırı ekranın ortasında tek başına duruyordu ve veri gelince
 * yerine giren blok her şeyi aşağı itiyordu. İskelet aynı yüksekliği
 * kaplıyor; satır sayısı çağıran tarafından, gelecek içeriğe göre veriliyor.
 *
 * Etiket ekran okuyucu için duruyor (`aria-label`): görsel iskelet ekran
 * okuyucuya hiçbir şey anlatmıyor.
 */
export function Loading({ label = "Yükleniyor…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex flex-col gap-3 py-2">
      {Array.from({ length: rows }, (_, index) => (
        <span
          key={index}
          aria-hidden
          className="skeleton block h-4"
          style={{ width: index === rows - 1 ? "58%" : "100%" }}
        />
      ))}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof Error ? error.message : "Beklenmeyen bir hata oldu.";
  return (
    <div className="card p-4" role="alert">
      <p className="text-sm" style={{ color: "var(--color-danger)" }}>
        {message}
      </p>
      {onRetry && (
        <button className="btn btn-ghost mt-3" onClick={onRetry}>
          Tekrar dene
        </button>
      )}
    </div>
  );
}

export function Empty({
  title,
  hint,
  action,
  photo,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  /**
   * Geniş bir fotoğraf şeridi. Verilirse başlık onun üstüne çıkıyor.
   *
   * Boş durum, ekranın en ölü ânı: veri yok, gösterilecek bir şey yok.
   * Fotoğraf orada "hiçbir şey yok" cümlesini bir davete çeviriyor — ve
   * ekranın en çok yer açan yeri zaten burası. Fotoğraf yoksa yuva nötr
   * dokuya düşüyor ve kart yine çalışıyor.
   */
  photo?: string;
}) {
  if (photo) {
    /* Başlık, açıklama ve eylem HEPSİ fotoğrafın üstünde.
       Önce başlık görselde, açıklama ve düğme altındaki beyaz şeritteydi —
       yani kart "kapak + içerik" diye ikiye bölünüyordu ve fotoğraf bir
       başlık süsüne dönüyordu. Tek katmanda toplanınca görselin kendisi
       etkileşim yüzeyi oluyor. */
    return (
      <section className="card overflow-hidden">
        {/* Dar ekranda oran yetmiyor: başlık iki satıra çıkınca metin kutunun
            dışına taşıyor ve kırpılıyordu. Alt sınır bunu kaldırıyor. */}
        {/* `w-full` ŞART: oran belirlenmişken yükseklik sabitlenince tarayıcı
            GENİŞLİĞİ orandan türetiyor (304 × 2 = 608 piksel) ve kutu kartın
            dışına taşıp kırpılıyordu — yazının sağı kesiliyordu. */}
        <Photo slug={photo} ratio="2 / 1" scrim className="min-h-[19rem] w-full sm:min-h-0">
          <div className="flex size-full flex-col justify-end gap-3 p-6 lg:p-10">
            <p
              className="display max-w-[24ch] text-xl lg:text-2xl"
              style={{ color: "oklch(99% 0 0)" }}
            >
              {title}
            </p>
            {hint && (
              <p
                className="max-w-[52ch] text-sm"
                style={{ color: "oklch(90% 0.01 115)" }}
              >
                {hint}
              </p>
            )}
            {action && <div className="mt-1 flex flex-wrap gap-2">{action}</div>}
          </div>
        </Photo>
      </section>
    );
  }

  return (
    <div className="card p-6 text-center">
      <p className="text-sm text-[var(--color-ink)]">{title}</p>
      {hint && <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string | number;
  unit?: string;
  // "success" tonu KALDIRILDI: volt zaten başarı rengi, yanına ikinci bir
  // yeşil koymak ikisini de ayırt edilemez yapıyordu.
  tone?: "accent" | "warning";
}) {
  // `--color-accent` DEĞİL: volt metin olarak okunmuyor, koyu varyantı gerekiyor.
  const color =
    tone === "accent"
      ? "var(--color-accent-deep)"
      : tone === "warning"
        ? "var(--color-warning)"
        : "var(--color-ink)";
  return (
    <div className="card p-4">
      <p className="text-xs text-[var(--color-ink-muted)]">{label}</p>
      <p className="mt-1">
        <span className="tnum text-xl font-semibold" style={{ color }}>
          {value}
        </span>
        {unit && <span className="ml-1 text-xs text-[var(--color-ink-faint)]">{unit}</span>}
      </p>
    </div>
  );
}

/** Sayısal metinleri güvenle biçimlendirir — backend Decimal'leri string döndürüyor. */
export function fmt(value: string | number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
