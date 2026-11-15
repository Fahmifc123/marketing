/** Read/write a JSON document in the private Vercel Blob store connected with prefix DATA. */
import "server-only";

import { BlobNotFoundError, BlobPreconditionFailedError, get, head, put } from "@vercel/blob";

export class PrivateStoreConfigError extends Error {}

export function privateAuth(): { token: string } | { storeId: string } {
  const token = process.env.DATA_BLOB_READ_WRITE_TOKEN?.trim();
  if (token) return { token };
  const storeId = process.env.DATA_STORE_ID?.trim();
  if (storeId) return { storeId };
  throw new PrivateStoreConfigError("Storage database belum disambungkan (DATA_STORE_ID).");
}

export async function readJson<T>(path: string): Promise<{ value: T | null; etag: string | null }> {
  let etag: string | null;
  try {
    etag = (await head(path, privateAuth())).etag;
  } catch (err) {
    if (err instanceof BlobNotFoundError) return { value: null, etag: null };
    throw err;
  }
  const res = await get(path, { access: "private", ...privateAuth(), useCache: false });
  if (!res?.stream) return { value: null, etag: null };
  return { value: JSON.parse(await new Response(res.stream).text()) as T, etag };
}

/** Writes conditionally on `etag`; falls back to overwrite if the ETag keeps mismatching. */
export async function writeJson(path: string, value: unknown, etag: string | null, force = false) {
  await put(path, JSON.stringify(value), {
    access: "private",
    ...privateAuth(),
    contentType: "application/json",
    addRandomSuffix: false,
    ...(force ? { allowOverwrite: true } : etag ? { ifMatch: etag } : { allowOverwrite: false }),
  });
}

export const isPreconditionError = (err: unknown) =>
  err instanceof BlobPreconditionFailedError || /precondition|etag|already exists/i.test(`${(err as Error)?.name} ${(err as Error)?.message}`);
