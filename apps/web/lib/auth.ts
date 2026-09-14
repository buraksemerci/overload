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

export function logout(): void {
  setToken(null);
}

export async function fetchMe(): Promise<Me> {
  return api.get<Me>("/users/me");
}
