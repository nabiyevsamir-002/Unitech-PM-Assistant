import { prisma } from "@/lib/prisma";

// Public liveness/readiness probe for Docker healthchecks + load balancers.
// Excluded from auth in src/middleware.ts. Verifies the DB is reachable.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({
      status: "ok",
      db: "up",
      time: new Date().toISOString(),
    });
  } catch {
    return Response.json(
      { status: "error", db: "down" },
      { status: 503 },
    );
  }
}
