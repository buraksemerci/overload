"use client";

/**
 * Seans kapanışı — kırılan rekorlar ve günün toplamı.
 */

import Link from "next/link";
import { Hero, HeroStat, HeroStats, Page } from "@/components/Layout";
import { fmt } from "@/components/States";
import { prLabel, prUnit } from "@/lib/labels";
import type { PersonalRecordRow } from "@/lib/queries";

/* --- Rekor kutlaması ------------------------------------------------------ */

export function Celebration({
  records,
  doneCount,
  volume,
}: {
  records: PersonalRecordRow[];
  doneCount: number;
  volume: number;
}) {
  return (
    <Page>
      <Hero
        photo="app-plates"
        size="lg"
        eyebrow="Tamamlandı"
        title="Antrenman bitti"
        lead="Hacim birikiyor. Bir sonraki seansta motor ağırlıkları buna göre önerecek."
        actions={
          <>
            <Link href="/" className="btn btn-primary px-6 py-3">
              Panele dön
            </Link>
            <Link href="/progress" className="btn btn-on-photo px-6 py-3">
              İlerlemeyi gör
            </Link>
          </>
        }
      >
        <HeroStats>
          <HeroStat label="Set" value={doneCount} foot={`${doneCount} set tamamlandı`} />
          <HeroStat label="Tonaj" value={volume > 0 ? fmt(volume, 0) : "—"} unit={volume > 0 ? "kg" : undefined} />
          <HeroStat label="Rekor" value={records.length} foot={records.length > 0 ? "yeni" : "bu seansta yok"} />
        </HeroStats>
      </Hero>

      {records.length > 0 ? (
        <section className="tile-night p-6 lg:p-8">
          <h2 className="display text-2xl" style={{ color: "var(--color-on-night)" }}>
            {records.length} yeni rekor
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {records.map((record, i) => (
              <li key={i} className="flex items-center justify-between gap-4 p-4" style={{ background: "var(--color-night-raised)" }}>
                <span className="flex items-center gap-2.5 text-sm" style={{ color: "var(--color-on-night)" }}>
                  <span
                    aria-hidden
                    className="animate-check grid size-5 shrink-0 place-items-center rounded-full"
                    style={{ background: "var(--color-accent)" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-on-accent)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  {prLabel(record.type)}
                </span>
                <span className="display tnum text-2xl" style={{ color: "var(--color-on-night)" }}>
                  {fmt(record.value, 1)}{" "}
                  <span className="font-sans text-xs font-normal" style={{ color: "var(--color-on-night-muted)" }}>
                    {prUnit(record.type)}
                    {record.reps !== null && ` × ${record.reps}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="card p-6 lg:p-8">
          <p className="text-sm text-[var(--color-ink-muted)]">
            Bu seansta rekor kırılmadı — ama {doneCount} set tamamladın, hacim birikiyor.
          </p>
        </section>
      )}
    </Page>
  );
}
