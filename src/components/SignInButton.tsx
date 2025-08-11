"use client";
import { signIn } from "next-auth/react";

export default function SignInButton() {
  return (
    <button
      onClick={() => signIn("google", { callbackUrl: "/app" })}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-2)] text-white"
    >
      <span aria-hidden>🔐</span>
      <span>Sign in with Google</span>
    </button>
  );
}
