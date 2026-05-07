"use server";

import { revalidatePath } from "next/cache";
import { markAllRead, markRead } from "@/lib/notification/notification-service";

export async function markReadAction(id: number) {
  await markRead(id);
  revalidatePath("/thong-bao");
}

export async function markAllReadAction() {
  const n = await markAllRead();
  revalidatePath("/thong-bao");
  return { count: n };
}
