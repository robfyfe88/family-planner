"use client";
import * as React from "react";
import { signIn } from "next-auth/react";

type Props = {
  fullWidth?: boolean;
  label?: string;
};

export default function SignInButton({ fullWidth, label = "Sign in with Google" }: Props) {
  const [loading, setLoading] = React.useState(false);

  const onClick = async () => {
    try {
      setLoading(true);
      // Redirects away; if it doesn't (popup blockers, etc.), we stop loading after a bit
      const p = signIn("google", { callbackUrl: "/app" });
      const timeout = setTimeout(() => setLoading(false), 6000);
      await p;
      clearTimeout(timeout);
    } catch {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      aria-label="Sign in with Google"
      className={`relative inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl
                  bg-white text-gray-900 border border-gray-200 shadow-sm
                  hover:shadow-md hover:border-gray-300
                  active:translate-y-[1px]
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-2)]
                  disabled:opacity-60 disabled:cursor-not-allowed
                  ${fullWidth ? "w-full" : ""}`}
    >
      {/* Google G */}
      <GoogleG className="h-5 w-5" />

      <span className="font-medium">{loading ? "Signing in…" : label}</span>

      {/* Spinner (appears on the right while loading) */}
      {loading && (
        <svg
          className="absolute right-3 h-4 w-4 animate-spin"
          viewBox="0 0 24 24"
          role="status"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" fill="none" />
          <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" strokeWidth="3" className="opacity-75" fill="none" />
        </svg>
      )}
    </button>
  );
}

function GoogleG({ className = "h-5 w-5" }: { className?: string }) {
  // Official-ish "G" composed of four paths
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path fill="#EA4335" d="M19.6 10.23c0-.68-.06-1.18-.18-1.7H10v3.1h5.5c-.11.86-.72 2.15-2.05 3.03l-.02.12 2.98 2.31.21.02c1.93-1.78 3.03-4.4 3.03-7.9z" />
      <path fill="#34A853" d="M10 20c2.7 0 4.96-.9 6.61-2.44l-3.14-2.43c-.84.58-1.97.99-3.47.99-2.65 0-4.9-1.78-5.7-4.25h-.12l-3.07 2.37-.04.11C2.86 17.98 6.19 20 10 20z" />
      <path fill="#4A90E2" d="M4.3 11.87A6.04 6.04 0 0 1 3.98 10c0-.65.11-1.28.3-1.87l-.01-.13-3.1-2.4-.1.05A10 10 0 0 0 0 10c0 1.6.38 3.1 1.06 4.44l3.24-2.57z" />
      <path fill="#FBBC05" d="M10 3.96c1.88 0 3.15.8 3.87 1.48l2.83-2.76C14.93 1.02 12.7 0 10 0 6.19 0 2.86 2.02 1.06 5.56l3.22 2.57c.8-2.47 3.05-4.17 5.72-4.17z" />
    </svg>
  );
}
