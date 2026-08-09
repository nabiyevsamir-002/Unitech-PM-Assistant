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
      // Public, pre-authentication pages: sign-in, self-registration, and the
      // OTP password reset.
      const isPublicAuthPage =
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/register") ||
        nextUrl.pathname.startsWith("/reset-password");

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
