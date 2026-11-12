import { type NextRequest } from "next/server";

import { errorResponse, guardRequest } from "@/lib/api";
import { RemoteImageError, fetchRemoteImage } from "@/lib/remote-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Downloads an image from a public link so the browser can use it as a reference (avoids CORS). */
export async function POST(request: NextRequest) {
  const denied = await guardRequest(request);
  if (denied) return denied;
  let url: unknown;
  try {
    ({ url } = await request.json());
  } catch {
    return errorResponse(400, "invalid_request", "Request tidak valid.");
  }
  if (typeof url !== "string" || url.length > 2048 || !url.trim()) return errorResponse(400, "invalid_url", "Masukkan link gambar.");
  try {
    const img = await fetchRemoteImage(url);
    return new Response(img.data as Uint8Array<ArrayBuffer>, {
      headers: {
        "Content-Type": img.type,
        "Cache-Control": "no-store",
        "X-Filename": encodeURIComponent(img.name),
      },
    });
  } catch (err) {
    if (err instanceof RemoteImageError) return errorResponse(400, "invalid_url", err.message);
    return errorResponse(400, "invalid_url", "Gambar tidak bisa diambil dari link itu.");
  }
}
