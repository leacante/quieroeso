import { describe, expect, it, vi } from "vitest";
import { bookmarkletHref, bookmarkletSource } from "./bookmarklet";

type Meta = { attr: "property" | "name" | "itemprop"; key: string; content: string };

/** Minimal stand-in for the Mercado Libre page the bookmarklet reads. */
function page({
  href = "https://www.mercadolibre.com.ar/aplique/up/MLAU3914430684?pdp_filters=item_id%3AMLA3202924364",
  metas = [] as Meta[],
  jsonLd = [] as unknown[],
  heading = null as string | null,
  popupBlocked = false,
} = {}) {
  const location = { href, hostname: new URL(href).hostname };
  const document = {
    title: "Documento",
    querySelector(selector: string) {
      if (selector === "h1") return heading === null ? null : { textContent: heading };
      const meta = metas.find((m) => selector.includes(`meta[${m.attr}="${m.key}"]`));
      return meta ? { getAttribute: () => meta.content } : null;
    },
    querySelectorAll: () => jsonLd.map((data) => ({ textContent: JSON.stringify(data) })),
  };
  const open = vi.fn(() => (popupBlocked ? null : {}));
  const alert = vi.fn();
  new Function(
    "location",
    "document",
    "window",
    "alert",
    bookmarkletSource("https://quieroeso.app/"),
  )(location, document, { open }, alert);
  const opened = open.mock.calls[0] as unknown as [string] | undefined;
  const target = opened?.[0] ?? (location.href === href ? null : location.href);
  return { target: target ? new URL(target) : null, alert, open };
}

describe("Guardar en QuieroEso bookmarklet", () => {
  it("sends Open Graph title, image and the schema.org price", () => {
    const { target } = page({
      metas: [
        {
          attr: "property",
          key: "og:title",
          content: "Aplique Techo Barral 5 Luces | MercadoLibre",
        },
        { attr: "property", key: "og:image", content: "https://http2.mlstatic.com/D_1-O.jpg" },
        { attr: "itemprop", key: "price", content: "45999" },
      ],
    });
    expect(target?.origin + target!.pathname).toBe("https://quieroeso.app/dashboard/guardar");
    expect(Object.fromEntries(target!.searchParams)).toEqual({
      url: "https://www.mercadolibre.com.ar/aplique/up/MLAU3914430684?pdp_filters=item_id%3AMLA3202924364",
      title: "Aplique Techo Barral 5 Luces",
      image: "https://http2.mlstatic.com/D_1-O.jpg",
      price: "45999",
    });
  });

  it("falls back to JSON-LD product data and the page heading", () => {
    const { target } = page({
      jsonLd: [
        { "@type": "BreadcrumbList" },
        {
          "@type": "Product",
          image: [{ url: "https://http2.mlstatic.com/D_2-O.jpg" }],
          offers: { "@type": "Offer", price: 12500.5 },
        },
      ],
      heading: "  Lámpara colgante  ",
    });
    expect(target?.searchParams.get("title")).toBe("Lámpara colgante");
    expect(target?.searchParams.get("image")).toBe("https://http2.mlstatic.com/D_2-O.jpg");
    expect(target?.searchParams.get("price")).toBe("12500.5");
  });

  it("navigates in the same tab when the popup is blocked", () => {
    const { target } = page({ popupBlocked: true, heading: "Algo" });
    expect(target?.pathname).toBe("/dashboard/guardar");
  });

  it("does nothing outside Mercado Libre", () => {
    const { target, alert, open } = page({ href: "https://www.mercadolibre.com.ar.evil.com/p" });
    expect(target).toBeNull();
    expect(open).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledOnce();
  });

  it("builds a javascript: URL that decodes back to one runnable line", () => {
    const href = bookmarkletHref("https://quieroeso.app");
    expect(href.startsWith("javascript:")).toBe(true);
    const code = decodeURIComponent(href.slice("javascript:".length));
    expect(code).not.toContain("\n");
    expect(() => new Function(code)).not.toThrow();
    expect(code).toContain("https://quieroeso.app/dashboard/guardar");
  });
});
