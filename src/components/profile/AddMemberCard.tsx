"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import RoleBadge from "./RoleBadge";
import { showInviteEmail, emailRequired, validateEmail } from "@/lib/profile-utils";

export default function AddMemberCard({
  name, setName,
  role, setRole,
  email, setEmail,
  canAddParent, canAddCaregiver,
  canSubmit, busy, onSubmit,
}: {
  name: string;
  setName: (v: string) => void;
  role: "parent" | "caregiver" | "child";
  setRole: (v: "parent" | "caregiver" | "child") => void;
  email: string;
  setEmail: (v: string) => void;
  canAddParent: boolean;
  canAddCaregiver: boolean;
  canSubmit: boolean;
  busy: boolean;
  onSubmit: () => void;
}) {
  const needsEmail = showInviteEmail(role);
  const isRequired = emailRequired(role);
  const emailOk = !needsEmail || (validateEmail(email) && (!isRequired || email.trim().length > 0));

  return (
    <div className="rounded-xl border p-4 bg-white flex flex-col relative">
      <div className="absolute top-3 right-3">
        <RoleBadge role={role} />
      </div>

      <div className="mb-3 mt-8">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Member name"
        />
      </div>

      <div className="mb-3">
        <Select value={role} onValueChange={(v) => setRole(v as any)}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="parent" disabled={!canAddParent}>
              Parent{!canAddParent ? " — limit reached" : ""}
            </SelectItem>
            <SelectItem value="caregiver" disabled={!canAddCaregiver}>
              Caregiver{!canAddCaregiver ? " — limit reached" : ""}
            </SelectItem>
            <SelectItem value="child">Child</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {needsEmail ? (
        <div className="mb-3">
          <Input
            type="email"
            placeholder={isRequired ? "Email (required for caregivers)" : "Invite email (optional)"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={(e) => setEmail(e.target.value.trim())}
          />
          {!emailOk && (
            <p className="mt-1 text-[11px] text-red-600">
              {isRequired && !email.trim()
                ? "Email is required for caregivers."
                : "Please enter a valid email."}
            </p>
          )}
        </div>
      ) : (
        <div></div>
      )}

      <Button
        disabled={!canSubmit || !emailOk || busy}
        onClick={onSubmit}
        className="mt-auto"
      >
        Add member
      </Button>
    </div>
  );
}
