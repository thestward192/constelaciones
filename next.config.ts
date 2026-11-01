import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The postcard reads its fonts from disk at runtime: ship them with that route.
  outputFileTracingIncludes: {
    "/api/postal/[usuario]": ["./assets/fonts/**"],
    "/api/admin/constellation-image/[id]": ["./assets/fonts/**"],
  },
  async rewrites() {
    // Share links: /@usuario keeps its address and is served by the star page.
    return [{ source: "/@:usuario", destination: "/estrella/:usuario" }];
  },
};

export default nextConfig;
