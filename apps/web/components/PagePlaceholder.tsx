/**
 * Henüz backend'e bağlanmamış ekranlar için dürüst iskelet.
 *
 * Sahte veriyle "çalışıyormuş gibi" görünen bir ekran yapmak yerine ne
 * yapılacağını açıkça yazıyoruz. Yarım kalmış bir ekranı tamamlanmış gibi
 * göstermek, sonradan neyin gerçek neyin dekor olduğunu anlamayı zorlaştırır.
 */

interface Props {
  title: string;
  description: string;
  /** Bu ekran bittiğinde ne yapacak — madde madde. */
  planned: string[];
  /** Hangi backend endpoint'lerine bağlanacak. */
  endpoints?: string[];
}

export function PagePlaceholder({ title, description, planned, endpoints }: Props) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{description}</p>
      </header>

      <section className="card p-4">
        <p className="text-2xs uppercase tracking-wide text-[var(--color-warning)]">
          Henüz bağlanmadı
        </p>
        <h2 className="mt-2 text-base font-medium">Bu ekranda olacaklar</h2>
        <ul className="mt-3 space-y-2">
          {planned.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-[var(--color-ink-muted)]">
              <span className="text-[var(--color-ink-faint)]">—</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        {endpoints && endpoints.length > 0 && (
          <>
            <h3 className="mt-5 text-xs font-medium text-[var(--color-ink-muted)]">
              Bağlanacağı endpoint&apos;ler
            </h3>
            <ul className="mt-2 space-y-1">
              {endpoints.map((endpoint) => (
                <li
                  key={endpoint}
                  className="font-mono text-xs text-[var(--color-ink-faint)]"
                >
                  {endpoint}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
