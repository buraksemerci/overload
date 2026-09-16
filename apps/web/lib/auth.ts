/**
 * Kimlik doğrulama istemcisi.
 *
 * **Giriş endpoint'i JSON DEĞİL, form-encoded bekliyor.** `fastapi-users`
 * OAuth2 şifre akışını uyguluyor (`OAuth2PasswordRequestForm`) ve alan adları
 * `username` / `password` — e-posta `username` alanına yazılıyor. JSON gönderirsek
 * 422 döner ve hata mesajı bunun sebebini açıkça söylemez; bu yüzden burada
 * tek bir yerde doğru şekilde sarmalanıyor.
 */

import { ApiError, api, setToken } from "./api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface Me {
  id: string;
  email: string;
  display_name: string | null;
  timezone: string;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
}

export async function login(email: string, password: string): Promise<void> {
  const body = new URLSearchParams({ username: email, password });

  const response = await fetch(`${API_URL}/auth/jwt/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    // fastapi-users hatalı girişte 400 + {detail: "LOGIN_BAD_CREDENTIALS"} döner.
    // Bu kodu kullanıcıya olduğu gibi göstermek anlamsız; çeviriyoruz.
    const detail = await response.json().catch(() => null);
    const code = detail?.detail;
    throw new ApiError(
      response.status,
      code === "LOGIN_BAD_CREDENTIALS"
        ? "E-posta ya da şifre hatalı."
        : code === "LOGIN_USER_NOT_VERIFIED"
          ? "Hesabın henüz doğrulanmamış."
          : "Giriş yapılamadı.",
      detail,
    );
  }

  const data = (await response.json()) as TokenResponse;
  setToken(data.access_token);
}

export async function register(
  email: string,
  password: string,
  displayName?: string,
): Promise<void> {
  try {
    await api.post("/auth/register", {
      email,
      password,
      display_name: displayName || null,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      const detail = (error.detail as { detail?: unknown })?.detail;
      if (detail === "REGISTER_USER_ALREADY_EXISTS") {
        throw new ApiError(error.status, "Bu e-posta zaten kayıtlı.", error.detail);
      }
      // Şifre politikası hatası iç içe bir nesne olarak geliyor.
      if (
        typeof detail === "object" &&
        detail !== null &&
        "reason" in detail &&
        typeof (detail as { reason: unknown }).reason === "string"
      ) {
        throw new ApiError(error.status, (detail as { reason: string }).reason, error.detail);
      }
    }
    throw error;
  }

  // Kayıt token döndürmüyor; hemen giriş yapıp oturumu başlatıyoruz ki
  // kullanıcı iki adım yaşamasın.
  await login(email, password);
}

/**
 * Parola sıfırlama isteği.
 *
 * Hata YUTULUYOR: sunucu var olmayan bir adres için de 202 dönüyor ve
 * burada farklı davranmak, bir adresin kayıtlı olup olmadığını dışarıdan
 * öğrenmenin yolu olurdu. Çağıran ekran her durumda aynı cümleyi gösteriyor.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await api.post("/auth/forgot-password", { email });
  } catch {
    /* bilerek yutuluyor — yukarıdaki açıklamaya bakın */
  }
}

/** `fastapi-users`ın hata kodları kullanıcıya gösterilecek metinler değil. */
const RESET_MESSAGES: Record<string, string> = {
  RESET_PASSWORD_BAD_TOKEN:
    "Bağlantının süresi dolmuş ya da daha önce kullanılmış. Yeni bir tane iste.",
};

const VERIFY_MESSAGES: Record<string, string> = {
  VERIFY_USER_BAD_TOKEN:
    "Bağlantının süresi dolmuş ya da daha önce kullanılmış.",
  VERIFY_USER_ALREADY_VERIFIED: "Bu adres zaten doğrulanmış.",
};

function translate(error: unknown, table: Record<string, string>, fallback: string): never {
  if (error instanceof ApiError) {
    const detail = (error.detail as { detail?: unknown })?.detail;
    if (typeof detail === "string" && detail in table) {
      throw new ApiError(error.status, table[detail]!, error.detail);
    }
    // Parola politikası hatası iç içe bir nesne olarak geliyor.
    if (
      typeof detail === "object" &&
      detail !== null &&
      "reason" in detail &&
      typeof (detail as { reason: unknown }).reason === "string"
    ) {
      throw new ApiError(error.status, (detail as { reason: string }).reason, error.detail);
    }
    throw new ApiError(error.status, fallback, error.detail);
  }
  throw new Error(fallback);
}

export async function resetPassword(token: string, password: string): Promise<void> {
  try {
    await api.post("/auth/reset-password", { token, password });
  } catch (error) {
    translate(error, RESET_MESSAGES, "Parola değiştirilemedi.");
  }
}

export async function verifyEmail(token: string): Promise<void> {
  try {
    await api.post("/auth/verify", { token });
  } catch (error) {
    translate(error, VERIFY_MESSAGES, "Doğrulanamadı.");
  }
}

/**
 * Çıkış.
 *
 * Sunucuya HABER VERİYOR. Oturumlar artık veritabanında ve satır silinince
 * jeton o anda geçersiz; yalnızca yereldeki kopyayı silmek, jeton başka bir
 * yere kopyalanmışsa hiçbir işe yaramazdı.
 *
 * İstek başarısız olsa bile yerel jeton SİLİNİYOR: kullanıcı "çıkış" dedi ve
 * ağ hatası yüzünden oturumu açık bırakmak — özellikle ortak bir
 * bilgisayarda — kabul edilemez. O durumda sunucudaki satır süresi dolana
 * kadar kalıyor.
 */
export async function logout(): Promise<void> {
  try {
    await api.post("/auth/jwt/logout");
  } catch {
    /* yukarıdaki açıklamaya bakın */
  } finally {
    setToken(null);
  }
}

export async function fetchMe(): Promise<Me> {
  return api.get<Me>("/users/me");
}
