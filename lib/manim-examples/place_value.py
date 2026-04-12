"""
Place Value with Base-Ten Blocks — What is 347? (Grade 3)
Run: manim -qm place_value.py Lesson
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


def build_hundred_flat(x, y, color):
    """A 10×10 grid representing 100."""
    S = 0.14  # cell size
    flat = VGroup()
    # Background fill
    bg = Rectangle(
        width=10*S, height=10*S,
        fill_color=color, fill_opacity=0.4,
        stroke_color=INK, stroke_width=2
    ).move_to([x, y, 0])
    flat.add(bg)
    # Grid lines
    for i in range(1, 10):
        flat.add(Line(
            [bg.get_left()[0] + i*S, bg.get_top()[1], 0],
            [bg.get_left()[0] + i*S, bg.get_bottom()[1], 0],
            stroke_color=INK, stroke_width=0.8
        ))
        flat.add(Line(
            [bg.get_left()[0], bg.get_top()[1] - i*S, 0],
            [bg.get_right()[0], bg.get_top()[1] - i*S, 0],
            stroke_color=INK, stroke_width=0.8
        ))
    return flat


def build_ten_rod(x, y, color):
    """A 1×10 rod representing 10."""
    S = 0.14
    rod = VGroup()
    bg = Rectangle(
        width=S, height=10*S,
        fill_color=color, fill_opacity=0.5,
        stroke_color=INK, stroke_width=2
    ).move_to([x, y, 0])
    rod.add(bg)
    for i in range(1, 10):
        rod.add(Line(
            [bg.get_left()[0], bg.get_top()[1] - i*S, 0],
            [bg.get_right()[0], bg.get_top()[1] - i*S, 0],
            stroke_color=INK, stroke_width=0.8
        ))
    return rod


def build_one_unit(x, y, color):
    """A single unit cube."""
    S = 0.14
    return Rectangle(
        width=S, height=S,
        fill_color=color, fill_opacity=0.6,
        stroke_color=INK, stroke_width=2
    ).move_to([x, y, 0])


class Lesson(Scene):
    """Break down 347 into hundreds, tens, and ones with base-ten blocks."""

    def construct(self):
        self.mascot = build_mascot().to_corner(UL, buff=0.4)
        self.play(FadeIn(self.mascot, scale=0.5), run_time=0.4)

        self.intro()
        self.show_hundreds()
        self.show_tens()
        self.show_ones()
        self.show_equation()
        self.celebrate()

    # ── Phase 1: Title ────────────────────────────────────────
    def intro(self):
        # Step 1: Introduce the number
        title = T("Place Value", size=44, color=PINK)
        number = T("347", size=64, color=INK)
        sub = T("Let's break it apart!", size=26, color=SKY)
        group = VGroup(title, number, sub).arrange(DOWN, buff=0.4)
        self.play(Write(title), run_time=0.6)
        self.play(FadeIn(number, scale=1.3), run_time=0.5)
        self.play(FadeIn(sub, shift=UP*0.2), run_time=0.4)
        self.wait(1.5)
        self.play(FadeOut(group), run_time=0.5)

    # ── Phase 2: Hundreds ─────────────────────────────────────
    def show_hundreds(self):
        # Step 2: 3 hundreds = 300
        header = T("Hundreds", size=32, color=SKY)
        header.to_edge(UP, buff=0.35)
        self.play(Write(header), run_time=0.4)

        # Three flats side by side
        flats = VGroup()
        start_x = -3.0
        for i in range(3):
            flat = build_hundred_flat(start_x + i * 1.8, 0.5, SKY)
            flats.add(flat)

        self.play(
            LaggedStart(*[FadeIn(f, scale=0.8) for f in flats], lag_ratio=0.15),
            run_time=0.8
        )

        lbl = MathTex(r"3 \times 100 = 300", font_size=40, color=SKY)
        lbl.move_to(DOWN * 1.2)
        self.play(Write(lbl), run_time=0.5)
        self.wait(1.5)

        # Shrink and park left
        hundreds_group = VGroup(flats, lbl)
        target = VGroup(flats.copy().scale(0.45), lbl.copy().scale(0.6))
        target.arrange(DOWN, buff=0.15)
        target.move_to(LEFT * 4.5 + DOWN * 0.5)

        self.play(
            FadeOut(header),
            flats.animate.scale(0.45).move_to(LEFT * 4.5 + UP * 0.2),
            lbl.animate.scale(0.6).move_to(LEFT * 4.5 + DOWN * 0.7),
            run_time=0.6
        )
        self.wait(0.3)
        self.hundreds_flats = flats
        self.hundreds_lbl = lbl

    # ── Phase 3: Tens ─────────────────────────────────────────
    def show_tens(self):
        # Step 3: 4 tens = 40
        header = T("Tens", size=32, color=ORANGE)
        header.to_edge(UP, buff=0.35)
        self.play(Write(header), run_time=0.4)

        rods = VGroup()
        start_x = -1.0
        for i in range(4):
            rod = build_ten_rod(start_x + i * 0.5, 0.5, ORANGE)
            rods.add(rod)

        self.play(
            LaggedStart(*[FadeIn(r, scale=0.8) for r in rods], lag_ratio=0.12),
            run_time=0.6
        )

        lbl = MathTex(r"4 \times 10 = 40", font_size=40, color=ORANGE)
        lbl.move_to(DOWN * 1.2)
        self.play(Write(lbl), run_time=0.5)
        self.wait(1.5)

        # Shrink and park center
        self.play(
            FadeOut(header),
            rods.animate.scale(0.55).move_to(DOWN * 0.2),
            lbl.animate.scale(0.6).move_to(DOWN * 1.2),
            run_time=0.6
        )
        self.wait(0.3)
        self.tens_rods = rods
        self.tens_lbl = lbl

    # ── Phase 4: Ones ─────────────────────────────────────────
    def show_ones(self):
        # Step 4: 7 ones = 7
        header = T("Ones", size=32, color=GRASS)
        header.to_edge(UP, buff=0.35)
        self.play(Write(header), run_time=0.4)

        units = VGroup()
        start_x = 3.5
        for i in range(7):
            row = i // 4
            col = i % 4
            unit = build_one_unit(start_x + col * 0.3, 0.7 - row * 0.3, GRASS)
            units.add(unit)

        self.play(
            LaggedStart(*[FadeIn(u, scale=0.5) for u in units], lag_ratio=0.08),
            run_time=0.5
        )

        lbl = MathTex(r"7 \times 1 = 7", font_size=40, color=GRASS)
        lbl.move_to(RIGHT * 4 + DOWN * 1.2)
        self.play(Write(lbl), run_time=0.5)
        self.wait(1.0)

        # Park right
        self.play(
            FadeOut(header),
            units.animate.scale(0.7).move_to(RIGHT * 4.5 + UP * 0.2),
            lbl.animate.scale(0.6).move_to(RIGHT * 4.5 + DOWN * 0.7),
            run_time=0.6
        )
        self.wait(0.3)
        self.ones_units = units
        self.ones_lbl = lbl

    # ── Phase 5: Full equation ────────────────────────────────
    def show_equation(self):
        # Step 5: Put it all together
        eq = MathTex(
            r"300", r"+", r"40", r"+", r"7", r"=", r"347",
            font_size=48, color=INK
        )
        eq[0].set_color(SKY)
        eq[2].set_color(ORANGE)
        eq[4].set_color(GRASS)
        eq[6].set_color(PINK)
        eq.move_to(DOWN * 2.5)

        self.play(Write(eq), run_time=0.8)

        box = SurroundingRectangle(eq[6], color=PINK, buff=0.15,
                                    stroke_width=3, corner_radius=0.1)
        self.play(Create(box), run_time=0.3)
        self.play(eq[6].animate.scale(1.3), run_time=0.2)
        self.play(eq[6].animate.scale(1/1.3), run_time=0.2)

        # Bounce
        self.play(self.mascot.animate.shift(UP*0.2), run_time=0.15)
        self.play(self.mascot.animate.shift(DOWN*0.2), run_time=0.15)
        self.wait(1.5)

        self.equation = eq
        self.eq_box = box

    # ── Phase 6: Celebrate ────────────────────────────────────
    def celebrate(self):
        # Step 6: Celebration
        banner = RoundedRectangle(
            width=10, height=0.9, corner_radius=0.3,
            fill_color=SUN, fill_opacity=0.5,
            stroke_color=PINK, stroke_width=4
        )
        banner.to_edge(DOWN, buff=0.1)
        cheer = T("347 = 3 hundreds + 4 tens + 7 ones!", size=26, color=INK)
        cheer.move_to(banner)

        self.play(FadeIn(banner, scale=0.9), Write(cheer), run_time=0.6)

        for _ in range(2):
            self.play(self.mascot.animate.shift(UP*0.2), run_time=0.12)
            self.play(self.mascot.animate.shift(DOWN*0.2), run_time=0.12)

        colors = [SUN, SKY, GRASS, PINK, GRAPE, ORANGE]
        np.random.seed(13)
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
