"use client";

/**
 * Giriş / Kayıt — uygulamanın ilk izlenimi.
 *
 * --------------------------------------------------------------------------
 * TEK FOTOĞRAFIN OLDUĞU YER
 * --------------------------------------------------------------------------
 * Bu ekran fotoğraf için en verimli yer: etkisi yüksek, günlük kullanımda
 * maliyeti sıfır (bir kez görülüyor) ve arkasında okunması gereken canlı bir
 * sayı yok. Nike'ın görünümünü veren şeyin aynısı — tam yükseklikte bir
 * fotoğraf, yanında kalın tipografi ve tek bir eylem.
 *
 * Fotoğraf yoksa sol sütun nötr bir dokuya düşüyor ve ekran yine tamam
 * (bkz. `components/Photo.tsx`). Telefonda sütun tümden gizleniyor: 812
 * piksellik bir ekranda fotoğraf, formu katlanma çizgisinin altına itiyordu.
 *
 * --------------------------------------------------------------------------
 * GİRİŞ Mİ KAYIT MI
 * --------------------------------------------------------------------------
 * İki kip tek formda ve aralarında geçiş bir bağlantı değil segmentli
 * kontrol: ikisi eşit ağırlıkta seçenek, biri diğerinin alt eylemi değil.
 * Kip değişince hata mesajı temizleniyor — "şifre yanlış" uyarısı kayıt
 * formunda durmamalı.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Photo } from "@/components/Photo";
import { login, register } from "@/lib/auth";

type Mode = "login" | "register";

/**
 * Kip etiketleri KISA, gönder düğmesindekiler uzun.
 *
 * Önce ikisi de "Giriş yap" / "Hesap oluştur" idi ve ekranda aynı yazı iki
 * kez görünüyordu — kullanıcı hangisinin seçim hangisinin eylem olduğunu
 * ayırt edemiyordu (testler de aynı sebeple iki öğeye birden uyuyordu).
 */
const MODES = [
  { value: "login", label: "Giriş" },
  { value: "register", label: "Kayıt" },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, displayName);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-[88dvh] max-w-[72rem] items-stretch gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
      {/* Telefonda gizli: dikey bir fotoğraf formu ekranın dışına itiyordu.
          Masaüstünde `fill` ile satır yüksekliğini kaplıyor — sabit bir oran
          verince yanındaki formdan kısa kalıyor ve ızgarada boşluk
          bırakıyordu. */}
      <Photo
        slug="hero-login"
        fill
        className="hidden min-h-[34rem] lg:block"
        position="center 30%"
        scrim
      >
        <div className="flex size-full flex-col justify-end p-10">
          <p className="display text-3xl" style={{ color: "oklch(99% 0 0)" }}>
            Ağırlık artmazsa
            <br />
            kas büyümez.
          </p>
          <p className="mt-2 max-w-[28ch] text-sm" style={{ color: "oklch(88% 0.01 115)" }}>
            overload her sette ne kaldırman gerektiğini geçmişine bakarak
            söylüyor.
          </p>
        </div>
      </Photo>

      <div className="mx-auto flex w-full max-w-sm flex-col justify-center">
        <h1 className="display text-2xl">overload</h1>
        <p className="mt-1.5 text-sm text-[var(--color-ink-muted)]">
          {mode === "login"
            ? "Devam etmek için giriş yap."
            : "Programın ve verilerin sana özel kalır."}
        </p>

        <div className="seg mt-6 w-full" role="group" aria-label="Giriş ya da kayıt">
          {MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={mode === option.value}
              onClick={() => {
                setMode(option.value);
                // Kip değişince hata temizleniyor: "şifre yanlış" uyarısı
                // kayıt formunda anlamsız duruyor.
                setError(null);
              }}
              className="seg-item flex-1 text-sm"
            >
              {option.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
          {mode === "register" && (
            <Field
              label="Adın"
              value={displayName}
              onChange={setDisplayName}
              autoComplete="name"
              hint="İsteğe bağlı."
            />
          )}
          <Field
            label="E-posta"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            required
          />
          <Field
            label="Şifre"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={8}
            hint={mode === "register" ? "En az 8 karakter." : undefined}
          />

          {error && (
            <p className="text-sm" style={{ color: "var(--color-danger)" }} role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary mt-1 w-full py-3"
            disabled={busy}
          >
            {busy ? "…" : mode === "login" ? "Giriş yap" : "Hesap oluştur"}
          </button>
        </form>

        {/* Yalnızca giriş kipinde: kayıt olurken parolasını unutmuş olamaz.
            Bağlantı formun ALTINDA ve sessiz — ekranın işi giriş yaptırmak,
            parola kurtarma nadir bir yol. */}
        {mode === "login" && (
          <Link href="/forgot-password" className="link mt-4 self-start text-xs">
            Parolamı unuttum
          </Link>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  hint,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  hint?: string;
  // `value`/`onChange`/`type` dışlanıyor: kendi imzamızla kesişirlerse
  // TypeScript ikisinin birleşimini bekler ve hiçbir fonksiyon uymaz.
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field h-11 w-full px-3 text-sm"
        {...rest}
      />
      {hint && <span className="text-2xs text-[var(--color-ink-faint)]">{hint}</span>}
    </label>
  );
}
