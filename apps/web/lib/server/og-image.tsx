import "server-only";

import type { PublicListView } from "@quieroeso/domain";
import { getLogger } from "@quieroeso/observability";
import { ImageResponse } from "next/og";
import { getEnv } from "./env";

export const OG_SIZE = { width: 1200, height: 630 };

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = /^image\/(jpeg|png|svg\+xml)$/;

/**
 * Resolves the URL the server may fetch for an item image, or null. Only the
 * Mercado Libre CDN over https (and the local mock) is allowed, because owners can
 * edit image URLs and the server must not fetch arbitrary hosts.
 */
function fetchableImageUrl(imageUrl: string): URL | null {
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return null;
  }
  const env = getEnv();
  if (env.MOCK_PROVIDERS && env.MOCK_PROVIDERS_PUBLIC_URL && env.MOCK_PROVIDERS_INTERNAL_URL) {
    const mock = new URL(env.MOCK_PROVIDERS_PUBLIC_URL);
    if (url.origin === mock.origin && url.pathname.startsWith("/meli/img/")) {
      return new URL(url.pathname, env.MOCK_PROVIDERS_INTERNAL_URL);
    }
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !(host === "mlstatic.com" || host.endsWith(".mlstatic.com"))) {
    return null;
  }
  return url;
}

async function toDataUrl(imageUrl: string | null): Promise<string | null> {
  const url = imageUrl ? fetchableImageUrl(imageUrl) : null;
  if (!url) return null;
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(3_000) });
    const type = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!response.ok || !IMAGE_TYPES.test(type)) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) return null;
    return `data:${type};base64,${buffer.toString("base64")}`;
  } catch (error) {
    getLogger().debug({ err: error }, "og image fetch skipped");
    return null;
  }
}

/** 1200x630 social preview: title, cover and up to three products. */
export async function renderListOgImage(list: PublicListView | null): Promise<ImageResponse> {
  const items = list?.items.slice(0, 3) ?? [];
  const images = await Promise.all(items.map((item) => toDataUrl(item.imageUrl)));

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#fff1f2",
        padding: 48,
        gap: 40,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          flex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 34,
            fontWeight: 700,
            color: "#0f172a",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "#dc2626",
              border: "4px solid #0f172a",
            }}
          />
          QuieroEso
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 30, color: "#dc2626", fontWeight: 700 }}>Lista de deseos</div>
          <div
            style={{
              fontSize: list && list.title.length > 40 ? 58 : 76,
              fontWeight: 800,
              color: "#0f172a",
              lineHeight: 1.05,
            }}
          >
            {list?.title ?? "Armá tu lista de deseos"}
          </div>
        </div>
        <div style={{ fontSize: 28, color: "#475569" }}>
          {list
            ? `${list.items.length} ${list.items.length === 1 ? "producto" : "productos"} · Mirala y regalá algo`
            : "Compartila y recibí aportes"}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 420 }}>
        {items.map((item, index) => (
          <div
            key={item.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              background: "#ffffff",
              border: "4px solid #0f172a",
              borderRadius: 20,
              padding: 12,
              boxShadow: "6px 6px 0 #0f172a",
            }}
          >
            {images[index] ? (
              // eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not the browser
              <img
                src={images[index]!}
                width={120}
                height={120}
                style={{ objectFit: "contain", borderRadius: 12 }}
                alt=""
              />
            ) : (
              <div
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 12,
                  background: ["#d97706", "#ec4899", "#15803d"][index],
                }}
              />
            )}
            <div
              style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#0f172a", flex: 1 }}
            >
              {item.title.length > 48 ? `${item.title.slice(0, 47)}…` : item.title}
            </div>
          </div>
        ))}
      </div>
    </div>,
    { ...OG_SIZE, headers: { "Cache-Control": "public, max-age=600" } },
  );
}
