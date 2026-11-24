import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Redirect old /cong-viec paths to /van-hanh/cong-viec (permanent: false for easy rollback)
      { source: "/cong-viec", destination: "/van-hanh/cong-viec", permanent: false },
      { source: "/cong-viec/:path*", destination: "/van-hanh/cong-viec/:path*", permanent: false },
      // Redirect old /phieu-phoi-hop paths to /van-hanh/phieu-phoi-hop
      { source: "/phieu-phoi-hop", destination: "/van-hanh/phieu-phoi-hop", permanent: false },
      { source: "/phieu-phoi-hop/:path*", destination: "/van-hanh/phieu-phoi-hop/:path*", permanent: false },
    ];
  },
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  allowedDevOrigins: [
    "127.0.0.1",
    "100.116.178.88",
    "admin-pc.tail8998df.ts.net",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
    // proxy.ts matches every path, so Next buffers each request body for it and silently
    // truncates past this limit (default 10MB), which corrupts larger uploads before the
    // server action sees them. Keep it above serverActions.bodySizeLimit plus multipart
    // overhead so oversized uploads are rejected by the action limit, never truncated.
    proxyClientMaxBodySize: "26mb",
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
});
