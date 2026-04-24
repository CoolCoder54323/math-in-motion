"""
Gold v2: place value for 2nd grade with base-ten blocks.
Prompt: Explain place value, ones, tens, and hundreds, with a concrete example.

Visual QA notes:
- Three lesson bays are fixed by SLOT_XS and share PANEL_CENTER_Y.
- Every block set is a compound VGroup built at the origin, then moved as a whole.
- Labels and equations use fixed y constants; the final equation stays at y=-2.75.
- Callouts are sized from their contents and never depend on fragile VGroup indexes.

Run: manim -qm gold_v2_place_value_blocks.py Lesson
"""

from manim import *
import numpy as np

BG = "#FFF4D6"
INK = "#2D2013"
PINK = "#FF6FA3"
SKY = "#4FC3F7"
GRASS = "#56C42A"
SUN = "#FFD23F"
GRAPE = "#9B59D0"
ORANGE = "#FF8C42"
PANEL_BG = "#E8D5A3"

config.background_color = BG

TITLE_Y = 3.12
SUBTITLE_Y = 2.58
PANEL_CENTER_Y = 0.52
HEADER_Y = 1.86
MODEL_Y = 0.47
VALUE_Y = -1.25
FOOTER_Y = -2.75
CELL = 0.105
SLOT_XS = {"hundreds": -3.85, "tens": 0.0, "ones": 3.85}
PANEL_W = 2.95
PANEL_H = 2.48


def T(s, size=36, color=INK):
    return Text(str(s), font_size=size, color=color, weight=BOLD)


def soft_shadow(mob, opacity=0.16):
    shadow = mob.copy()
    shadow.set_fill(INK, opacity=opacity)
    shadow.set_stroke(INK, opacity=0)
    shadow.shift(0.055 * DOWN + 0.055 * RIGHT)
    return shadow


class LessonCard(VGroup):
    def __init__(self, width, height, accent, label):
        super().__init__()
        shadow = RoundedRectangle(width=width, height=height, corner_radius=0.18, stroke_width=0)
        shadow.set_fill(INK, opacity=0.10).shift(0.07 * DOWN + 0.06 * RIGHT)
        panel = RoundedRectangle(width=width, height=height, corner_radius=0.18, color=INK, stroke_width=2)
        panel.set_fill(PANEL_BG, opacity=0.58)
        ribbon = RoundedRectangle(width=width - 0.34, height=0.34, corner_radius=0.11, color=accent, stroke_width=0)
        ribbon.set_fill(accent, opacity=0.26).move_to(panel.get_top() + DOWN * 0.36)
        header = T(label, 25, accent).move_to(ribbon)
        self.add(shadow, panel, ribbon, header)


class BaseTenFlat(VGroup):
    def __init__(self, fill=SKY):
        super().__init__()
        body = RoundedRectangle(width=10 * CELL, height=10 * CELL, corner_radius=0.035, color=INK, stroke_width=2)
        body.set_fill(fill, opacity=0.58)
        glints = VGroup()
        for alpha, shift in zip(np.linspace(0.08, 0.18, 3), [-0.28, 0.0, 0.28]):
            glint = Line(LEFT * 0.38, RIGHT * 0.38, color=WHITE, stroke_width=2, stroke_opacity=alpha)
            glint.rotate(PI / 7).shift(UP * shift + LEFT * 0.03)
            glints.add(glint)
        grid = VGroup()
        for i in range(1, 10):
            x = -5 * CELL + i * CELL
            y = 5 * CELL - i * CELL
            grid.add(Line([x, 5 * CELL, 0], [x, -5 * CELL, 0], color=INK, stroke_width=0.55, stroke_opacity=0.55))
            grid.add(Line([-5 * CELL, y, 0], [5 * CELL, y, 0], color=INK, stroke_width=0.55, stroke_opacity=0.55))
        self.add(soft_shadow(body, 0.12), body, glints, grid)


class TenRod(VGroup):
    def __init__(self, fill=ORANGE):
        super().__init__()
        body = RoundedRectangle(width=CELL * 1.35, height=10 * CELL, corner_radius=0.025, color=INK, stroke_width=2)
        body.set_fill(fill, opacity=0.68)
        marks = VGroup()
        for i in range(1, 10):
            y = 5 * CELL - i * CELL
            marks.add(Line([-CELL * 0.67, y, 0], [CELL * 0.67, y, 0], color=INK, stroke_width=0.55, stroke_opacity=0.58))
        shine = Line(UP * 0.41, DOWN * 0.41, color=WHITE, stroke_width=2, stroke_opacity=0.17).shift(LEFT * 0.022)
        self.add(soft_shadow(body, 0.12), body, marks, shine)


class OneCube(VGroup):
    def __init__(self, fill=GRASS):
        super().__init__()
        body = RoundedRectangle(width=CELL * 1.45, height=CELL * 1.45, corner_radius=0.022, color=INK, stroke_width=2)
        body.set_fill(fill, opacity=0.74)
        dot = Dot(radius=0.012, color=WHITE).set_opacity(0.42).shift(UP * 0.024 + LEFT * 0.025)
        self.add(soft_shadow(body, 0.11), body, dot)


class ValueBadge(VGroup):
    def __init__(self, title, value, accent):
        super().__init__()
        chip = RoundedRectangle(width=1.82, height=0.64, corner_radius=0.16, color=accent, stroke_width=2)
        chip.set_fill(BG, opacity=0.92)
        words = VGroup(T(title, 22, accent), MathTex(value, font_size=31, color=accent)).arrange(RIGHT, buff=0.16)
        words.move_to(chip)
        self.add(chip, words)


def place_value_group(kind):
    if kind == "hundreds":
        blocks = VGroup(*[BaseTenFlat(SKY) for _ in range(3)]).arrange(RIGHT, buff=0.17)
        badge = ValueBadge("3 hundreds", "300", SKY)
        brace_text = MathTex("100+100+100", font_size=23, color=SKY)
    elif kind == "tens":
        blocks = VGroup(*[TenRod(ORANGE) for _ in range(4)]).arrange(RIGHT, buff=0.12)
        badge = ValueBadge("4 tens", "40", ORANGE)
        brace_text = MathTex("10+10+10+10", font_size=23, color=ORANGE)
    else:
        blocks = VGroup(*[OneCube(GRASS) for _ in range(7)]).arrange_in_grid(rows=2, cols=4, buff=(0.095, 0.11))
        badge = ValueBadge("7 ones", "7", GRASS)
        brace_text = MathTex("1+1+1+1+1+1+1", font_size=20, color=GRASS)
    brace = Brace(blocks, DOWN, buff=0.08)
    brace_text.next_to(brace, DOWN, buff=0.05)
    return VGroup(blocks, brace, brace_text, badge).arrange(DOWN, buff=0.17)


class Lesson(Scene):
    def construct(self):
        self.intro()
        self.build_hundreds()
        self.build_tens()
        self.build_ones()
        self.compose_number()
        self.clean_exit()

    def intro(self):
        title = T("Place value builds 347", 44, PINK).move_to([0, TITLE_Y, 0])
        subtitle = T("Each digit tells how many blocks of that size.", 24, INK).move_to([0, SUBTITLE_Y, 0])
        cards = VGroup(
            LessonCard(PANEL_W, PANEL_H, SKY, "hundreds").move_to([SLOT_XS["hundreds"], PANEL_CENTER_Y, 0]),
            LessonCard(PANEL_W, PANEL_H, ORANGE, "tens").move_to([SLOT_XS["tens"], PANEL_CENTER_Y, 0]),
            LessonCard(PANEL_W, PANEL_H, GRASS, "ones").move_to([SLOT_XS["ones"], PANEL_CENTER_Y, 0]),
        )
        self.play(Write(title), run_time=0.55)
        self.play(FadeIn(subtitle, shift=UP * 0.08), LaggedStart(*[FadeIn(card, scale=0.97) for card in cards], lag_ratio=0.1), run_time=0.85)
        self.wait(0.35)
        self.title = title
        self.subtitle = subtitle
        self.cards = cards

    def build_hundreds(self):
        group = place_value_group("hundreds").scale(0.96).move_to([SLOT_XS["hundreds"], MODEL_Y - 0.14, 0])
        group[-1].move_to([SLOT_XS["hundreds"], VALUE_Y, 0])
        self.play(LaggedStart(*[FadeIn(flat, scale=0.9) for flat in group[0]], lag_ratio=0.12), run_time=0.75)
        self.play(Create(group[1]), Write(group[2]), FadeIn(group[3], shift=UP * 0.08), run_time=0.55)
        self.play(Circumscribe(self.cards[0][2], color=SKY, time_width=0.45), run_time=0.55)
        self.wait(0.3)
        self.hundreds_group = group

    def build_tens(self):
        group = place_value_group("tens").scale(0.98).move_to([SLOT_XS["tens"], MODEL_Y - 0.14, 0])
        group[-1].move_to([SLOT_XS["tens"], VALUE_Y, 0])
        self.play(LaggedStart(*[FadeIn(rod, shift=UP * 0.12) for rod in group[0]], lag_ratio=0.1), run_time=0.62)
        self.play(Create(group[1]), Write(group[2]), FadeIn(group[3], shift=UP * 0.08), run_time=0.55)
        self.play(Circumscribe(self.cards[1][2], color=ORANGE, time_width=0.45), run_time=0.55)
        self.wait(0.3)
        self.tens_group = group

    def build_ones(self):
        group = place_value_group("ones").scale(1.02).move_to([SLOT_XS["ones"], MODEL_Y - 0.16, 0])
        group[-1].move_to([SLOT_XS["ones"], VALUE_Y, 0])
        self.play(LaggedStart(*[FadeIn(cube, scale=0.72) for cube in group[0]], lag_ratio=0.055), run_time=0.58)
        self.play(Create(group[1]), Write(group[2]), FadeIn(group[3], shift=UP * 0.08), run_time=0.55)
        self.play(Circumscribe(self.cards[2][2], color=GRASS, time_width=0.45), run_time=0.55)
        self.wait(0.3)
        self.ones_group = group

    def compose_number(self):
        guide = T("Add the values of the places.", 24, GRAPE).move_to([0, -2.14, 0])
        equation = MathTex("300", "+", "40", "+", "7", "=", "347", font_size=48, color=INK)
        equation[0].set_color(SKY)
        equation[2].set_color(ORANGE)
        equation[4].set_color(GRASS)
        equation[6].set_color(PINK)
        equation.move_to([0, FOOTER_Y, 0])
        tray = RoundedRectangle(width=5.55, height=0.68, corner_radius=0.16, color=INK, stroke_width=1.8)
        tray.set_fill("#FFF8E8", opacity=0.86).move_to(equation)
        frame = SurroundingRectangle(equation[6], color=PINK, buff=0.12, corner_radius=0.08)
        self.play(FadeIn(guide, shift=UP * 0.05), FadeIn(tray), Write(equation), run_time=0.85)
        self.play(
            Indicate(self.hundreds_group[0], color=SKY),
            Indicate(self.tens_group[0], color=ORANGE),
            Indicate(self.ones_group[0], color=GRASS),
            run_time=0.9,
        )
        self.play(Create(frame), Circumscribe(equation[6], color=PINK, time_width=0.5), run_time=0.5)
        self.wait(1.0)

    def clean_exit(self):
        self.play(*[FadeOut(mob) for mob in self.mobjects], run_time=0.5)
        self.wait(0.2)
