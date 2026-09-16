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
 * Anlatı bu yüzden panelden buraya taşındı. Panelde her gün açan kişiyi beş
 * ekran boyu videoyu geçmeye zorluyordu; burada tam olarak aradığı şey.
 *
 * --------------------------------------------------------------------------
 * SIRA: ÖNCE ANLAT, SONRA İSTE
 * --------------------------------------------------------------------------
 * 1. **Anlatı** — kaydırdıkça bir günün dört ânı geçiyor.
 * 2. **Form** — en altta, anlatının vardığı yer.
 *
 * Ama geri gelen kullanıcı tanıtım izlemek istemiyor: üstteki çubukta duran
 * "Giriş yap" doğrudan forma indiriyor. Çubuk YAPIŞKAN, yani kaydırmanın
 * neresinde olursan ol çıkış yolu görünür kalıyor. Anlatıyı zorunlu tutmak
 * onu tanıtım olmaktan çıkarıp engele çevirirdi.
 *
 * --------------------------------------------------------------------------
 * FORMUN ARKASINDA FOTOĞRAF YOK
 * --------------------------------------------------------------------------
 * Ekranın geri kalanında fotoğraf baskın ama form bölümü sade. Aynı ayrım
 * antrenman ekranında da var: okunması ve YAZILMASI gereken bir yüzeyin
 * arkasına görsel koymak yalnızca kontrastı düşürüyor. Görselin işi yukarıda
 * bitti.
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
import { useEffect, useState } from "react";
import { Scrollytelling } from "@/components/Scrollytelling";
import { login, register } from "@/lib/auth";

type Mode = "login" | "register";

/** Formun çapası. Üstteki "Giriş yap" ve anlatının sonu buraya iniyor. */
const FORM_ID = "giris";

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
  return (
    <div className="flex flex-col">
      <TopBar />

      {/* Anlatı TAM GENİŞLİK: sahne ekranın tamamını kaplamak zorunda, yoksa
          iki yanında şeritle bir video oynatıcı gibi duruyor. `50% - 50vw`
          kabın ortasından ekranın kenarına kadar geri çekiyor; taşmayı
          `html`deki `overflow-x: clip` kesiyor. */}
      <div style={{ width: "100vw", marginInline: "calc(50% - 50vw)" }}>
        <Scrollytelling />
      </div>

      {/* Sahneden forma geçişi yumuşatan bant. Video koyu, form bölümü açık
          zeminde: aralarında keskin bir çizgi kalıyor ve sayfa iki ayrı
          parçaya bölünmüş gibi duruyordu. */}
      <div
        aria-hidden
        className="h-24"
        style={{
          width: "100vw",
          marginInline: "calc(50% - 50vw)",
          background:
            "linear-gradient(to bottom, oklch(12% 0.01 115), transparent)",
        }}
      />

      <AuthSection />
    </div>
  );
}

/**
 * Anlatının üstünde yüzen çubuk.
 *
 * --------------------------------------------------------------------------
 * `fixed`, AKIŞTA DEĞİL
 * --------------------------------------------------------------------------
 * Akışta duran yapışkan bir çubuk sahneyi kendi yüksekliği kadar aşağı
 * itiyordu: ekranın tepesinde bir şerit zemin kalıyor ve sahne o kadar
 * aşağıdan başladığı için alt kenarı katlanma çizgisinin altına taşıyor,
 * anlatı metninin son satırı kesiliyordu. `fixed` yer kaplamıyor; video
 * ekranın tamamını dolduruyor ve çubuk onun üstünde yüzüyor.
 *
 * --------------------------------------------------------------------------
 * FORMA VARINCA KAYBOLUYOR
 * --------------------------------------------------------------------------
 * Çubuğun tek işi forma inen bir yol bırakmak. Form ekrandayken o yol
 * gereksiz — ve koyu cam bir şerit, açık zeminli form bölümünün üstünde
 * yabancı duruyor. Görünürlük forma bakılarak veriliyor: gözlemci, kaydırma
 * dinleyicisinden daha ucuz ve sıçramasız.
 */
function TopBar() {
  const [atForm, setAtForm] = useState(false);

  useEffect(() => {
    const form = document.getElementById(FORM_ID);
    if (form === null) return;
    const observer = new IntersectionObserver(
      ([entry]) => setAtForm(entry?.isIntersecting ?? false),
      // Form ekranın üçte birine girdiğinde çubuk çekiliyor: tam değdiği
      // anda kaybolsa geçiş ani oluyor.
      { rootMargin: "-33% 0px 0px 0px" },
    );
    observer.observe(form);
    return () => observer.disconnect();
  }, []);

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
        opacity: atForm ? 0 : 1,
        pointerEvents: atForm ? "none" : "auto",
        transition: "opacity var(--dur-long) var(--ease-out)",
      }}
    >
      {/* Sayfanın `h1`i BURASI. Marka adı, sayfanın kimliği; altındaki
          anlatı fazları ve form bölümü `h2`. Formun başlığını `h1` yapmak,
          sayfanın konusunu "başlamaya hazır mısın" sanmak olurdu. */}
      <h1 className="display text-xl" style={{ color: "oklch(99% 0 0)" }}>
        overload
      </h1>
      <a href={`#${FORM_ID}`} className="btn btn-on-photo">
        Giriş yap
      </a>
    </header>
  );
}

/* --- Giriş / Kayıt -------------------------------------------------------- */

function AuthSection() {
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
    <section
      id={FORM_ID}
      /* `scroll-mt`: çapaya inerken yapışkan çubuk başlığın üstünü
         örtmesin. */
      className="mx-auto flex w-full max-w-sm scroll-mt-24 flex-col justify-center pt-8 pb-24"
    >
      <h2 className="display text-3xl">Başlamaya hazır mısın?</h2>
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

        <button
          type="submit"
          className="btn btn-primary mt-1 w-full py-3"
          disabled={busy}
        >
          {busy ? "…" : mode === "login" ? "Giriş yap" : "Hesap oluştur"}
        </button>
      </form>

      {/* Yalnızca giriş kipinde: kayıt olurken parolasını unutmuş olamaz. */}
      {mode === "login" && (
        <Link href="/forgot-password" className="link mt-4 self-start text-xs">
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
