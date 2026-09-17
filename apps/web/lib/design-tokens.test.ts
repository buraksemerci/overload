/**
 * Tasarım belirteçlerinin KAYNAK üzerinden denetimi.
 *
 * --------------------------------------------------------------------------
 * NEDEN ÇALIŞMA ZAMANI TESTİ YETMİYOR
 * --------------------------------------------------------------------------
 * `e2e/design-rules.spec.ts` ekranları açıp hesaplanan stillere bakıyor ve iki
 * kuralı orada sınıyor. Ama yalnızca ekranın **varsayılan durumunu** görüyor:
 * panellerin, açılır bölümlerin, hata ve boş durumların içindeki stiller DOM'a
 * hiç girmiyor.
 *
 * Bu somut bir boşluk: hareket kütüphanesindeki kas etiketleri volt METİN
 * rengiyle yazılmıştı ve paneli açmayan hiçbir test onu göremedi. Aynı hata
 * programlar ekranındaki rozetlerde de vardı ve orada aylarca durdu.
 *
 * Kaynak taraması bu boşluğu kapatıyor: kod yolundan bağımsız, her dosyayı
 * görüyor ve hızlı. Karşılığında kaba — `color:` yazan her yeri yakalayamaz,
 * sadece bilinen kalıpları. İkisi birlikte çalışıyor.
 */

// @vitest-environment node
//
// jsdom DEĞİL: bu test tarayıcı değil dosya sistemi okuyor. jsdom altında
// `import.meta.url` bir http adresi oluyor ve `fileURLToPath` patlıyor.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

/** Vitest `apps/web` içinden koşuyor. */
const ROOT = process.cwd() + sep;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(tsx|ts|css)$/.test(entry) && !entry.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

const SOURCES = ["app", "components", "lib"].flatMap((dir) => walk(join(ROOT, dir)));

const rel = (path: string) => path.slice(ROOT.length).replace(/\\/g, "/");

/**
 * Yorumları çıkarır.
 *
 * ŞART, süs değil: bu dosyadaki kuralların açıklamaları kaçınılması gereken
 * kalıbı **örnek olarak yazıyor** (`color: var(--color-accent)` kullanılmamalı
 * diyen bir yorum, o kalıbı içeriyor). Yorumlar taranırsa denetim kendi
 * belgelerini ihlal olarak sayıyor ve gerçek ihlaller arasında kayboluyor.
 *
 * `//` yalnızca satır başında (ya da boşluktan sonra) kesiliyor; `https://`
 * gibi adreslerin ortasından kesmemek için.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .map((line) => line.replace(/(^|\s)\/\/.*$/, "$1"))
    .join("\n");
}

const read = (path: string) => withoutComments(readFileSync(path, "utf8"));

describe("volt yalnızca dolgu", () => {
  /**
   * `--color-accent` %90 parlaklıkta. Kırık beyaz zemin üzerinde ~1.3:1
   * kontrast veriyor — yani metin olarak OKUNMUYOR. Görünmesi gereken ince
   * işaretler için `--color-accent-deep` var.
   */
  it("metin rengi olarak kullanılmıyor", () => {
    const offenders: string[] = [];

    for (const path of SOURCES) {
      const source = read(path);

      // Satır içi stil: `color: "var(--color-accent)"`. `accent-deep` ve
      // `accent-wash` hariç — sınır `)` ile çiziliyor.
      for (const match of source.matchAll(
        /color:\s*["'`]?var\(--color-accent\)/g,
      )) {
        offenders.push(`${rel(path)}: ${match[0]}`);
      }

      // Tailwind rasgele değer: `text-[var(--color-accent)]`.
      for (const match of source.matchAll(/text-\[var\(--color-accent\)\]/g)) {
        offenders.push(`${rel(path)}: ${match[0]}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("CSS değişkenleri", () => {
  /**
   * Tanımsız bir değişkenle yazılan bildirim GEÇERSİZ oluyor ve sessizce
   * düşüyor. `background: var(--color-accent-dim)` yazan iki rozet, açık
   * temaya geçerken o değişken kaldırıldığı için şeffaf zeminle kaldı;
   * üstündeki volt metin de okunmadığı için rozetler tamamen görünmezdi.
   */
  it("hepsi tanımlı", () => {
    const css = read(join(ROOT, "app", "globals.css"));

    // `@theme` bloğundaki tanımlar Tailwind tarafından `:root`a yazılıyor.
    const defined = new Set(
      [...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((match) => match[1]!),
    );
    // Tailwind'in kendi ürettikleri ve tarayıcı belirteçleri.
    const builtin = /^--(tw|nextjs|font-|radix|spacing$|default-)/;

    const missing = new Map<string, string[]>();
    for (const path of SOURCES) {
      for (const match of read(path).matchAll(/var\((--[a-z0-9-]+)\)/g)) {
        const name = match[1]!;
        if (defined.has(name) || builtin.test(name)) continue;
        const where = missing.get(name) ?? [];
        if (!where.includes(rel(path))) where.push(rel(path));
        missing.set(name, where);
      }
    }

    expect(Object.fromEntries(missing)).toEqual({});
  });

  it("belirteç adları tekil kaynakta", () => {
    // Renkler yalnızca `globals.css` içinde tanımlanıyor. İkinci bir dosyada
    // tanım olması aynı adın iki farklı değeri olması demek ve hangisinin
    // kazandığı yükleme sırasına bağlı kalırdı.
    const others = SOURCES.filter(
      (path) => path.endsWith(".css") && !path.endsWith("globals.css"),
    ).filter((path) => /^\s*--color-/m.test(read(path)));

    expect(others.map(rel)).toEqual([]);
  });
});

describe("eski desenler", () => {
  /**
   * `rounded-[3px]` tasarım sistemi öncesinden kalma. Yarıçaplar artık
   * belirteçle (`--radius-sm/md/lg`) ve `.card`, `.field`, `.badge`
   * sınıflarıyla geliyor; elle yazılan 3px onların yanında yamalı duruyor.
   */
  it("rounded-[3px] kalmadı", () => {
    const offenders = SOURCES.filter((path) => read(path).includes("rounded-[3px]"));
    expect(offenders.map(rel)).toEqual([]);
  });

  /**
   * Sayfa genişliği tek yerde: `components/Layout.tsx` içindeki `Page`.
   * Elle yazılan `max-w-[88rem]` ekranlar arası kaymaya yol açıyor — biri
   * değişince diğerleri sessizce farklı kalıyor.
   */
  it("sayfa genişliği elle yazılmıyor", () => {
    // Eski genişlik de izleniyor: bir ekran eski değerde kalırsa ızgaralar
    // komşularından dar durur.
    const offenders = SOURCES.filter(
      (path) =>
        !path.endsWith("Layout.tsx") &&
        ["max-w-[68rem]", "max-w-[88rem]"].some((width) => read(path).includes(width)),
    );
    expect(offenders.map(rel)).toEqual([]);
  });
});
