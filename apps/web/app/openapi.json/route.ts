import { absoluteUrl } from "@/lib/site";

/**
 * OpenAPI description of public endpoints and inbound callbacks. Authenticated
 * owner endpoints are summarized; no secrets or internal hosts are included.
 */
export function GET(): Response {
  const problem = { $ref: "#/components/schemas/Problem" };
  const document = {
    openapi: "3.1.0",
    info: {
      title: "QuieroEso API",
      version: "1.0.0",
      description:
        "API pública de sólo lectura para listas públicas de QuieroEso, más los callbacks que recibe la plataforma. Los importes se expresan como strings decimales en ARS.",
    },
    servers: [{ url: absoluteUrl("/") }],
    paths: {
      "/api/public/lists/{slug}": {
        get: {
          summary: "Lista pública",
          description:
            "Representación JSON de una lista PUBLIC. Listas no listadas o privadas responden 404 igual que las inexistentes. Soporta ETag / If-None-Match.",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Lista pública",
              headers: { ETag: { schema: { type: "string" } } },
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/PublicList" } },
              },
            },
            "304": { description: "Sin cambios" },
            "404": {
              description: "No encontrada",
              content: { "application/problem+json": { schema: problem } },
            },
          },
        },
      },
      "/api/health": {
        get: {
          summary: "Salud del servicio",
          responses: {
            "200": { description: "Proceso y base de datos disponibles" },
            "503": { description: "Base de datos no disponible" },
          },
        },
      },
      "/api/contributions": {
        post: {
          summary: "Crear un aporte (Checkout Pro)",
          description:
            "Crea un aporte para un producto de una lista compartida y devuelve la URL de Checkout Pro de Mercado Pago. Requiere encabezado Idempotency-Key.",
          parameters: [
            {
              name: "Idempotency-Key",
              in: "header",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CreateContribution" } },
            },
          },
          responses: {
            "201": {
              description: "Aporte creado",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      contributionId: { type: "string" },
                      checkoutUrl: { type: "string", format: "uri" },
                    },
                  },
                },
              },
            },
            "409": {
              description: "El producto no acepta aportes",
              content: { "application/problem+json": { schema: problem } },
            },
            "422": {
              description: "Datos inválidos",
              content: { "application/problem+json": { schema: problem } },
            },
            "429": {
              description: "Demasiados intentos",
              content: { "application/problem+json": { schema: problem } },
            },
          },
        },
      },
      "/api/webhooks/mercadopago": {
        post: {
          summary: "Callback de notificaciones de Mercado Pago",
          description:
            "Uso exclusivo de Mercado Pago. Se valida la firma x-signature (HMAC-SHA256 sobre id, x-request-id y ts) antes de procesar. El estado del pago se consulta siempre a Mercado Pago.",
          parameters: [
            { name: "x-signature", in: "header", required: true, schema: { type: "string" } },
            { name: "x-request-id", in: "header", required: true, schema: { type: "string" } },
            { name: "data.id", in: "query", required: true, schema: { type: "string" } },
            { name: "type", in: "query", required: false, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Recibido" },
            "401": { description: "Firma inválida" },
          },
        },
      },
      "/api/integrations/mercadopago/callback": {
        get: {
          summary: "Callback OAuth de Mercado Pago",
          description: "Redirección de autorización OAuth (PKCE y state de un solo uso).",
          responses: { "302": { description: "Redirige al panel" } },
        },
      },
    },
    components: {
      schemas: {
        Problem: {
          type: "object",
          required: ["type", "title", "status", "detail", "instance", "code"],
          properties: {
            type: { type: "string" },
            title: { type: "string" },
            status: { type: "integer" },
            detail: { type: "string" },
            instance: { type: "string" },
            code: { type: "string" },
            fields: { type: "object", additionalProperties: { type: "string" } },
          },
        },
        Money: {
          type: "object",
          properties: {
            amount: { type: "string", examples: ["1234.56"] },
            currency: { const: "ARS" },
          },
        },
        PublicList: {
          type: "object",
          properties: {
            slug: { type: "string" },
            title: { type: "string" },
            description: { type: ["string", "null"] },
            url: { type: "string", format: "uri" },
            updatedAt: { type: "string", format: "date-time" },
            fundingMode: { enum: ["WISHLIST", "PER_ITEM"] },
            acceptsContributions: { type: "boolean" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  position: { type: "integer" },
                  title: { type: "string" },
                  notes: { type: ["string", "null"] },
                  imageUrl: { type: ["string", "null"] },
                  url: { type: ["string", "null"] },
                  source: { enum: ["MERCADOLIBRE", "MANUAL"] },
                  availability: { enum: ["AVAILABLE", "UNAVAILABLE", "UNKNOWN"] },
                  price: { oneOf: [{ $ref: "#/components/schemas/Money" }, { type: "null" }] },
                  funding: {
                    type: ["object", "null"],
                    properties: {
                      target: { type: "string" },
                      funded: { type: "string" },
                      currency: { const: "ARS" },
                    },
                  },
                },
              },
            },
          },
        },
        CreateContribution: {
          type: "object",
          required: ["listItemId", "amountMinor", "acceptTerms"],
          properties: {
            listItemId: { type: "string" },
            amountMinor: { type: "string", description: "Importe en centavos" },
            contributorName: { type: "string", maxLength: 80 },
            contributorMessage: { type: "string", maxLength: 280 },
            acceptTerms: { const: true },
          },
        },
      },
    },
  };
  return Response.json(document, { headers: { "Cache-Control": "public, max-age=3600" } });
}
