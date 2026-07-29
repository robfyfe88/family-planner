import Link from "next/link";
import {
  ArrowRight,
  Check,
  CreditCard,
  HeartHandshake,
  Landmark,
  PiggyBank,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import SignInButton from "@/components/SignInButton";
import KinfoldLogo from "@/components/KinfoldLogo";

const promises = [
  "Know exactly what’s left each month",
  "See every debt and its finish line",
  "Build savings without losing sight of family life",
];

export default function LandingPage() {
  return (
    <main className="marketing-page">
      <header className="marketing-header">
        <KinfoldLogo size={46} />
        <div className="marketing-actions">
          <Link href="#how-it-works">How it works</Link>
          <SignInButton />
        </div>
      </header>

      <section className="marketing-hero">
        <div className="marketing-copy">
          <div className="marketing-kicker"><Sparkles size={14} /> Money clarity for real family life</div>
          <h1>A calmer home starts with a clearer financial future.</h1>
          <p>
            Kinfold brings your budget, debt payoff, savings goals, childcare costs and family commitments
            into one shared plan—so you can make confident decisions together.
          </p>
          <div className="hero-actions">
            <SignInButton />
            <Link className="text-link" href="#inside">See what’s inside <ArrowRight size={16} /></Link>
          </div>
          <ul className="promise-list">
            {promises.map((promise) => <li key={promise}><Check size={15} /> {promise}</li>)}
          </ul>
        </div>

        <div className="product-preview" aria-label="Preview of the financial overview">
          <div className="preview-topbar">
            <span><i /> Your money plan</span>
            <span>July</span>
          </div>
          <div className="preview-hero-card">
            <div><small>On track this month</small><strong>£1,240</strong><span>left to decide together</span></div>
            <div className="preview-ring"><span>18%</span></div>
          </div>
          <div className="preview-metrics">
            <div><PiggyBank /><span>Future you</span><strong>£720</strong></div>
            <div><CreditCard /><span>Debt remaining</span><strong>£8,450</strong></div>
          </div>
          <div className="preview-goal">
            <div><span>Emergency fund</span><b>72%</b></div>
            <i><em /></i>
            <small>£5,400 of £7,500</small>
          </div>
        </div>
      </section>

      <section className="trust-strip">
        <span><ShieldCheck size={17} /> Private household space</span>
        <span><HeartHandshake size={17} /> Designed to use together</span>
        <span><Landmark size={17} /> Made for UK family finances</span>
      </section>

      <section className="marketing-section" id="inside">
        <div className="marketing-section-heading">
          <span>The whole picture</span>
          <h2>Money decisions don’t happen in isolation.</h2>
          <p>Your childcare, leave and activities all affect the plan. Kinfold keeps those connections visible.</p>
        </div>
        <div className="feature-grid">
          <article className="feature-money">
            <div><PiggyBank /></div>
            <span>01 · Monthly clarity</span>
            <h3>Give every pound a purpose</h3>
            <p>Bring take-home pay, household costs and savings into one calm monthly view with a clear “left to decide” figure.</p>
          </article>
          <article className="feature-money">
            <div><CreditCard /></div>
            <span>02 · Debt freedom</span>
            <h3>Turn balances into a finish line</h3>
            <p>Compare avalanche and snowball strategies, add overpayments, and see the time and interest impact immediately.</p>
          </article>
          <article className="feature-money">
            <div><Target /></div>
            <span>03 · Your future</span>
            <h3>Make “one day” measurable</h3>
            <p>Set an emergency fund, family goals and your financial-independence number, then track shared progress month by month.</p>
          </article>
        </div>
      </section>

      <section className="marketing-section how-section" id="how-it-works">
        <div className="how-copy">
          <span>A weekly money rhythm</span>
          <h2>Ten calm minutes. One shared direction.</h2>
          <p>Kinfold is built around a simple household check-in, not endless admin.</p>
        </div>
        <ol className="how-list">
          <li><b>1</b><div><strong>Check the month</strong><span>Confirm income, bills and family costs.</span></div></li>
          <li><b>2</b><div><strong>Choose the next move</strong><span>Direct the surplus to debt, safety or a goal.</span></div></li>
          <li><b>3</b><div><strong>Watch the future change</strong><span>See milestones move closer as your plan improves.</span></div></li>
        </ol>
      </section>

      <section className="marketing-cta">
        <div>
          <span>Build the life behind the numbers</span>
          <h2>Your family’s financial future deserves a plan you both understand.</h2>
        </div>
        <SignInButton />
      </section>

      <footer className="marketing-footer">
        <KinfoldLogo size={36} compact />
        <span>© {new Date().getFullYear()} Kinfold</span>
        <span>Private family workspace</span>
      </footer>
    </main>
  );
}
