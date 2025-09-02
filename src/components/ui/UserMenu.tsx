import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "next/navigation";
import React from "react";
import {
  User,
  Bell,
  CreditCard,
  Cog,
  LogOut,
  LayoutDashboard,
} from "lucide-react";
import { signOut } from "next-auth/react";

export function UserMenu({
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
              router.push("/app/profile");
            }}
          >
            <User className="mr-2 h-4 w-4" />
            Profile
          </DropdownMenuItem>

          <DropdownMenuItem disabled className="cursor-not-allowed opacity-60">
            <Bell className="mr-2 h-4 w-4" />
            Notifications
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              router.push("/app/subscribe");
            }}
          >
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
    </>
  );
}