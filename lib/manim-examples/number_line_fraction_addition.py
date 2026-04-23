"""
number_line_fraction_addition.py
─────────────────────────────────────────────────────────────────────────────
CANONICAL REFERENCE — Number-line scene for fraction addition.

PURPOSE FOR CODEGEN
  This file is the gold-standard template for any scene that uses a number
  line to demonstrate fraction addition.  Copy and adapt it; do not invent
  your own number-line layout from scratch.

KEY RULES ENFORCED HERE (violations are bugs):
  1. NEVER set include_numbers=True on a fraction lesson number line.
     Decimal labels (0.25, 0.50…) actively contradict fraction pedagogy.
     Label the axis manually with MathTex at chosen positions only.
  2. ALWAYS use MathTex for hop-arc labels, never Text("+1/4").
     Text() renders plain ASCII; MathTex renders a proper fraction glyph.
  3. Color ENTIRE sub-expressions in multi-arg MathTex, never individual
     glyph indices (eq[0][0][0]) — glyph indices shift across Manim versions.
  4. Compute every y-position explicitly and comment the arithmetic.
     No magic numbers.  If it doesn't fit, shrink radii or adjust Y, but
     document why.
  5. The predict wait (self.wait(3.0)) belongs BEFORE any reveal animation.
     This file shows the worked-example role; for predict role see
     predict_pause.py.
"""

from manim import *
import numpy as np

# ── Shared palette ────────────────────────────────────────────────────────
# All example files use this exact palette so the lesson looks coherent.
BG       = "#FFF4D6"
INK      = "#2D2013"
PINK     = "#FF6FA3"
SKY      = "#4FC3F7"
GRASS    = "#56C42A"
SUN      = "#FFD23F"
GRAPE    = "#9B59D0"
ORANGE   = "#FF8C42"

config.background_color = BG

# ── Layout constants ──────────────────────────────────────────────────────
# Frame is 16:9, Manim default units: width=14.22, height=8.0
# Safe content zone: x in [-6.2, 6.2], y in [-3.6, 3.6]

NL_LENGTH   = 9.0   # number line length in Manim units
NL_Y        = 0.4   # vertical center of the number line
                    # (slightly above midpoint so arcs + labels fit below)
FRAC_Y_BUFF = 0.30  # gap from tick top to fraction label top
ARC_HEIGHT  = 0.9   # approximate visual height of hop arcs
                    # arcs peak at roughly NL_Y + 0.5*pi*arc_radius ≈ NL_Y+0.9
EQ_Y        = -2.6  # equation center y
                    # Sanity: arc top ≈ NL_Y + ARC_HEIGHT ≈ 1.3  (fits in frame)
                    #         NL_Y - FRAC_Y_BUFF - label_h ≈ -0.1  (label bottoms)
                    #         EQ_Y = -2.6 → eq top ≈ -2.1  (gap from labels ✓)
                    #         eq bottom ≈ -3.1  (well within -3.6 safe zone ✓)

# ── Helpers ───────────────────────────────────────────────────────────────

def T(s: str, size: int = 36, color: str = INK) -> Text:
    """Convenience wrapper: bold Text with consistent defaults."""
    return Text(s, font_size=size, color=color, weight=BOLD)


def build_mascot() -> VGroup:
    """
    Sun-yellow star with a smiling face.

    BUG HISTORY: the right-eye Dot used '*' instead of '+' in early versions,
    placing both eyes at the same x-coordinate.  This version is correct.
    """
    star = Star(n=5, outer_radius=0.5, inner_radius=0.22,
                color=SUN, fill_opacity=1, stroke_color=INK, stroke_width=3)
    el = Dot(star.get_center() + LEFT  * 0.10 + UP * 0.07,  # left eye
             radius=0.04, color=INK)
    er = Dot(star.get_center() + RIGHT * 0.10 + UP * 0.07,  # right eye  ← '+' not '*'
             radius=0.04, color=INK)
    sm = Arc(radius=0.10, start_angle=PI + 0.45, angle=PI - 0.9,
             color=INK, stroke_width=3).move_to(star.get_center() + DOWN * 0.04)
    return VGroup(star, el, er, sm)


def fraction_axis_label(nl: NumberLine, position: float,
                        num: str, den: str, color: str,
                        size: int = 26) -> MathTex:
    """
    Place a colored fraction label BELOW a number-line tick.

    Args:
        nl:       The NumberLine mobject (needed for number_to_point).
        position: Value in [0, 1] — the fraction as a float (e.g. 0.25 for 1/4).
        num:      Numerator string.
        den:      Denominator string.
        color:    Color for the ENTIRE fraction (numerator, bar, denominator).
                  Coloring the whole fraction is always safe; coloring sub-parts
                  with MathTex[i][j][k] indexing is version-fragile.
        size:     Font size in points.

    Returns:
        MathTex positioned below the tick.
    """
    lbl = MathTex(rf"\frac{{{num}}}{{{den}}}", font_size=size, color=color)
    tick_pt = nl.number_to_point(position)
    lbl.next_to(tick_pt, DOWN, buff=FRAC_Y_BUFF)
    return lbl


def hop_arc(nl: NumberLine, start_val: float, end_val: float,
            color: str, label_str: str, label_size: int = 20) -> tuple:
    """
    Build a single hop arc above the number line, plus its MathTex label.

    RULE: label_str MUST be a raw LaTeX string suitable for MathTex, e.g.
          r"+\tfrac{1}{4}"  not  "+1/4".
          Text("+1/4") renders ASCII slash; MathTex renders the proper glyph.

    Returns:
        (arc, label) — both unstyled VGroup mobjects ready to animate.
    """
    sp = nl.number_to_point(start_val) + UP * 0.05
    ep = nl.number_to_point(end_val)   + UP * 0.05
    arc = ArcBetweenPoints(sp, ep, angle=-PI * 0.70,
                           color=color, stroke_width=4)
    mid = arc.point_from_proportion(0.5)
    lbl = MathTex(label_str, font_size=label_size, color=color)
    lbl.move_to(mid + UP * 0.28)
    return arc, lbl


# ── Scene ─────────────────────────────────────────────────────────────────

class NumberLineFractionAddition(Scene):
    """
    Worked-example scene: 1/4 + 2/4 = 3/4 shown on a fraction number line.

    Scene structure (timings are approximate):
      Phase 1  Draw the axis with fraction labels only        ~1.5 s
      Phase 2  Place the starting dot at 1/4                  ~0.8 s
      Phase 3  Two colour-coded hop arcs (1/4 each)           ~1.5 s
      Phase 4  Brace + "+2/4" spanning both hops              ~0.8 s
      Phase 5  Equation below + landing highlight             ~1.5 s
      Pause    Hold on complete picture                        ~1.5 s
      Exit     Fade everything out                            ~0.5 s
    Total: ~8 s — fits a "worked_example" role budget of 6–15 s.
    """

    def construct(self):
        mascot = build_mascot().to_corner(UL, buff=0.4)
        self.play(FadeIn(mascot, scale=0.5), run_time=0.4)

        self.draw_axis()
        self.show_start()
        self.hop_forward()
        self.show_equation()

        # Clean exit — always fade ALL mobjects so nothing bleeds into next scene
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.5)
        self.wait(0.2)

    # ── Phase 1: axis ─────────────────────────────────────────────────────

    def draw_axis(self):
        """
        Number line from 0 to 1, quarter subdivisions, NO decimal labels.

        DESIGN DECISION: include_numbers=False is mandatory for fraction
        lessons.  Manim's built-in number renderer would write "0.25", "0.50",
        "0.75" at the quarter-ticks, visually equating fractions to decimals —
        a separate concept that this lesson does not address.  Instead we
        label only the endpoints (0 and 1) and the three quarter-positions
        with colored fraction glyphs.
        """
        nl = NumberLine(
            x_range=[0, 1, 0.25],
            length=NL_LENGTH,
            color=INK,
            include_numbers=False,    # ← CRITICAL: never True for fraction lessons
            stroke_width=3,
            tick_size=0.15,
        )
        nl.move_to(UP * NL_Y)

        # Endpoint labels: plain "0" and "1" only
        lbl_0 = MathTex("0", font_size=26, color=INK).next_to(
            nl.number_to_point(0), DOWN, buff=FRAC_Y_BUFF)
        lbl_1 = MathTex("1", font_size=26, color=INK).next_to(
            nl.number_to_point(1), DOWN, buff=FRAC_Y_BUFF)

        # Fraction labels at the three interior ticks
        # Color grammar: SKY=first operand, ORANGE=second operand, GRAPE=answer
        lbl_quarter = fraction_axis_label(nl, 0.25, "1", "4", SKY)
        lbl_half    = fraction_axis_label(nl, 0.50, "2", "4", ORANGE)
        lbl_3qtr    = fraction_axis_label(nl, 0.75, "3", "4", GRAPE)

        axis_group = VGroup(nl, lbl_0, lbl_1, lbl_quarter, lbl_half, lbl_3qtr)

        self.play(Create(nl), run_time=0.8)
        self.play(
            LaggedStart(
                Write(lbl_0), Write(lbl_quarter), Write(lbl_half),
                Write(lbl_3qtr), Write(lbl_1),
                lag_ratio=0.15,
            ),
            run_time=0.7,
        )
        self.wait(0.4)

        # Store refs on self so later phases can read them
        self.nl        = nl
        self.lbl_3qtr  = lbl_3qtr

    # ── Phase 2: starting dot ─────────────────────────────────────────────

    def show_start(self):
        pos = self.nl.number_to_point(0.25)
        dot = Dot(pos, radius=0.17, color=SKY, fill_opacity=1,
                  stroke_color=INK, stroke_width=3)
        lbl = T("Start at 1/4", size=22, color=SKY).next_to(dot, UP, buff=0.35)

        self.play(GrowFromCenter(dot), run_time=0.4)
        self.play(Write(lbl), run_time=0.35)
        self.wait(0.4)

        self.dot       = dot
        self.start_lbl = lbl

    # ── Phase 3: two hop arcs ─────────────────────────────────────────────

    def hop_forward(self):
        """
        Two arcs of +1/4 each, colour-coded PINK then GRASS.

        Each arc's MathTex label uses \tfrac (text-style, slightly smaller)
        to keep the label from overwhelming the arc itself.
        """
        self.play(FadeOut(self.start_lbl), run_time=0.25)

        hop_colors  = [PINK, GRASS]
        hop_ranges  = [(0.25, 0.50), (0.50, 0.75)]
        arcs, lbls  = [], []

        for (sv, ev), col in zip(hop_ranges, hop_colors):
            arc, lbl = hop_arc(self.nl, sv, ev, col,
                               label_str=r"+\tfrac{1}{4}", label_size=22)
            self.play(Create(arc), FadeIn(lbl, scale=0.6), run_time=0.38)
            arcs.append(arc)
            lbls.append(lbl)

        # Move dot to landing position
        landing = self.nl.number_to_point(0.75)
        self.play(self.dot.animate.move_to(landing), run_time=0.45)

        # Brace spanning both arcs, labelled "+2/4"
        arcs_vg   = VGroup(*arcs)
        brace     = Brace(arcs_vg, UP, color=ORANGE, buff=0.40)
        brace_lbl = MathTex(r"+\frac{2}{4}", font_size=30, color=ORANGE)
        brace_lbl.next_to(brace, UP, buff=0.12)

        self.play(GrowFromCenter(brace), Write(brace_lbl), run_time=0.5)
        self.wait(0.4)

        self.arcs      = arcs
        self.hop_lbls  = lbls
        self.brace     = brace
        self.brace_lbl = brace_lbl

    # ── Phase 4: equation ─────────────────────────────────────────────────

    def show_equation(self):
        """
        Write the symbolic equation, build it left-to-right so the viewer
        can track which term corresponds to which hop.

        COLORING RULE: set_color() on the ENTIRE sub-expression (eq[i]),
        never on individual glyph indices (eq[i][j][k]).
        eq[i] corresponds to the i-th positional argument passed to MathTex().
        This mapping is stable across all Manim CE versions.
        """
        # Highlight landing with a ring
        ring = Circle(radius=0.28, color=GRAPE, stroke_width=5).move_to(
            self.nl.number_to_point(0.75))
        landing_lbl = T("We land on 3/4!", size=26, color=GRAPE)
        landing_lbl.next_to(self.dot, DOWN, buff=0.42)

        self.play(Create(ring), Write(landing_lbl), run_time=0.5)
        self.wait(0.35)

        # Full equation
        eq = MathTex(
            r"\frac{1}{4}", r"+", r"\frac{2}{4}", r"=", r"\frac{3}{4}",
            font_size=50, color=INK,
        )
        # Color ENTIRE fraction sub-expressions — always safe
        eq[0].set_color(SKY)     # 1/4  (starting point)
        eq[2].set_color(ORANGE)  # 2/4  (distance hopped)
        eq[4].set_color(GRAPE)   # 3/4  (answer)
        eq.move_to(DOWN * abs(EQ_Y))   # EQ_Y is negative; abs() → positive DOWN

        # Animate left side first, then reveal answer
        self.play(Write(eq[:3]), run_time=0.55)
        self.wait(0.25)
        self.play(Write(eq[3:]), run_time=0.45)

        # Box the answer
        box = SurroundingRectangle(eq[4], color=GRAPE, buff=0.14,
                                   stroke_width=3, corner_radius=0.10)
        self.play(Create(box), run_time=0.30)
        self.play(eq[4].animate.scale(1.25), run_time=0.18)
        self.play(eq[4].animate.scale(1 / 1.25), run_time=0.18)

        # Mascot bounce — signals success
        mascot = self.mobjects[0]   # mascot was added first in construct()
        self.play(mascot.animate.shift(UP * 0.20), run_time=0.13)
        self.play(mascot.animate.shift(DOWN * 0.20), run_time=0.13)

        self.wait(1.5)
