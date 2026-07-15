const BLOCKED_KEYS = /body|cookie|token|authorization|password|secret|email|amount|money|audit/i;

export interface SafeEvent {
  name: string;
  severity: "P0" | "P1" | "P2";
  correlationId?: string;
  route?: string;
  method?: string;
  status?: number;
  reason?: string;
}

export function sanitizeEvent(input: Record<string, unknown>): SafeEvent {
  const severity = input.severity;
  const event: SafeEvent = {
    name: typeof input.name === "string" ? input.name : "unknown",
    severity: severity === "P0" || severity === "P1" || severity === "P2" ? severity : "P2",
  };
  for (const key of ["correlationId", "route", "method", "reason"] as const) {
    if (!BLOCKED_KEYS.test(key) && typeof input[key] === "string") event[key] = input[key];
  }
  if (typeof input.status === "number") event.status = input.status;
  return event;
}
