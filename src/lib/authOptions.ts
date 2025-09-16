import type { NextAuthOptions } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";

const norm = (e?: string | null) => (e || "").trim().toLowerCase();

const accountIdOf = (account: any): string | null =>
  account?.providerAccountId ?? account?.sub ?? account?.userId ?? null;

async function findParentForGoogle(accountId: string | null, email: string | null) {
  const emailN = norm(email);

  if (accountId) {
    const m = await prisma.member.findFirst({
      where: { role: "parent", userId: accountId },
      select: { id: true, role: true, householdId: true, userId: true },
    });
    if (m) return m;
  }

  if (emailN) {
    const legacy = await prisma.member.findFirst({
      where: { role: "parent", userId: emailN },
      select: { id: true, role: true, householdId: true, userId: true },
    });
    if (legacy) return legacy;

    const byInvite = await prisma.member.findFirst({
      where: { role: "parent", inviteEmail: emailN },
      select: { id: true, role: true, householdId: true, userId: true },
    });
    if (byInvite) return byInvite;
  }

  return null;
}

async function findCaregiverByEmail(email?: string | null) {
  const e = norm(email);
  if (!e) return null;
  return prisma.member.findFirst({
    where: { role: "caregiver", inviteEmail: e },
    select: { id: true, role: true, householdId: true, name: true },
  });
}

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    Credentials({
      id: "caregiver",
      name: "Caregiver",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(creds) {
        const cg = await findCaregiverByEmail(creds?.email);
        if (!cg) return null;
        return { id: `cg_${cg.id}`, name: cg.name ?? "Caregiver", email: norm(creds?.email) };
      },
    }),
  ],

  callbacks: {
    async signIn({ account, user }) {
      const provider = account?.provider;
      if (!provider) return false;

      if (provider === "google") {
        const email = norm(user?.email);
        const accId = accountIdOf(account);

        const parent = await findParentForGoogle(accId, email);
        if (!parent) return false;

        if (accId && parent.userId !== accId) {
          await prisma.member.update({
            where: { id: parent.id },
            data: { userId: accId },
          });
        }
        return true;
      }

      if (provider === "caregiver") return true;

      return false;
    },

    async jwt({ token, account, user }) {
      const accId = accountIdOf(account);
      const email = norm(user?.email || (token as any)?.email);

      if (account?.provider === "google") {
        const parent = await findParentForGoogle(accId, email);
        if (parent) {
          token.memberId = parent.id;
          token.householdId = parent.householdId;
          token.role = "parent";
          return token;
        }
      }

      if (account?.provider === "caregiver" || (token as any).role === "caregiver") {
        const cg = await findCaregiverByEmail(email);
        if (cg) {
          token.memberId = cg.id;
          token.householdId = cg.householdId;
          token.role = "caregiver";
          return token;
        }
      }

      if (!token.householdId && email) {
        const m = await prisma.member.findFirst({
          where: { inviteEmail: email },
          select: { id: true, householdId: true, role: true },
        });
        if (m) {
          token.memberId = m.id;
          token.householdId = m.householdId;
          token.role = m.role;
        }
      }

      return token;
    },

    async session({ session, token }) {
      (session as any).memberId = token.memberId ?? null;
      (session as any).householdId = token.householdId ?? null;
      (session as any).role = token.role ?? null;
      return session;
    },
  },
};
