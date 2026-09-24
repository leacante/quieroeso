import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const production = process.env.APP_ENV === "production";
  return {
    rules: production
      ? [
          {
            userAgent: "*",
            allow: ["/", "/l/", "/api/public/", "/llms.txt", "/openapi.json"],
            disallow: ["/dashboard", "/api/", "/s/", "/login"],
          },
        ]
      : // Non-production environments are never indexed.
        [{ userAgent: "*", disallow: "/" }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
