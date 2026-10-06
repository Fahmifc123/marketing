import { redirect } from "next/navigation";

import { hasValidSession } from "@/lib/auth";

export default async function Home() {
  redirect((await hasValidSession()) ? "/dashboard" : "/login");
}
