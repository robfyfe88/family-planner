import Link from "next/link";
import SignInButton from "@/components/SignInButton";

export default function LandingPage() {
  return (
    <main className="min-h-dvh">
      {/* Header */}
      <header className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold">
          <span className="text-xl">👨‍👩‍👧‍👦</span>
          <span>Family Planner</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/app"
            className="hidden sm:inline-block px-3 py-2 rounded-lg border hover:bg-gray-50"
          >
            Open app
          </Link>
          <SignInButton />
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="text-4xl sm:text-5xl font-semibold leading-tight">
              The all-in-one planner for busy families
            </h1>
            <p className="mt-4 text-base sm:text-lg opacity-80">
              Coordinate annual leave around school closures, model nursery costs
              with real funding rules, and keep a shared family budget—together,
              in one place.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <SignInButton />
              <Link
                href="#features"
                className="px-4 py-2 rounded-lg border hover:bg-gray-50 whitespace-nowrap"
              >
                See how it works
              </Link>
            </div>
            <div className="mt-4 flex items-center gap-3 text-sm opacity-70">
              <span className="badge badge-teal">No installs</span>
              <span className="badge badge-pink">Made for UK families</span>
              <span className="badge badge-yellow">Mobile friendly</span>
            </div>
          </div>
          
          <div className="card p-0 overflow-hidden">
            <div className="bg-gradient-to-br from-[var(--accent-3)]/20 to-transparent p-6">
              <div className="text-sm opacity-80 mb-2">Preview</div>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 border rounded-xl bg-white">
                  <div className="text-xs opacity-70 mb-1">Annual Leave</div>
                  <div className="h-24 rounded-lg bg-[rgba(167,216,222,0.2)]" />
                </div>
                <div className="p-3 border rounded-xl bg-white">
                  <div className="text-xs opacity-70 mb-1">Nursery Costs</div>
                  <div className="h-24 rounded-lg bg-[rgba(255,192,203,0.2)]" />
                </div>
                <div className="p-3 border rounded-xl bg-white">
                  <div className="text-xs opacity-70 mb-1">Family Budget</div>
                  <div className="h-24 rounded-lg bg-[rgba(255,215,0,0.2)]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid lg:grid-cols-3 gap-6">
        <div className="card">
          <h3 className="text-lg font-medium mb-2">Smart leave planning</h3>
          <p className="opacity-80 text-sm">
            Auto-allocate who should be off during school closures, prioritising
            blocks (Christmas/Summer) and minimising random single days.
          </p>
        </div>
        <div className="card">
          <h3 className="text-lg font-medium mb-2">Nursery cost engine</h3>
          <p className="opacity-80 text-sm">
            Model AM/PM sessions, hourly rounding, funded hours (stretched/term-time) and
            Tax-Free Childcare. See the true monthly bill.
          </p>
        </div>
        <div className="card">
          <h3 className="text-lg font-medium mb-2">Budget that reflects reality</h3>
          <p className="opacity-80 text-sm">
            Tie childcare + leave decisions into a shared family budget so you
            see cash impact immediately.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="card">
          <h2 className="text-xl font-semibold mb-3">How it works</h2>
          <ol className="grid sm:grid-cols-3 gap-4 text-sm">
            <li className="p-3 border rounded-xl bg-[var(--card-bg)]">
              <div className="font-medium mb-1">1. Sign in</div>
              <div className="opacity-80">Use Google to create your space.</div>
            </li>
            <li className="p-3 border rounded-xl bg-[var(--card-bg)]">
              <div className="font-medium mb-1">2. Set your rules</div>
              <div className="opacity-80">Add school closures, allowances & session rates.</div>
            </li>
            <li className="p-3 border rounded-xl bg-[var(--card-bg)]">
              <div className="font-medium mb-1">3. Plan together</div>
              <div className="opacity-80">Share decisions and export calendars or CSVs.</div>
            </li>
          </ol>
          <div className="mt-4">
            <SignInButton />
          </div>
        </div>
      </section>

      {/* Pricing (starter) */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid md:grid-cols-3 gap-6">
          <div className="card">
            <div className="text-sm opacity-70 mb-1">Free</div>
            <div className="text-3xl font-semibold mb-2">£0</div>
            <ul className="text-sm space-y-1">
              <li>• 1 family space</li>
              <li>• Annual leave planner</li>
              <li>• Nursery cost planner</li>
              <li>• Budget dashboard</li>
            </ul>
          </div>
          <div className="card border-[2px] border-[var(--accent-2)]">
            <div className="text-sm opacity-70 mb-1">Plus</div>
            <div className="text-3xl font-semibold mb-2">£4.99/mo</div>
            <ul className="text-sm space-y-1">
              <li>• Share with partner</li>
              <li>• Unlimited exports</li>
              <li>• Priority features</li>
            </ul>
          </div>
          <div className="card">
            <div className="text-sm opacity-70 mb-1">Family</div>
            <div className="text-3xl font-semibold mb-2">£8.99/mo</div>
            <ul className="text-sm space-y-1">
              <li>• Multiple children & spaces</li>
              <li>• Advanced rules</li>
              <li>• Email reminders</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-10 text-sm opacity-70">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>© {new Date().getFullYear()} Family Planner</div>
          <div className="flex items-center gap-3">
            <Link href="/app" className="hover:underline">Open app</Link>
            <a className="hover:underline" href="mailto:hello@example.com">Contact</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
