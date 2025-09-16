"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FcGoogle } from "react-icons/fc";

export default function SignInButton() {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState<"google" | "email" | null>(null);

  const handleGoogle = async () => {
    setLoading("google");
    await signIn("google", { callbackUrl: "/app/dashboard" });
    setLoading(null);
  };

  const handleEmail = async () => {
    if (!email) return;
    setLoading("email");
    await signIn("household", {
      email,
      callbackUrl: "/app/dashboard",
      redirect: true,
    });
    setLoading(null);
  };

  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>Sign in</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign in</DialogTitle>
            <DialogDescription>
              Parents can use Google <span className="whitespace-nowrap">(quick)</span> or enter an email.
              Caregivers use the email the household owner invited you with.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleGoogle}
              disabled={loading !== null}
            >
              <FcGoogle className="text-xl" />
              {loading === "google" ? "Signing in..." : "Continue with Google (parent)"}
            </Button>

            <div className="text-xs text-muted-foreground text-center">— or —</div>

            <div className="grid gap-2">
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading !== null}
              />
              <Button
                className="w-full"
                onClick={handleEmail}
                disabled={!email || loading !== null}
              >
                {loading === "email" ? "Checking email..." : "Continue with email (parent or caregiver)"}
              </Button>
            </div>
          </div>

          <DialogFooter />
        </DialogContent>
      </Dialog>
    </>
  );
}
