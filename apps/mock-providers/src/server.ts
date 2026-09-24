import { createServer } from "node:http";
import { config } from "./config";
import { googleRoutes } from "./google";
import { page } from "./html";
import { readRequest, sendHtml, sendJson, type Route } from "./http";
import { meliRoutes, resetMeli } from "./mercadolibre";
import { mpRoutes, resetMercadoPago } from "./mercadopago";

const routes: Route[] = [
  ...googleRoutes,
  ...meliRoutes,
  ...mpRoutes,
  {
    method: "GET",
    pattern: /^\/health$/,
    handler: (_request, _params, response) => sendJson(response, 200, { status: "ok" }),
  },
  {
    method: "POST",
    pattern: /^\/_admin\/reset$/,
    handler: (_request, _params, response) => {
      resetMeli();
      resetMercadoPago();
      sendJson(response, 200, { ok: true });
    },
  },
  {
    method: "GET",
    pattern: /^\/$/,
    handler: (_request, _params, response) =>
      sendHtml(
        response,
        200,
        page(
          "Proveedores simulados",
          `<h1>Proveedores simulados de QuieroEso</h1>
          <ul><li>Google OIDC: <code>/google/*</code></li>
          <li>Mercado Libre API: <code>/meli/*</code>, enlaces cortos <code>/meli-la/{code}</code></li>
          <li>Mercado Pago: <code>/mp/*</code> — <a href="/mp/_admin">administrar pagos simulados</a></li></ul>`,
        ),
      ),
  },
];

const server = createServer(async (incoming, response) => {
  try {
    const request = await readRequest(incoming, config.publicUrl);
    for (const route of routes) {
      if (route.method !== request.method) continue;
      const match = route.pattern.exec(request.url.pathname);
      if (match) {
        await route.handler(request, match.slice(1), response);
        return;
      }
    }
    sendJson(response, 404, { error: "not_found", path: request.url.pathname });
  } catch (error) {
    console.error("[mock] request failed", error);
    if (!response.headersSent) sendJson(response, 500, { error: "mock_error" });
  }
});

server.listen(config.port, () => {
  console.warn(`[mock] providers listening on :${config.port} (public ${config.publicUrl})`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
