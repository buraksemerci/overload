/**
 * `Photo` bileşeninin davranışı.
 *
 * --------------------------------------------------------------------------
 * NEDEN BİRİM TESTİ
 * --------------------------------------------------------------------------
 * Bu bileşenin bütün değeri tek bir şeyde: **fotoğraf yokken de düzgün
 * görünmek**. Tarayıcıda denemek bunu kanıtlamıyordu, çünkü uzun süre açık
 * kalan bir sekme eksik dosyalar için 404'ü önbelleğe alıyor ve sonradan
 * eklenen dosya yüklenmiyor — yani "eklenince çalışıyor mu" sorusu elle
 * güvenilir biçimde sınanamıyor.
 *
 * Burada yükleme olayı doğrudan tetikleniyor: görselin yalnızca gerçekten
 * yüklendiğinde belirdiği deterministik olarak sınanıyor.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Photo } from "./Photo";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Photo", () => {
  it("slug'dan doğru yolu kuruyor", () => {
    render(<Photo slug="goal-strength" alt="Halter" />);
    expect(screen.getByAltText("Halter")).toHaveAttribute(
      "src",
      "/photos/goal-strength.jpg",
    );
  });

  it("yüklenmeden GÖRÜNMEZ", () => {
    // Kırık görsel simgesi hiçbir an görünmemeli: `onError` ile gizlemek
    // yetmiyordu, tarayıcı hata olayına kadar simgeyi çiziyor.
    const { container } = render(<Photo slug="yok" />);
    const img = container.querySelector("img")!;
    expect(img.style.opacity).toBe("0");
  });

  it("yüklenince beliriyor", () => {
    const { container } = render(<Photo slug="var" />);
    const img = container.querySelector("img")!;
    fireEvent.load(img);
    expect(img.style.opacity).toBe("1");
  });

  it("dekoratif fotoğrafın alt metni boş", () => {
    // Ekran okuyucu "goal-strength.jpg" okumamalı; fotoğraf bilgi taşımıyor.
    const { container } = render(<Photo slug="goal-strength" />);
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("işlem katmanı her zaman duruyor", () => {
    // Fotoğraf yoksa görünen şey bu. Zemin boş kalmıyor.
    const { container } = render(<Photo slug="yok" />);
    const wrap = container.firstElementChild as HTMLElement;
    expect(wrap.style.background).toContain("linear-gradient");
  });

  it("oran verilen değerde", () => {
    const { container } = render(<Photo slug="yok" ratio="3 / 2" />);
    const wrap = container.firstElementChild as HTMLElement;
    // Yüksekliği oran belirliyor: yer tutucu, görsel gelmeden de doğru
    // boyutta duruyor ve sayfa yüklenince zıplamıyor.
    expect(wrap.style.aspectRatio).toBe("3 / 2");
  });

  it("perde istendiğinde görsel olmasa da duruyor", () => {
    // Perde kaldırılınca üstündeki açık renkli yazı nötr dokunun üzerinde
    // zeminsiz kalıyor ve okunmuyor.
    const { container } = render(
      <Photo slug="yok" scrim>
        <p>Başlık</p>
      </Photo>,
    );
    const scrim = container.querySelectorAll('[aria-hidden="true"]');
    expect(scrim.length).toBe(1);
    expect(screen.getByText("Başlık")).toBeTruthy();
  });

  it("perde istenmediğinde yok", () => {
    const { container } = render(<Photo slug="yok" />);
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBe(0);
  });
});
