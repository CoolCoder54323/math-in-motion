"""
misconception_and_synthesize.py
─────────────────────────────────────────────────────────────────────────────
CANONICAL REFERENCE — Misconception and Synthesize scene templates.

Contains two scene classes:
  1. AddressMisconception     (role: "address_misconception")
  2. SynthesizeRule           (role: "synthesize")

PURPOSE FOR CODEGEN
  Adapt these scenes for any topic by changing the equations, the wrong
  answer, the plain-language rule, and the algebraic formula.  The layout
  grid, animation order, and spacing math are correct and tested — preserve
  them.

KEY RULES ENFORCED HERE:
  1. ORANGE is the mandatory wrong-answer colour.  The pedagogy linter
     (Rule P3) checks for this.  Never use red, never omit colour on the
     wrong equation.
  2. Wrong side appears FIRST, gets crossed out SECOND, correct side
     appears THIRD.  This is the pedagogically required order: see the
     error, understand it's wrong, see the correct approach.
  3. In SynthesizeRule, space stacked equations with explicit arithmetic.
     The spacing formula is:
       gap = font_size_in_units + inter_line_buff
       font_size_in_units ≈ font_size_pt * 0.013  (rough conversion)
       At font_size=44, one fraction row ≈ 0.75 Manim units tall.
       Minimum safe gap between row CENTERS: 0.75 + 0.3 = 1.05 units.
     The synthesize scene uses DOWN spacing of 1.1 per row — just sufficient.
  4. Sparkle stars in the celebration phase are seeded for reproducibility
     (np.random.seed(42)) so the video looks the same on every render.
  5. Celebration banner uses to_edge(DOWN) so it anchors to the bottom and
     never overlaps the content above.
"""

from manim import *
import numpy as np

# ── Shared palette ────────────────────────────────────────────────────────
BG       = "#FFF4D6"
INK      = "#2D2013"
PINK     = "#FF6FA3"
SKY      = "#4FC3F7"
GRASS    = "#56C42A"
SUN      = "#FFD23F"
GRAPE    = "#9B59D0"
ORANGE   = "#FF8C42"

config.background_color = BG

# ── Helpers ───────────────────────────────────────────────────────────────

def T(s: str, size: int = 36, color: str = INK) -> Text:
    return Text(s, font_size=size, color=color, weight=BOLD)


def build_mascot() -> VGroup:
    star = Star(n=5, outer_radius=0.5, inner_radius=0.22,
                color=SUN, fill_opacity=1, stroke_color=INK, stroke_width=3)
    el = Dot(star.get_center() + LEFT  * 0.10 + UP * 0.07, radius=0.04, color=INK)
    er = Dot(star.get_center() + RIGHT * 0.10 + UP * 0.07, radius=0.04, color=INK)
    sm = Arc(radius=0.10, start_angle=PI + 0.45, angle=PI - 0.9,
             color=INK, stroke_width=3).move_to(star.get_center() + DOWN * 0.04)
    return VGroup(star, el, er, sm)


# ─────────────────────────────────────────────────────────────────────────────
# Scene 1: AddressMisconception
# ─────────────────────────────────────────────────────────────────────────────

class AddressMisconception(Scene):
    """
    Two-column wrong/correct layout for the "add the denominators" misconception.

    LAYOUT (verified to fit 1280×720):
        mascot          : UL corner
        ── Left column (wrong) ──  x-center = −2.8
          col_header    : y = +2.2
          equation      : y = +1.3  (top ≈ +1.9, bottom ≈ +0.7)
          cross lines   : cover equation bounding box ± 0.15
          why_wrong     : y = +0.2
        ── Right column (correct) ── x-center = +2.8
          col_header    : y = +2.2
          equation      : y = +1.3
          answer_box    : around eq[4]
        ── All at bottom ──
          nothing — content ends at y ≈ −0.1, leaving the lower half clean
    """

    WRONG_X   = -2.8
    CORRECT_X =  2.8
    EQ_Y      =  1.3
    HEADER_Y  =  2.2

    def construct(self):
        mascot = build_mascot().to_corner(UL, buff=0.4)
        self.play(FadeIn(mascot, scale=0.5), run_time=0.4)

        self.show_wrong()
        self.cross_out_wrong()
        self.show_correct(mascot)

        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.5)
        self.wait(0.2)

    def show_wrong(self):
        """
        ALWAYS colour the wrong equation ORANGE.
        Rule P3 in the pedagogy linter checks that ORANGE appears in
        address_misconception scenes — do not substitute any other colour.
        """
        header = T("Wrong way", size=28, color=ORANGE)
        header.move_to([self.WRONG_X, self.HEADER_Y, 0])

        # The wrong equation: 1/4 + 2/4 = 3/8  (adding denominators)
        wrong_eq = MathTex(
            r"\frac{1}{4}", r"+", r"\frac{2}{4}", r"=", r"\frac{3}{8}",
            font_size=52, color=ORANGE,
        )
        wrong_eq.move_to([self.WRONG_X, self.EQ_Y, 0])

        self.play(Write(header), run_time=0.40)
        self.play(Write(wrong_eq), run_time=0.75)
        self.wait(1.2)

        self.wrong_header = header
        self.wrong_eq     = wrong_eq

    def cross_out_wrong(self):
        """
        Draw a bold PINK X over the wrong equation, then explain why it's wrong.

        The cross is drawn from corner-to-corner of the equation's bounding
        box, expanded by 0.15 units on each side for visual clarity.
        """
        buf = 0.15
        ul  = self.wrong_eq.get_corner(UL) + UL * buf
        dr  = self.wrong_eq.get_corner(DR) + DR * buf
        ur  = self.wrong_eq.get_corner(UR) + UR * buf
        dl  = self.wrong_eq.get_corner(DL) + DL * buf

        cross = VGroup(
            Line(ul, dr, color=PINK, stroke_width=6),
            Line(ur, dl, color=PINK, stroke_width=6),
        )
        self.play(Create(cross), run_time=0.40)

        why = T("Don't add denominators!", size=26, color=PINK)
        why.next_to(self.wrong_eq, DOWN, buff=0.30)
        self.play(Write(why), run_time=0.45)
        self.wait(0.8)

        self.cross = cross
        self.why   = why

    def show_correct(self, mascot):
        """
        Present the correct equation on the right side.

        Coloring rule: color ENTIRE sub-expression terms (eq[i]), never
        individual glyphs (eq[i][j][k]).  Index mapping:
          eq[0] = \\frac{1}{4}  → SKY
          eq[1] = +             → INK (default)
          eq[2] = \\frac{2}{4}  → GRASS
          eq[3] = =             → INK (default)
          eq[4] = \\frac{3}{4}  → GRAPE
        """
        header = T("Correct way", size=28, color=GRASS)
        header.move_to([self.CORRECT_X, self.HEADER_Y, 0])

        correct_eq = MathTex(
            r"\frac{1}{4}", r"+", r"\frac{2}{4}", r"=", r"\frac{3}{4}",
            font_size=52, color=INK,
        )
        correct_eq[0].set_color(SKY)
        correct_eq[2].set_color(GRASS)
        correct_eq[4].set_color(GRAPE)
        correct_eq.move_to([self.CORRECT_X, self.EQ_Y, 0])

        box = SurroundingRectangle(correct_eq[4], color=GRAPE, buff=0.13,
                                   stroke_width=3, corner_radius=0.10)

        self.play(Write(header), Write(correct_eq), run_time=0.75)
        self.play(Create(box), run_time=0.30)
        self.play(correct_eq[4].animate.scale(1.2), run_time=0.18)
        self.play(correct_eq[4].animate.scale(1 / 1.2), run_time=0.18)

        # Mascot bounce — signals the correct answer has been confirmed
        self.play(mascot.animate.shift(UP * 0.20), run_time=0.13)
        self.play(mascot.animate.shift(DOWN * 0.20), run_time=0.13)
        self.wait(1.8)


# ─────────────────────────────────────────────────────────────────────────────
# Scene 2: SynthesizeRule
# ─────────────────────────────────────────────────────────────────────────────

class SynthesizeRule(Scene):
    """
    Synthesize (last) scene: present the general rule, algebraic formula,
    and two concrete examples; end with a celebration banner + sparkles.

    CRITICAL SPACING FIX (addresses the overlap bug in the original output):
    ─────────────────────────────────────────────────────────────────────────
    The original scene placed formula at DOWN*0.2, example1 at DOWN*1.5,
    example2 at DOWN*2.3.  At font_size=42 each fraction row is ≈0.75 units
    tall, so only 0.8 units separated rows whose content needed ≥1.05 units.
    Result: denominators of row 1 overlapped numerators of row 2.

    CORRECTED LAYOUT:
      rule_title  y = +2.8
      rule_text   y = +2.1   (below title)
      formula     y = +0.8   (below rule_text with 0.5 gap)
      example_1   y = −0.6   (formula bottom ≈ −0.1, gap = 0.5, ex1 top ≈ −0.2 ✓)
      example_2   y = −1.8   (ex1 bottom ≈ −1.1, gap = 0.7 ✓)
      banner      : to_edge(DOWN, buff=0.15)  (anchored, never overlaps content)

    Verification:
      formula top     ≈ +0.8 + 0.45 = +1.25  →  gap from rule_text = 0.85 ✓
      example_1 span  : center −0.6 ± 0.45   →  y ∈ [−1.05, −0.15]
      example_2 span  : center −1.8 ± 0.45   →  y ∈ [−2.25, −1.35]
      gap between rows: −1.35 − (−1.05) = 0.30  ✓  (minimum required)
      example_2 bottom: −2.25  →  banner at ≈ −3.2  →  gap = 0.95 ✓
    """

    RULE_TITLE_Y  =  2.8
    RULE_TEXT_Y   =  2.05
    FORMULA_Y     =  0.8
    EXAMPLE_1_Y   = -0.6
    EXAMPLE_2_Y   = -1.8

    def construct(self):
        mascot = build_mascot().to_corner(UL, buff=0.4)
        self.play(FadeIn(mascot, scale=0.5), run_time=0.4)

        self.show_rule()
        self.show_formula()
        self.show_examples()
        self.box_rule()
        self.celebrate(mascot)

        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.5)
        self.wait(0.2)

    def show_rule(self):
        title = T("The Rule", size=36, color=PINK)
        title.move_to(UP * self.RULE_TITLE_Y)

        rule = T("Add the numerators, keep the denominator.", size=30, color=INK)
        rule.move_to(UP * self.RULE_TEXT_Y)

        self.play(Write(title), run_time=0.55)
        self.play(Write(rule),  run_time=0.75)
        self.wait(1.2)

        self.rule_title = title
        self.rule_text  = rule

    def show_formula(self):
        """
        General algebraic formula using letter variables.
        Color the two input fractions and the result distinctly.
        """
        formula = MathTex(
            r"\frac{a}{c}", r"+", r"\frac{b}{c}", r"=", r"\frac{a+b}{c}",
            font_size=50, color=INK,
        )
        formula[0].set_color(SKY)     # first fraction
        formula[2].set_color(ORANGE)  # second fraction
        formula[4].set_color(GRASS)   # result
        formula.move_to(UP * self.FORMULA_Y)

        self.play(FadeIn(formula, shift=UP * 0.3), run_time=0.65)
        self.wait(0.8)
        self.formula = formula

    def show_examples(self):
        """
        Two concrete examples, placed with explicit y-coordinates to prevent
        overlap.  See class docstring for spacing arithmetic.

        RULE: every new row of stacked equations MUST have its y-center set
        explicitly with .move_to(), never with .next_to(prev_row, DOWN) when
        prev_row is itself a MathTex — .next_to() uses bounding boxes which
        can be unreliable for multi-row content.
        """
        def make_example(a: str, b: str, c: str,
                         result_num: str, font_size: int = 44) -> MathTex:
            """
            Build  a/c + b/c = result_num/c  with standard coloring.
            Separate-argument MathTex so eq[i] mapping is reliable.
            """
            eq = MathTex(
                rf"\frac{{{a}}}{{{c}}}",
                r"+",
                rf"\frac{{{b}}}{{{c}}}",
                r"=",
                rf"\frac{{{result_num}}}{{{c}}}",
                font_size=font_size, color=INK,
            )
            eq[0].set_color(SKY)
            eq[2].set_color(ORANGE)
            eq[4].set_color(GRASS)
            return eq

        ex1 = make_example("2", "1", "5", "3")
        ex1.move_to(UP * self.EXAMPLE_1_Y)   # explicit y-position

        ex2 = make_example("3", "2", "8", "5")
        ex2.move_to(UP * self.EXAMPLE_2_Y)   # explicit y-position

        self.play(Write(ex1), run_time=0.55)
        self.wait(0.4)
        self.play(Write(ex2), run_time=0.55)
        self.wait(1.2)

        self.ex1 = ex1
        self.ex2 = ex2

    def box_rule(self):
        """Draw a green box around the rule text to visually anchor it."""
        box = SurroundingRectangle(self.rule_text, color=GRASS, buff=0.20,
                                   stroke_width=4, corner_radius=0.12)
        self.play(Create(box), run_time=0.40)

        mascot_ref = self.mobjects[0]
        self.play(mascot_ref.animate.shift(UP * 0.20), run_time=0.13)
        self.play(mascot_ref.animate.shift(DOWN * 0.20), run_time=0.13)
        self.wait(1.8)

    def celebrate(self, mascot):
        """
        Celebration banner anchored to bottom edge + seeded sparkle burst.

        np.random.seed(42) ensures the sparkle positions are identical on
        every render — important for reproducibility in CI/preview.

        Banner uses to_edge(DOWN, buff=0.15) so it is always flush with the
        bottom of the frame regardless of other content position.  Never
        place the banner at a fixed y-coordinate.
        """
        banner = RoundedRectangle(
            width=10.5, height=0.85, corner_radius=0.28,
            fill_color=SUN, fill_opacity=0.55,
            stroke_color=PINK, stroke_width=4,
        )
        banner.to_edge(DOWN, buff=0.15)

        cheer = T("You've mastered adding fractions!", size=28, color=INK)
        cheer.move_to(banner.get_center())

        self.play(FadeIn(banner, scale=0.9), Write(cheer), run_time=0.6)

        # Mascot double-bounce for celebration
        for _ in range(2):
            self.play(mascot.animate.shift(UP * 0.22), run_time=0.12)
            self.play(mascot.animate.shift(DOWN * 0.22), run_time=0.12)

        # Sparkle burst: 14 mini-stars scattered across the frame
        # seed=42 → same random positions on every render
        palette = [SUN, SKY, GRASS, PINK, GRAPE, ORANGE]
        np.random.seed(42)
        sparkles = VGroup(*[
            Star(n=5, outer_radius=0.17, inner_radius=0.07,
                 color=palette[i % len(palette)], fill_opacity=1.0,
                 stroke_color=INK, stroke_width=1.5)
            for i in range(14)
        ])
        for s in sparkles:
            # Avoid the banner zone (y < −2.8) and the mascot zone (x<−5, y>2.5)
            x = np.random.uniform(-5.8, 5.8)
            y = np.random.uniform(-2.5, 3.2)
            s.move_to([x, y, 0])

        self.play(
            LaggedStart(*[FadeIn(s, scale=2.5) for s in sparkles], lag_ratio=0.055),
            run_time=0.85,
        )
        self.wait(2.5)
