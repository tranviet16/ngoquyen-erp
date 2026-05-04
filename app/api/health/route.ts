import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Record start time once at module load (approximates process uptime)
const startTime = Date.now();

export async function GET(): Promise<NextResponse> {
  let dbStatus: "ok" | "fail" = "fail";

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "ok";
  } catch {
    // DB is unreachable — return 503 with fail status
  }

  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const version =
    process.env.npm_package_version ??
    process.env.NEXT_PUBLIC_APP_VERSION ??
    "0.1.0";

  const body = {
    status: dbStatus === "ok" ? "ok" : "degraded",
    db: dbStatus,
    uptime: uptimeSeconds,
    version,
  };

  const statusCode = dbStatus === "ok" ? 200 : 503;

  return NextResponse.json(body, { status: statusCode });
}
