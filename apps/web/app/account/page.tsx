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
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Hesap Ayarları</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Bu sayfadaki bilgiler yalnızca buradan değiştirilebilir — AI asistanının
          bu alanlara erişimi yok.
        </p>
      </header>

      <section className="card p-4">
        <h2 className="text-base font-medium">Profil</h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
          Boy, doğum tarihi ve cinsiyet TDEE hesabı ve güç standartları için gerekli.
          Cinsiyet belirtilmezse bu iki özellik kapalı kalır — ortalama almak
          kimseyi doğru temsil etmediği için tahmin üretilmiyor.
        </p>

        <form
          className="mt-4 space-y-3"
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

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" className="btn btn-primary" disabled={save.isPending}>
              {save.isPending ? "Kaydediliyor…" : "Kaydet"}
            </button>
            {saved && (
              <span className="text-xs" style={{ color: "var(--color-success)" }}>
                ✓ Kaydedildi
              </span>
            )}
          </div>
        </form>
        {save.isError && <div className="mt-3"><ErrorBox error={save.error} /></div>}
      </section>

      <section className="card p-4">
        <h2 className="text-base font-medium">Oturum</h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
          E-posta: {me.data?.email}
        </p>
        <button
          className="btn btn-ghost mt-3"
          onClick={() => {
            logout();
            router.replace("/login");
          }}
        >
          Çıkış yap
        </button>
      </section>

      <section className="card p-4">
        <h2 className="text-base font-medium">AI sınırı</h2>
        <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
          Asistan verilerini okuyabilir ve yeni kayıt ekleyebilir. Var olan kayıtları
          değiştirmek ya da silmek için senin onayını isteyen bir kart gösterir.
          E-posta, şifre ve bu sayfadaki ayarlar ise tamamen erişimi dışında —
          bunlar için bir tool tanımlı değil.
        </p>
      </section>
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
        className="h-11 w-full rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-3 text-sm outline-none"
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
    <label className="block">
      <span className="mb-1 block text-xs text-[var(--color-ink-muted)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-2 text-sm outline-none"
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
