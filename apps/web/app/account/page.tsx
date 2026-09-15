"use client";

/**
 * Hesap Ayarları (Bölüm 8, ekran 15) — **AI'nın erişemediği bölge**.
 *
 * Bu ekrandaki hiçbir alan sohbet üzerinden değiştirilemez. Bu bir prompt
 * talimatı değil: karşılık gelen bir AI tool'u YOK ve olmayacak. Model
 * olmayan bir tool'u çağıramaz.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Page, PageHeader, Section } from "@/components/Layout";
import { ErrorBox, Loading } from "@/components/States";
import { api } from "@/lib/api";
import { logout, type Me } from "@/lib/auth";
import { keys, useMe } from "@/lib/queries";

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
  const client = useQueryClient();
  const router = useRouter();
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (me.data && form === null) {
      setForm({
        display_name: me.data.display_name ?? "",
        birth_date: (me.data as Me & { birth_date?: string | null }).birth_date ?? "",
        sex: (me.data as Me & { sex?: string }).sex ?? "unspecified",
        height_cm: String((me.data as Me & { height_cm?: number | null }).height_cm ?? ""),
        timezone: me.data.timezone,
        activity_level:
          (me.data as Me & { activity_level?: string }).activity_level ?? "moderate",
      });
    }
  }, [me.data, form]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<Me>("/users/me", body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.me });
      // Profil değişince TDEE hedefi ve güç standartları yeniden hesaplanmalı.
      void client.invalidateQueries({ queryKey: keys.nutrition });
      void client.invalidateQueries({ queryKey: keys.standards });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  if (me.isLoading || form === null) return <Loading />;
  if (me.isError) return <ErrorBox error={me.error} onRetry={() => void me.refetch()} />;

  const set = (patch: Partial<ProfileForm>) => setForm({ ...form, ...patch });

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

      <Section
        title="Profil"
        info="Boy, doğum tarihi ve cinsiyet TDEE hesabı ve güç standartları için gerekli. Cinsiyet belirtilmezse bu iki özellik kapalı kalıyor — ortalama almak kimseyi doğru temsil etmediği için tahmin üretilmiyor."
      >
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              display_name: form.display_name || null,
              birth_date: form.birth_date || null,
              sex: form.sex,
              height_cm: form.height_cm ? Number.parseInt(form.height_cm, 10) : null,
              timezone: form.timezone,
              activity_level: form.activity_level,
            });
          }}
        >
          <Field label="Ad" value={form.display_name} onChange={(v) => set({ display_name: v })} />
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
          <Field
            label="Boy (cm)"
            inputMode="numeric"
            value={form.height_cm}
            onChange={(v) => set({ height_cm: v })}
          />
          <Select
            label="Aktivite seviyesi"
            value={form.activity_level}
            options={ACTIVITY_OPTIONS}
            onChange={(v) => set({ activity_level: v })}
          />
          <Field
            label="Saat dilimi"
            value={form.timezone}
            onChange={(v) => set({ timezone: v })}
          />

          <div className="flex items-center gap-3 pt-1 sm:col-span-2">
            <button type="submit" className="btn btn-primary" disabled={save.isPending}>
              {save.isPending ? "Kaydediliyor…" : "Kaydet"}
            </button>
            {saved && (
              <span
                className="animate-check text-xs"
                style={{ color: "var(--color-accent-deep)" }}
                role="status"
              >
                Kaydedildi
              </span>
            )}
          </div>
        </form>
        {save.isError && (
          <div className="mt-4">
            <ErrorBox error={save.error} />
          </div>
        )}
      </Section>

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
