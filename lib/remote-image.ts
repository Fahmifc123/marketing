/** Fetch an image from a user-supplied link without letting it reach private networks. */
import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const REMOTE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

export class RemoteImageError extends Error {}

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(v);
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n))) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RemoteImageError("Link tidak valid.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new RemoteImageError("Link harus diawali https://");
  if (url.username || url.password) throw new RemoteImageError("Link tidak valid.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new RemoteImageError("Link tidak bisa dibuka.");
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new RemoteImageError("Link tidak diizinkan.");
  return url;
}

export async function fetchRemoteImage(raw: string, signal?: AbortSignal): Promise<{ data: Uint8Array; type: string; name: string }> {
  let url = await assertPublicUrl(raw.trim());
  let res: Response | null = null;
  for (let hop = 0; hop < 4; hop++) {
    res = await fetch(url, { redirect: "manual", signal: signal ?? AbortSignal.timeout(15_000), headers: { Accept: TYPES.join(",") } });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = await assertPublicUrl(new URL(loc, url).toString());
      continue;
    }
    break;
  }
  if (!res || !res.ok) throw new RemoteImageError("Gambar tidak bisa diambil dari link itu.");
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!TYPES.includes(type)) throw new RemoteImageError("Link itu bukan gambar (PNG, JPG, WEBP). Pakai link langsung ke file gambar.");
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > REMOTE_IMAGE_MAX_BYTES) throw new RemoteImageError("Gambar terlalu besar (maks 10 MB).");
  const reader = res.body?.getReader();
  if (!reader) throw new RemoteImageError("Gambar tidak bisa diambil dari link itu.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > REMOTE_IMAGE_MAX_BYTES) {
      await reader.cancel();
      throw new RemoteImageError("Gambar terlalu besar (maks 10 MB).");
    }
    chunks.push(value);
  }
  const data = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    data.set(c, off);
    off += c.byteLength;
  }
  const name = decodeURIComponent(url.pathname.split("/").pop() || "reference").slice(0, 80) || "reference";
  return { data, type, name };
}
