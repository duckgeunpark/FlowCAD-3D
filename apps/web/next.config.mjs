/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile the workspace shared package (ships raw TS, not built JS).
  transpilePackages: ["@flowcad/shared"],
};

export default nextConfig;
