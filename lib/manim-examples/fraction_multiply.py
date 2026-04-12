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


class Lesson(Scene):
    """Multiply fractions 2/3 × 3/4 with a precise area model."""

    # Grid geometry — all layout derived from these constants
    COLS = 4          # denominator of 3/4
    ROWS = 3          # denominator of 2/3
    CELL = 0.75       # cell size in scene units
    SHADE_COLS = 3    # numerator of 3/4
    SHADE_ROWS = 2    # numerator of 2/3

    def construct(self):
        self.mascot = build_mascot().to_corner(UL, buff=0.4)
        self.play(FadeIn(self.mascot, scale=0.5), run_time=0.4)

        self.intro()
        self.build_grid()
        self.shade_columns()    # 3/4
        self.shade_rows()       # 2/3
        self.show_overlap()     # 6/12
        self.show_answer()
        self.celebrate()

    # ── Phase 1: Title ────────────────────────────────────────
    def intro(self):
        # Step 1: Introduce the problem
        title = T("Multiplying Fractions", size=44, color=PINK)
        problem = MathTex(
            r"\frac{2}{3}", r"\times", r"\frac{3}{4}", r"= \;?",
            font_size=52, color=INK
        )
        problem[1].set_color(ORANGE)
        group = VGroup(title, problem).arrange(DOWN, buff=0.5)
        self.play(Write(title), run_time=0.8)
        self.play(FadeIn(problem, shift=UP*0.3), run_time=0.6)
        self.wait(1.5)
        self.play(FadeOut(title), problem.animate.scale(0.7).to_edge(UP, buff=0.35), run_time=0.6)
        self.problem = problem
        self.wait(0.5)

    # ── Phase 2: Build the grid ───────────────────────────────
    def build_grid(self):
        # Step 2: Create the area model
        C, R, S = self.COLS, self.ROWS, self.CELL
        w, h = C * S, R * S

        # Outer rectangle
        outer = Rectangle(width=w, height=h, stroke_color=INK, stroke_width=3)

        # Internal grid lines
        lines = VGroup()
        # Vertical lines (COLS - 1)
        for i in range(1, C):
            x = outer.get_left()[0] + i * S
            lines.add(Line(
                start=[x, outer.get_top()[1], 0],
                end=[x, outer.get_bottom()[1], 0],
                stroke_color=INK, stroke_width=2
            ))
        # Horizontal lines (ROWS - 1)
        for j in range(1, R):
            y = outer.get_top()[1] - j * S
            lines.add(Line(
                start=[outer.get_left()[0], y, 0],
                end=[outer.get_right()[0], y, 0],
                stroke_color=INK, stroke_width=2
            ))

        self.grid = VGroup(outer, lines)
        self.grid.move_to(DOWN * 0.3)
        self.outer = outer

        # Column labels (fourths)
        col_labels = VGroup()
        for i in range(C):
            x = outer.get_left()[0] + (i + 0.5) * S
            y = outer.get_top()[1] + 0.3
            lbl = MathTex(f"{i+1}", font_size=24, color=INK).move_to([x, y, 0])
            col_labels.add(lbl)

        # Row labels (thirds)
        row_labels = VGroup()
        for j in range(R):
            x = outer.get_left()[0] - 0.35
            y = outer.get_top()[1] - (j + 0.5) * S
            lbl = MathTex(f"{j+1}", font_size=24, color=INK).move_to([x, y, 0])
            row_labels.add(lbl)

        # Fraction labels on edges — wide buff to avoid overlapping row/col numbers
        col_frac = MathTex(r"\frac{3}{4}", font_size=32, color=SKY)
        col_frac.next_to(outer, UP, buff=0.55)
        row_frac = MathTex(r"\frac{2}{3}", font_size=32, color=PINK)
        row_frac.next_to(outer, LEFT, buff=0.9)

        self.play(Create(outer), run_time=0.6)
        self.play(Create(lines), run_time=0.5)
        self.play(
            LaggedStart(*[FadeIn(l, scale=0.5) for l in col_labels], lag_ratio=0.1),
            LaggedStart(*[FadeIn(l, scale=0.5) for l in row_labels], lag_ratio=0.1),
            run_time=0.5
        )
        self.play(Write(col_frac), Write(row_frac), run_time=0.5)
        self.wait(1.0)

        self.col_labels = col_labels
        self.row_labels = row_labels
        self.col_frac = col_frac
        self.row_frac = row_frac

    # ── Phase 3: Shade 3/4 (columns) ─────────────────────────
    def shade_columns(self):
        # Step 3: Shade three-fourths
        S = self.CELL
        cells = VGroup()
        for i in range(self.SHADE_COLS):
            for j in range(self.ROWS):
                x = self.outer.get_left()[0] + (i + 0.5) * S
                y = self.outer.get_top()[1] - (j + 0.5) * S
                cell = Rectangle(
                    width=S, height=S,
                    fill_color=SKY, fill_opacity=0.3,
                    stroke_width=0
                ).move_to([x, y, 0])
                cells.add(cell)

        lbl = T("3 out of 4 columns", size=24, color=SKY)
        lbl.next_to(self.outer, DOWN, buff=0.4)

        self.play(
            LaggedStart(*[FadeIn(c) for c in cells], lag_ratio=0.04),
            run_time=0.8
        )
        self.play(Write(lbl), run_time=0.4)
        self.wait(1.0)

        self.col_shade = cells
        self.col_lbl = lbl

    # ── Phase 4: Shade 2/3 (rows) ────────────────────────────
    def shade_rows(self):
        # Step 4: Shade two-thirds
        S = self.CELL
        cells = VGroup()
        for j in range(self.SHADE_ROWS):
            for i in range(self.COLS):
                x = self.outer.get_left()[0] + (i + 0.5) * S
                y = self.outer.get_top()[1] - (j + 0.5) * S
                cell = Rectangle(
                    width=S, height=S,
                    fill_color=PINK, fill_opacity=0.25,
                    stroke_width=0
                ).move_to([x, y, 0])
                cells.add(cell)

        lbl = T("2 out of 3 rows", size=24, color=PINK)
        lbl.next_to(self.col_lbl, DOWN, buff=0.2)

        self.play(
            LaggedStart(*[FadeIn(c) for c in cells], lag_ratio=0.04),
            run_time=0.8
        )
        self.play(Write(lbl), run_time=0.4)
        self.wait(1.0)

        self.row_shade = cells
        self.row_lbl = lbl

    # ── Phase 5: Highlight the overlap ────────────────────────
    def show_overlap(self):
        # Step 5: Find the overlap
        S = self.CELL

        # Fade out the individual column/row shading
        self.play(FadeOut(self.col_shade), FadeOut(self.row_shade), run_time=0.4)

        # Draw overlap cells with a strong color
        overlap_cells = VGroup()
        for i in range(self.SHADE_COLS):
            for j in range(self.SHADE_ROWS):
                x = self.outer.get_left()[0] + (i + 0.5) * S
                y = self.outer.get_top()[1] - (j + 0.5) * S
                cell = Rectangle(
                    width=S, height=S,
                    fill_color=GRASS, fill_opacity=0.55,
                    stroke_color=GRASS, stroke_width=2
                ).move_to([x, y, 0])
                overlap_cells.add(cell)

        # Update labels
        self.play(FadeOut(self.col_lbl), FadeOut(self.row_lbl), run_time=0.3)

        count_lbl = T("6 cells overlap out of 12 total", size=26, color=GRASS)
        count_lbl.next_to(self.outer, DOWN, buff=0.4)

        self.play(
            LaggedStart(*[GrowFromCenter(c) for c in overlap_cells], lag_ratio=0.06),
            run_time=0.8
        )
        self.play(Write(count_lbl), run_time=0.5)

        # Bounce mascot
        self.play(self.mascot.animate.shift(UP*0.2), run_time=0.15)
        self.play(self.mascot.animate.shift(DOWN*0.2), run_time=0.15)
        self.wait(1.0)

        self.overlap_cells = overlap_cells
        self.count_lbl = count_lbl

    # ── Phase 6: Show the answer ──────────────────────────────
    def show_answer(self):
        # Step 6: Conclusion
        self.play(FadeOut(self.count_lbl), run_time=0.3)

        answer = MathTex(
            r"\frac{2}{3}", r"\times", r"\frac{3}{4}",
            r"=", r"\frac{6}{12}", r"=", r"\frac{1}{2}",
            font_size=48, color=INK
        )
        answer[1].set_color(ORANGE)
        answer[4].set_color(GRASS)
        answer[6].set_color(PINK)
        answer.next_to(self.outer, DOWN, buff=0.5)

        # Transform the problem into the full answer
        self.play(
            ReplacementTransform(self.problem.copy(), answer[:4]),
            run_time=0.7
        )
        self.play(Write(answer[4]), run_time=0.5)
        self.wait(0.5)
        self.play(Write(answer[5:]), run_time=0.5)

        # Highlight the final answer
        box = SurroundingRectangle(answer[6], color=PINK, buff=0.15,
                                    stroke_width=3, corner_radius=0.1)
        self.play(Create(box), run_time=0.3)
        self.play(answer[6].animate.scale(1.3), run_time=0.2)
        self.play(answer[6].animate.scale(1/1.3), run_time=0.2)
        self.wait(1.0)

        self.answer = answer
        self.answer_box = box

    # ── Phase 7: Celebrate ────────────────────────────────────
    def celebrate(self):
        # Step 7: Celebration
        banner = RoundedRectangle(
            width=10, height=1.0, corner_radius=0.3,
            fill_color=SUN, fill_opacity=0.5,
            stroke_color=PINK, stroke_width=4
        )
        banner.to_edge(DOWN, buff=0.2)
        cheer = T("Two-thirds times three-fourths equals one-half!", size=28, color=INK)
        cheer.move_to(banner)

        self.play(FadeIn(banner, scale=0.9), Write(cheer), run_time=0.6)

        # Mascot bounces
        for _ in range(2):
            self.play(self.mascot.animate.shift(UP*0.2), run_time=0.12)
            self.play(self.mascot.animate.shift(DOWN*0.2), run_time=0.12)

        # Sparkles
        colors = [SUN, SKY, GRASS, PINK, GRAPE, ORANGE]
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
