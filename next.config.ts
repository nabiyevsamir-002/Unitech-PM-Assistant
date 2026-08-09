import type { NextConfig } from "next";

// Baseline security response headers (track 5c hardening). These are safe with
// Next's SSR/streaming; a full nonce-based Content-Security-Policy is a separate
// follow-up (needs per-request nonces in middleware) and is intentionally not
// set here to avoid breaking inline runtime chunks. HSTS is a no-op over plain
// HTTP and only takes effect once the app is served over TLS (reverse proxy).
const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy. 'unsafe-inline' is required because Next injects inline
// bootstrap scripts/styles without nonces; dev additionally needs 'unsafe-eval' +
// ws: for Turbopack/HMR. Everything else is locked to same-origin. This blocks
// external script/resource loading, clickjacking, base-tag hijacking and off-site
// form posts.
//
// NONCE-CSP ASSESSMENT (track 5c, evaluated against Next 16's own CSP guide in
// node_modules/next/dist/docs/.../content-security-policy.md — deliberately NOT
// adopted): a per-request nonce would only ever tighten `script-src`, never
// `style-src` — nonces cannot cover inline `style=` ATTRIBUTES, which this app
// uses in ~9 components (project-colour dots, progress/Gantt bar sizing), so
// style-src must keep 'unsafe-inline' regardless. Nonce script-src also demands
// (a) generating the nonce in the auth-critical proxy/middleware and parsing it
// back out of the request CSP header, (b) wiring next-themes' <ThemeProvider
// nonce> so its anti-FOUC inline script isn't blocked, and (c) forcing EVERY
// page to dynamic rendering (no static/ISR/CDN). For a self-hosted, same-origin
// app whose only residual is `script-src 'unsafe-inline'` — already low-risk
// (React escapes all output, no dangerouslySetInnerHTML on user data, prod
// script-src has no 'unsafe-eval', object-src/base-uri/frame-ancestors locked) —
// that cost/risk isn't justified. Revisit if a compliance mandate requires it.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `connect-src 'self'${isDev ? " ws: http://localhost:*" : ""}`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle (.next/standalone) for a lean
  // production Docker image — see Dockerfile / compose.yaml (track 5c).
  output: "standalone",
  // exceljs / bcryptjs / prisma use dynamic requires + native/engine binaries;
  // keep them as real node_modules requires so file tracing bundles them
  // correctly into the standalone output instead of trying to inline them.
  serverExternalPackages: ["exceljs", "bcryptjs", "@prisma/client", "nodemailer"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
