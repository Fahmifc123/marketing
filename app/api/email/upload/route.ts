import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse, type NextRequest } from "next/server";

import { errorResponse, guardRequest } from "@/lib/api";
import { ALLOWED_UPLOAD_TYPES, ASSET_LIMITS } from "@/lib/email-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Issues short-lived client tokens so the browser uploads email images/files
 * straight to the public Vercel Blob store (bypassing request-size limits).
 * Only signed-in marketers can get a token; types and sizes are restricted.
 */
export async function POST(request: NextRequest) {
  const denied = await guardRequest(request);
  if (denied) return denied;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return errorResponse(503, "storage_not_configured", "Storage file belum dikonfigurasi (BLOB_READ_WRITE_TOKEN).");
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return errorResponse(400, "invalid_request", "Request tidak valid.");
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("email/")) throw new Error("Invalid path");
        return {
          allowedContentTypes: ALLOWED_UPLOAD_TYPES,
          maximumSizeInBytes: ASSET_LIMITS.maxFileBytes,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60 * 1000,
        };
      },
    });
    return NextResponse.json(result);
  } catch {
    return errorResponse(400, "upload_rejected", "Upload ditolak. Periksa jenis & ukuran file.");
  }
}
