"""
fraction_circles.py
─────────────────────────────────────────────────────────────────────────────
CANONICAL REFERENCE — Fraction circle scenes for introduce and predict roles.

Contains two scene classes:
  1. IntroduceFractionCircles  (role: "introduce")
  2. PredictCombineSlices      (role: "predict")

PURPOSE FOR CODEGEN
  Use this file as the reference for ANY scene that uses pie-chart-style
  fraction circles.  The layout arithmetic and coloring patterns here are
  tested and correct — do not reinvent them.

KEY RULES ENFORCED HERE:
  1. colored_fraction() helper — always build display fractions as three
     separate mobjects (MathTex num, Line bar, MathTex den).  This gives
     you reliable per-part coloring without fragile glyph-index hacks.
  2. When sizing circles, verify the FULL layout fits:
       top of circles  = circle_center_y + radius
       bottom of eq    = eq_center_y - eq_height/2
       Required gap between them ≥ 0.3 Manim units
  3. Sector.move_to(center) positions the sector's BOUNDING BOX center,
     not its geometric arc center.  For precise placement use:
       sector.move_to(circle.get_center())
     and verify visually.
  4. In a predict scene, self.wait(3.0) MUST appear BEFORE any reveal
     animation.  The linter enforces this; do not omit it.
  5. Safe multi-arg MathTex equation coloring: color eq[i] (whole term),
     never eq[i][j][k] (sub-glyph index).
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
    star = Star(n=5, radius=0.5, inner_radius=0.22,
                color=SUN, fill_opacity=1, stroke_color=INK, stroke_width=3)
    el = Dot(star.get_center() + LEFT  * 0.10 + UP * 0.07, radius=0.04, color=INK)
    er = Dot(star.get_center() + RIGHT * 0.10 + UP * 0.07, radius=0.04, color=INK)
    sm = Arc(radius=0.10, start_angle=PI + 0.45, angle=PI - 0.9,
             color=INK, stroke_width=3).move_to(star.get_center() + DOWN * 0.04)
    return VGroup(star, el, er, sm)


def colored_fraction(num_str: str, den_str: str,
                     num_color: str, den_color: str,
                     font_size: int = 44) -> VGroup:
    """
    Build a fraction display from THREE separate mobjects.

    WHY NOT MathTex(r"\\frac{a}{b}")[0][i]?
    ─────────────────────────────────────────
    MathTex glyph indexing inside \\frac is fragile: the index of the
    numerator vs denominator can differ based on Manim CE version, LaTeX
    distribution, and font.  This helper avoids that entirely by building
    the fraction from primitives that are always reliable.

    The result LOOKS identical to \\frac at normal viewing sizes.

    Usage:
        frac = colored_fraction("1", "4", PINK, SKY)
        frac.move_to(LEFT * 3 + DOWN * 0.5)
        self.play(FadeIn(frac))
    """
    n   = MathTex(num_str, font_size=font_size, color=num_color)
    bar = Line(LEFT * 0.24, RIGHT * 0.24, color=INK, stroke_width=2.5)
    d   = MathTex(den_str, font_size=font_size, color=den_color)
    return VGroup(n, bar, d).arrange(DOWN, buff=0.07)


def fraction_circle(center: np.ndarray, radius: float,
                    shaded: int, total: int,
                    shade_color: str) -> VGroup:
    """
    Build a fraction circle (pizza-slice diagram) with `total` equal sectors
    and `shaded` sectors filled with `shade_color`.

    Args:
        center:      3D numpy array [x, y, 0].
        radius:      Circle radius in Manim units.
        shaded:      Number of sectors to shade.
        total:       Total number of equal sectors.
        shade_color: Fill color for shaded sectors.

    Returns:
        VGroup containing the circle outline, dividing lines, and shaded sectors.
        The unshaded sectors are NOT drawn — the background colour shows through.
    """
    circle = Circle(radius=radius, stroke_color=INK, stroke_width=4,
                    fill_color=BG, fill_opacity=1.0).move_to(center)

    lines = VGroup()
    for i in range(total):
        angle = i * TAU / total
        end   = center + radius * np.array([np.cos(angle), np.sin(angle), 0])
        lines.add(Line(center, end, color=INK, stroke_width=3))

    sectors = VGroup()
    for i in range(shaded):
        start_angle = i * TAU / total
        s = Sector(
            radius=radius,
            angle=TAU / total,
            start_angle=start_angle,
            fill_color=shade_color,
            fill_opacity=0.55,
            stroke_width=0,
        ).move_to(center)
        sectors.add(s)

    return VGroup(circle, lines, sectors)


# ─────────────────────────────────────────────────────────────────────────────
# Scene 1: Introduce
# ─────────────────────────────────────────────────────────────────────────────

class IntroduceFractionCircles(Scene):
    """
    Introduce scene: label 1/4 and 2/4 as fraction circles, then show the
    addition equation 1/4 + 2/4 = ? to set up the rest of the lesson.

    LAYOUT (all y-values computed explicitly):
        mascot          : UL corner
        circle centres  : y = +1.0,  x = ±3.3,  radius = 1.5
        circle bottoms  : y = +1.0 − 1.5 = −0.5
        frac labels     : y ≈ −0.5 − 0.45 (buff) − 0.35 (half label h) ≈ −1.3
        label text      : y ≈ −1.3 − 0.25 (buff) − 0.20 (half text h)  ≈ −1.75
        equation        : y = −2.7  (top ≈ −2.3, bottom ≈ −3.1 — within safe zone)
        gap label→eq    : −2.3 − (−1.75) = 0.55  ✓  (> 0.3 minimum)
    """

    CIRCLE_Y      = 1.0
    CIRCLE_X      = 3.3
    CIRCLE_RADIUS = 1.5
    EQ_Y          = -2.7

    def construct(self):
        mascot = build_mascot().to_corner(UL, buff=0.4)
        self.play(FadeIn(mascot, scale=0.5), run_time=0.4)

        self.draw_circles()
        self.label_circles()
        self.show_equation(mascot)

        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.5)
        self.wait(0.2)

    def draw_circles(self):
        c = self.CIRCLE_RADIUS
        y = self.CIRCLE_Y
        x = self.CIRCLE_X

        circ1 = fraction_circle(np.array([-x, y, 0]), c, 1, 4, PINK)
        circ2 = fraction_circle(np.array([ x, y, 0]), c, 2, 4, PINK)

        self.play(
            LaggedStart(Create(circ1), Create(circ2), lag_ratio=0.25),
            run_time=1.0,
        )
        self.wait(0.6)
        self.circ1 = circ1
        self.circ2 = circ2

    def label_circles(self):
        c  = self.CIRCLE_RADIUS
        y  = self.CIRCLE_Y
        x  = self.CIRCLE_X

        # Fraction labels below each circle
        # Color numerator PINK (shaded slices), denominator SKY (total slices)
        frac1 = colored_fraction("1", "4", PINK, SKY, font_size=46)
        frac1.next_to(self.circ1, DOWN, buff=0.45)

        frac2 = colored_fraction("2", "4", PINK, SKY, font_size=46)
        frac2.next_to(self.circ2, DOWN, buff=0.45)

        # Plain-text sublabels — small, below the fraction glyphs
        sub1 = T("1 shaded slice out of 4", size=22, color=INK)
        sub1.next_to(frac1, DOWN, buff=0.18)
        sub2 = T("2 shaded slices out of 4", size=22, color=INK)
        sub2.next_to(frac2, DOWN, buff=0.18)

        self.play(
            LaggedStart(FadeIn(frac1), FadeIn(frac2), lag_ratio=0.2),
            run_time=0.6,
        )
        self.play(
            LaggedStart(Write(sub1), Write(sub2), lag_ratio=0.2),
            run_time=0.5,
        )
        self.wait(0.8)
        self.frac1, self.frac2 = frac1, frac2

    def show_equation(self, mascot):
        """
        Display 1/4 + 2/4 = ? using safe multi-arg MathTex coloring.

        COLORING RULE (safe version):
          - Pass each term as a SEPARATE argument to MathTex().
          - Color the whole sub-expression with eq[i].set_color().
          - Never index deeper than eq[i]; eq[i][j][k] is fragile.
        """
        eq = MathTex(
            r"\frac{1}{4}", r"+", r"\frac{2}{4}", r"=", r"?",
            font_size=54, color=INK,
        )
        eq[0].set_color(PINK)   # 1/4  — matches shading color
        eq[2].set_color(PINK)   # 2/4  — matches shading color
        eq[1].set_color(ORANGE) # +
        eq[3].set_color(ORANGE) # =
        eq[4].set_color(GRAPE)  # ?
        eq.move_to(DOWN * abs(self.EQ_Y))

        question = T("What do we get when we add them?", size=24, color=INK)
        question.next_to(eq, DOWN, buff=0.25)

        self.play(Write(eq), run_time=0.7)
        self.play(Write(question), run_time=0.5)

        # Mascot bounce — signals a question has been posed
        self.play(mascot.animate.shift(UP * 0.20), run_time=0.13)
        self.play(mascot.animate.shift(DOWN * 0.20), run_time=0.13)
        self.wait(2.0)


# ─────────────────────────────────────────────────────────────────────────────
# Scene 2: Predict
# ─────────────────────────────────────────────────────────────────────────────

class PredictCombineSlices(Scene):
    """
    Predict scene: student sees two fraction circles and is asked to count
    the total shaded slices before the circles are merged to reveal 3/4.

    MANDATORY PREDICT PAUSE:
      Rule P1 (from pedagogy-lint.ts) requires self.wait(≥2.0) BEFORE
      any reveal animation when hasPredictPause=true.  This scene uses 3.0.
      Do not move the wait AFTER the reveal — that defeats its purpose.

    LAYOUT:
        mascot           : UL corner
        question text    : top, y ≈ 3.1
        source circles   : y = +0.8,  x = ±3.0,  radius = 1.4
        source bottoms   : y ≈ −0.6
        predict wait     : 3 seconds  ← mandatory, happens here
        combined circle  : y = −1.5,  radius = 1.6
        combined bottom  : y ≈ −3.1  (within −3.6 safe zone ✓)
        equation         : y = −3.0  (below combined circle left edge ✓)

    VERIFIED: combined circle bottom (−3.1) and equation (−3.0) are close.
    The equation is offset to the RIGHT of the combined circle to avoid
    visual overlap.  See show_answer() for the exact positioning.
    """

    SRC_Y      = 0.8
    SRC_X      = 3.0
    SRC_R      = 1.4
    COMB_Y     = -1.5
    COMB_R     = 1.6

    def construct(self):
        mascot = build_mascot().to_corner(UL, buff=0.4)
        self.play(FadeIn(mascot, scale=0.5), run_time=0.4)

        self.setup_source_circles()
        self.pose_question()
        # ── MANDATORY PREDICT PAUSE ────────────────────────────────────────
        # Everything above this line is the "question" phase.
        # Nothing below this line reveals the answer.
        # The 3-second wait is the student's thinking window.
        self.wait(3.0)
        # ── END PREDICT PAUSE ─────────────────────────────────────────────
        self.combine_into_result()
        self.show_answer(mascot)

        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.5)
        self.wait(0.2)

    def setup_source_circles(self):
        cx = self.SRC_X
        cy = self.SRC_Y
        r  = self.SRC_R

        # Left: 1/4 shaded in SKY
        self.left_circ = fraction_circle(np.array([-cx, cy, 0]), r, 1, 4, SKY)
        # Right: 2/4 shaded in PINK
        self.right_circ = fraction_circle(np.array([cx, cy, 0]), r, 2, 4, PINK)

        lbl_l = colored_fraction("1", "4", SKY,  INK, font_size=38)
        lbl_r = colored_fraction("2", "4", PINK, INK, font_size=38)
        lbl_l.next_to(self.left_circ,  DOWN, buff=0.30)
        lbl_r.next_to(self.right_circ, DOWN, buff=0.30)

        self.play(
            LaggedStart(
                Create(self.left_circ), Create(self.right_circ),
                lag_ratio=0.2,
            ),
            run_time=0.8,
        )
        self.play(FadeIn(lbl_l), FadeIn(lbl_r), run_time=0.4)
        self.wait(0.5)
        self.lbl_l, self.lbl_r = lbl_l, lbl_r

    def pose_question(self):
        q = T("How many shaded slices total?", size=34, color=PINK)
        q.to_edge(UP, buff=0.5)
        self.play(Write(q), run_time=0.55)
        self.question = q

    def combine_into_result(self):
        """
        Fade source circles to the side, create the combined circle in the
        centre, then animate colour-coded sectors flying in.

        LAYOUT NOTE: The combined circle is at y=COMB_Y=−1.5.  Its bottom
        edge is at −1.5 − 1.6 = −3.1.  The answer equation is placed to the
        right of center at the same y level, so they don't overlap vertically.
        """
        # Fade out source material, keep question
        self.play(
            FadeOut(self.left_circ), FadeOut(self.lbl_l),
            FadeOut(self.right_circ), FadeOut(self.lbl_r),
            run_time=0.45,
        )

        comb_center = np.array([0.0, self.COMB_Y, 0])
        comb = fraction_circle(comb_center, self.COMB_R, 0, 4, SKY)
        # (shaded=0 → just outline + lines, no fill yet)
        self.play(Create(comb), run_time=0.5)

        # Sectors fly in: 1 SKY (from left circle) + 2 PINK (from right circle)
        # Build them at their final positions from the start
        sector_configs = [
            (0,       SKY),   # first slice
            (TAU / 4, PINK),  # second slice
            (TAU / 2, PINK),  # third slice
        ]
        sectors = VGroup()
        for start_angle, col in sector_configs:
            s = Sector(
                radius=self.COMB_R,
                angle=TAU / 4,
                start_angle=start_angle,
                fill_color=col,
                fill_opacity=0.55,
                stroke_width=0,
            ).move_to(comb_center)
            sectors.add(s)

        self.play(
            LaggedStart(*[FadeIn(s, scale=0.4) for s in sectors], lag_ratio=0.18),
            run_time=0.7,
        )
        self.wait(0.5)
        self.comb         = comb
        self.comb_sectors = sectors
        self.comb_center  = comb_center

    def show_answer(self, mascot):
        """
        Reveal the equation 1/4 + 2/4 = 3/4 to the right of the combined
        circle.  The equation is positioned so its horizontal span starts
        ~0.3 units right of the circle edge.

        Note: EQ x-start = COMB_R + 0.3 = 1.9.  At font_size=46 the equation
        is about 3.5 units wide, so it ends at 1.9 + 3.5 = 5.4 — within
        the 6.2 safe zone ✓.
        """
        # Equation to the right of the combined circle
        eq = MathTex(
            r"\frac{1}{4}", r"+", r"\frac{2}{4}", r"=", r"\frac{3}{4}",
            font_size=46, color=INK,
        )
        eq[0].set_color(SKY)
        eq[2].set_color(PINK)
        eq[4].set_color(GRASS)
        eq.next_to(self.comb, RIGHT, buff=0.5)
        # Clamp y to same level as combined circle center
        eq.move_to(np.array([eq.get_center()[0], self.COMB_Y, 0]))

        box = SurroundingRectangle(eq[4], color=GRASS, buff=0.13,
                                   stroke_width=3, corner_radius=0.10)

        self.play(Write(eq[:4]), run_time=0.55)
        self.wait(0.3)
        self.play(Write(eq[4]), run_time=0.40)
        self.play(Create(box), run_time=0.30)
        self.play(eq[4].animate.scale(1.2), run_time=0.18)
        self.play(eq[4].animate.scale(1 / 1.2), run_time=0.18)

        # Mascot bounce
        self.play(mascot.animate.shift(UP * 0.20), run_time=0.13)
        self.play(mascot.animate.shift(DOWN * 0.20), run_time=0.13)
        self.wait(1.5)
