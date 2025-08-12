"use client";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/kit";
import { FcGoogle } from "react-icons/fc";

export default function SignInButton() {
  return (
    <Button
      onClick={() => signIn("google", { callbackUrl: "/app" })}
      className="gap-2"
      size="lg"
    >
      <FcGoogle className="text-xl" />
      <span>Sign in with Google</span>
    </Button>
  );
}
