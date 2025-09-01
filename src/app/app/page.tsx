"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import HearthPlanLogo from "@/components/HearthPlanLogo";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  User,
  Users,
  Bell,
  CreditCard,
  Cog,
  LogOut,
  LayoutDashboard,
  Trash,
  Save,
} from "lucide-react";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FamilyToolsPage from "../family-tools/FamilyToolsPage";
import LegacyImportGate from "@/components/LegacyImportGate";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  fetchProfileData,
  updateHouseholdName,
  addMember,
  removeMember,
  updateMember,
  type MemberLite,
} from "../app/profile/actions";

export default function AppHome() {
  const { data: session, status } = useSession();
  if (status === "loading") {
    return (
      <div className="p-6">
        <div className="h-7 w-40 rounded bg-gray-100 animate-pulse" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto text-center p-8 border rounded-2xl bg-[var(--card-bg)]">
          <HearthPlanLogo size={50} variant="app" />
          <p className="text-sm opacity-70 mb-5">
            Sign in to save your nursery plans, leave schedules, and budgets.
          </p>
          <Button
            type="button"
            onClick={() => signIn("google", { callbackUrl: "/app" })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-2)] text-white"
          >
            <GoogleIcon />
            <span>Sign in with Google</span>
          </Button>
        </div>
      </div>
    );
  }

  const user = session.user;
  return (
    <div className="p-2 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <HearthPlanLogo size={50} variant="app" />
        <UserMenu user={user} />
      </header>
      <LegacyImportGate />
      <FamilyToolsPage />
    </div>
  );
}

function UserMenu({
  user,
}: {
  user?: { name?: string | null; email?: string | null; image?: string | null };
}) {
  const router = useRouter();
  const name = user?.name || user?.email || "Account";
  const initials =
    (name?.match(/\b\w/g)?.join("").slice(0, 2).toUpperCase() as string) || "U";

  const [profileOpen, setProfileOpen] = React.useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full border bg-white"
          >
            {user?.image ? (
              <img
                src={user.image}
                alt=""
                className="h-6 w-6 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-6 w-6 rounded-full bg-[var(--accent-2)]/20 grid place-items-center text-xs font-medium">
                {initials}
              </div>
            )}
            <span className="text-sm max-w-[12rem] truncate">{name}</span>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="space-y-1">
            <div className="text-sm font-medium truncate">{name}</div>
            {user?.email && (
              <div className="text-xs opacity-70 truncate">{user.email}</div>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              router.push("/app/dashboard");
            }}
          >
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setProfileOpen(true);
            }}
          >
            <User className="mr-2 h-4 w-4" />
            Profile
          </DropdownMenuItem>

          <DropdownMenuItem disabled className="cursor-not-allowed opacity-60">
            <Bell className="mr-2 h-4 w-4" />
            Notifications
          </DropdownMenuItem>
          <DropdownMenuItem disabled className="cursor-not-allowed opacity-60">
            <CreditCard className="mr-2 h-4 w-4" />
            Subscription
          </DropdownMenuItem>
          <DropdownMenuItem disabled className="cursor-not-allowed opacity-60">
            <Cog className="mr-2 h-4 w-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              signOut({ callbackUrl: "/" });
            }}
            className="text-red-600"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.7 0 6.9 1.3 9.5 3.8l7.1-7.1C36.9 2.2 30.9 0 24 0 14.6 0 6.4 5.4 2.5 13.2l8.6 6.7C12.9 14.3 17.9 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.5c0-1.7-.2-3.3-.6-4.9H24v9.3h12.7c-.6 3-2.3 5.6-4.8 7.3l7.4 5.7c4.3-3.9 6.8-9.6 6.8-17.4z"
      />
      <path
        fill="#FBBC05"
        d="M11.1 27.9c-.5-1.5-.8-3.1-.8-4.9s.3-3.4.8-4.9l-8.6-6.7C.9 13.9 0 18.8 0 23s.9 9.1 2.5 12.6l8.6-7.7z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 12-2.1 16-5.8l-7.4-5.7c-2.1 1.4-4.8 2.2-8.6 2.2-6.1 0-11.1-4.8-12.9-11.1l-8.6 7.7C6.4 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

/* ------------------------ Profile Dialog ------------------------ */

function ProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [loading, setLoading] = React.useState(true);
  const [savingName, setSavingName] = React.useState(false);
  const [householdName, setHouseholdName] = React.useState("");
  const [members, setMembers] = React.useState<MemberLite[]>([]);

  const [newMemberName, setNewMemberName] = React.useState("");
  const [newMemberRole, setNewMemberRole] = React.useState<"parent" | "child">(
    "parent"
  );

  React.useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchProfileData();
        setHouseholdName(data.householdName ?? "Household");
        setMembers(data.members ?? []);
      } catch {
        // no-op
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  const onSaveHousehold = async () => {
    const name = (householdName || "").trim();
    if (!name) return;
    setSavingName(true);
    try {
      const updated = await updateHouseholdName(name);
      setHouseholdName(updated.name);
    } finally {
      setSavingName(false);
    }
  };

  const onAddMember = async () => {
    const name = (newMemberName || "").trim();
    if (!name) return;
    try {
      const created = await addMember({ name, role: newMemberRole });
      setMembers((m) => [...m, created]);
      setNewMemberName("");
    } catch {
    }
  };

  const onRemoveMember = async (id: string) => {
    const prev = members;
    setMembers((m) => m.filter((x) => x.id !== id));
    try {
      await removeMember(id);
    } catch {
      setMembers(prev);
    }
  };

  const onUpdateMember = async (id: string, patch: Partial<MemberLite>) => {
    const prev = members;
    setMembers((m) => m.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    try {
      await updateMember(id, patch);
    } catch {
      setMembers(prev);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl sm:max-w-6xl max-h-[60vh] h-full overflow-auto">
        <DialogHeader>
          <DialogTitle>Profile & Household</DialogTitle>
          <DialogDescription>
            Update your household name and manage family members.
          </DialogDescription>
        </DialogHeader>
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Household</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-full sm:w-96"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              placeholder="Household name"
              disabled={loading}
            />
            <Button
              onClick={onSaveHousehold}
              disabled={loading || savingName || !householdName.trim()}
              className="inline-flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              Save
            </Button>
          </div>
        </section>

        {/* Members */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium">Family Members</h3>
          <div className="rounded-xl border overflow-hidden">
            <div className="max-h-112 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr>
                    <th className="text-left px-3 py-2 w-[55%]">Name</th>
                    <th className="text-left px-3 py-2 w-[30%]">Role</th>
                    <th className="text-right px-2 py-2 w-[15%]">Actions</th>
                  </tr>
                </thead>
                <tbody className="[&>tr:nth-child(even)]:bg-[rgba(0,0,0,0.02)]">
                  {loading && (
                    <tr>
                      <td className="px-3 py-3" colSpan={3}>
                        <div className="h-4 w-40 bg-gray-100 animate-pulse rounded" />
                      </td>
                    </tr>
                  )}
                  {!loading && members.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center opacity-70">
                        No members yet. Add one below.
                      </td>
                    </tr>
                  )}
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td className="px-3 py-2">
                        <Input
                          className="w-64 bg-transparent"
                          value={m.name}
                          onChange={(e) =>
                            onUpdateMember(m.id, { name: e.target.value })
                          }
                          onBlur={(e) =>
                            onUpdateMember(m.id, { name: e.target.value.trim() })
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={m.role}
                          onValueChange={(v) =>
                            onUpdateMember(m.id, { role: v as "parent" | "child" })
                          }
                        >
                          <SelectTrigger className="h-9 w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="parent">Parent</SelectItem>
                            <SelectItem value="child">Child</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="Remove"
                          onClick={() => onRemoveMember(m.id)}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add new row */}
            <div className="flex items-center gap-2 px-3 py-2 border-t bg-[var(--card-bg)]">
              <Input
                className="flex-1"
                placeholder="Member name"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
              />
              <Select
                value={newMemberRole}
                onValueChange={(v) =>
                  setNewMemberRole(v as "parent" | "child")
                }
              >
                <SelectTrigger className="h-9 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="parent">Parent</SelectItem>
                  <SelectItem value="child">Child</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={onAddMember} disabled={!newMemberName.trim()}>
                Add member
              </Button>
            </div>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
