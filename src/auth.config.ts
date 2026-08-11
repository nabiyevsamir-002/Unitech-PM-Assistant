import type { NextAuthConfig } from "next-auth";

// Edge-safe base config (no Prisma / bcrypt). Used by middleware and extended
// in auth.ts with the Node-only Credentials provider.
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      // Simplified 2-person setup: only the sign-in page is public. Self-
      // registration and OTP password-reset are disabled — those routes now
      // require a session, so unauthenticated hits redirect to /login.
      const isPublicAuthPage = nextUrl.pathname.startsWith("/login");

      if (isPublicAuthPage) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
        return true;
      }

      // Everything else requires a session.
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: string }).role ?? "MEMBER";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) ?? "MEMBER";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
