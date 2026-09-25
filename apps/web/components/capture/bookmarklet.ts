/**
 * "Guardar en QuieroEso" bookmarklet. It runs on the Mercado Libre page the owner has
 * open (their own browser, so no bot wall) and sends name, image and price to
 * `/dashboard/guardar`, where the owner reviews them before saving. Needed for listings
 * the Mercado Libre API refuses to share with the application (403).
 *
 * Kept as plain ES5 source, not a transpiled function, so the tested code is exactly
 * the code people drag to their bookmarks bar. `__ORIGIN__` is replaced at render time.
 */
const SOURCE = `(function () {
  if (!/(^|\\.)mercadolibre\\.com\\.ar$/i.test(location.hostname)) {
    alert("Abrí un producto de Mercado Libre y volvé a tocar «Guardar en QuieroEso».");
    return;
  }
  function meta(key) {
    var el = document.querySelector(
      'meta[property="' + key + '"],meta[name="' + key + '"],meta[itemprop="' + key + '"]'
    );
    return (el && el.getAttribute("content")) || "";
  }
  var title = meta("og:title");
  var image = meta("og:image");
  var price = meta("price");
  var scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (var s = 0; s < scripts.length; s++) {
    try {
      var data = JSON.parse(scripts[s].textContent || "null");
      var nodes = [].concat((data && data["@graph"]) || data);
      for (var n = 0; n < nodes.length; n++) {
        var node = nodes[n];
        if (!node || node["@type"] !== "Product") continue;
        title = title || node.name || "";
        var picture = [].concat(node.image || [])[0];
        image = image || (typeof picture === "string" ? picture : (picture && picture.url) || "");
        var offer = [].concat(node.offers || [])[0];
        if (offer && !price) price = String(offer.price || offer.lowPrice || "");
      }
    } catch (ignored) {}
  }
  if (!title) {
    var heading = document.querySelector("h1");
    title = heading ? heading.textContent : document.title;
  }
  title = (title || "").replace(/\\s*[|\\-\\u2013]\\s*Mercado\\s*Libre.*$/i, "").trim();
  var target = new URL("__ORIGIN__/dashboard/guardar");
  target.searchParams.set("url", location.href);
  if (title) target.searchParams.set("title", title.slice(0, 200));
  if (image) target.searchParams.set("image", image);
  if (price) target.searchParams.set("price", price);
  if (!window.open(target.toString(), "_blank")) location.href = target.toString();
})();`;

/** Script body for the given app origin (e.g. `https://quieroeso.app`). */
export function bookmarkletSource(origin: string): string {
  return SOURCE.replace("__ORIGIN__", origin.replace(/\/$/, ""));
}

/** `javascript:` URL to use as the bookmark's address. */
export function bookmarkletHref(origin: string): string {
  const compact = bookmarkletSource(origin)
    .split("\n")
    .map((line) => line.trim())
    .join(" ");
  return `javascript:${encodeURIComponent(compact)}`;
}
