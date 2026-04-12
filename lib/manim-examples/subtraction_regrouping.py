"""
Subtraction with Regrouping — 42 − 17 = 25 (Grade 2)
Run: manim -qm subtraction_regrouping.py Lesson
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


# ── Block helpers ─────────────────────────────────────────────
BLOCK_S = 0.28   # unit cube size
ROD_GAP = 0.12   # gap between rods

def build_rod(x, y, color):
    """A 1×10 rod representing 10, drawn as stacked unit squares."""
    rod = VGroup()
    for i in range(10):
        sq = Square(
            side_length=BLOCK_S,
            fill_color=color, fill_opacity=0.5,
            stroke_color=INK, stroke_width=1.5
        ).move_to([x, y + (i - 4.5) * BLOCK_S, 0])
        rod.add(sq)
    return rod

def build_unit(x, y, color):
    """A single unit cube."""
    return Square(
        side_length=BLOCK_S,
        fill_color=color, fill_opacity=0.6,
        stroke_color=INK, stroke_width=1.5
    ).move_to([x, y, 0])


class Lesson(Scene):
    """Subtraction with regrouping: 42 − 17 = 25 using base-ten blocks.

    Layout strategy:
    ┌─────────────────────────────────────┐
    │  Tens (rods)  │  │  Ones (cubes)    │
    │  left side    │  │  right side      │
    │  x: -5 to -1  │  │  x: 1 to 5      │
    └─────────────────────────────────────┘
    Divider at x=0. This keeps everything within the ±7.1 frame.
    Units are arranged in a 2-wide grid (max 6 rows × 2 cols = 12 units)
    so they never exceed ~1.5 units wide.
    """

    # Column centers
    TENS_X = -3.5
    ONES_X = 2.5
    BLOCKS_Y = 0.0   # vertical center of block area

    def construct(self):
        self.mascot = build_mascot().to_corner(UL, buff=0.4)
        self.play(FadeIn(self.mascot, scale=0.5), run_time=0.4)

        self.intro()
        self.show_42()
        self.regroup()
        self.subtract_ones()
        self.subtract_tens()
        self.show_answer()
        self.celebrate()

    # ── Phase 1: Title ────────────────────────────────────────
    def intro(self):
        title = T("Subtraction with Regrouping", size=42, color=PINK)
        problem = MathTex(r"42 - 17 = \;?", font_size=52, color=INK)
        group = VGroup(title, problem).arrange(DOWN, buff=0.5)
        self.play(Write(title), run_time=0.8)
        self.play(FadeIn(problem, shift=UP*0.3), run_time=0.6)
        self.wait(1.5)
        self.play(FadeOut(title), problem.animate.scale(0.7).to_edge(UP, buff=0.3), run_time=0.6)
        self.problem = problem
        self.wait(0.3)

    # ── Phase 2: Show 42 as blocks ────────────────────────────
    def show_42(self):
        # Column headers
        tens_hdr = T("Tens", size=28, color=SKY)
        ones_hdr = T("Ones", size=28, color=ORANGE)
        tens_hdr.move_to([self.TENS_X, 3.0, 0])
        ones_hdr.move_to([self.ONES_X, 3.0, 0])

        # Divider
        divider = DashedLine(
            start=[0, 3.3, 0], end=[0, -3.2, 0],
            color=INK, stroke_width=1.5, dash_length=0.15
        )

        self.play(Write(tens_hdr), Write(ones_hdr), Create(divider), run_time=0.5)

        # 4 tens rods
        rods = VGroup()
        for i in range(4):
            x = self.TENS_X - 1.2 + i * (BLOCK_S + ROD_GAP)
            rod = build_rod(x, self.BLOCKS_Y, SKY)
            rods.add(rod)

        self.play(
            LaggedStart(*[FadeIn(r, scale=0.7) for r in rods], lag_ratio=0.12),
            run_time=0.7
        )

        # 2 ones cubes — arranged vertically
        ones = VGroup()
        for i in range(2):
            x = self.ONES_X
            y = self.BLOCKS_Y + 0.5 - i * (BLOCK_S + 0.06)
            unit = build_unit(x, y, ORANGE)
            ones.add(unit)

        self.play(
            LaggedStart(*[FadeIn(u, scale=0.5) for u in ones], lag_ratio=0.1),
            run_time=0.4
        )

        # Count labels
        tens_count = T("4 tens = 40", size=22, color=SKY)
        ones_count = T("2 ones = 2", size=22, color=ORANGE)
        tens_count.move_to([self.TENS_X, -2.5, 0])
        ones_count.move_to([self.ONES_X, -2.5, 0])
        self.play(Write(tens_count), Write(ones_count), run_time=0.4)
        self.wait(1.0)

        self.tens_hdr = tens_hdr
        self.ones_hdr = ones_hdr
        self.divider = divider
        self.rods = rods
        self.ones = ones
        self.tens_count = tens_count
        self.ones_count = ones_count

    # ── Phase 3: Regroup — borrow 1 ten ──────────────────────
    def regroup(self):
        # We need to take away 7 ones, but only have 2.
        # Borrow 1 ten → becomes 10 ones.
        note = T("Can't take 7 from 2 — regroup!", size=24, color=PINK)
        note.move_to([0, -3.3, 0])
        self.play(Write(note), run_time=0.5)
        self.wait(1.0)

        # Highlight the last rod
        last_rod = self.rods[-1]
        hi = SurroundingRectangle(last_rod, color=PINK, buff=0.08,
                                   stroke_width=3, corner_radius=0.06)
        self.play(Create(hi), run_time=0.3)

        # Animate: fade out last rod, create 10 unit cubes in ones column
        # Arrange 10 + 2 existing = 12 ones in a 2-col × 6-row grid
        # Grid: 2 columns, starting at ONES_X - 0.2 and ONES_X + 0.2
        new_ones = VGroup()
        col_offsets = [-0.22, 0.22]
        top_y = self.BLOCKS_Y + 0.85
        for i in range(10):
            row = i // 2
            col = i % 2
            x = self.ONES_X + col_offsets[col]
            y = top_y - row * (BLOCK_S + 0.04)
            unit = build_unit(x, y, GRASS)
            new_ones.add(unit)

        self.play(
            FadeOut(last_rod),
            FadeOut(hi),
            run_time=0.4
        )
        self.play(
            LaggedStart(*[FadeIn(u, scale=0.3) for u in new_ones], lag_ratio=0.04),
            run_time=0.6
        )

        # Remove old 2 ones and reposition all 12 ones in the grid
        self.play(FadeOut(self.ones), run_time=0.3)

        # Add 2 more (the original ones) at bottom of grid
        extra_ones = VGroup()
        for i in range(2):
            idx = 10 + i
            row = idx // 2
            col = idx % 2
            x = self.ONES_X + col_offsets[col]
            y = top_y - row * (BLOCK_S + 0.04)
            unit = build_unit(x, y, ORANGE)
            extra_ones.add(unit)

        self.play(
            LaggedStart(*[FadeIn(u, scale=0.3) for u in extra_ones], lag_ratio=0.06),
            run_time=0.3
        )

        # Update the rods list (now 3 rods)
        self.rods = VGroup(*list(self.rods)[:-1])

        # All 12 ones in order
        self.all_ones = VGroup(*list(new_ones) + list(extra_ones))

        # Update counts
        new_tens_count = T("3 tens = 30", size=22, color=SKY)
        new_ones_count = T("12 ones", size=22, color=ORANGE)
        new_tens_count.move_to([self.TENS_X, -2.5, 0])
        new_ones_count.move_to([self.ONES_X, -2.5, 0])

        self.play(
            ReplacementTransform(self.tens_count, new_tens_count),
            ReplacementTransform(self.ones_count, new_ones_count),
            FadeOut(note),
            run_time=0.5
        )
        self.wait(1.0)

        self.tens_count = new_tens_count
        self.ones_count = new_ones_count

    # ── Phase 4: Subtract 7 ones ──────────────────────────────
    def subtract_ones(self):
        sub_note = T("Take away 7 ones", size=24, color=GRAPE)
        sub_note.move_to([0, -3.3, 0])
        self.play(Write(sub_note), run_time=0.4)

        # Cross out (fade out) the first 7 ones
        to_remove = self.all_ones[:7]
        crosses = VGroup()
        for unit in to_remove:
            c = unit.get_center()
            cross = VGroup(
                Line(c + UL*0.12, c + DR*0.12, color=PINK, stroke_width=3),
                Line(c + UR*0.12, c + DL*0.12, color=PINK, stroke_width=3),
            )
            crosses.add(cross)

        self.play(
            LaggedStart(*[Create(c) for c in crosses], lag_ratio=0.06),
            run_time=0.5
        )
        self.wait(0.5)
        self.play(FadeOut(to_remove), FadeOut(crosses), run_time=0.4)

        # Remaining 5 ones
        remaining_ones = VGroup(*list(self.all_ones)[7:])

        # Reposition remaining 5 ones neatly: 2-col grid
        col_offsets = [-0.22, 0.22]
        top_y = self.BLOCKS_Y + 0.5
        anims = []
        for i, unit in enumerate(remaining_ones):
            row = i // 2
            col = i % 2
            x = self.ONES_X + col_offsets[col]
            y = top_y - row * (BLOCK_S + 0.04)
            anims.append(unit.animate.move_to([x, y, 0]))

        self.play(*anims, run_time=0.5)

        new_ones_count = T("5 ones", size=22, color=ORANGE)
        new_ones_count.move_to([self.ONES_X, -2.5, 0])
        self.play(
            ReplacementTransform(self.ones_count, new_ones_count),
            FadeOut(sub_note),
            run_time=0.4
        )
        self.wait(0.8)

        self.remaining_ones = remaining_ones
        self.ones_count = new_ones_count

    # ── Phase 5: Subtract 1 ten ──────────────────────────────
    def subtract_tens(self):
        sub_note = T("Take away 1 ten", size=24, color=GRAPE)
        sub_note.move_to([0, -3.3, 0])
        self.play(Write(sub_note), run_time=0.4)

        # Cross out last rod
        last_rod = self.rods[-1]
        hi = SurroundingRectangle(last_rod, color=PINK, buff=0.08,
                                   stroke_width=3, corner_radius=0.06)
        self.play(Create(hi), run_time=0.25)
        self.play(FadeOut(last_rod), FadeOut(hi), run_time=0.4)

        self.rods = VGroup(*list(self.rods)[:-1])

        new_tens_count = T("2 tens = 20", size=22, color=SKY)
        new_tens_count.move_to([self.TENS_X, -2.5, 0])
        self.play(
            ReplacementTransform(self.tens_count, new_tens_count),
            FadeOut(sub_note),
            run_time=0.4
        )
        self.wait(0.8)

        self.tens_count = new_tens_count

    # ── Phase 6: Show the answer ──────────────────────────────
    def show_answer(self):
        answer = MathTex(r"42 - 17 = 25", font_size=52, color=INK)
        answer.move_to([0, -3.3, 0])

        self.play(Write(answer), run_time=0.7)

        box = SurroundingRectangle(answer, color=GRASS, buff=0.2,
                                    stroke_width=4, corner_radius=0.12)
        self.play(Create(box), run_time=0.3)
        self.play(answer.animate.scale(1.1), run_time=0.2)
        self.play(answer.animate.scale(1/1.1), run_time=0.2)

        # Bounce
        self.play(self.mascot.animate.shift(UP*0.2), run_time=0.15)
        self.play(self.mascot.animate.shift(DOWN*0.2), run_time=0.15)
        self.wait(1.0)

        self.answer = answer
        self.answer_box = box

    # ── Phase 7: Celebrate ────────────────────────────────────
    def celebrate(self):
        banner = RoundedRectangle(
            width=10, height=0.9, corner_radius=0.3,
            fill_color=SUN, fill_opacity=0.5,
            stroke_color=PINK, stroke_width=4
        )
        banner.to_edge(DOWN, buff=0.1)
        cheer = T("42 minus 17 equals 25!", size=28, color=INK)
        cheer.move_to(banner)

        self.play(
            FadeOut(self.answer), FadeOut(self.answer_box),
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
