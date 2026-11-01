import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Training is a separate local Python project, never a deployed runtime asset.
  outputFileTracingExcludes: {
    "/*": ["./model-training/**/*"],
  },
};

export default nextConfig;
