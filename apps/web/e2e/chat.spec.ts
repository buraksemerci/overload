import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

/**
 * Asistan ekranı.
 *
 * Boş sohbetteki örnekler TIKLANABİLİR olmak zorunda. Alıntı içinde duran
 * üç cümle ne yazılabileceğini anlatıyor ama yazmayı hâlâ kullanıcıya
 * bırakıyordu — boş durumun işi davet etmek, tarif etmek değil.
 */

test.describe("asistan", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  test("örneğe dokunmak yazı alanını dolduruyor", async ({ page }) => {
    await page.goto("/chat");

    const example = "Bugün 300gr tavuk ve 150gr pilav yedim";
    await page.getByRole("button", { name: example }).click();

    const input = page.getByPlaceholder("Bir şey sor ya da anlat…");
    await expect(input).toHaveValue(example);
    // İmleç de orada: kullanıcı düzenlemek isterse yazmaya devam edebilsin.
    await expect(input).toBeFocused();
    // Dolu alan gönderilebilir olmalı.
    await expect(page.getByRole("button", { name: "Gönder" })).toBeEnabled();
  });

  test("boş alanla gönderilemiyor", async ({ page }) => {
    await page.goto("/chat");
    await expect(page.getByRole("button", { name: "Gönder" })).toBeDisabled();
  });

  test("Enter gönderiyor, Shift+Enter satır atlıyor", async ({ page }) => {
    /* Sohbet kutusunun beklenen davranışı. Tek satırlık `input` uzun
       cümlelerde ne yazdığını göstermiyordu; alan artık içerikle büyüyor. */
    let sent = false;
    await page.route("http://localhost:8000/chat/stream", (route) => {
      sent = true;
      return route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: 'data: {"type":"text","data":{"text":"Tamam."}}\n\n',
      });
    });

    await page.goto("/chat");
    const box = page.getByLabel("Mesaj");
    await box.fill("Birinci satır");
    await box.press("Shift+Enter");
    await box.type("ikinci satır");
    await expect(box).toHaveValue("Birinci satır\nikinci satır");
    expect(sent, "Shift+Enter göndermemeli").toBe(false);

    await box.press("Enter");
    await expect.poll(() => sent).toBe(true);
  });
});
