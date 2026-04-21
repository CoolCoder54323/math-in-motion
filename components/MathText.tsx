"use client";

import { useMemo } from "react";
import katex from "katex";

/**
 * Renders a string that may contain inline LaTeX (`$...$`) or display
 * LaTeX (`$$...$$`).  Non-math segments pass through as plain text.
 *
 * Uses KaTeX for fast, high-quality math rendering with no external
 * network requests.
 */

// Match $$...$$ (display) first, then $...$ (inline).
// Negative lookbehind avoids matching escaped dollars (\$).
const MATH_RE = /(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$|(?<!\\)\$((?:[^$\\]|\\.)+?)(?<!\\)\$/g;

type Segment =
  | { kind: "text"; value: string }
  | { kind: "math"; value: string; display: boolean };

function parseSegments(input: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const m of input.matchAll(MATH_RE)) {
    const matchStart = m.index!;
    if (matchStart > lastIndex) {
      segments.push({ kind: "text", value: input.slice(lastIndex, matchStart) });
    }

    const isDisplay = m[1] !== undefined;
    segments.push({
      kind: "math",
      value: isDisplay ? m[1] : m[2],
      display: isDisplay,
    });

    lastIndex = matchStart + m[0].length;
  }

  if (lastIndex < input.length) {
    segments.push({ kind: "text", value: input.slice(lastIndex) });
  }

  return segments;
}

export function MathText({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const rendered = useMemo(() => {
    const segments = parseSegments(children);

    // Fast path: no math found, just return plain text.
    if (segments.length === 1 && segments[0].kind === "text") {
      return null;
    }

    return segments.map((seg, i) => {
      if (seg.kind === "text") {
        return <span key={i}>{seg.value}</span>;
      }

      try {
        const html = katex.renderToString(seg.value, {
          displayMode: seg.display,
          throwOnError: false,
          strict: false,
          trust: true,
        });

        return (
          <span
            key={i}
            className={seg.display ? "math-display" : "math-inline"}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } catch {
        // If KaTeX fails, show the raw LaTeX so nothing disappears.
        return (
          <code key={i} className="text-[color:var(--accent)]">
            {seg.value}
          </code>
        );
      }
    });
  }, [children]);

  if (!rendered) {
    return <span className={className}>{children}</span>;
  }

  return <span className={className}>{rendered}</span>;
}
