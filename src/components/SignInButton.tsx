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

  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>Sign in</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign in</DialogTitle>
            <DialogDescription>
              Parents use Google. Caregivers enter the email the parents saved for you.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => signIn("google", { callbackUrl: "/app/dashboard" })}
            >
              <FcGoogle className="text-xl" />
              Continue with Google (parent)
            </Button>

            <div className="text-xs text-muted-foreground text-center">— or —</div>

            <div className="grid gap-2">
              <Input
                type="email"
                placeholder="caregiver@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button
                className="w-full"
                onClick={() =>
                  signIn("caregiver", {
                    email,
                    callbackUrl: "/app/dashboard",
                    redirect: true,
                  })
                }
              >
                Continue as caregiver
              </Button>
            </div>
          </div>

          <DialogFooter />
        </DialogContent>
      </Dialog>
    </>
  );
}
