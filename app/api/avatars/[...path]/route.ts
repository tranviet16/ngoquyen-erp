import { Readable } from "node:stream";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { store } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

interface Params {
  params: Promise<{ path: string[] }>;
}

export async function GET(_req: Request, { params }: Params): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { path } = await params;
  if (!path || path.length === 0) return new Response("Bad request", { status: 400 });

  const rel = `avatars/${path.join("/")}`;
  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME_BY_EXT[ext];
  if (!mime) return new Response("Bad request", { status: 400 });

  try {
    if (!(await store.exists(rel))) {
      return new Response("Not found", { status: 404 });
    }
    const stream = store.getStream(rel);
    const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>;
    return new Response(webStream, {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
