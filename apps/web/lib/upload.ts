/**
 * Fotoğraf yükleme — ön-imzalı R2 akışı.
 *
 * Dosya backend'den GEÇMEZ. Üç adım:
 *   1. Backend'den ön-imzalı PUT adresi al
 *   2. Dosyayı doğrudan R2'ye yükle
 *   3. Backend'e "yüklendi" de — o da R2'ye sorup gerçekten orada mı bakar
 *
 * 3. adım atlanabilir gibi görünür ama atlanmamalı: yükleme yarıda kesilirse
 * veritabanına kırık bir anahtar yazılır ve sonradan boş görsel olarak döner.
 */

import { ApiError, api } from "./api";

export type MediaKind = "meal" | "progress";

interface UploadUrlResponse {
  key: string;
  upload_url: string;
  required_content_type: string;
  expires_in_seconds: number;
}

interface MediaUrlResponse {
  key: string;
  url: string;
  expires_in_seconds: number;
}

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

export async function uploadPhoto(file: File, kind: MediaKind): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new ApiError(
      422,
      `Desteklenmeyen dosya tipi: ${file.type || "bilinmiyor"}. JPEG, PNG, WebP veya HEIC gönder.`,
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError(
      422,
      `Dosya çok büyük (${(file.size / 1024 / 1024).toFixed(1)} MB). Sınır 15 MB.`,
    );
  }

  const ticket = await api.post<UploadUrlResponse>("/media/upload-url", {
    kind,
    content_type: file.type,
    size_bytes: file.size,
  });

  // Content-Type imzaya dahil — birebir aynı gönderilmeli, yoksa R2 reddeder.
  const put = await fetch(ticket.upload_url, {
    method: "PUT",
    headers: { "Content-Type": ticket.required_content_type },
    body: file,
  });
  if (!put.ok) {
    throw new ApiError(put.status, "Dosya yüklenemedi. Bağlantını kontrol edip tekrar dene.");
  }

  const confirmed = await api.post<MediaUrlResponse>("/media/confirm", { key: ticket.key });
  return confirmed.key;
}

export async function mediaUrl(key: string): Promise<string> {
  const response = await api.get<MediaUrlResponse>(
    `/media/url?key=${encodeURIComponent(key)}`,
  );
  return response.url;
}
