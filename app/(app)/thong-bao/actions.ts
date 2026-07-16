"use server";

import { revalidatePath } from "next/cache";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { markAllRead, markRead } from "@/lib/notification/notification-service";

export async function markReadAction(id: number) {
  await requireReleasedModuleRequest("thong-bao");
  await markRead(id);
  revalidatePath("/thong-bao");
}

export async function markAllReadAction() {
  await requireReleasedModuleRequest("thong-bao");
  const n = await markAllRead();
  revalidatePath("/thong-bao");
  return { count: n };
}
