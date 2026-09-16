"use client";

/**
 * Hesap Ayarları (Bölüm 8, ekran 15) — **AI'nın erişemediği bölge**.
 *
 * Bu ekrandaki hiçbir alan sohbet üzerinden değiştirilemez. Bu bir prompt
 * talimatı değil: karşılık gelen bir AI tool'u YOK ve olmayacak. Model
 * olmayan bir tool'u çağıramaz.
 *
 * --------------------------------------------------------------------------
 * NEDEN TEK FORM DEĞİL, KART KÜMESİ
 * --------------------------------------------------------------------------
 * Altı alan alt alta dizildiğinde ekran bir kayıt formuna benziyordu; oysa
 * bu alanlar farklı işler yapıyor. Doğum tarihi ve cinsiyet TDEE hesabına
 * gidiyor, boy güç standartlarına, saat dilimi günün ne zaman döndüğüne.
 * Kartlar bu ayrımı görünür kılıyor — hangi bilginin neyi etkilediği
 * alanın yanında değil, kartın başlığında yazıyor.
 *
 * Kartlar ayrı ama **form tek**: hepsi aynı `<form>` içinde ve tek bir
 * kaydet düğmesi var. Kart başına kaydet koymak, bir ekranda beş ayrı
 * "kaydedildi mi" durumu demek olurdu.
 *
 * --------------------------------------------------------------------------
 * KAYDET DÜĞMESİ DEĞİŞİKLİK OLANA KADAR YOK
 * --------------------------------------------------------------------------
 * Hiçbir şey değişmemişken duran bir kaydet düğmesi ya yanıltıyor (basılır,
 * hiçbir şey olmaz) ya da gürültü. Çubuk yalnızca form ilk hâlinden
 * ayrıldığında beliriyor ve o an "geri al" da sunuyor.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Page, PageHeader, Section } from "@/components/Layout";
import { Photo } from "@/components/Photo";
import { ErrorBox, Loading } from "@/components/States";
import { api } from "@/lib/api";
import { logout, type Me } from "@/lib/auth";
import { keys, useMe, useWeightTrend } from "@/lib/queries";

interface ProfileForm {
  display_name: string;
  birth_date: string;
  sex: string;
  height_cm: string;
  timezone: string;
  activity_level: string;
}

const SEX_OPTIONS = [
  { value: "unspecified", label: "Belirtmek istemiyorum" },
  { value: "male", label: "Erkek" },
  { value: "female", label: "Kadın" },
];

const ACTIVITY_OPTIONS = [
  { value: "sedentary", label: "Hareketsiz — masa başı, antrenman yok" },
  { value: "light", label: "Hafif — haftada 1-3 gün" },
  { value: "moderate", label: "Orta — haftada 3-5 gün" },
  { value: "active", label: "Aktif — haftada 6-7 gün" },
  { value: "very_active", label: "Çok aktif — günde iki seans / fiziksel iş" },
];

export default function AccountPage() {
  const me = useMe();
  const trend = useWeightTrend(1);
  const client = useQueryClient();
  const router = useRouter();
  const [form, setForm] = useState<ProfileForm | null>(null);
  /** Formun sunucudan gelen hâli. "Değişiklik var mı" bununla ölçülüyor. */
  const [initial, setInitial] = useState<ProfileForm | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (me.data && form === null) {
      const loaded: ProfileForm = {
        display_name: me.data.display_name ?? "",
        birth_date: (me.data as Me & { birth_date?: string | null }).birth_date ?? "",
        sex: (me.data as Me & { sex?: string }).sex ?? "unspecified",
        height_cm: String((me.data as Me & { height_cm?: number | null }).height_cm ?? ""),
        timezone: me.data.timezone,
        activity_level:
          (me.data as Me & { activity_level?: string }).activity_level ?? "moderate",
      };
      /* eslint-disable-next-line react-hooks/set-state-in-effect --
         Form durumu sunucudan gelen veriyle BİR KEZ tohumlanıyor ve sonra
         kullanıcıya ait: türetilmiş bir değer değil, düzenlenen bir kopya.
         Kural bunu "etki içinde setState" diye işaretliyor ama alternatifi
         (veriyi anahtar yapıp bileşeni yeniden kurmak) kullanıcının yazdığı
         her şeyi arka plandaki bir yeniden çekimde silerdi. */
      setForm(loaded);
      setInitial(loaded);
    }
  }, [me.data, form]);

  const save = useMutation({
    mutationFn: ({ body }: { body: Record<string, unknown>; snapshot: ProfileForm }) =>
      api.patch<Me>("/users/me", body),
    // Anlık görüntü DEĞİŞKENLERLE taşınıyor, kapanıştan okunmuyor: istek
    // uçarken kullanıcı bir alanı daha değiştirmişse, kaydedilen hâl
    // gönderilen hâldir — ekrandaki değil.
    onSuccess: (_data, variables) => {
      void client.invalidateQueries({ queryKey: keys.me });
      // Profil değişince TDEE hedefi ve güç standartları yeniden hesaplanmalı.
      void client.invalidateQueries({ queryKey: keys.nutrition });
      void client.invalidateQueries({ queryKey: keys.standards });
      setInitial(variables.snapshot);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  if (me.isLoading || form === null || initial === null) return <Loading />;
  if (me.isError) return <ErrorBox error={me.error} onRetry={() => void me.refetch()} />;

  const set = (patch: Partial<ProfileForm>) => setForm({ ...form, ...patch });
  const dirty = (Object.keys(form) as Array<keyof ProfileForm>).some(
    (key) => form[key] !== initial[key],
  );
  const lastWeight = trend.data?.at(-1) ?? null;

  /* Baş harf: ad varsa ondan, yoksa e-postadan. Türkçe yerelinde
     `toLocaleUpperCase` şart — "i" harfi "I" değil "İ" olmalı. */
  const source = form.display_name.trim() || me.data?.email || "";
  const letter = source ? source[0]!.toLocaleUpperCase("tr-TR") : "·";

  return (
    <Page>
      <PageHeader
        title="Hesap"
        /* Bu satır GÖRÜNÜR kalıyor, "?" arkasına girmiyor. Ekranın geri
           kalanında açıklamalar gizlendi ama bu bir açıklama değil, bir
           güvence: kullanıcının asistanın neye dokunamadığını görmek için
           baktığı tek yer burası. */
        lead="Bu sayfadaki bilgileri yalnızca sen değiştirebilirsin — AI asistanının bu alanlara erişimi yok."
        info={
          <>
            Bu sayfadaki hiçbir alan sohbet üzerinden değiştirilemez ve bu bir
            istem talimatı değil: karşılık gelen bir AI tool&apos;u{" "}
            <strong>yok</strong>. Model olmayan bir tool&apos;u çağıramaz.
            Asistan verilerini okuyabilir ve yeni kayıt ekleyebilir; var olan
            bir kaydı değiştirmek için senin onayını isteyen bir kart gösterir.
          </>
        }
      />

      {/* --- Kimlik kartı -------------------------------------------------
          Hesap ekranı baştan sona formdu ve hiçbir yerinde "bu benim
          hesabım" hissi yoktu. Kapak kartı o boşluğu dolduruyor: ad,
          e-posta ve baş harf tek bakışta.

          Fotoğraf bir portre DEĞİL, bölüm görseli — kullanıcının kendi
          fotoğrafını yüklemesi henüz yok ve yerine rastgele bir yüz koymak
          yanlış olurdu. */}
      <section className="card overflow-hidden">
        <Photo slug="nav-vucut" ratio="21 / 9" scrim position="center 35%">
          <div className="flex size-full items-end gap-4 p-6 lg:p-8">
            <span
              aria-hidden
              className="grid size-14 shrink-0 place-items-center border text-lg font-semibold lg:size-16"
              style={{
                borderColor: "oklch(99% 0 0 / 0.5)",
                color: "oklch(99% 0 0)",
              }}
            >
              {letter}
            </span>
            <div className="min-w-0">
              <p
                className="display truncate text-xl lg:text-2xl"
                style={{ color: "oklch(99% 0 0)" }}
              >
                {form.display_name.trim() || "Adını ekle"}
              </p>
              <p
                className="truncate text-sm"
                style={{ color: "oklch(88% 0.01 115)" }}
              >
                {me.data?.email}
              </p>
            </div>
          </div>
        </Photo>
      </section>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({
            body: {
              display_name: form.display_name || null,
              birth_date: form.birth_date || null,
              sex: form.sex,
              height_cm: form.height_cm ? Number.parseInt(form.height_cm, 10) : null,
              timezone: form.timezone,
              activity_level: form.activity_level,
            },
            snapshot: form,
          });
        }}
      >
        <div className="grid items-start gap-2 lg:grid-cols-3">
          <Section
            title="Kimlik"
            className="lg:col-span-2"
            info="Doğum tarihi ve cinsiyet TDEE hesabına giriyor. Cinsiyet belirtilmezse hem günlük kalori hedefi hem güç standartları kapalı kalıyor — ortalama almak kimseyi doğru temsil etmediği için tahmin üretilmiyor."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Ad"
                value={form.display_name}
                onChange={(v) => set({ display_name: v })}
              />
              <Field
                label="Doğum tarihi"
                type="date"
                value={form.birth_date}
                onChange={(v) => set({ birth_date: v })}
              />
              <Select
                label="Cinsiyet"
                value={form.sex}
                options={SEX_OPTIONS}
                onChange={(v) => set({ sex: v })}
              />
            </div>
          </Section>

          <Section
            title="Vücut"
            info="Boy, güç standartlarının vücut ağırlığına oranlanmasında kullanılıyor. Kilo burada değil Tartı ekranında tutuluyor: boy yılda bir değişir, kilo her hafta."
          >
            <Field
              label="Boy (cm)"
              inputMode="numeric"
              value={form.height_cm}
              onChange={(v) => set({ height_cm: v })}
            />
            {/* Kilo BU EKRANDAN DEĞİŞTİRİLMİYOR, yalnızca gösteriliyor.
                Tek bir sayıyı iki yerden düzenlenebilir yapmak, hangisinin
                doğru olduğunu belirsizleştirir. */}
            <div className="mt-4 border-t border-[var(--color-border)] pt-3">
              {lastWeight ? (
                <>
                  <p className="label">Son tartı</p>
                  <p className="mt-1 text-sm">
                    <span className="display text-lg">
                      {Number(lastWeight.weight_kg).toLocaleString("tr-TR", {
                        maximumFractionDigits: 1,
                      })}
                    </span>{" "}
                    kg
                    <span className="text-[var(--color-ink-faint)]">
                      {" · "}
                      {new Date(`${lastWeight.date}T00:00:00`).toLocaleDateString("tr-TR", {
                        day: "numeric",
                        month: "long",
                      })}
                    </span>
                  </p>
                  <Link href="/weight" className="link mt-2 inline-block text-xs">
                    Tartı geçmişi
                  </Link>
                </>
              ) : (
                <Link href="/weight" className="link text-xs">
                  İlk tartını gir
                </Link>
              )}
            </div>
          </Section>
        </div>

        <div className="grid items-start gap-2 lg:grid-cols-3">
          <Section
            title="Aktivite"
            className="lg:col-span-2"
            info="Antrenman dışındaki hareketin. Günlük kalori hedefi bazal metabolizmanın bu katsayıyla çarpımından çıkıyor; masa başı bir gün ile ayakta geçen bir gün arasında 600 kaloriye varan fark var."
          >
            <Select
              label="Haftalık hareket"
              value={form.activity_level}
              options={ACTIVITY_OPTIONS}
              onChange={(v) => set({ activity_level: v })}
            />
          </Section>

          <Section
            title="Saat dilimi"
            info="Günün ne zaman döndüğünü belirliyor. Gece yarısından sonra kaydedilen bir öğünün hangi güne yazılacağı buna bağlı."
          >
            <Field
              label="Bölge"
              value={form.timezone}
              onChange={(v) => set({ timezone: v })}
            />
          </Section>
        </div>

        {/* Yalnızca değişiklik varken. Kaydedildikten sonra kısa bir süre
            daha duruyor ki onay görünsün. */}
        {(dirty || saved) && (
          <div
            className="card-raised sticky bottom-4 flex flex-wrap items-center justify-between gap-3 px-5 py-4"
            style={{
              zIndex: "var(--z-dropdown)",
              animation: "reveal var(--dur-short) var(--ease-out) forwards",
            }}
          >
            {saved ? (
              <span
                className="animate-check text-sm"
                style={{ color: "var(--color-accent-deep)" }}
                role="status"
              >
                Kaydedildi
              </span>
            ) : (
              <span className="text-sm text-[var(--color-ink-muted)]">
                Kaydedilmemiş değişiklik var
              </span>
            )}
            {dirty && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setForm(initial)}
                >
                  Geri al
                </button>
                <button type="submit" className="btn btn-primary" disabled={save.isPending}>
                  {save.isPending ? "Kaydediliyor…" : "Kaydet"}
                </button>
              </div>
            )}
          </div>
        )}

        {save.isError && <ErrorBox error={save.error} />}
      </form>

      <Section bare>
        <div className="card flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="min-w-0">
            <p className="label">Oturum</p>
            <p className="mt-1 truncate text-sm">{me.data?.email}</p>
          </div>
          <button
            type="button"
            className="btn btn-ghost shrink-0"
            onClick={() => {
              logout();
              router.replace("/login");
            }}
          >
            Çıkış yap
          </button>
        </div>
      </Section>
    </Page>
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
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field h-11 w-full px-3 text-sm"
        {...rest}
      />
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field h-11 w-full px-2.5 text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
