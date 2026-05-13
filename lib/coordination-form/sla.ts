export const SLA_HOURS = 24;
const MS_PER_HOUR = 3_600_000;

type SlaForm = {
  status: string;
  submittedAt: Date | null;
  escalatedAt: Date | null;
};

export function deadlineOf(form: { submittedAt: Date | null }): Date | null {
  if (!form.submittedAt) return null;
  return new Date(form.submittedAt.getTime() + SLA_HOURS * MS_PER_HOUR);
}

export function isOverdue(form: SlaForm, now: Date = new Date()): boolean {
  if (form.status !== "pending_leader") return false;
  if (form.escalatedAt) return false;
  const dl = deadlineOf(form);
  return dl != null && now > dl;
}

export function hoursRemaining(
  form: { submittedAt: Date | null },
  now: Date = new Date(),
): number | null {
  const dl = deadlineOf(form);
  if (!dl) return null;
  return (dl.getTime() - now.getTime()) / MS_PER_HOUR;
}
