"use client";

const PLACEHOLDER_PROMPTS = [
  {
    prompt: "Show me how to add fractions with unlike denominators, step by step, using a visual pizza-slice example.",
    topic: "Fractions",
    date: "2 days ago",
  },
  {
    prompt: "Explain place value — ones, tens, and hundreds — for 2nd-grade students with a concrete example.",
    topic: "Place Value",
    date: "1 week ago",
  },
  {
    prompt: "What is the distributive property? Explain it visually with a relatable real-world example.",
    topic: "Distributive Property",
    date: "2 weeks ago",
  },
  {
    prompt: "Help students understand the difference between area and perimeter using a rectangular garden example.",
    topic: "Area vs Perimeter",
    date: "3 weeks ago",
  },
  {
    prompt: "Explain how to convert a fraction into a percentage for 5th-grade students in an intuitive way.",
    topic: "Percentages",
    date: "1 month ago",
  },
];

export default function PromptsGalleryPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12 md:px-12 md:py-16">
      <div className="mb-10">
        <h1 className="font-heading text-3xl font-semibold text-[color:var(--umber)] md:text-4xl">
          Prompts Gallery
        </h1>
        <p className="mt-2 text-[color:var(--umber)]/60">
          Browse and reuse prompts that created great animations.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {PLACEHOLDER_PROMPTS.map((item, i) => (
          <div
            key={i}
            className="group cursor-pointer rounded-xl bg-[color:var(--card)] p-5 ring-1 ring-[color:var(--rule)]/20 transition-all hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <span className="inline-block rounded-full bg-[color:var(--sunflower)]/30 px-2.5 py-0.5 font-heading text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sunflower-deep)]">
                  {item.topic}
                </span>
                <p className="mt-2 font-heading text-sm leading-relaxed text-[color:var(--umber)]/80">
                  {item.prompt}
                </p>
              </div>
              <span className="shrink-0 font-heading text-xs text-[color:var(--umber)]/40">
                {item.date}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button className="font-heading text-xs italic text-[color:var(--sunflower-deep)] underline-offset-4 hover:underline">
                Use this prompt →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
