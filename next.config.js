/** @type {import('next').NextConfig} */
const nextConfig = {
  // IMPORTANT: do NOT set output: 'export'
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/audio/tracks/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
