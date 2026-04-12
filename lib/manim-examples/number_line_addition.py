"""
Number Line Addition — 3 + 5 = 8 (Grade 2)
Run: manim -qm number_line_addition.py Lesson
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


class Lesson(Scene):
    """Addition on a number line: 3 + 5 = 8."""

    def construct(self):
        self.mascot = build_mascot().to_corner(UL, buff=0.4)
        self.play(FadeIn(self.mascot, scale=0.5), run_time=0.4)

        self.intro()
        self.draw_number_line()
        self.show_start()
        self.hop_forward()
        self.show_answer()
        self.celebrate()

    # ── Phase 1: Title ────────────────────────────────────────
    def intro(self):
        # Step 1: Introduce the problem
        title = T("Adding on a Number Line", size=44, color=PINK)
        problem = MathTex(r"3 + 5 = \;?", font_size=56, color=INK)
        group = VGroup(title, problem).arrange(DOWN, buff=0.5)
        self.play(Write(title), run_time=0.8)
        self.play(FadeIn(problem, shift=UP*0.3), run_time=0.6)
        self.wait(1.5)
        self.play(FadeOut(title), problem.animate.scale(0.65).to_edge(UP, buff=0.3), run_time=0.6)
        self.problem = problem
        self.wait(0.5)

    # ── Phase 2: Draw the number line ─────────────────────────
    def draw_number_line(self):
        # Step 2: Create the number line
        nl = NumberLine(
            x_range=[0, 10, 1],
            length=11,
            color=INK,
            include_numbers=True,
            numbers_to_include=range(0, 11),
            font_size=28,
            stroke_width=3,
            tick_size=0.15,
        )
        nl.move_to(DOWN * 0.5)
        # Color the numbers
        for num_mob in nl.numbers:
            num_mob.set_color(INK)
            num_mob.set(weight=BOLD)

        self.play(Create(nl), run_time=1.0)
        self.wait(1.0)
        self.nl = nl

    # ── Phase 3: Place the starting dot ───────────────────────
    def show_start(self):
        # Step 3: Start at 3
        pos_3 = self.nl.number_to_point(3)
        dot = Dot(pos_3, radius=0.18, color=SKY, fill_opacity=1,
                  stroke_color=INK, stroke_width=3)
        lbl = T("Start at 3", size=24, color=SKY)
        lbl.next_to(dot, UP, buff=0.35)

        self.play(GrowFromCenter(dot), run_time=0.4)
        self.play(Write(lbl), run_time=0.4)
        self.wait(1.0)

        self.dot = dot
        self.start_lbl = lbl

    # ── Phase 4: Hop forward 5 times ──────────────────────────
    def hop_forward(self):
        # Step 4: Jump 5 spaces forward
        self.play(FadeOut(self.start_lbl), run_time=0.3)

        hop_arcs = VGroup()
        hop_labels = VGroup()
        colors = [PINK, ORANGE, GRAPE, GRASS, SKY]

        for i in range(5):
            start_val = 3 + i
            end_val = 3 + i + 1
            start_pt = self.nl.number_to_point(start_val)
            end_pt = self.nl.number_to_point(end_val)

            # Arc hop
            arc = ArcBetweenPoints(
                start_pt + UP * 0.05,
                end_pt + UP * 0.05,
                angle=-PI * 0.7,
                color=colors[i],
                stroke_width=4,
            )
            # Hop number label
            mid = arc.point_from_proportion(0.5)
            lbl = T(f"+1", size=20, color=colors[i])
            lbl.move_to(mid + UP * 0.25)

            self.play(Create(arc), FadeIn(lbl, scale=0.5), run_time=0.35)
            hop_arcs.add(arc)
            hop_labels.add(lbl)

        # Move the dot to 8
        pos_8 = self.nl.number_to_point(8)
        self.play(self.dot.animate.move_to(pos_8), run_time=0.5)

        # Label "5 hops"
        brace = Brace(hop_arcs, UP, color=ORANGE, buff=0.45)
        brace_lbl = T("+5", size=28, color=ORANGE)
        brace_lbl.next_to(brace, UP, buff=0.15)
        self.play(GrowFromCenter(brace), Write(brace_lbl), run_time=0.5)
        self.wait(1.0)

        self.hop_arcs = hop_arcs
        self.hop_labels = hop_labels
        self.brace = brace
        self.brace_lbl = brace_lbl

    # ── Phase 5: Show the answer ──────────────────────────────
    def show_answer(self):
        # Step 5: We land on 8!
        pos_8 = self.nl.number_to_point(8)
        landing_lbl = T("We land on 8!", size=28, color=GRASS)
        landing_lbl.next_to(self.dot, DOWN, buff=0.45)

        answer = MathTex(r"3 + 5 = 8", font_size=52, color=INK)
        answer.next_to(self.nl, DOWN, buff=1.2)

        # Highlight the dot
        ring = Circle(radius=0.3, color=GRASS, stroke_width=5).move_to(pos_8)
        self.play(Create(ring), Write(landing_lbl), run_time=0.5)
        self.wait(0.5)

        self.play(
            ReplacementTransform(self.problem.copy(), answer),
            run_time=0.7
        )

        box = SurroundingRectangle(answer, color=PINK, buff=0.2,
                                    stroke_width=3, corner_radius=0.12)
        self.play(Create(box), run_time=0.3)
        self.wait(1.0)

        # Bounce mascot
        self.play(self.mascot.animate.shift(UP*0.2), run_time=0.15)
        self.play(self.mascot.animate.shift(DOWN*0.2), run_time=0.15)

        self.answer = answer
        self.answer_box = box

    # ── Phase 6: Celebrate ────────────────────────────────────
    def celebrate(self):
        # Step 6: Celebration
        banner = RoundedRectangle(
            width=10, height=1.0, corner_radius=0.3,
            fill_color=SUN, fill_opacity=0.5,
            stroke_color=PINK, stroke_width=4
        )
        banner.to_edge(DOWN, buff=0.15)
        cheer = T("Three plus five equals eight!", size=28, color=INK)
        cheer.move_to(banner)

        self.play(FadeIn(banner, scale=0.9), Write(cheer), run_time=0.6)

        for _ in range(2):
            self.play(self.mascot.animate.shift(UP*0.2), run_time=0.12)
            self.play(self.mascot.animate.shift(DOWN*0.2), run_time=0.12)

        colors = [SUN, SKY, GRASS, PINK, GRAPE, ORANGE]
        np.random.seed(7)
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
