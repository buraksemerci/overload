"use client";

/** Onboarding / Kayıt-Giriş (Bölüm 8, ekran 1). */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { login, register } from "@/lib/auth";

type Mode = "login" | "register";

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
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center">
      <h1 className="text-xl lg:text-2xl">overload</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
        {mode === "login"
          ? "Devam etmek için giriş yap."
          : "Hesap oluştur — programın ve verilerin sana özel kalır."}
      </p>

      <form onSubmit={submit} className="mt-6 space-y-3">
        {mode === "register" && (
          <Field
            label="Adın (isteğe bağlı)"
            value={displayName}
            onChange={setDisplayName}
            autoComplete="name"
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
        />

        {error && (
          <p className="text-sm" style={{ color: "var(--color-danger)" }} role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? "…" : mode === "login" ? "Giriş yap" : "Hesap oluştur"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setError(null);
        }}
        className="mt-4 text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      >
        {mode === "login"
          ? "Hesabın yok mu? Kayıt ol"
          : "Zaten hesabın var mı? Giriş yap"}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  // `value`/`onChange`/`type` dışlanıyor: kendi imzamızla kesişirlerse
  // TypeScript ikisinin birleşimini bekler ve hiçbir fonksiyon uymaz.
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-[var(--color-ink-muted)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm outline-none"
        {...rest}
      />
    </label>
  );
}
