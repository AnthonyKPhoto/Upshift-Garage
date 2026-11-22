import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refreshProduct, pruneBoughtProducts, getPriceAlertSettings } from "@/lib/price-tracker";

export const maxDuration = 300;

/**
 * POST /api/products/refresh-all
 * Re-scrapes every tracked product (a few at a time) and returns the updated
 * list. Uses the shared refreshProduct(), which — unlike the old inline code —
 * keeps each product's all-time low/high and never overwrites a good price or
 * title when a fetch fails.
 */
// Re-checks every product at once, i.e. one outbound request per product. Products are shared by every
// account, so cap how often anyone can set that off (the background scheduler is unaffected).
const COOLDOWN_MS = 5 * 60 * 1000;
const g = globalThis as unknown as { __bvRefreshAllAt?: number };

export async function POST() {
  const since = Date.now() - (g.__bvRefreshAllAt ?? 0);
  if (since < COOLDOWN_MS) {
    const mins = Math.ceil((COOLDOWN_MS - since) / 60000);
    return NextResponse.json({ error: `Prices were refreshed a moment ago — try again in ${mins} min.` }, { status: 429 });
  }
  g.__bvRefreshAllAt = Date.now();
  try {
    if ((await getPriceAlertSettings()).autoRemoveBought) await pruneBoughtProducts().catch(() => 0);
    const ids = (await prisma.trackedProduct.findMany({ select: { id: true } })).map((p) => p.id);
    let i = 0;
    await Promise.all(
      Array.from({ length: Math.min(3, ids.length) }, async () => {
        while (i < ids.length) await refreshProduct(ids[i++]).catch(() => null);
      })
    );
    const updated = await prisma.trackedProduct.findMany({
      include: { priceHistory: { orderBy: { createdAt: "desc" }, take: 60 } },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Refresh all failed" }, { status: 500 });
  }
}
