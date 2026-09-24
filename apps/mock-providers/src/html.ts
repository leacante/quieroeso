import { escapeHtml } from "./http";

/** Minimal accessible page shell for the simulator screens. */
export function page(title: string, body: string, accent = "#2563eb"): string {
  return `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · Simulador</title>
<style>
  :root { color-scheme: light dark; --accent: ${accent}; }
  body { font-family: system-ui, sans-serif; margin: 0; background: Canvas; color: CanvasText; line-height: 1.5; }
  .banner { background: #fef3c7; color: #78350f; padding: .5rem 1rem; font-weight: 700; text-align: center; }
  main { max-width: 32rem; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.5rem; margin: 0 0 1rem; }
  .card { border: 1px solid #cbd5e1; border-radius: .75rem; padding: 1rem; margin: 1rem 0; }
  button, .button { display: inline-flex; align-items: center; justify-content: center; min-height: 44px;
    padding: .5rem 1rem; border-radius: .5rem; border: 2px solid var(--accent); background: var(--accent);
    color: #fff; font-weight: 700; font-size: 1rem; cursor: pointer; text-decoration: none; width: 100%; margin: .25rem 0; }
  button.secondary { background: transparent; color: var(--accent); }
  button.danger { background: #b91c1c; border-color: #b91c1c; }
  label { display: block; font-weight: 600; margin-top: .75rem; }
  input { width: 100%; box-sizing: border-box; min-height: 44px; padding: .5rem; border-radius: .5rem; border: 2px solid #94a3b8; font-size: 1rem; }
  table { width: 100%; border-collapse: collapse; font-size: .875rem; }
  td, th { border-bottom: 1px solid #cbd5e1; padding: .375rem; text-align: left; }
  .muted { color: #64748b; font-size: .875rem; }
  :focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
</style>
</head>
<body>
<div class="banner" role="note">SIMULADOR LOCAL — no se procesa dinero real</div>
<main>${body}</main>
</body>
</html>`;
}

export function hiddenInputs(values: Record<string, string | null | undefined>): string {
  return Object.entries(values)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
    )
    .join("");
}
