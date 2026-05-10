import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    "100.116.178.88",
    "admin-pc.tail8998df.ts.net",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
