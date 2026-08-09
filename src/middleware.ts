import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge middleware uses the DB-free config to gate routes via the JWT cookie.
export const { auth: middleware } = NextAuth(authConfig);

export default middleware((req) => {
  // The `authorized` callback in authConfig handles redirects.
  void req;
});

export const config = {
  // Protect everything except Next internals, the auth API, the public health
  // probe, the cron-triggerable AI endpoints, and static assets. The cron
  // endpoints (scan, weekly-report) enforce their OWN gate in the handler —
  // a shared CRON_SECRET header OR an admin session — so an external scheduler
  // with no browser cookie must not be redirected to /login by the middleware.
  matcher: [
    "/((?!api/auth|api/health|api/ai/scan|api/ai/weekly-report|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
