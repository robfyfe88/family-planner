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
import { Trash, Pencil, Save, X } from "lucide-react";
import RoleBadge from "./RoleBadge";
import { showInviteEmail, emailRequired, validateEmail } from "@/lib/profile-utils";

type Member = {
  id: string;
  name: string;
  role: "parent" | "caregiver" | "child";
  inviteEmail?: string | null;
};

export default function MemberCard({
  member,
  onSave,              
  onRemove,
  parentOptionDisabled,
  caregiverOptionDisabled,
}: {
  member: Member;
  onSave: (patch: Partial<Member>) => void;
  onRemove: () => void;
  parentOptionDisabled?: boolean;
  caregiverOptionDisabled?: boolean;
}) {
  const [editing, setEditing] = React.useState(false);

  const [name, setName] = React.useState(member.name);
  const [role, setRole] = React.useState<Member["role"]>(member.role);
  const [email, setEmail] = React.useState(member.inviteEmail ?? "");

  React.useEffect(() => setName(member.name), [member.name]);
  React.useEffect(() => setRole(member.role), [member.role]);
  React.useEffect(() => setEmail(member.inviteEmail ?? ""), [member.inviteEmail]);

  const needsEmail = showInviteEmail(role);
  const emailIsRequired = emailRequired(role);
  const emailIsValid = validateEmail(email);
  const emailHasValue = email.trim().length > 0;

  const canSave =
    name.trim().length > 0 &&
    (!needsEmail || (emailIsValid && (!emailIsRequired || emailHasValue)));

  const onStartEdit = () => {
    setEditing(true);
  };

  const onCancel = () => {
    setEditing(false);
    setName(member.name);
    setRole(member.role);
    setEmail(member.inviteEmail ?? "");
  };

  const onCommit = () => {
    if (!canSave) return;
    const patch: Partial<Member> = {
      name: name.trim(),
      role,
      inviteEmail: needsEmail ? (email.trim() || null) : null,
    };
    onSave(patch);
    setEditing(false);
  };

  const parentDisabled = role !== "parent" && parentOptionDisabled;
  const caregiverDisabled = role !== "caregiver" && caregiverOptionDisabled;

  return (
    <div className="rounded-xl border p-4 bg-white flex flex-col relative">
      <div className="absolute top-3 right-3">
        <RoleBadge role={editing ? role : member.role} />
      </div>

      {!editing ? (
        <div className="pr-20 pt-8">
          <div className="text-base font-semibold truncate">{member.name || "—"}</div>
        </div>
      ) : (
        <div className="mb-3 mt-8">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
          />
        </div>
      )}

      {!editing ? (
        <div >
        </div>
      ) : (
        <div className="mb-3">
          <Select value={role} onValueChange={(v) => setRole(v as Member["role"])}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="parent" disabled={parentDisabled}>
                Parent{parentDisabled ? " — limit reached" : ""}
              </SelectItem>
              <SelectItem value="caregiver" disabled={caregiverDisabled}>
                Caregiver{caregiverDisabled ? " — limit reached" : ""}
              </SelectItem>
              <SelectItem value="child">Child</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {showInviteEmail(editing ? role : member.role) ? (
        <>
          {!editing ? (
            <div className="mt-2 text-sm mb-8">
              <span className="block opacity-70">Email</span>
              <span className="block">
                {member.inviteEmail ? member.inviteEmail : <span className="opacity-40">—</span>}
              </span>
            </div>
          ) : (
            <div className="mb-12">
              <Input
                type="email"
                placeholder={emailRequired(role) ? "Email (required for caregivers)" : "Invite email (optional)"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={(e) => setEmail(e.target.value.trim())}
              />
              {!emailIsValid && (
                <p className="mt-1 text-[11px] text-red-600">Please enter a valid email.</p>
              )}
              {emailIsRequired && !emailHasValue && (
                <p className="mt-1 text-[11px] text-red-600">Email is required for caregivers.</p>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="mt-2 text-xs opacity-50">No email needed for children.</div>
      )}

      <div className="absolute bottom-3 right-3 gap-4">
        {!editing ? (
          <>
            <Button variant="outline" size="icon" aria-label="Edit" onClick={onStartEdit} className="mr-2" >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" aria-label="Remove" onClick={onRemove}>
              <Trash className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onCancel} className="inline-flex items-center gap-1 mr-2">
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button
              onClick={onCommit}
              disabled={!canSave}
              className="inline-flex items-center gap-1"
            >
              <Save className="h-4 w-4" />
              Save
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
