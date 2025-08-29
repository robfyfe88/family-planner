import Link from "next/link";
import SignInButton from "@/components/SignInButton";
import HearthPlanLogo from "@/components/HearthPlanLogo";

function Check({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden>✅</span>
      <span>{text}</span>
    </li>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-dvh">
      {/* Header */}
      <header className="max-w-6xl mx-auto px-4 sm:px-2 py-4 flex items-center justify-between">
        <div className="inline-flex items-center gap-2 font-semibold">
          <HearthPlanLogo size={50} variant="app" />
        </div>
        <div className="flex items-center gap-2">

          <SignInButton />
        </div>
      </header>

      {/* Hero */}
      <section className="overflow-hidden">
        <div
          className="hero-vibrant"
          // graceful fallback for older browsers
          style={{
            background:
              "radial-gradient(900px 480px at 10% -10%, rgba(99,102,241,.35) 0%, rgba(99,102,241,0) 60%), radial-gradient(700px 480px at 90% -10%, rgba(16,185,129,.35) 0%, rgba(16,185,129,0) 60%), linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 55%)",
          }}
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-24">
            <div className="grid lg:grid-cols-2 gap-10 items-center">
              <div>
                <h1 className="text-4xl sm:text-5xl font-semibold leading-tight">
                  HearthPlan — the all-in-one planner for busy families
                </h1>
                <p className="mt-4 text-base sm:text-lg text-[var(--foreground)]/80">
                  Coordinate annual leave around school closures, model nursery
                  costs with real UK funding rules, and keep a shared family
                  budget — together, in one place.
                </p>

                <div className="mt-4 flex items-center gap-2 text-xs sm:text-sm">
                  <span className="pill pill-blue">No installs</span>
                  <span className="pill pill-green">Made for UK families</span>
                  <span className="pill pill-amber">Mobile friendly</span>
                </div>
              </div>

              {/* Bright preview card */}
              <div className="card p-0 overflow-hidden shadow-lg">
                <div className="bg-gradient-to-br from-[var(--accent-2)]/15 via-[var(--accent-3)]/10 to-transparent p-6">
                  <div className="text-sm opacity-80 mb-2">Preview</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 border rounded-xl bg-white">
                      <div className="text-xs opacity-70 mb-1">Annual Leave</div>
                      <div className="h-24 rounded-lg bg-[rgba(59,130,246,0.22)]" />
                    </div>
                    <div className="p-3 border rounded-xl bg-white">
                      <div className="text-xs opacity-70 mb-1">Nursery Costs</div>
                      <div className="h-24 rounded-lg bg-[rgba(234,88,12,0.20)]" />
                    </div>
                    <div className="p-3 border rounded-xl bg-white">
                      <div className="text-xs opacity-70 mb-1">Family Budget</div>
                      <div className="h-24 rounded-lg bg-[rgba(16,185,129,0.22)]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid lg:grid-cols-3 gap-6">
        <div className="feature-card border-t-4 border-[var(--accent-2)]">
          <h3 className="text-lg font-semibold mb-2">Smart leave planning</h3>
          <p className="opacity-80 text-sm">
            Auto-allocate who should be off during school closures, prioritising
            blocks (Christmas & Summer) and minimising random single days.
          </p>
        </div>
        <div className="feature-card border-t-4 border-[var(--accent-3)]">
          <h3 className="text-lg font-semibold mb-2">Nursery cost engine</h3>
          <p className="opacity-80 text-sm">
            Model AM/PM sessions, hourly rounding, funded hours (stretched/term-time) and
            Tax-Free Childcare. See the true monthly bill.
          </p>
        </div>
        <div className="feature-card border-t-4 border-[var(--accent)]">
          <h3 className="text-lg font-semibold mb-2">Budget that reflects reality</h3>
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
        </div>
      </section>

      {/* Pricing (member-based) */}
      {/* <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid md:grid-cols-3 gap-6">
          <div className="pricing-card p-4">
            <div className="pricing-head">
              <span className="pill pill-slate">Free</span>
              <div className="price">£0</div>
            </div>
            <ul className="text-sm space-y-2">
              <Check text="1 parent" />
              <Check text="Unlimited children" />
              <Check text="All three planners" />
              <Check text="Local exports" />
            </ul>
          </div>
          <div className="pricing-card featured border-[2px] border-[var(--accent-2)] p-4 shadow-md">
            <div className="pricing-head">
              <span className="pill pill-blue">Plus</span>
              <div className="price">£4.99/mo</div>
            </div>
            <ul className="text-sm space-y-2">
              <Check text="2 parents" />
              <Check text="1 caregiver" />
              <Check text="Unlimited children" />
              <Check text="Priority updates & exports" />
            </ul>
          </div>
          <div className="pricing-card p-4">
            <div className="pricing-head">
              <span className="pill pill-green">Family</span>
              <div className="price">£8.99/mo</div>
            </div>
            <ul className="text-sm space-y-2">
              <Check text="2 parents" />
              <Check text="Up to 6 caregivers" />
              <Check text="Unlimited children" />
              <Check text="Advanced rules + reminders" />
            </ul>
          </div>
        </div>
      </section> */}

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-10 text-sm opacity-70">
        {/* <div className="flex flex-wrap items-center justify-between gap-3">
          <div>© {new Date().getFullYear()} hearthPlan</div>
          <div className="flex items-center gap-3">
            <Link href="/app" className="hover:underline">Open app</Link>
            <a className="hover:underline" href="mailto:hello@example.com">Contact</a>
          </div>
        </div> */}
      </footer>
    </main>
  );
}
