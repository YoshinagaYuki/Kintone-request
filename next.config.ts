import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 受付システムは検索エンジンに載せない
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
