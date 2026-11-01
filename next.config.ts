import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    // Share links: /@usuario opens the sky centered on that star (the page reads the path).
    return [{ source: "/@:handle", destination: "/" }];
  },
};

export default nextConfig;
