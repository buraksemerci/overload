"use client";

/**
 * Panonun alt bölümleri: son antrenmanlar ve bölüm karoları.
 */

import Link from "next/link";
import { Photo } from "@/components/Photo";
import { tonnage } from "@/lib/stats";
import type { HistorySession } from "@/lib/queries";
import { BigNumber } from "@/components/dashboard/Tiles";
import type { Href } from "@/components/dashboard/model";

/* --- Son antrenmanlar -------------------------------------------------------------- */

export function RecentSessions({ sessions }: { sessions: readonly HistorySession[] }) {
  const rows = sessions.slice(0, 3);
  if (rows.length === 0) return null;

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="display text-xl lg:text-2xl">Son antrenmanlar</h2>
        <Link href="/history" className="link text-xs">
          Tümü
        </Link>
      </div>

      <ul className="grid gap-3 md:grid-cols-3">
        {rows.map((session, index) => {
          const tons = tonnage(Number.parseFloat(session.volume_kg) || 0);
          return (
            <li key={session.id}>
              <Link href="/history" className="card lift flex h-full flex-col p-6">
                <p className="flex items-center justify-between gap-2">
                  <span className="label">{shortDate(session.started_at)}</span>
                  {session.records.length > 0 && (
                    <span className="badge badge-accent">
                      {session.records.length > 1 ? `${session.records.length} REKOR` : "REKOR"}
                    </span>
                  )}
                </p>
                <p className="display mt-3 text-xl leading-tight">
                  {session.day_label ?? dayName(session.started_at)}
                </p>
                <div className="mt-auto flex items-end justify-between gap-3 pt-6">
                  <BigNumber value={tons.value} unit={tons.unit} size="md" />
                  <p className="tnum text-right text-xs text-[var(--color-ink-faint)]">
                    {session.total_sets} set
                    {session.duration_min ? ` · ${session.duration_min} dk` : ""}
                  </p>
                </div>
                <span aria-hidden className="mt-4 block h-1 w-full bg-[var(--color-surface-raised)]">
                  <span
                    className="block h-full"
                    style={{
                      width: `${100 - index * 22}%`,
                      background: "var(--color-ink)",
                      opacity: 0.12 + (2 - index) * 0.1,
                    }}
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const dayName = (iso: string): string =>
  new Date(iso)
    .toLocaleDateString("tr-TR", { weekday: "long" })
    .replace(/^./, (c) => c.toLocaleUpperCase("tr-TR"));

const shortDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "short" });

/* --- Bölümler ------------------------------------------------------------------------ */

const SECTIONS: ReadonlyArray<{
  href: Href;
  photo: string;
  title: string;
  note: string;
  className: string;
}> = [
  {
    href: "/workout",
    photo: "app-grip",
    title: "Antrenman",
    note: "Bugünün akışı, programlar, hareket kütüphanesi, geçmiş",
    className: "lg:col-span-7 lg:row-span-2",
  },
  {
    href: "/nutrition",
    photo: "app-meal-bar",
    title: "Beslenme",
    note: "Günlük ve supplement",
    className: "lg:col-span-5",
  },
  {
    href: "/body",
    photo: "app-body",
    title: "Vücut",
    note: "Durum özeti, kas haritası, kilo, ağrı",
    className: "lg:col-span-5",
  },
  {
    href: "/chat",
    photo: "app-review",
    title: "Asistan",
    note: "Sohbet ve haftalık rapor",
    className: "lg:col-span-12",
  },
];

export function SectionGrid() {
  return (
    <ul className="grid auto-rows-[15rem] gap-3 sm:grid-cols-2 lg:auto-rows-[17rem] lg:grid-cols-12">
      {SECTIONS.map((section) => (
        <li key={String(section.href)} className={section.className}>
          <Link href={section.href} className="card lift block size-full overflow-hidden">
            <Photo
              slug={section.photo}
              fill
              scrim
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="size-full"
            >
              <div className="flex size-full flex-col justify-end p-6 lg:p-8">
                <p className="display on-photo-dark text-2xl lg:text-3xl" style={{ color: "var(--color-on-night)" }}>
                  {section.title}
                </p>
                <p className="on-photo-dark mt-1 text-sm" style={{ color: "var(--color-on-night-muted)" }}>
                  {section.note}
                </p>
              </div>
            </Photo>
          </Link>
        </li>
      ))}
    </ul>
  );
}
