"""
Equivalent Fractions — 1/2 = 2/4 = 3/6 (Grade 4)
Run: manim -qm equivalent_fractions.py Lesson
"""
from manim import *
import numpy as np

# ── Palette ───────────────────────────────────────────────────
BG       = "#FFF4D6"
INK      = "#2D2013"
PINK     = "#FF6FA3"
SKY      = "#4FC3F7"
GRASS    = "#56C42A"
SUN      = "#FFD23F"
GRAPE    = "#9B59D0"
ORANGE   = "#FF8C42"
PANEL_BG = "#E8D5A3"

config.background_color = BG

def T(s, size=40, color=INK):
    return Text(s, font_size=size, color=color, weight=BOLD)

def build_mascot():
    star = Star(n=5, outer_radius=0.5, inner_radius=0.22,
                color=SUN, fill_opacity=1, stroke_color=INK, stroke_width=3)
    el = Dot(star.get_center() + LEFT*0.1 + UP*0.07, radius=0.04, color=INK)
    er = Dot(star.get_center() + RIGHT*0.1 + UP*0.07, radius=0.04, color=INK)
    sm = Arc(radius=0.10, start_angle=PI+0.45, angle=PI-0.9,
             color=INK, stroke_width=3).move_to(star.get_center() + DOWN*0.04)
    return VGroup(star, el, er, sm)


def build_bar(total_parts, shaded_parts, bar_width, bar_height, shade_color, x_center, y_center):
    """Build a fraction bar with exact cell shading. Returns (bar_group, cells_group)."""
    cell_w = bar_width / total_parts
    left_x = x_center - bar_width / 2

    # Outer border
    border = Rectangle(
        width=bar_width, height=bar_height,
        stroke_color=INK, stroke_width=3
    ).move_to([x_center, y_center, 0])

    # Divider lines
    dividers = VGroup()
    for i in range(1, total_parts):
        x = left_x + i * cell_w
        dividers.add(Line(
            start=[x, y_center + bar_height/2, 0],
            end=[x, y_center - bar_height/2, 0],
            stroke_color=INK, stroke_width=2
        ))

    # Shaded cells
    cells = VGroup()
    for i in range(shaded_parts):
        x = left_x + (i + 0.5) * cell_w
        cell = Rectangle(
            width=cell_w, height=bar_height,
            fill_color=shade_color, fill_opacity=0.5,
            stroke_width=0
        ).move_to([x, y_center, 0])
        cells.add(cell)

    bar_group = VGroup(border, dividers)
    return bar_group, cells


class Lesson(Scene):
    """Show that 1/2 = 2/4 = 3/6 using bar models."""

    BAR_W = 8.0
    BAR_H = 0.65
    CENTER_X = 0.0

    # Three rows: pushed higher to leave room for equation + banner below
    ROW_Y = [2.2, 0.6, -1.0]  # top, middle, bottom

    FRACTIONS = [
        (2, 1, SKY,   r"\frac{1}{2}"),
        (4, 2, PINK,  r"\frac{2}{4}"),
        (6, 3, GRAPE, r"\frac{3}{6}"),
    ]

    def construct(self):
        self.mascot = build_mascot().to_corner(UL, buff=0.4)
        self.play(FadeIn(self.mascot, scale=0.5), run_time=0.4)

        self.intro()
        self.show_half()
        self.show_two_fourths()
        self.show_three_sixths()
        self.show_equality()
        self.celebrate()

    # ── Phase 1: Title ────────────────────────────────────────
    def intro(self):
        # Step 1: Introduce the concept
        title = T("Equivalent Fractions", size=44, color=PINK)
        sub = T("Same amount, different names!", size=28, color=SKY)
        group = VGroup(title, sub).arrange(DOWN, buff=0.4)
        self.play(Write(title), run_time=0.8)
        self.play(FadeIn(sub, shift=UP*0.2), run_time=0.5)
        self.wait(1.5)
        self.play(FadeOut(group), run_time=0.5)
        self.wait(0.3)

    # ── Phase 2: Show 1/2 ────────────────────────────────────
    def show_half(self):
        # Step 2: Show one-half
        total, shaded, color, latex = self.FRACTIONS[0]
        y = self.ROW_Y[0]

        bar, cells = build_bar(total, shaded, self.BAR_W, self.BAR_H, color, self.CENTER_X, y)
        frac_lbl = MathTex(latex, font_size=40, color=color)
        frac_lbl.move_to([self.CENTER_X - self.BAR_W/2 - 0.8, y, 0])

        self.play(Create(bar), run_time=0.5)
        self.play(
            LaggedStart(*[FadeIn(c) for c in cells], lag_ratio=0.1),
            run_time=0.5
        )
        self.play(Write(frac_lbl), run_time=0.4)
        self.wait(1.0)

        self.bars = [VGroup(bar, cells)]
        self.frac_lbls = [frac_lbl]

    # ── Phase 3: Show 2/4 ────────────────────────────────────
    def show_two_fourths(self):
        # Step 3: Show two-fourths
        total, shaded, color, latex = self.FRACTIONS[1]
        y = self.ROW_Y[1]

        bar, cells = build_bar(total, shaded, self.BAR_W, self.BAR_H, color, self.CENTER_X, y)
        frac_lbl = MathTex(latex, font_size=40, color=color)
        frac_lbl.move_to([self.CENTER_X - self.BAR_W/2 - 0.8, y, 0])

        self.play(Create(bar), run_time=0.5)
        self.play(
            LaggedStart(*[FadeIn(c) for c in cells], lag_ratio=0.1),
            run_time=0.5
        )
        self.play(Write(frac_lbl), run_time=0.4)
        self.wait(1.0)

        self.bars.append(VGroup(bar, cells))
        self.frac_lbls.append(frac_lbl)

    # ── Phase 4: Show 3/6 ────────────────────────────────────
    def show_three_sixths(self):
        # Step 4: Show three-sixths
        total, shaded, color, latex = self.FRACTIONS[2]
        y = self.ROW_Y[2]

        bar, cells = build_bar(total, shaded, self.BAR_W, self.BAR_H, color, self.CENTER_X, y)
        frac_lbl = MathTex(latex, font_size=40, color=color)
        frac_lbl.move_to([self.CENTER_X - self.BAR_W/2 - 0.8, y, 0])

        self.play(Create(bar), run_time=0.5)
        self.play(
            LaggedStart(*[FadeIn(c) for c in cells], lag_ratio=0.1),
            run_time=0.5
        )
        self.play(Write(frac_lbl), run_time=0.4)
        self.wait(1.0)

        self.bars.append(VGroup(bar, cells))
        self.frac_lbls.append(frac_lbl)

    # ── Phase 5: Show they're equal ───────────────────────────
    def show_equality(self):
        # Step 5: They're all the same!
        # Draw vertical dashed lines at the halfway mark to show alignment
        half_x = self.CENTER_X
        line = DashedLine(
            start=[half_x, self.ROW_Y[0] + self.BAR_H/2 + 0.15, 0],
            end=[half_x, self.ROW_Y[2] - self.BAR_H/2 - 0.15, 0],
            color=GRASS, stroke_width=4, dash_length=0.15
        )
        self.play(Create(line), run_time=0.6)

        # Equality statement — positioned well below the bottom bar
        eq = MathTex(
            r"\frac{1}{2}", r"=", r"\frac{2}{4}", r"=", r"\frac{3}{6}",
            font_size=48, color=INK
        )
        eq[0].set_color(SKY)
        eq[2].set_color(PINK)
        eq[4].set_color(GRAPE)
        eq.move_to(DOWN * 2.4)

        self.play(Write(eq), run_time=0.8)

        box = SurroundingRectangle(eq, color=GRASS, buff=0.2,
                                    stroke_width=3, corner_radius=0.12)
        self.play(Create(box), run_time=0.3)

        # Bounce
        self.play(self.mascot.animate.shift(UP*0.2), run_time=0.15)
        self.play(self.mascot.animate.shift(DOWN*0.2), run_time=0.15)
        self.wait(1.5)

        self.eq = eq
        self.eq_box = box
        self.half_line = line

    # ── Phase 6: Celebrate ────────────────────────────────────
    def celebrate(self):
        # Step 6: Celebration
        banner = RoundedRectangle(
            width=10.5, height=0.9, corner_radius=0.3,
            fill_color=SUN, fill_opacity=0.5,
            stroke_color=PINK, stroke_width=4
        )
        banner.to_edge(DOWN, buff=0.1)
        cheer = T("Same amount — just different names!", size=26, color=INK)
        cheer.move_to(banner)

        self.play(
            FadeOut(self.eq), FadeOut(self.eq_box),
            FadeIn(banner, scale=0.9), Write(cheer),
            run_time=0.6
        )

        for _ in range(2):
            self.play(self.mascot.animate.shift(UP*0.2), run_time=0.12)
            self.play(self.mascot.animate.shift(DOWN*0.2), run_time=0.12)

        colors = [SUN, SKY, GRASS, PINK, GRAPE, ORANGE]
        np.random.seed(42)
        sparkles = VGroup(*[
            Star(n=5, outer_radius=0.18, inner_radius=0.07,
                 color=colors[i % len(colors)], fill_opacity=1,
                 stroke_color=INK, stroke_width=1.5)
            for i in range(12)
        ])
        for s in sparkles:
            s.move_to([np.random.uniform(-6, 6), np.random.uniform(-3, 3.5), 0])
        self.play(LaggedStart(*[FadeIn(s, scale=2.5) for s in sparkles], lag_ratio=0.06), run_time=0.8)

        self.wait(3)
