/**
 * Browser typesetter for app-rendered ad copy (headline, supporting line, CTA).
 * Text is drawn with the brand font in the reserved text zone, so it is always
 * spelled exactly as written and can be edited without regenerating.
 */
import type { LogoCorner } from "@/lib/logo-placement";
import { hasCardText, textZone, type CardText, type TextLayout } from "@/lib/text-layout";

const NAVY = "#023047";
const ORANGE = "#FF5400";
const WHITE = "#FFFFFF";

export interface TextOverlay {
  text: CardText;
  layout: TextLayout;
}

let cachedFamily: string | null = null;

/** The page's brand font stack (Inter via next/font), loaded before drawing. */
async function brandFont(): Promise<string> {
  if (!cachedFamily) {
    cachedFamily = getComputedStyle(document.body).fontFamily || "Inter, system-ui, sans-serif";
  }
  try {
    await Promise.all([
      document.fonts.load(`800 48px ${cachedFamily}`),
      document.fonts.load(`500 48px ${cachedFamily}`),
      document.fonts.load(`700 48px ${cachedFamily}`),
    ]);
  } catch {
    // Fall back to whatever is available.
  }
  return cachedFamily;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Mean luminance and its spread in a region — used to pick text colour and a scrim. */
function analyse(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const { data } = ctx.getImageData(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 32) {
    const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    sum += l;
    sumSq += l * l;
    n++;
  }
  const mean = n ? sum / n : 255;
  const spread = n ? Math.sqrt(Math.max(0, sumSq / n - mean * mean)) : 0;
  return { mean, spread };
}

interface Block {
  headSize: number;
  subSize: number;
  ctaSize: number;
  headLines: string[];
  subLines: string[];
  height: number;
}

function layoutBlock(ctx: CanvasRenderingContext2D, family: string, text: CardText, width: number, scale: number): Block {
  const headSize = Math.round(width * 0.078 * scale);
  const subSize = Math.round(width * 0.036 * scale);
  const ctaSize = Math.round(width * 0.032 * scale);
  ctx.font = `800 ${headSize}px ${family}`;
  const headLines = text.headline.trim() ? wrap(ctx, text.headline, width) : [];
  ctx.font = `500 ${subSize}px ${family}`;
  const subLines = text.supporting.trim() ? wrap(ctx, text.supporting, width) : [];
  let height = headLines.length * headSize * 1.08;
  if (subLines.length) height += (headLines.length ? subSize * 0.7 : 0) + subLines.length * subSize * 1.35;
  if (text.cta.trim()) height += (headLines.length || subLines.length ? ctaSize * 1.2 : 0) + ctaSize * 2.4;
  return { headSize, subSize, ctaSize, headLines, subLines, height };
}

/** Draws the copy onto `ctx` (already holding the image) in the reserved zone. */
export async function drawCardText(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  overlay: TextOverlay,
  logoCorner: LogoCorner | null,
): Promise<void> {
  const { text, layout } = overlay;
  if (!hasCardText(text)) return;
  const family = await brandFont();
  const zone = textZone(layout, width, height, logoCorner);
  const zx = zone.x * width;
  const zy = zone.y * height;
  const zw = zone.width * width;
  const zh = zone.height * height;

  // Shrink until the block fits the zone (headline ≤ 4 lines).
  let scale = 1;
  let block = layoutBlock(ctx, family, text, zw, scale);
  while ((block.height > zh || block.headLines.length > 4) && scale > 0.45) {
    scale *= 0.92;
    block = layoutBlock(ctx, family, text, zw, scale);
  }

  // Text colour from the background; busy backgrounds get a soft navy scrim.
  const { mean, spread } = analyse(ctx, zx, zy, zw, zh);
  const scrim = spread > 48;
  const light = scrim || mean < 140;
  if (scrim) {
    const from = layout === "bottom" ? Math.max(0, zy - zh * 0.35) : 0;
    const to = layout === "bottom" ? height : Math.min(height, zy + zh * 1.35);
    const gradient = ctx.createLinearGradient(0, layout === "bottom" ? from : to, 0, layout === "bottom" ? to : from);
    gradient.addColorStop(0, "rgba(2, 48, 71, 0)");
    gradient.addColorStop(0.55, "rgba(2, 48, 71, 0.72)");
    gradient.addColorStop(1, "rgba(2, 48, 71, 0.9)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, from, width, to - from);
  }
  const ink = light ? WHITE : NAVY;

  // Bottom layout hugs the bottom of the zone; top layout hugs the top.
  let y = layout === "bottom" ? zy + zh - block.height : zy;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = ink;

  ctx.font = `800 ${block.headSize}px ${family}`;
  for (const line of block.headLines) {
    ctx.fillText(line, zx, y);
    y += block.headSize * 1.08;
  }
  if (block.subLines.length) {
    if (block.headLines.length) y += block.subSize * 0.7;
    ctx.font = `500 ${block.subSize}px ${family}`;
    ctx.globalAlpha = light ? 0.92 : 0.85;
    for (const line of block.subLines) {
      ctx.fillText(line, zx, y);
      y += block.subSize * 1.35;
    }
    ctx.globalAlpha = 1;
  }
  if (text.cta.trim()) {
    if (block.headLines.length || block.subLines.length) y += block.ctaSize * 1.2;
    ctx.font = `700 ${block.ctaSize}px ${family}`;
    const label = text.cta.trim();
    const padX = block.ctaSize * 1.25;
    const h = block.ctaSize * 2.4;
    const w = Math.min(zw, ctx.measureText(label).width + padX * 2);
    ctx.fillStyle = ORANGE;
    ctx.beginPath();
    ctx.roundRect(zx, y, w, h, h * 0.22);
    ctx.fill();
    ctx.fillStyle = WHITE;
    ctx.textBaseline = "middle";
    ctx.fillText(label, zx + padX, y + h / 2, w - padX * 2);
  }
}
