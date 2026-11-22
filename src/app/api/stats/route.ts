import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// See src/app/api/health/route.ts for why this matters.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Run counts individually so a missing table doesn't kill the whole response
    const safeCount = async (fn: () => Promise<number>) => {
      try { return await fn(); } catch { return 0; }
    };

    const [vehicleCount, modCount, productCount, mods] = await Promise.all([
      safeCount(() => prisma.vehicle.count()),
      safeCount(() => prisma.modification.count()),
      safeCount(() => prisma.trackedProduct.count()),
      prisma.modification.findMany({
        select: { status: true, price: true, actualPrice: true },
      }).catch(() => [] as { status: string; price: number | null; actualPrice: number | null }[]),
    ]);

    const EXCLUDED = new Set(["RESEARCHING", "REMOVED"]);
    const totalPlanned = mods
      .filter((m) => !EXCLUDED.has(m.status))
      .reduce((sum, m) => sum + (m.price ?? 0), 0);
    const totalInstalled = mods
      .filter((m) => m.status === "INSTALLED")
      .reduce((sum, m) => sum + (m.actualPrice ?? m.price ?? 0), 0);
    const installedCount = mods.filter((m) => m.status === "INSTALLED").length;

    // Vehicles other than the demo one seeded on first launch (same match as /api/remove-sample-data) —
    // the onboarding wizard uses this to tell a brand-new install from an existing garage.
    const ownVehicleCount = (await prisma.vehicle.findMany({ select: { name: true, make: true, model: true } }))
      .filter((v) => !(v.name?.startsWith("Example") || (v.make === "Honda" && v.model === "S2000"))).length;
    return NextResponse.json({
      vehicleCount,
      ownVehicleCount,
      modCount,
      productCount,
      totalPlanned,
      totalInstalled,
      installedCount,
    });
  } catch {
    return NextResponse.json({
      vehicleCount: 0,
      modCount: 0,
      productCount: 0,
      totalPlanned: 0,
      totalInstalled: 0,
      installedCount: 0,
    });
  }
}
