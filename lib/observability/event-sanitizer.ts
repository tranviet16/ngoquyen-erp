import type { ErrorEvent } from "@sentry/nextjs";

const SAFE_TAGS = new Set(["severity", "route", "method", "status", "correlation_id"]);

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
    name: safeCode(input.name) ?? "unknown",
    severity: severity === "P0" || severity === "P1" || severity === "P2" ? severity : "P2",
  };
  event.correlationId = safeCode(input.correlationId);
  event.route = safeRoute(input.route);
  event.method = safeCode(input.method)?.toUpperCase();
  event.reason = safeCode(input.reason);
  if (typeof input.status === "number") event.status = input.status;
  return event;
}

function safeCode(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{1,80}$/.test(value)) return undefined;
  return value;
}

function safeRoute(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const pathname = value.split("?", 1)[0]
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:id");
  return pathname.startsWith("/") && pathname.length <= 160 ? pathname : undefined;
}

function safeText(value: unknown, fallback = "unknown"): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[^a-zA-Z0-9._:/@ -]/g, "").slice(0, 160);
  return cleaned || fallback;
}

function safeFilename(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const parts = value.replace(/\\/g, "/").split("?")[0].split("/").filter(Boolean);
  return parts.slice(-3).join("/").slice(0, 200) || undefined;
}

export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent {
  const tags = Object.fromEntries(
    Object.entries(event.tags ?? {})
      .filter(([key]) => SAFE_TAGS.has(key))
      .map(([key, value]) => [key, safeText(value)]),
  );

  const values = event.exception?.values?.map((exception) => ({
    type: safeText(exception.type, "Error"),
    value: "Error details redacted",
    stacktrace: exception.stacktrace
      ? {
          frames: exception.stacktrace.frames?.map((frame) => ({
            filename: safeFilename(frame.filename),
            function: safeText(frame.function, "unknown"),
            lineno: frame.lineno,
            colno: frame.colno,
            in_app: frame.in_app,
          })),
        }
      : undefined,
  }));

  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    environment: event.environment,
    release: event.release,
    transaction: safeRoute(event.transaction),
    message: event.message ? "Application error details redacted" : undefined,
    exception: values ? { values } : undefined,
    tags,
  };
}
