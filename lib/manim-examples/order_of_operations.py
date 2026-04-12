"""
Order of Operations — Solve 3 + 4 × 2 (Grade 5)
Run: manim -qm order_of_operations.py Lesson
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
    """Order of operations: 3 + 4 × 2 = 11 (not 14)."""

    STEP_DATA = [
        ("P", "Parentheses", GRAPE),
        ("E", "Exponents",   SKY),
        ("M", "Multiply",    ORANGE),
        ("D", "Divide",      ORANGE),
        ("A", "Add",         GRASS),
        ("S", "Subtract",    GRASS),
    ]

    def construct(self):
        self.mascot = build_mascot().to_corner(UL, buff=0.4)
        self.tracker_boxes = []
        self.tracker_colors = [c for _, _, c in self.STEP_DATA]
        self.play(FadeIn(self.mascot, scale=0.5), run_time=0.4)

        self.intro()
        self.show_pemdas()
        self.show_wrong_way()
        self.show_right_way()
        self.show_answer()
        self.celebrate()

    # ── Tracker ───────────────────────────────────────────────
    def build_tracker(self):
        boxes = []
        for letter, name, _ in self.STEP_DATA:
            rect = RoundedRectangle(
                width=2.4, height=0.52, corner_radius=0.14,
                fill_color=PANEL_BG, fill_opacity=1,
                stroke_color=INK, stroke_width=2.5,
            )
            lbl = Text(f"{letter}  {name}", font_size=20, color=INK, weight=BOLD)
            lbl.move_to(rect)
            boxes.append(VGroup(rect, lbl))
        self.tracker_boxes = boxes
        rows = VGroup(*boxes).arrange(DOWN, buff=0.16)
        title = T("PEMDAS", size=24, color=PINK)
        panel = VGroup(title, rows).arrange(DOWN, buff=0.2)
        panel.move_to(RIGHT * 4.8 + DOWN * 0.3)
        return panel

    def highlight_step(self, idx):
        anims = []
        for i, bg in enumerate(self.tracker_boxes):
            rect, lbl = bg
            if i == idx:
                anims += [rect.animate.set_fill(self.tracker_colors[i], opacity=0.88),
                          lbl.animate.set_color(WHITE)]
            else:
                anims += [rect.animate.set_fill(PANEL_BG, opacity=1),
                          lbl.animate.set_color(INK)]
        self.play(*anims, run_time=0.25)

    def reset_tracker(self):
        anims = []
        for rect, lbl in self.tracker_boxes:
            anims += [rect.animate.set_fill(PANEL_BG, opacity=1),
                      lbl.animate.set_color(INK)]
        if anims:
            self.play(*anims, run_time=0.2)

    # ── Phase 1: Title ────────────────────────────────────────
    def intro(self):
        # Step 1: Introduce the problem
        title = T("Order of Operations", size=44, color=PINK)
        problem = MathTex(r"3 + 4 \times 2 = \;?", font_size=52, color=INK)
        problem[0][4].set_color(ORANGE)  # the ×
        group = VGroup(title, problem).arrange(DOWN, buff=0.5)
        self.play(Write(title), run_time=0.8)
        self.play(FadeIn(problem, shift=UP*0.3), run_time=0.6)
        self.wait(1.5)
        self.play(FadeOut(title), problem.animate.scale(0.75).to_edge(UP, buff=0.3), run_time=0.6)
        self.problem = problem
        self.wait(0.3)

    # ── Phase 2: Show PEMDAS panel ────────────────────────────
    def show_pemdas(self):
        # Step 2: Remember PEMDAS
        tracker = self.build_tracker()
        self.play(FadeIn(tracker, shift=LEFT), run_time=0.5)
        self.wait(1.0)
        self.tracker = tracker

    # ── Phase 3: Show the WRONG way ───────────────────────────
    def show_wrong_way(self):
        # Step 3: The wrong way (left to right)
        wrong_title = T("Wrong way ✗", size=28, color=PINK)
        wrong_title.move_to(LEFT * 2.5 + UP * 1.5)

        step1 = MathTex(r"3 + 4 = 7", font_size=38, color=INK)
        step1.next_to(wrong_title, DOWN, buff=0.5)
        step2 = MathTex(r"7 \times 2 = 14", font_size=38, color=INK)
        step2.next_to(step1, DOWN, buff=0.35)

        cross = VGroup(
            Line(step2.get_corner(UL) + UL*0.1, step2.get_corner(DR) + DR*0.1,
                 color=PINK, stroke_width=5),
            Line(step2.get_corner(UR) + UR*0.1, step2.get_corner(DL) + DL*0.1,
                 color=PINK, stroke_width=5),
        )

        self.play(Write(wrong_title), run_time=0.4)
        self.play(Write(step1), run_time=0.5)
        self.play(Write(step2), run_time=0.5)
        self.play(Create(cross), run_time=0.3)
        self.wait(1.0)

        self.wrong_group = VGroup(wrong_title, step1, step2, cross)

    # ── Phase 4: Show the RIGHT way ───────────────────────────
    def show_right_way(self):
        # Step 4: The right way — multiply first
        # Remove wrong way completely to avoid ghost text
        self.play(FadeOut(self.wrong_group), run_time=0.4)

        right_title = T("Right way ✓", size=28, color=GRASS)
        right_title.move_to(LEFT * 2.5 + UP * 1.5)
        self.play(FadeIn(right_title, shift=DOWN*0.2), run_time=0.4)

        # Highlight multiply step in PEMDAS
        self.highlight_step(2)  # M: Multiply

        # First: 4 × 2 = 8
        step1 = MathTex(r"4 \times 2 = 8", font_size=38, color=ORANGE)
        step1.next_to(right_title, DOWN, buff=0.5)
        # Highlight the multiplication in the original problem
        hi = SurroundingRectangle(
            self.problem, color=ORANGE, buff=0.1, stroke_width=3, corner_radius=0.08
        )
        self.play(Create(hi), run_time=0.25)
        self.play(Write(step1), run_time=0.5)
        self.play(FadeOut(hi), run_time=0.2)
        self.wait(0.5)

        # Then: 3 + 8 = 11
        self.highlight_step(4)  # A: Add
        step2 = MathTex(r"3 + 8 = 11", font_size=38, color=GRASS)
        step2.next_to(step1, DOWN, buff=0.35)
        self.play(Write(step2), run_time=0.5)
        self.wait(0.8)

        self.reset_tracker()
        self.right_title = right_title
        self.right_steps = VGroup(step1, step2)

    # ── Phase 5: Show final answer ────────────────────────────
    def show_answer(self):
        # Step 5: The answer is 11
        answer = MathTex(r"3 + 4 \times 2 = 11", font_size=52, color=INK)
        answer.move_to(DOWN * 2.2)

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

    # ── Phase 6: Celebrate ────────────────────────────────────
    def celebrate(self):
        # Step 6: Celebration
        banner = RoundedRectangle(
            width=10, height=0.9, corner_radius=0.3,
            fill_color=SUN, fill_opacity=0.5,
            stroke_color=PINK, stroke_width=4
        )
        banner.to_edge(DOWN, buff=0.1)
        cheer = T("Multiply before you add!", size=28, color=INK)
        cheer.move_to(banner)

        self.play(FadeIn(banner, scale=0.9), Write(cheer), run_time=0.6)

        for _ in range(2):
            self.play(self.mascot.animate.shift(UP*0.2), run_time=0.12)
            self.play(self.mascot.animate.shift(DOWN*0.2), run_time=0.12)

        colors = [SUN, SKY, GRASS, PINK, GRAPE, ORANGE]
        np.random.seed(99)
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
