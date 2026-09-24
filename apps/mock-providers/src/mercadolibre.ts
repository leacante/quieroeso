import { randomBytes } from "node:crypto";
import { config } from "./config";
import { MELI_FAILURES, MELI_ITEMS, MELI_PRODUCTS, MELI_SHORT_LINKS } from "./fixtures/meli";
import {
  bearerToken,
  clientCredentials,
  escapeHtml,
  parseBody,
  redirect,
  sendJson,
  type Route,
} from "./http";

const appTokens = new Set<string>();
/** Runtime overrides set by tests through the admin endpoint (price, status). */
const itemOverrides = new Map<string, Partial<{ price: number; status: string; title: string }>>();

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function imageUrl(id: string): string {
  return `${config.publicUrl}/meli/img/${id}.svg`;
}

function authorized(request: Parameters<Route["handler"]>[0]): boolean {
  return appTokens.has(bearerToken(request) ?? "");
}

export const meliRoutes: Route[] = [
  {
    method: "POST",
    pattern: /^\/meli\/oauth\/token$/,
    handler(request, _params, response) {
      const body = parseBody(request);
      const { clientId, clientSecret } = clientCredentials(request, body);
      if (clientId !== config.meli.clientId || clientSecret !== config.meli.clientSecret) {
        sendJson(response, 401, {
          error: "invalid_client",
          message: "invalid client_id or client_secret",
        });
        return;
      }
      if (body.grant_type !== "client_credentials") {
        sendJson(response, 400, { error: "unsupported_grant_type" });
        return;
      }
      const token = `APP_USR-mock-meli-${randomBytes(12).toString("hex")}`;
      appTokens.add(token);
      sendJson(response, 200, {
        access_token: token,
        token_type: "Bearer",
        expires_in: 21600,
        scope: "offline_access read",
      });
    },
  },
  {
    method: "GET",
    pattern: /^\/meli\/items\/([A-Z]{3}\d+)$/,
    handler(request, [id = ""], response) {
      if (!authorized(request)) {
        sendJson(response, 401, {
          message: "invalid access token",
          error: "unauthorized",
          status: 401,
        });
        return;
      }
      if (id === MELI_FAILURES.rateLimited) {
        response.setHeader("Retry-After", "1");
        sendJson(response, 429, {
          message: "Too Many Requests",
          error: "too_many_requests",
          status: 429,
        });
        return;
      }
      if (id === MELI_FAILURES.serverError) {
        sendJson(response, 500, { message: "internal error", status: 500 });
        return;
      }
      const fixture = MELI_ITEMS.find((item) => item.id === id);
      if (!fixture) {
        sendJson(response, 404, {
          message: `Item with id ${id} not found`,
          error: "not_found",
          status: 404,
        });
        return;
      }
      const item = { ...fixture, ...itemOverrides.get(id) };
      sendJson(response, 200, {
        id: item.id,
        site_id: "MLA",
        title: item.title,
        price: item.price,
        currency_id: "ARS",
        status: item.status,
        condition: "new",
        permalink: `https://articulo.mercadolibre.com.ar/MLA-${item.id.slice(3)}-${slugify(item.title)}-_JM`,
        thumbnail: imageUrl(item.id),
        pictures: [{ id: `${item.id}-1`, url: imageUrl(item.id), secure_url: imageUrl(item.id) }],
        catalog_product_id: item.catalogProductId,
      });
    },
  },
  {
    method: "GET",
    pattern: /^\/meli\/products\/([A-Z]{3}\d+)$/,
    handler(request, [id = ""], response) {
      if (!authorized(request)) {
        sendJson(response, 401, {
          message: "invalid access token",
          error: "unauthorized",
          status: 401,
        });
        return;
      }
      const product = MELI_PRODUCTS.find((candidate) => candidate.id === id);
      if (!product) {
        sendJson(response, 404, {
          message: `Product ${id} not found`,
          error: "not_found",
          status: 404,
        });
        return;
      }
      sendJson(response, 200, {
        id: product.id,
        status: product.status,
        name: product.name,
        permalink: `https://www.mercadolibre.com.ar/${slugify(product.name)}/p/${product.id}`,
        pictures: [{ id: `${product.id}-1`, url: imageUrl(product.id) }],
        buy_box_winner:
          product.price === null
            ? null
            : { item_id: "MLA1000000012", price: product.price, currency_id: "ARS" },
      });
    },
  },
  {
    method: "GET",
    pattern: /^\/meli\/img\/([A-Z]{3}\d+)\.svg$/,
    handler(_request, [id = ""], response) {
      const item = MELI_ITEMS.find((candidate) => candidate.id === id);
      const product = MELI_PRODUCTS.find((candidate) => candidate.id === id);
      const color = item?.color ?? product?.color ?? "#64748b";
      const label = (item?.title ?? product?.name ?? id).split(" ").slice(0, 2).join(" ");
      response.writeHead(200, {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400",
      });
      response.end(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
        <rect width="500" height="500" fill="${color}"/>
        <circle cx="250" cy="210" r="110" fill="#ffffff" fill-opacity="0.18"/>
        <rect x="170" y="150" width="160" height="120" rx="18" fill="#ffffff" fill-opacity="0.85"/>
        <text x="250" y="380" font-family="sans-serif" font-size="34" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeHtml(label)}</text>
      </svg>`);
    },
  },
  {
    // Mock of https://meli.la/{code}, used when MOCK_PROVIDERS=true.
    method: "GET",
    pattern: /^\/meli-la\/([\w-]+)$/,
    handler(_request, [code = ""], response) {
      const target = MELI_SHORT_LINKS[code];
      if (!target) {
        sendJson(response, 404, { error: "not_found" });
        return;
      }
      redirect(response, target, 301);
    },
  },
  {
    method: "POST",
    pattern: /^\/_admin\/meli\/items\/([A-Z]{3}\d+)$/,
    handler(request, [id = ""], response) {
      const body = parseBody(request) as Partial<{ price: number; status: string; title: string }>;
      itemOverrides.set(id, { ...itemOverrides.get(id), ...body });
      sendJson(response, 200, { ok: true });
    },
  },
];

export function resetMeli(): void {
  itemOverrides.clear();
}
