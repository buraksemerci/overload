/**
 * Backend istemcisi.
 *
 * JWT `localStorage`'da tutuluyor, cookie'de değil. Gerekçe: uygulama PWA olarak
 * çalışacak ve servis worker + çapraz köken cookie davranışı tarayıcılar arasında
 * öngörülemez (özellikle iOS Safari'de "ana ekrana ekle" sonrası). Bearer başlığı
 * her yerde aynı davranıyor.
 *
 * Bunun bedeli XSS'e açık olmak: bir saldırgan sayfaya script sokabilirse token'ı
 * okuyabilir. Karşılığında React'in varsayılan kaçışlaması ve `dangerouslySetInnerHTML`
 * kullanmama disiplini var. Üçüncü parti script eklenmediği sürece kabul edilebilir
 * bir takas; eklenirse httpOnly cookie'ye geçilmeli.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "overload.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    // Private mode / site verisi kapalı: token okunamaz, oturum yok sayılır.
    return null;
  }
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token === null) window.localStorage.removeItem(TOKEN_KEY);
    else window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* yazamıyorsak sessizce devam — istek başına token yine gönderilir */
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text();
    }
    const message =
      typeof detail === "object" && detail !== null && "detail" in detail
        ? String((detail as { detail: unknown }).detail)
        : `İstek başarısız (${response.status})`;
    throw new ApiError(response.status, message, detail);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/**
 * Sohbet akışını Server-Sent Events olarak tüketir.
 *
 * `EventSource` kullanılmıyor çünkü o yalnızca GET yapar ve özel başlık
 * (Authorization) göndermez. `fetch` + ReadableStream ikisini de çözüyor.
 */
export async function* streamChat(
  message: string,
  imageUrl?: string,
  signal?: AbortSignal,
): AsyncGenerator<{ type: string; data: unknown }> {
  const token = getToken();
  const response = await fetch(`${API_URL}/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, image_url: imageUrl ?? null }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new ApiError(response.status, "Sohbet akışı başlatılamadı.");
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;

    // SSE çerçeveleri boş satırla ayrılır. Parça sınırları bir çerçevenin
    // ortasına düşebilir; bu yüzden tamponda tam çerçeve arıyoruz.
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      let eventType = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) eventType = line.slice(7).trim();
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (data) {
        try {
          yield { type: eventType, data: JSON.parse(data) };
        } catch {
          // Bozuk çerçeveyi atla; akışın geri kalanı kullanılabilir kalsın.
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}
