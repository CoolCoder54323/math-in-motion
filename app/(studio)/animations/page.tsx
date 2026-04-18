"use client";

import { useAppStore } from "@/lib/store";

const PLACEHOLDER_ANIMATIONS = [
  { title: "Adding Fractions with Pizza", duration: "45s", date: "2 days ago" },
  { title: "Place Value for 2nd Grade", duration: "38s", date: "1 week ago" },
  { title: "The Distributive Property", duration: "52s", date: "2 weeks ago" },
  { title: "Area vs Perimeter", duration: "41s", date: "3 weeks ago" },
];

export default function AnimationsPage() {
  const plan = useAppStore((s) => s.animationPlan);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 md:px-12 md:py-16">
      <div className="mb-10">
        <h1 className="font-heading text-3xl font-semibold text-[color:var(--umber)] md:text-4xl">
          Your Animations
        </h1>
        <p className="mt-2 text-[color:var(--umber)]/60">
          Browse and reuse your generated animations.
        </p>
      </div>

      {plan && (
        <div className="mb-8 rounded-xl border border-[color:var(--sunflower-deep)]/30 bg-[color:var(--sunflower)]/10 px-5 py-4">
          <p className="font-heading text-sm font-semibold text-[color:var(--umber)]">
            Latest: {plan.title}
          </p>
          <p className="mt-1 font-heading text-xs text-[color:var(--umber)]/60">
            Just now · {plan.steps.length} steps
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PLACEHOLDER_ANIMATIONS.map((anim) => (
          <div
            key={anim.title}
            className="group cursor-pointer rounded-xl bg-[color:var(--card)] p-5 ring-1 ring-[color:var(--rule)]/20 transition-all hover:shadow-md"
          >
            <div className="aspect-video w-full rounded-lg bg-[oklch(0.94_0.04_85)]" />
            <h3 className="mt-3 font-heading text-sm font-semibold text-[color:var(--umber)] group-hover:text-[color:var(--sunflower-deep)]">
              {anim.title}
            </h3>
            <div className="mt-1 flex items-center gap-2 font-heading text-xs text-[color:var(--umber)]/50">
              <span>{anim.duration}</span>
              <span>·</span>
              <span>{anim.date}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
