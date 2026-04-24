import Link from "next/link";

const PLANS = [
  {
    name: "Starter",
    price: "$2.99",
    period: "/month",
    prompts: "5 prompts",
    description: "Perfect for trying it out",
    features: [
      "5 animation prompts per month",
      "All animation styles",
      "Worksheet upload",
      "Email support",
    ],
    cta: "Get Started",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$5.99",
    period: "/month",
    prompts: "15 prompts",
    description: "For regular classroom use",
    features: [
      "15 animation prompts per month",
      "All animation styles",
      "Worksheet upload",
      "Priority support",
      "Save animations",
    ],
    cta: "Get Started",
    highlight: true,
  },
  {
    name: "Unlimited",
    price: "$9.99",
    period: "/month",
    prompts: "Unlimited",
    description: "For power users and teams",
    features: [
      "Unlimited animation prompts",
      "All animation styles",
      "Worksheet upload",
      "Priority support",
      "Save animations",
      "Team sharing",
    ],
    cta: "Get Started",
    highlight: false,
  },
];

const FLOATING_GLYPHS = [
  { char: "+", className: "left-[8%] top-[15%] text-7xl text-[oklch(0.78_0.17_80/0.18)]", delay: "0s", variant: "drift-a" as const },
  { char: "π", className: "right-[10%] top-[12%] text-6xl text-[oklch(0.78_0.17_80/0.18)]", delay: "1s", variant: "drift-b" as const },
  { char: "÷", className: "left-[15%] bottom-[20%] text-5xl text-[oklch(0.62_0.18_45/0.18)]", delay: "2s", variant: "drift-c" as const },
  { char: "√", className: "right-[12%] bottom-[15%] text-6xl text-[oklch(0.62_0.18_45/0.18)]", delay: "0.5s", variant: "drift-a" as const },
];

export default function PricingPage() {
  return (
    <main className="relative flex-1">
      <div aria-hidden="true" className="bg-sunbeams pointer-events-none absolute inset-0" />

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-64 -top-32 size-[42rem] rounded-full bg-[oklch(0.88_0.14_88/0.2)] blur-[140px]" />
        <div className="absolute -right-56 top-1/3 size-[46rem] rounded-full bg-[oklch(0.75_0.15_45/0.1)] blur-[160px]" />
      </div>

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {FLOATING_GLYPHS.map(({ char, className, delay, variant }, i) => (
          <span key={i} className={`math-glyph ${variant} ${className}`} style={{ animationDelay: delay }}>
            {char}
          </span>
        ))}
      </div>

      <div className="relative mx-auto max-w-5xl px-6 py-20 md:px-12 md:py-28">
        <div className="mb-16 text-center">
          <h1 className="font-heading text-4xl font-semibold leading-tight tracking-tight text-[color:var(--umber)] md:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-lg text-[color:var(--umber)]/70">
            Start free, upgrade when you&apos;re ready. No hidden fees.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl p-8 ring-1 transition-shadow hover:shadow-lg ${
                plan.highlight
                  ? "border-2 border-[color:var(--sunflower-deep)] bg-[color:var(--sunflower)]/20 ring-[color:var(--sunflower-deep)]/30"
                  : "bg-[color:var(--card)] ring-[color:var(--rule)]/30"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[color:var(--sunflower-deep)] px-3 py-0.5 font-heading text-[10px] font-semibold uppercase tracking-wider text-white">
                  Most Popular
                </span>
              )}

              <h3 className="font-heading text-xl font-semibold text-[color:var(--umber)]">{plan.name}</h3>
              <p className="mt-1 text-sm text-[color:var(--umber)]/60">{plan.description}</p>

              <div className="mt-6 flex items-baseline gap-1">
                <span className="font-heading text-4xl font-semibold text-[color:var(--umber)]">{plan.price}</span>
                <span className="font-heading text-sm text-[color:var(--umber)]/60">{plan.period}</span>
              </div>
              <p className="mt-1 font-heading text-sm font-semibold text-[color:var(--sunflower-deep)]">{plan.prompts}</p>

              <ul className="mt-6 flex flex-col gap-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 font-heading text-sm text-[color:var(--umber)]/80">
                    <span className="mt-0.5 text-[color:var(--sunflower-deep)]" aria-hidden="true">✦</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href="/login"
                className={`mt-8 block w-full rounded-lg px-4 py-2.5 text-center font-heading text-sm font-semibold transition-colors ${
                  plan.highlight
                    ? "bg-[color:var(--sunflower-deep)] text-white hover:bg-[color:var(--sunflower-deep)]/90"
                    : "border border-[color:var(--rule)]/40 text-[color:var(--umber)] hover:bg-[color:var(--sunflower)]/20"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
