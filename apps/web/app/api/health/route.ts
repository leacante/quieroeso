import { checkHealth } from "@/lib/server/health";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const result = await checkHealth();
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
