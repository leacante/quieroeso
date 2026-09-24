/**
 * Public base URL of the site. All absolute URLs are derived from APP_URL so the
 * product is not coupled to a domain (see "Nombre y dominio provisionales").
 */
export function siteUrl(): URL {
  const value = process.env.APP_URL ?? "http://localhost:3000";
  return new URL(value);
}

export function absoluteUrl(pathname: string): string {
  return new URL(pathname, siteUrl()).toString();
}
