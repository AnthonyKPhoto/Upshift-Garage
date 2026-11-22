/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  // Report-only for now: violations show in the browser console but nothing is blocked. Once a release runs
  // clean, switch the key to "Content-Security-Policy" to enforce it as a second line of defence against XSS.
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-src 'self' blob:",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  output: "standalone",
  images: {
    // The /_next/image optimizer is disabled. With a wildcard remotePattern it
    // was an unauthenticated (middleware skips it) proxy that could fetch
    // arbitrary hosts, including internal ones. Product/vehicle images are
    // user-supplied URLs or data: URIs and render fine unoptimized.
    unoptimized: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    // Enables src/instrumentation.ts (background price checks)
    instrumentationHook: true,
    serverComponentsExternalPackages: ["@prisma/client", "prisma"],
  },
};

export default nextConfig;
