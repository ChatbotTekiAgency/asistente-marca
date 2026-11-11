
import { connection } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function GET() {
  await connection();

  try {
    await db.execute(sql`SELECT 1`);

    return Response.json({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed:", error);

    return Response.json(
      {
        status: "error",
        database: "disconnected",
      },
      { status: 503 }
    );
  }
}
