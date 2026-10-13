import { NextResponse, type NextRequest } from "next/server";

import { ValidationError, errorResponse, guardRequest, validateMetaAdInput } from "@/lib/api";
import { isQualityId, resolveFormat } from "@/lib/image-settings";
import { isLogoCorner } from "@/lib/logo-placement";
import { getMetaSize } from "@/lib/meta-ads";
import { buildMetaAdSlidePrompt } from "@/lib/prompt-builder";

export const dynamic = "force-dynamic";

/** Developer Mode only: the internal prompt of one Meta Ads card in one size. No API key involved. */
export async function POST(request: NextRequest) {
  const denied = await guardRequest(request);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_request", "Request tidak valid.");
  }

  try {
    const card = validateMetaAdInput(body);
    const size = getMetaSize(String(body.sizeId));
    if (!size) throw new ValidationError("unsupported_size", "Ukuran tidak didukung.");
    const prompt = buildMetaAdSlidePrompt({
      ...card,
      quality: isQualityId(body.quality) ? body.quality : "high",
      aspectRatio: resolveFormat({ formatId: size.formatId }),
      hasStyleAnchor: body.hasStyleAnchor === true,
      hasSizeMaster: body.hasSizeMaster === true,
      hasReference: body.hasReference === true,
      logoCorner: isLogoCorner(body.logoCorner) ? body.logoCorner : null,
    });
    return NextResponse.json({ ok: true, prompt }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ValidationError) return errorResponse(400, err.code, err.message);
    return errorResponse(400, "invalid_request", "Request tidak valid.");
  }
}
