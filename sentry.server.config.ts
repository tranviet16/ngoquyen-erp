import * as Sentry from "@sentry/nextjs";
import { sanitizeSentryEvent } from "@/lib/observability/event-sanitizer";

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  sendDefaultPii: false,
  tracesSampleRate: 0,
  maxBreadcrumbs: 0,
  beforeSend: sanitizeSentryEvent,
});
