import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyTotp } from "@/lib/totp";
import { isGoogleConfigured } from "@/lib/oauth";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp: z.string().optional(),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totp: { label: "2FA code", type: "text" },
      },
      authorize: async (credentials, request) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        // Throttle brute-force login attempts per client IP. Fail-open: any
        // error in the limiter must never block a legitimate sign-in.
        try {
          const ip = getClientIp(request as Request | undefined);
          const rl = checkRateLimit("login", ip, {
            limit: 20,
            windowMs: 10 * 60_000,
          });
          if (!rl.ok) return null;
        } catch {
          // ignore — never let rate limiting break auth
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user || !user.isActive) return null;

        const valid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash,
        );
        if (!valid) return null;

        // Second factor: enforced only for users who have confirmed 2FA.
        if (user.totpEnabled) {
          if (!user.totpSecret || !verifyTotp(user.totpSecret, parsed.data.totp ?? "")) {
            return null;
          }
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          image: user.avatar ?? undefined,
        };
      },
    }),
    // Google is added ONLY when GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are set,
    // so with no keys the app stays pure-credentials (see src/lib/oauth.ts).
    ...(isGoogleConfigured()
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Google is a convenience sign-in for EXISTING, ACTIVE accounts only: we
    // match the verified Google email to a local user. Unknown or not-yet-
    // approved emails are turned away — account creation stays in the explicit
    // /register flow with its admin-approval gate. Credentials are already
    // fully validated in authorize() above, so they always pass here.
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      const email = user.email?.toLowerCase();
      if (!email) return false;
      const dbUser = await prisma.user.findUnique({ where: { email } });
      return !!dbUser && dbUser.isActive;
    },
    // On sign-in, stamp our DB user id + role onto the token. For Google the
    // provider `user` carries no role and a non-local id, so resolve it from the
    // DB by email (guaranteed to exist + be active by the signIn gate above).
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "google") {
          const dbUser = await prisma.user.findUnique({
            where: { email: (user.email ?? "").toLowerCase() },
          });
          if (dbUser) {
            token.id = dbUser.id;
            token.role = dbUser.role;
            token.name = dbUser.name;
            token.picture = dbUser.avatar ?? null;
          }
        } else {
          token.id = user.id as string;
          token.role = (user as { role?: string }).role ?? "MEMBER";
        }
      }
      return token;
    },
  },
});
