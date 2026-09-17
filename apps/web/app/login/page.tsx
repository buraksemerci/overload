"use client";

/**
 * Giriş ekranı — aynı zamanda uygulamanın tanıtım sayfası.
 *
 * --------------------------------------------------------------------------
 * NEDEN BURASI
 * --------------------------------------------------------------------------
 * Oturumu olmayan herkes buraya düşüyor (`components/AuthGate.tsx`), yani bu
 * sayfa uygulamanın **dış kapısı**. "Bu ne işe yarıyor" sorusu yalnızca
 * burada canlı: içeride oturan kişi o soruyu aylar önce bir kez sordu.
 *
 * --------------------------------------------------------------------------
 * FORM ANLATININ SONUCU
 * --------------------------------------------------------------------------
 * Kaydırdıkça bir günün dört ânı geçiyor; video telefon ekranında bitiyor ve
 * form o karenin üstüne çıkıyor. Önce anlatıdan sonra ayrı, açık zeminli bir
 * bölümdü: videodan sonra sönük bir kapanış gibi kalıyordu. Şimdi anlatının
 * vardığı yer — "bu uygulama bu; başla".
 *
 * Form bir KART içinde, doğrudan videonun üstünde değil. Yazılması gereken
 * bir yüzeyin arkasında hareketli görüntü olunca alanlar okunmuyor; kart
 * kendi zeminini taşıyor, video çevresinde görünmeye devam ediyor. Masaüstünde
 * kart solda duruyor: sağdaki telefon ekranı açık kalıyor.
 *
 * --------------------------------------------------------------------------
 * GERİ GELEN KULLANICI
 * --------------------------------------------------------------------------
 * Tanıtım izlemek istemiyor: üstteki çubuktaki "Giriş yap" doğrudan finale
 * kaydırıyor. Çubuk kaydırmanın neresinde olursan ol görünür; final
 * geldiğinde çekiliyor. Anlatıyı zorunlu tutmak onu tanıtım olmaktan
 * çıkarıp engele çevirirdi.
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
import { Scrollytelling } from "@/components/Scrollytelling";
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
  const [atFinale, setAtFinale] = useState(false);

  return (
    <div className="flex flex-col">
      <TopBar hidden={atFinale} />

      {/* Anlatı TAM GENİŞLİK: sahne ekranın tamamını kaplamak zorunda, yoksa
          iki yanında şeritle bir video oynatıcı gibi duruyor. `50% - 50vw`
          kabın ortasından ekranın kenarına kadar geri çekiyor; taşmayı
          `html`deki `overflow-x: clip` kesiyor.

          Sayfa anlatıyla BİTİYOR. Altına bir şey eklenirse en alta
          kaydırıldığında sahne o kadar yukarı çıkar ve form ekranın dışında
          kalır. */}
      <div style={{ width: "100vw", marginInline: "calc(50% - 50vw)" }}>
        <Scrollytelling finale={<AuthCard />} onFinaleChange={setAtFinale} />
      </div>
    </div>
  );
}

/**
 * Anlatının üstünde yüzen çubuk.
 *
 * `fixed`, akışta değil: akışta duran bir çubuk sahneyi kendi yüksekliği
 * kadar aşağı itiyor, sahnenin alt kenarı katlanma çizgisinin altına taşıyor
 * ve anlatı metninin son satırı kesiliyordu.
 */
function TopBar({ hidden }: { hidden: boolean }) {
  return (
    <header
      className="fixed inset-x-0 top-0 flex items-center justify-between py-4"
      style={{
        zIndex: "var(--z-dropdown)",
        // Cam: altındaki videoyu kapatmadan yazıyı okunur tutuyor.
        background: "oklch(12% 0.01 115 / 0.45)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        paddingInline: "max(1.5rem, calc(50vw - 34rem))",
        // Finalde çekiliyor: form ekrandayken forma inen bir yol gereksiz.
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? "none" : "auto",
        transition: "opacity var(--dur-long) var(--ease-out)",
      }}
    >
      {/* Sayfanın `h1`i BURASI. Marka adı, sayfanın kimliği; anlatı fazları
          ve formun başlığı `h2`. */}
      <h1 className="display text-xl" style={{ color: "oklch(99% 0 0)" }}>
        overload
      </h1>
      <button
        type="button"
        className="btn btn-on-photo"
        onClick={() =>
          // Sayfanın sonu = anlatının finali. Yumuşak kaydırma kasıtlı:
          // video hızla sona sarıyor ve form bir sıçramayla değil, anlatının
          // sonucu olarak geliyor.
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: "smooth",
          })
        }
      >
        Giriş yap
      </button>
    </header>
  );
}

/* --- Giriş / Kayıt -------------------------------------------------------- */

function AuthCard() {
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
      if (mode === "login") {
        await login(email, password);
        // Onboarding'i bitirmemiş biri panelden oraya yönlendiriliyor
        // (`components/OnboardingGate.tsx`); burada ayrıca bakmak gerekmiyor.
        router.replace("/");
      } else {
        await register(email, password, displayName);
        // Yeni hesap: panele uğramadan doğrudan tanışmaya.
        router.replace("/onboarding");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="giris"
      className="w-full max-w-sm p-7 lg:p-9"
      style={{
        // Kart kendi zeminini taşıyor: arkasında hareketli bir görüntü var
        // ve alanların okunması ona bağlı olmamalı.
        background: "oklch(98.5% 0.004 115 / 0.94)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        boxShadow: "0 30px 80px oklch(0% 0 0 / 0.45)",
      }}
    >
      <p className="label">overload</p>
      <h2 className="display mt-2 text-2xl lg:text-3xl">Başlamaya hazır mısın?</h2>
      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
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

        <button type="submit" className="btn btn-primary mt-1 w-full py-3" disabled={busy}>
          {busy ? "…" : mode === "login" ? "Giriş yap" : "Hesap oluştur"}
        </button>
      </form>

      {/* Yalnızca giriş kipinde: kayıt olurken parolasını unutmuş olamaz. */}
      {mode === "login" && (
        <Link href="/forgot-password" className="link mt-4 inline-block text-xs">
          Parolamı unuttum
        </Link>
      )}
    </section>
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
