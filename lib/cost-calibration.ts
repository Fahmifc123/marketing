/**
 * Learns real output tokens per pixel from finished generations (per model,
 * quality and orientation) so the next estimate matches this account's
 * actual bills. Stored per browser; a missing store just means no calibration.
 */
import { useEffect, useState } from "react";

import { calibrationKey, type Calibration } from "@/lib/pricing";
import type { QualityId } from "@/types/image";

const KEY = "imk-cost-calibration-v1";
const EVENT = "imk-cost-calibration";

function read(): Calibration {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Calibration;
  } catch {
    return {};
  }
}

/** Records one generation: `size` is the API's "WIDTHxHEIGHT". */
export function recordGeneration(model: string, quality: QualityId, size: string, outputTokens: number | undefined) {
  const m = /^(\d+)x(\d+)$/.exec(size);
  if (!m || !outputTokens) return;
  const dims = { width: Number(m[1]), height: Number(m[2]) };
  const perPixel = outputTokens / (dims.width * dims.height);
  try {
    const cal = read();
    const k = calibrationKey(model, quality, dims);
    // Smooth towards the newest value so one odd image does not dominate.
    cal[k] = cal[k] ? cal[k] * 0.5 + perPixel * 0.5 : perPixel;
    localStorage.setItem(KEY, JSON.stringify(cal));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // calibration is a convenience
  }
}

export function useCalibration(): Calibration {
  const [cal, setCal] = useState<Calibration>({});
  useEffect(() => {
    const update = () => setCal(read());
    const t = setTimeout(update, 0);
    window.addEventListener(EVENT, update);
    return () => {
      clearTimeout(t);
      window.removeEventListener(EVENT, update);
    };
  }, []);
  return cal;
}
