import "server-only";

import { signValue, verifySignedValue } from "@/lib/auth";

const TEN_YEARS = 10 * 365 * 24 * 60 * 60 * 1000;

export async function unsubscribeUrl(origin: string, email: string): Promise<string> {
  const t = await signValue(`unsub:${email.toLowerCase()}`, TEN_YEARS);
  return `${origin}/unsubscribe?e=${encodeURIComponent(email.toLowerCase())}&t=${encodeURIComponent(t)}`;
}

export function verifyUnsubscribe(email: string, token: string): Promise<boolean> {
  return verifySignedValue(token, `unsub:${email.toLowerCase()}`);
}
