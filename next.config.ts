import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pino & pino-pretty sudah masuk daftar external bawaan Next, tapi
  // rotating-file-stream tidak — kalau ikut di-bundle, instance stream-nya
  // terduplikasi antar webpack layer dan rotasi file jadi kacau.
  serverExternalPackages: ["pino", "pino-pretty", "rotating-file-stream"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.vcgamers.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "i.ibb.co.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
