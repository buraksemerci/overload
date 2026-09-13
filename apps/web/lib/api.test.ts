import { afterEach, describe, expect, it, vi } from "vitest";
import { streamChat } from "./api";

/**
 * SSE çerçeve ayrıştırıcısının testleri.
 *
 * Buranın asıl riski **parça sınırları**: ağ, bir SSE çerçevesini herhangi bir
 * byte'ından ikiye bölebilir. Naif bir "gelen parçayı satırlara böl" uygulaması
 * çoğu zaman çalışır, sonra üretimde rastgele mesaj yutar. Bu testler tam da
 * o senaryoyu zorluyor.
 */

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function mockFetch(chunks: string[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(streamOf(chunks), { status: 200 })),
  );
}

async function collect(): Promise<Array<{ type: string; data: unknown }>> {
  const out: Array<{ type: string; data: unknown }> = [];
  for await (const event of streamChat("merhaba")) out.push(event);
  return out;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamChat", () => {
  it("tek parçadaki birden çok çerçeveyi ayrıştırır", async () => {
    mockFetch([
      'event: text\ndata: {"text":"Merhaba"}\n\n',
      'event: text\ndata: {"text":" dünya"}\n\n',
      'event: done\ndata: {"usage":{"input_tokens":10}}\n\n',
    ]);

    const events = await collect();
    expect(events.map((e) => e.type)).toEqual(["text", "text", "done"]);
    expect(events[0]?.data).toEqual({ text: "Merhaba" });
  });

  it("çerçeve ortasından bölünmüş parçaları birleştirir", async () => {
    // Aynı çerçeve üç parçaya bölünmüş — ayırıcının ortasından bile.
    mockFetch(['event: te', 'xt\ndata: {"tex', 't":"bölünmüş"}\n', "\n"]);

    const events = await collect();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("text");
    expect(events[0]?.data).toEqual({ text: "bölünmüş" });
  });

  it("tek parçada arka arkaya gelen çerçeveleri ayırır", async () => {
    mockFetch(['event: text\ndata: {"text":"a"}\n\nevent: text\ndata: {"text":"b"}\n\n']);

    const events = await collect();
    expect(events.map((e) => (e.data as { text: string }).text)).toEqual(["a", "b"]);
  });

  it("bozuk JSON içeren çerçeveyi atlar, akışı kesmez", async () => {
    mockFetch([
      "event: text\ndata: {bozuk\n\n",
      'event: text\ndata: {"text":"sağlam"}\n\n',
    ]);

    const events = await collect();
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toEqual({ text: "sağlam" });
  });

  it("onay kartı olayını yapısıyla birlikte geçirir", async () => {
    const action = {
      id: "11111111-1111-1111-1111-111111111111",
      action_type: "propose_program",
      summary: "«Üst/Alt Split» — 4 gün, 22 hareket",
      payload: { name: "Üst/Alt Split" },
    };
    mockFetch([`event: pending_action\ndata: ${JSON.stringify(action)}\n\n`]);

    const events = await collect();
    expect(events[0]?.type).toBe("pending_action");
    expect(events[0]?.data).toEqual(action);
  });

  it("HTTP hatasında anlamlı hata fırlatır", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 })),
    );
    await expect(collect()).rejects.toThrow(/başlatılamadı/);
  });
});
