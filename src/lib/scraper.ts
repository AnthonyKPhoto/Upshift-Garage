import dns from "dns/promises";
import net from "net";
import type { LookupOptions, LookupAddress } from "dns";
import { fetch as undiciFetch, Agent } from "undici";

interface ScrapedProduct {
  title: string;
  price: number | null;
  imageUrl: string | null;
  brand: string | null;
  description: string | null;
  availability: string | null;
  vendor: string | null;
  sku: string | null;
  /** The "was" / list / compare-at price the shop shows next to the current one (a sale marker), when one is found. */
  listPrice?: number | null;
  /** True when the page couldn't be fetched at all (network error, bot block, 4xx/5xx). */
  failed?: boolean;
  error?: string;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function vendorFromDomain(domain: string): string {
  const map: Record<string, string> = {
    "ecstuning.com": "ECS Tuning",
    "fcpeuro.com": "FCP Euro",
    "034motorsport.com": "034Motorsport",
    "integratedengineering.com": "Integrated Engineering",
    "goapr.com": "APR",
    "unitronic.com": "Unitronic",
    "ctsturbo.com": "CTS Turbo",
    "urotuning.com": "UROTuning",
    "bmptuning.com": "BMP Tuning",
    "autozone.com": "AutoZone",
    "rockauto.com": "RockAuto",
    "amazon.com": "Amazon",
    "ebay.com": "eBay",
    "tirerack.com": "Tire Rack",
    "discounttire.com": "Discount Tire",
    "bcsuspensions.com": "BC Racing",
    "h2motorsports.com": "H&R Springs",
  };
  return map[domain] ?? domain;
}

function parsePrice(text: string): number | null {
  const match = text.match(/\$?([\d,]+\.?\d{0,2})/);
  if (!match) return null;
  const val = parseFloat(match[1].replace(/,/g, ""));
  return isNaN(val) ? null : val;
}

// ── SSRF guard ────────────────────────────────────────────────────────────────

// Every address range a product page has no business resolving to: private, loopback, link-local (cloud
// metadata lives at 169.254.169.254), CGNAT, benchmark/test/documentation nets, multicast and reserved — and
// the IPv6 forms that can tunnel to IPv4 internals (NAT64 64:ff9b::/96, 6to4 2002::/16, Teredo 2001::/32,
// IPv4-mapped/compatible ::ffff:0:0/96 and ::/96).
// Two lists: Node matches IPv4 addresses against IPv6 rules too (as ::ffff:a.b.c.d), so one combined list
// would flag every public IPv4 address via the ::ffff:0:0/96 rule.
const BLOCKED_V4 = new net.BlockList();
const BLOCKED_V6 = new net.BlockList();
for (const [a, p] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as [string, number][]) BLOCKED_V4.addSubnet(a, p, "ipv4");
for (const [a, p] of [
  ["::", 96], ["::1", 128], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001::", 32], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as [string, number][]) BLOCKED_V6.addSubnet(a, p, "ipv6");

/** True for any IP literal in a blocked range (or anything that isn't a valid IP at all). */
export function isPrivateIP(rawIp: string): boolean {
  const ip = rawIp.replace(/^\[|\]$/g, "").toLowerCase().split("%")[0]; // URL brackets, IPv6 zone id
  const v = net.isIP(ip);
  if (v === 4) return BLOCKED_V4.check(ip, "ipv4");
  if (v === 6) return BLOCKED_V6.check(ip, "ipv6");
  return false; // not an IP literal — a hostname, checked after resolving
}

/**
 * Validates that a URL is safe to fetch externally, and returns the
 * DNS-resolved addresses that passed validation so the caller can pin the
 * actual fetch to them (see `pinnedLookup` below).
 *
 * Checks:
 *  1. Protocol must be http or https (blocks file://, ftp://, etc.)
 *  2. Hostname must not be a private/loopback IP literal
 *  3. DNS pre-resolution must not resolve to a private/loopback IP
 *
 * The caller MUST fetch using only the returned `addresses` (never re-resolve
 * the hostname) — otherwise a DNS-rebinding attacker can flip the record
 * between this check and the fetch itself. Pinning the connection closes that
 * gap, which matters now that this server is reachable from the public
 * internet rather than only trusted local processes.
 */
export async function validateScrapingUrl(rawUrl: string): Promise<{ hostname: string; addresses: string[] }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL format");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are permitted for product scraping");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");

  // Block raw IP literals that fall in private ranges
  if (isPrivateIP(hostname)) {
    throw new Error("Requests to private or loopback addresses are not allowed");
  }
  // A public IP literal needs no DNS (and the pinned lookup is never consulted for literals)
  if (net.isIP(hostname)) {
    return { hostname, addresses: [hostname] };
  }

  // DNS pre-resolution — catches hostnames that map to private IPs. lookup (the system resolver, both IPv4
  // and IPv6) is what a normal connection would use; resolve() only ever returned A records.
  let addresses: string[];
  try {
    addresses = (await dns.lookup(hostname, { all: true, verbatim: true })).map((a) => a.address);
    if (addresses.length === 0) throw new Error("no addresses");
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes("private") || err.message.includes("loopback"))
    ) {
      throw err;
    }
    // Unresolvable hostname — fail closed (safer than allowing unknown destinations)
    throw new Error("Unable to resolve URL hostname — request blocked");
  }

  for (const addr of addresses) {
    if (isPrivateIP(addr)) {
      throw new Error("URL resolves to a private or loopback address");
    }
  }

  return { hostname, addresses };
}

/**
 * Builds a `dns.lookup`-compatible function that always answers with the
 * pre-validated addresses, regardless of what a fresh DNS query would return.
 * Passed to an undici Agent so the real TCP connection can never land
 * anywhere other than the address `validateScrapingUrl` already vetted.
 */
function pinnedLookup(addresses: string[]) {
  const fam = (a: string) => (net.isIP(a) === 6 ? 6 : 4);
  return (
    _hostname: string,
    options: LookupOptions,
    callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void
  ) => {
    if (options && options.all) {
      callback(null, addresses.map((address) => ({ address, family: fam(address) })));
    } else {
      callback(null, addresses[0], fam(addresses[0]));
    }
  };
}

// ── URL sanitizer ─────────────────────────────────────────────────────────────

/**
 * Normalizes protocol-relative URLs and rejects any URL whose scheme is not
 * http or https (guards against javascript: and data: being stored as imageUrls).
 */
function sanitizeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const normalized = url.startsWith("//") ? `https:${url}` : url;
  return /^https?:\/\//i.test(normalized) ? normalized : null;
}

// ── Scraper ───────────────────────────────────────────────────────────────────

// ── Structured data (schema.org JSON-LD) ──────────────────────────────────────
// Most shops publish a machine-readable Product block. It's far more reliable
// than guessing at CSS classes ("[class*=price]" happily matches strikethrough
// list prices, shipping thresholds, etc.), so it's preferred when present.

interface LdProduct {
  name?: string; price?: number; listPrice?: number; availability?: string;
  image?: string; brand?: string; sku?: string; description?: string;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

function firstString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return firstString(v[0]);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return firstString(o.url ?? o.contentUrl ?? o.name);
  }
  return undefined;
}

function ldPrice(offer: Record<string, unknown>): number | undefined {
  const spec = asArray(offer.priceSpecification as Record<string, unknown> | undefined)[0] as Record<string, unknown> | undefined;
  const raw = offer.price ?? offer.lowPrice ?? spec?.price;
  if (raw == null) return undefined;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function prettyAvailability(a: unknown): string | undefined {
  if (typeof a !== "string") return undefined;
  const key = a.replace(/^https?:\/\/schema\.org\//i, "");
  const map: Record<string, string> = {
    InStock: "In Stock", OutOfStock: "Out of Stock", SoldOut: "Sold Out",
    PreOrder: "Pre-order", BackOrder: "Backorder", LimitedAvailability: "Limited Stock",
    InStoreOnly: "In Store Only", OnlineOnly: "Online Only", Discontinued: "Discontinued",
  };
  return map[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractJsonLd($: any): LdProduct | null {
  const nodes: Record<string, unknown>[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      nodes.push(o);
      if (o["@graph"]) walk(o["@graph"]);
    }
  };
  $('script[type="application/ld+json"]').each((_: number, el: unknown) => {
    try { walk(JSON.parse($(el).contents().text())); } catch { /* malformed block — skip */ }
  });

  const product = nodes.find((n) => asArray(n["@type"] as string | string[]).some((t) => /^(Product|ProductGroup|IndividualProduct)$/i.test(String(t))));
  if (!product) return null;

  // Prefer the lowest valid offer price across variants
  const recs = (v: unknown): Record<string, unknown>[] => asArray<Record<string, unknown>>(v as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const offers: Record<string, unknown>[] = recs(product.offers).concat(
    recs(product.hasVariant).flatMap((v) => recs(v.offers))
  );
  const priced = offers.map((o) => ({ o, p: ldPrice(o) })).filter((x) => x.p != null) as { o: Record<string, unknown>; p: number }[];
  priced.sort((a, b) => a.p - b.p);
  const best = priced[0];
  const brand = product.brand as unknown;

  // A shop can publish the crossed-out price as a second priceSpecification of type ListPrice / StrikethroughPrice / SRP
  let listPrice: number | undefined;
  for (const o of best ? [best.o] : []) {
    for (const spec of asArray(o.priceSpecification as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
      if (/list|strike|srp|msrp|retail|original/i.test(String(spec.priceType ?? ""))) {
        const raw = spec.price;
        const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "").replace(/[^0-9.]/g, ""));
        if (Number.isFinite(n) && n > 0) listPrice = n;
      }
    }
  }

  return {
    name: firstString(product.name),
    price: best?.p,
    listPrice,
    availability: prettyAvailability(best?.o.availability ?? offers[0]?.availability),
    image: firstString(product.image),
    brand: typeof brand === "string" ? brand : firstString((brand as Record<string, unknown> | undefined)?.name),
    sku: firstString(product.sku) ?? firstString(product.mpn),
    description: firstString(product.description),
  };
}

// ── Sale detection ───────────────────────────────────────────────────────────
// A "sale" = the shop shows a higher crossed-out price next to the current one. Looked for, in order of
// trustworthiness, in: JSON-LD (priceType ListPrice/Strikethrough), product meta tags, data-attributes, and
// finally struck-through / "was" / "compare-at" elements that sit NEXT TO the current price (searched only in
// the price element's own ancestors, so a crossed-out price on a "related products" tile isn't picked up).

const STRIKE_SEL = [
  "del", "s", "strike",
  '[class*="compare"]', '[class*="was-price"]', '[class*="was_price"]', '[class*="old-price"]', '[class*="old_price"]',
  '[class*="regular-price"]', '[class*="list-price"]', '[class*="original-price"]', '[class*="strike"]', '[class*="msrp"]',
  "[data-compare-at-price]", "[data-was-price]", "[data-old-price]",
].join(",");

/** The list price is only believable if it's a real, sane step above the current price. */
export function sanitizeListPrice(listPrice: number | null | undefined, price: number | null): number | null {
  if (listPrice == null || price == null || !Number.isFinite(listPrice)) return null;
  return listPrice > price * 1.02 && listPrice < price * 4 ? Math.round(listPrice * 100) / 100 : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractListPrice($: any, price: number | null, ldList?: number): number | null {
  if (price == null) return null;
  const fromLd = sanitizeListPrice(ldList, price);
  if (fromLd) return fromLd;

  for (const sel of ['meta[property="product:original_price:amount"]', 'meta[property="og:price:standard_amount"]', 'meta[property="product:price:standard_amount"]']) {
    const v = sanitizeListPrice(parsePrice($(sel).attr("content") || ""), price);
    if (v) return v;
  }

  const candidates = (scope: unknown): number[] => {
    const out: number[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $(scope).find(STRIKE_SEL).addBack(STRIKE_SEL).each((_: number, el: any) => {
      const raw = $(el).attr("data-compare-at-price") || $(el).attr("data-was-price") || $(el).attr("data-old-price") || $(el).text();
      const n = raw ? parsePrice(String(raw).replace(/\s+/g, " ")) : null;
      const ok = sanitizeListPrice(n, price);
      if (ok) out.push(ok);
    });
    return out;
  };

  // Find the element showing the CURRENT price, then look around it
  let found: number | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $('[itemprop="price"], [class*="price"]').each((_: number, el: any) => {
    if (found != null) return;
    const txt = $(el).attr("content") || $(el).text();
    const n = txt ? parsePrice(String(txt)) : null;
    if (n == null || Math.abs(n - price) > 0.005) return;
    let scope = $(el);
    for (let depth = 0; depth < 3 && found == null; depth++) {
      scope = scope.parent();
      if (!scope.length) break;
      const c = candidates(scope);
      if (c.length) found = Math.min(...c); // the smallest believable "was" is the safest claim
    }
  });
  return found;
}

const MAX_REDIRECTS = 4;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Fetches a page, re-running the SSRF validation (and re-pinning DNS) on EVERY
 * hop. undici follows redirects by default, which let a public URL bounce the
 * request to http://127.0.0.1/... or the cloud metadata IP. Redirects are
 * followed manually here and the body is size-capped.
 */
async function fetchHtmlSafely(startUrl: string): Promise<string> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const { addresses } = await validateScrapingUrl(current);
    const agent = new Agent({ connect: { lookup: pinnedLookup(addresses) } });
    try {
      const res = await undiciFetch(current, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
        dispatcher: agent,
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        await res.body?.cancel().catch(() => {});
        if (!loc) throw new Error(`HTTP ${res.status}`);
        current = new URL(loc, current).toString();
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) return "";
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > MAX_BODY_BYTES) { await reader.cancel().catch(() => {}); break; }
        chunks.push(value);
      }
      return Buffer.concat(chunks).toString("utf-8");
    } finally {
      await agent.close();
    }
  }
  throw new Error("Too many redirects");
}

export async function scrapeProduct(url: string): Promise<ScrapedProduct> {
  // SSRF guard — throws on disallowed targets (each redirect hop is re-checked
  // inside fetchHtmlSafely too)
  await validateScrapingUrl(url);

  const domain = extractDomain(url);
  const vendor = vendorFromDomain(domain);

  try {
    const html = await fetchHtmlSafely(url);

    const { load } = await import("cheerio");
    const $ = load(html);
    const ld = extractJsonLd($);

    // Title
    const title =
      ld?.name ||
      $('meta[property="og:title"]').attr("content") ||
      $('meta[name="title"]').attr("content") ||
      $("h1").first().text().trim() ||
      $("title").text().trim() ||
      "Unknown Product";

    // Price
    let price: number | null = ld?.price ?? null;
    const priceSelectors = [
      '[itemprop="price"]',
      ".price",
      ".product-price",
      '[class*="price"]',
      'meta[property="og:price:amount"]',
      'meta[name="twitter:data1"]',
    ];
    for (const sel of price != null ? [] : priceSelectors) {
      const el = $(sel).first();
      const val = el.attr("content") || el.attr("data-price") || el.text();
      if (val) {
        price = parsePrice(val);
        if (price) break;
      }
    }

    const listPrice = extractListPrice($, price, ld?.listPrice);

    // Image — sanitized to prevent javascript:/data: storage
    const rawImageUrl =
      ld?.image ||
      $('meta[property="og:image"]').attr("content") ||
      $('meta[property="og:image:url"]').attr("content") ||
      $(".product-image img, .main-image img, [class*=\"product\"] img").first().attr("src") ||
      null;

    // Description
    const description =
      ld?.description ||
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      $('[itemprop="description"]').first().text().trim() ||
      null;

    // Brand
    const brand =
      ld?.brand ||
      $('meta[property="og:brand"]').attr("content") ||
      $('[itemprop="brand"]').first().text().trim() ||
      $('[class*="brand"]').first().text().trim() ||
      null;

    // Availability
    const availability =
      ld?.availability ||
      $('[itemprop="availability"]').attr("content") ||
      $('[class*="stock"], [class*="availability"]').first().text().trim() ||
      null;

    // SKU
    const sku =
      ld?.sku ||
      $('[itemprop="sku"]').text().trim() ||
      $('[class*="sku"], [class*="part-number"]').first().text().trim() ||
      null;

    return {
      title: title.slice(0, 255),
      price,
      listPrice,
      imageUrl: sanitizeImageUrl(rawImageUrl ? new URL(rawImageUrl, url).toString() : null),
      brand: brand ? brand.slice(0, 100) : null,
      description: description ? description.slice(0, 500) : null,
      availability: availability ? availability.slice(0, 50) : null,
      vendor,
      sku: sku ? sku.slice(0, 100) : null,
    };
  } catch (err) {
    // Re-throw SSRF errors so the caller surfaces them as 400, not 500
    if (err instanceof Error && (
      err.message.includes("private") ||
      err.message.includes("loopback") ||
      err.message.includes("hostname") ||
      err.message.includes("Only http")
    )) {
      throw err;
    }
    return {
      title: `Product from ${vendor}`,
      price: null,
      imageUrl: null,
      brand: null,
      description: null,
      availability: null,
      vendor,
      sku: null,
      failed: true,
      error: err instanceof Error ? err.message : "Couldn't load the page",
    };
  }
}
