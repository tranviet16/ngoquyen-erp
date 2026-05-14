"use server";

import { revalidatePath } from "next/cache";
import * as svc from "@/lib/payment/payment-service";

export async function createRoundAction(input: svc.CreateRoundInput) {
  const r = await svc.createRound(input);
  revalidatePath("/thanh-toan/ke-hoach");
  return { id: r.id };
}

export async function upsertItemAction(input: svc.UpsertItemInput) {
  const r = await svc.upsertItem(input);
  revalidatePath(`/thanh-toan/ke-hoach/${input.roundId}`);
  return { id: r.id };
}

export async function deleteItemAction(itemId: number, roundId: number) {
  await svc.deleteItem(itemId);
  revalidatePath(`/thanh-toan/ke-hoach/${roundId}`);
}

export async function submitRoundAction(roundId: number) {
  await svc.submitRound(roundId);
  revalidatePath("/thanh-toan/ke-hoach");
  revalidatePath(`/thanh-toan/ke-hoach/${roundId}`);
}

export async function approveItemAction(input: {
  itemId: number;
  roundId: number;
  soDuyet?: number;
}) {
  await svc.approveItem({ itemId: input.itemId, soDuyet: input.soDuyet });
  revalidatePath(`/thanh-toan/ke-hoach/${input.roundId}`);
}

export async function rejectItemAction(input: {
  itemId: number;
  roundId: number;
}) {
  await svc.rejectItem(input.itemId);
  revalidatePath(`/thanh-toan/ke-hoach/${input.roundId}`);
}

export async function bulkApproveAsRequestedAction(roundId: number) {
  await svc.bulkApproveAsRequested(roundId);
  revalidatePath(`/thanh-toan/ke-hoach/${roundId}`);
  revalidatePath("/thanh-toan/ke-hoach");
}

export async function rejectRoundAction(roundId: number, reason: string) {
  await svc.rejectRound(roundId, reason);
  revalidatePath(`/thanh-toan/ke-hoach/${roundId}`);
  revalidatePath("/thanh-toan/ke-hoach");
}

export async function closeRoundAction(roundId: number) {
  await svc.closeRound(roundId);
  revalidatePath(`/thanh-toan/ke-hoach/${roundId}`);
  revalidatePath("/thanh-toan/ke-hoach");
}
