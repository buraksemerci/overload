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
import { setToken } from "@/lib/api";
import { logout, type Me } from "@/lib/auth";
import { keys, useAiUsage, useMe, useWeightTrend } from "@/lib/queries";

interface ProfileForm {
  display_name: string;
  birth_date: string;
  sex: string;
  height_cm: string;
  timezone: string;
  activity_level: string;
  training_experience: string;
  training_goal: string;
  training_days_per_week: string;
  nutrition_goal: string;
}

const SEX_OPTIONS = [
  { value: "unspecified", label: "Belirtmek istemiyorum" },
  { value: "male", label: "Erkek" },
  { value: "female", label: "Kadın" },
];

/* Boş seçenek "belirtilmedi": tanışma akışında atlanan bir soru burada da
   boş görünmeli, uydurulmuş bir varsayılanla değil. */
const EXPERIENCE_OPTIONS = [
  { value: "", label: "Belirtilmedi" },
  { value: "new", label: "Yeni başlıyorum" },
  { value: "under_1y", label: "Bir yıldan az" },
  { value: "one_to_three", label: "Bir ile üç yıl arası" },
  { value: "over_three", label: "Üç yıldan fazla" },
];

const TRAINING_GOAL_OPTIONS = [
  { value: "", label: "Belirtilmedi" },
  { value: "strength", label: "Güç" },
  { value: "hypertrophy", label: "Kas" },
  { value: "powerbuilding", label: "Güç ve kas" },
  { value: "general_fitness", label: "Genel form" },
];

const DAYS_OPTIONS = [
  { value: "", label: "Belirtilmedi" },
  ...[1, 2, 3, 4, 5, 6, 7].map((days) => ({ value: String(days), label: `${days} gün` })),
];

const NUTRITION_GOAL_OPTIONS = [
  { value: "", label: "Belirtilmedi (koruma)" },
  { value: "cut", label: "Yağ kaybı" },
  { value: "maintain", label: "Koruma" },
  { value: "bulk", label: "Kas kazanımı" },
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
        birth_date: me.data.birth_date ?? "",
        sex: me.data.sex,
        height_cm: String(me.data.height_cm ?? ""),
        timezone: me.data.timezone,
        activity_level: me.data.activity_level,
        training_experience: me.data.training_experience ?? "",
        training_goal: me.data.training_goal ?? "",
        training_days_per_week: String(me.data.training_days_per_week ?? ""),
        nutrition_goal: me.data.nutrition_goal ?? "",
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
      // Haftalık gün, program olmayan haftalarda seri hedefi.
      void client.invalidateQueries({ queryKey: keys.streak });
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
              training_experience: form.training_experience || null,
              training_goal: form.training_goal || null,
              training_days_per_week: form.training_days_per_week
                ? Number.parseInt(form.training_days_per_week, 10)
                : null,
              nutrition_goal: form.nutrition_goal || null,
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

        <Section
          title="Hedefler"
          info="Tanışmada sorulan bilgiler. Antrenman süresi, geçmişin yokken ilk ağırlıkların ne kadar temkinli başlayacağını belirliyor — setlerini girdikçe geçmişin bu beyanın yerini alıyor. Haftalık gün, aktif program yokken seri hedefin; beslenme hedefi, Beslenme ekranının varsayılanı."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Antrenman süresi"
              value={form.training_experience}
              options={EXPERIENCE_OPTIONS}
              onChange={(v) => set({ training_experience: v })}
            />
            <Select
              label="Antrenman hedefi"
              value={form.training_goal}
              options={TRAINING_GOAL_OPTIONS}
              onChange={(v) => set({ training_goal: v })}
            />
            <Select
              label="Haftada"
              value={form.training_days_per_week}
              options={DAYS_OPTIONS}
              onChange={(v) => set({ training_days_per_week: v })}
            />
            <Select
              label="Beslenme hedefi"
              value={form.nutrition_goal}
              options={NUTRITION_GOAL_OPTIONS}
              onChange={(v) => set({ nutrition_goal: v })}
            />
          </div>
        </Section>

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

      <Verification email={me.data?.email ?? ""} verified={me.data?.is_verified ?? true} />

      <AiBudget />

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
              void logout().then(() => router.replace("/login"));
            }}
          >
            Çıkış yap
          </button>
        </div>
      </Section>

      <DeleteAccount />
    </Page>
  );
}

/**
 * E-posta doğrulama durumu.
 *
 * Yalnızca doğrulanmamış hesapta görünüyor: "doğrulandı ✓" satırı her gün
 * hesap ekranını açan kişi için bir kez bile işe yaramıyor.
 *
 * Doğrulama uygulamanın TAMAMINI kilitlemiyor — yalnızca asistanı. Girişi
 * tümden kapatmak, e-posta gönderimi bozulduğunda herkesi dışarıda bırakırdı.
 * Metin bunu açıkça söylüyor ki kullanıcı ne kaybettiğini bilsin.
 */
function Verification({ email, verified }: { email: string; verified: boolean }) {
  const [sent, setSent] = useState(false);
  const resend = useMutation({
    mutationFn: () => api.post<void>("/auth/request-verify-token", { email }),
    onSuccess: () => setSent(true),
  });

  if (verified) return null;

  return (
    <Section bare>
      <div className="card p-6" style={{ borderColor: "var(--color-warning)" }}>
        <p className="display text-base">E-posta adresin doğrulanmadı</p>
        <p className="mt-2 max-w-[62ch] text-sm text-[var(--color-ink-muted)]">
          Kaydolurken <strong>{email}</strong> adresine bir bağlantı gönderdik.
          Doğrulayana kadar asistan kapalı; uygulamanın geri kalanı çalışmaya
          devam ediyor.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={resend.isPending || sent}
            onClick={() => resend.mutate()}
          >
            {resend.isPending ? "Gönderiliyor…" : "Bağlantıyı tekrar gönder"}
          </button>
          {sent && (
            <span className="text-xs text-[var(--color-ink-muted)]" role="status">
              Gönderildi. Gelen kutunu kontrol et.
            </span>
          )}
        </div>
        {resend.isError && (
          <div className="mt-4">
            <ErrorBox error={resend.error} />
          </div>
        )}
      </div>
    </Section>
  );
}

/**
 * Günlük AI sınırı.
 *
 * --------------------------------------------------------------------------
 * NEDEN GÖSTERİLİYOR
 * --------------------------------------------------------------------------
 * Sınırın varlığını gizlemek, sınıra takılan kullanıcıyı "uygulama bozuldu"
 * sanmaya bırakıyor. Burada durunca hem sebebi hem ne zaman açılacağı belli.
 *
 * İki sayı var çünkü iki sınır var: istek sayısı hızlı döngüyü, token sayısı
 * tek seferde devasa bağlam gönderen çağrıyı kesiyor. Hangisi önce dolarsa
 * kapı o an kapanıyor.
 *
 * Çubuk **dolduğunda** kehribara dönüyor. Volt değil: volt bir kazanım işareti
 * ve dolmuş bir kota kazanım değil.
 */
function AiBudget() {
  const usage = useAiUsage();
  if (usage.data === undefined) return null;

  const { requests, request_limit, tokens, token_limit } = usage.data;
  const full = requests >= request_limit || tokens >= token_limit;

  return (
    <Section
      title="AI sınırı"
      info="Asistan çağrıları gün başına sınırlı. Fatura kullanıma göre çıkıyor ve döngüye giren bir istemci ya da arka arkaya denenen bir foto ayrıştırma bunu hızla büyütebiliyor. Sınır gece yarısı, senin saat diliminde sıfırlanıyor."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Meter label="Asistan turu" current={requests} limit={request_limit} />
        <Meter label="Token" current={tokens} limit={token_limit} />
      </div>
      {full && (
        <p className="mt-4 text-xs" style={{ color: "var(--color-warning)" }}>
          Bugünlük sınıra ulaştın. Yarın sıfırlanıyor; uygulamanın geri kalanı
          çalışmaya devam ediyor.
        </p>
      )}
    </Section>
  );
}

function Meter({
  label,
  current,
  limit,
}: {
  label: string;
  current: number;
  limit: number;
}) {
  const ratio = limit > 0 ? Math.min(1, current / limit) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="label">{label}</span>
        <span className="tnum text-xs text-[var(--color-ink-muted)]">
          {current.toLocaleString("tr-TR")} / {limit.toLocaleString("tr-TR")}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden bg-[var(--color-surface-raised)]">
        <div
          className="h-full"
          style={{
            width: `${Math.round(ratio * 100)}%`,
            background:
              ratio >= 1 ? "var(--color-warning)" : "var(--color-accent-deep)",
            transition: "width var(--dur-long) var(--ease-out)",
          }}
        />
      </div>
    </div>
  );
}

/**
 * Hesap silme.
 *
 * --------------------------------------------------------------------------
 * KAPALI DURUYOR
 * --------------------------------------------------------------------------
 * Ekranın en altında ve tek satır. Geri alınamaz bir işlemin, hesabını
 * düzenlemeye gelen kullanıcının gözünün önünde durmasının bir sebebi yok.
 *
 * --------------------------------------------------------------------------
 * PAROLA İSTİYOR
 * --------------------------------------------------------------------------
 * "Emin misin?" diye soran bir kutu yeterli değil: açık bir oturumu ele
 * geçiren biri de "evet" diyebilir. Parola, bu oturumun gerçekten hesap
 * sahibine ait olduğunun tek kanıtı. Sunucu da aynı şeyi ayrıca doğruluyor —
 * buradaki alan bir kolaylık değil, isteğin parçası.
 */
function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");

  const remove = useMutation({
    mutationFn: (value: string) => api.delete<void>("/users/me", { password: value }),
    onSuccess: () => {
      /* Hesap zaten silindi; jeton da onunla birlikte (`ON DELETE CASCADE`).
         Sunucuya ayrıca çıkış demek 401 dönerdi — yerel kopyayı silmek
         yeterli. */
      setToken(null);
      router.replace("/login");
    },
  });

  if (!open) {
    return (
      <Section bare>
        <button
          type="button"
          className="btn btn-quiet -ml-2.5"
          style={{ color: "var(--color-ink-faint)" }}
          onClick={() => setOpen(true)}
        >
          Hesabımı sil
        </button>
      </Section>
    );
  }

  return (
    <Section bare>
      <div
        className="card p-6"
        style={{ borderColor: "var(--color-danger)" }}
      >
        <p className="display text-base">Hesabını silmek üzeresin</p>
        <p className="mt-2 max-w-[62ch] text-sm text-[var(--color-ink-muted)]">
          Bütün antrenmanların, öğün kayıtların, ölçümlerin, programların ve
          yüklediğin fotoğraflar kalıcı olarak silinir.{" "}
          <strong>Bu işlem geri alınamaz.</strong>
        </p>

        <form
          className="mt-5 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            remove.mutate(password);
          }}
        >
          <label className="flex min-w-[14rem] flex-col gap-1.5">
            <span className="label">Parolan</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field h-11 w-full px-3 text-sm"
            />
          </label>
          <button
            type="submit"
            className="btn btn-ghost"
            style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }}
            disabled={password.length === 0 || remove.isPending}
          >
            {remove.isPending ? "Siliniyor…" : "Hesabı kalıcı olarak sil"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setOpen(false);
              setPassword("");
            }}
          >
            Vazgeç
          </button>
        </form>

        {remove.isError && (
          <div className="mt-4">
            <ErrorBox error={remove.error} />
          </div>
        )}
      </div>
    </Section>
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
