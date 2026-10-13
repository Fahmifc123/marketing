/**
 * Official logo placement.
 *
 * The image model never draws the logo. When auto-logo is on, the prompt asks
 * the model to keep one corner empty, and the browser then composites the
 * marketer's official logo file into exactly that zone — pixel-perfect, never
 * altered. Shared by the server (prompt) and the browser (compositing) so both
 * use the same geometry.
 */
export type LogoCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export const LOGO_CORNERS: Array<{ id: LogoCorner; label: string }> = [
  { id: "top-left", label: "Kiri atas" },
  { id: "top-right", label: "Kanan atas" },
  { id: "bottom-left", label: "Kiri bawah" },
  { id: "bottom-right", label: "Kanan bawah" },
];

export const DEFAULT_LOGO_CORNER: LogoCorner = "top-left";

export function isLogoCorner(value: unknown): value is LogoCorner {
  return LOGO_CORNERS.some((c) => c.id === value);
}

/** Zone as fractions of the image (0–1). */
export interface LogoZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Logo width as a fraction of the image width. */
const LOGO_WIDTH = 0.2;
/** Space reserved for the logo's height (fits logos up to ~1:1). */
const ZONE_HEIGHT_RATIO = 0.6;
const MARGIN = 0.05;

/**
 * Reserved logo zone for an image of the given size. For vertical 9:16
 * (Stories/Reels) the zone moves inside Meta's safe area (below the top 14%,
 * above the bottom 20%).
 */
export function logoZone(corner: LogoCorner, width: number, height: number): LogoZone {
  const isVertical = height / width > 1.6;
  const zoneW = LOGO_WIDTH;
  const zoneH = (LOGO_WIDTH * ZONE_HEIGHT_RATIO * width) / height;
  const marginX = MARGIN;
  const marginY = (MARGIN * width) / height;
  const topY = isVertical ? 0.15 : marginY;
  const bottomY = isVertical ? 1 - 0.21 - zoneH : 1 - marginY - zoneH;
  const left = corner.endsWith("left");
  const top = corner.startsWith("top");
  return {
    x: left ? marginX : 1 - marginX - zoneW,
    y: top ? topY : bottomY,
    width: zoneW,
    height: zoneH,
  };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Plain-language description of the zone for the image prompt. */
export function describeLogoZone(corner: LogoCorner, width: number, height: number): string {
  const z = logoZone(corner, width, height);
  const horizontal = corner.endsWith("left") ? `${pct(z.x)} from the left edge` : `${pct(1 - z.x - z.width)} from the right edge`;
  const vertical = corner.startsWith("top") ? `${pct(z.y)} from the top edge` : `${pct(1 - z.y - z.height)} from the bottom edge`;
  return `${corner.replace("-", " ")} corner: a zone about ${pct(z.width)} of the image width and ${pct(z.height)} of the image height, ${horizontal} and ${vertical}`;
}
