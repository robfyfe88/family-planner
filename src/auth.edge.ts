import NextAuth from "next-auth";

export const { auth } = NextAuth({
  providers: [],             
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET,
});
