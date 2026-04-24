"""
Gold v2: unlike-denominator fraction addition with pizza slices.
Prompt: Show how to add fractions with unlike denominators, step by step,
using a visual pizza-slice example.

Visual QA notes:
- Safe zone is x in [-6.5, 6.5], y in [-3.5, 3.5].
- Pizza centers are fixed at x=-3.7, 0.0, 3.7 and y=0.45.
- Radius 1.05 plus labels keeps each pizza column inside a 2.7 unit slot.
- All transforms move whole objects; no scene relies on drifting next_to chains.
- Equations live on the lower rail at y=-2.72; callouts stay above y=-2.15.

Run: manim -qm gold_v2_fraction_pizza_addition.py Lesson
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

TITLE_Y = 3.1
PIZZA_Y = 0.45
LABEL_Y = -1.45
FOOTER_Y = -2.75
RADIUS = 1.05
LEFT_X = -3.7
CENTER_X = 0.0
RIGHT_X = 3.7
COLUMN_SLOT_WIDTH = 2.7
CARD_W = 2.75
CARD_H = 3.65
MINI_SCALE = 0.72


def T(s, size=36, color=INK):
    return Text(str(s), font_size=size, color=color, weight=BOLD)


def make_label_chip(text, color, width=1.62):
    bg = RoundedRectangle(
        width=width,
        height=0.5,
        corner_radius=0.12,
        color=color,
        stroke_width=2.5,
    )
    bg.set_fill(BG, opacity=0.96)
    label = MathTex(text, font_size=34, color=color)
    return VGroup(bg, label)


def make_column_card(title, accent, center_x):
    card = RoundedRectangle(
        width=CARD_W,
        height=CARD_H,
        corner_radius=0.18,
        color=accent,
        stroke_width=3,
    )
    card.set_fill("#FFF9E8", opacity=0.92)
    card.move_to([center_x, PIZZA_Y - 0.02, 0])
    ribbon = RoundedRectangle(
        width=2.08,
        height=0.42,
        corner_radius=0.11,
        color=accent,
        stroke_width=0,
    )
    ribbon.set_fill(accent, opacity=1)
    ribbon.move_to([center_x, PIZZA_Y + 1.78, 0])
    text = T(title, 19, BG).move_to(ribbon)
    return VGroup(card, ribbon, text)


def make_slice_marks(parts, radius=RADIUS):
    marks = VGroup()
    for index in range(parts):
        angle = np.pi / 2 - index * TAU / parts
        end = [np.cos(angle) * radius, np.sin(angle) * radius, 0]
        marks.add(Line(ORIGIN, end, color=INK, stroke_width=1.7))
    return marks


def pizza(parts, shaded, color, label, title=None, center_x=0.0):
    slices = VGroup()
    for index in range(parts):
        sector = Sector(
            radius=RADIUS,
            start_angle=PI / 2 - index * TAU / parts,
            angle=-TAU / parts,
            color=INK,
            stroke_width=2.5,
        )
        sector.set_fill(color if index < shaded else PANEL_BG, opacity=0.92)
        slices.add(sector)
    crust = Circle(radius=RADIUS, color=INK, stroke_width=3.5)
    crust.set_fill(opacity=0)
    marks = make_slice_marks(parts)
    slice_count = T(f"{shaded} of {parts} slices", 18, INK).move_to([0, -1.18, 0])
    chip = make_label_chip(label, color).move_to([0, -1.68, 0])
    plate = Circle(radius=RADIUS + 0.13, color="#F8E8B8", stroke_width=7)
    plate.set_fill("#FFF8E6", opacity=0.38)
    group = VGroup(plate, slices, marks, crust, slice_count, chip)
    if title:
        title_text = T(title, 20, color).move_to([0, 1.43, 0])
        group.add(title_text)
    group.move_to([center_x, PIZZA_Y, 0])
    return group


def equivalence_badge(left, right, color):
    left_tex = MathTex(left, font_size=34, color=color)
    arrow = MathTex(r"\Longrightarrow", font_size=28, color=ORANGE)
    right_tex = MathTex(right, font_size=34, color=color)
    row = VGroup(left_tex, arrow, right_tex).arrange(RIGHT, buff=0.18)
    bg = RoundedRectangle(
        width=row.width + 0.36,
        height=0.68,
        corner_radius=0.13,
        color=color,
        stroke_width=2,
    )
    bg.set_fill("#FFF9E8", opacity=0.96)
    return VGroup(bg, row)


def make_slice_counter():
    blocks = VGroup()
    labels = [
        ("3 sixths", SKY, LEFT * 1.55),
        ("+", INK, ORIGIN),
        ("2 sixths", GRASS, RIGHT * 1.55),
        ("=", INK, RIGHT * 2.8),
        ("5 sixths", PINK, RIGHT * 4.25),
    ]
    for text, color, point in labels:
        item = T(text, 22, color)
        if text not in ["+", "="]:
            box = RoundedRectangle(
                width=1.35,
                height=0.45,
                corner_radius=0.1,
                color=color,
                stroke_width=2,
            )
            box.set_fill(BG, opacity=0.92)
            item = VGroup(box, item)
        item.move_to(point)
        blocks.add(item)
    blocks.move_to([0, -2.12, 0])
    return blocks


def build_mascot():
    body = Star(n=5, outer_radius=0.45, inner_radius=0.2, color=INK, stroke_width=3)
    body.set_fill(SUN, opacity=1)
    left_eye = Dot(LEFT * 0.1 + UP * 0.07, radius=0.035, color=INK)
    right_eye = Dot(RIGHT * 0.1 + UP * 0.07, radius=0.035, color=INK)
    smile = Arc(radius=0.1, start_angle=PI + 0.45, angle=PI - 0.9, color=INK, stroke_width=3)
    smile.move_to(DOWN * 0.04)
    return VGroup(body, left_eye, right_eye, smile)


def make_step_tabs(active_index):
    labels = ["1. Compare", "2. Convert", "3. Add"]
    tabs = VGroup()
    for index, label in enumerate(labels):
        active = index == active_index
        color = [ORANGE, GRAPE, PINK][index]
        tab = RoundedRectangle(
            width=1.42,
            height=0.38,
            corner_radius=0.09,
            color=color,
            stroke_width=2,
        )
        tab.set_fill(color if active else BG, opacity=1)
        text = T(label, 16, BG if active else color)
        tabs.add(VGroup(tab, text))
    tabs.arrange(RIGHT, buff=0.18).move_to([0, 2.55, 0])
    return tabs


class Lesson(Scene):
    def construct(self):
        self.intro()
        self.show_unlike_pizzas()
        self.cut_to_common_denominator()
        self.combine_slices()
        self.final_equation()
        self.clean_exit()

    def intro(self):
        title = T("Add unlike fractions", 44, PINK).move_to([0, TITLE_Y, 0])
        problem = MathTex(r"\frac{1}{2}", "+", r"\frac{1}{3}", font_size=58, color=INK)
        problem.move_to([0, 1.45, 0])
        cue_card = RoundedRectangle(width=5.85, height=0.75, corner_radius=0.16, color=GRAPE, stroke_width=2.5)
        cue_card.set_fill("#FFF9E8", opacity=0.96)
        cue_card.move_to([0, FOOTER_Y, 0])
        cue = T("First, make matching slice sizes.", 26, GRAPE).move_to(cue_card)
        cue_group = VGroup(cue_card, cue)
        mascot = build_mascot().move_to([-5.4, 2.55, 0])
        sparkle = VGroup(
            Star(n=4, outer_radius=0.13, inner_radius=0.05, color=SUN).move_to([-4.78, 2.88, 0]),
            Star(n=4, outer_radius=0.09, inner_radius=0.035, color=ORANGE).move_to([-5.97, 2.2, 0]),
        )
        for star in sparkle:
            star.set_fill(star.get_color(), opacity=1)
        self.play(FadeIn(mascot, scale=0.6), Write(title), run_time=0.7)
        self.play(FadeIn(sparkle, scale=0.8), Write(problem), FadeIn(cue_group, shift=UP * 0.15), run_time=0.8)
        self.play(Indicate(problem[0], color=SKY), Indicate(problem[2], color=GRASS), run_time=0.7)
        self.wait(0.7)
        self.play(FadeOut(VGroup(title, problem, cue_group, mascot, sparkle)), run_time=0.4)

    def show_unlike_pizzas(self):
        header = T("Different slice sizes", 36, ORANGE).move_to([0, TITLE_Y, 0])
        tabs = make_step_tabs(0)
        left_card = make_column_card("halves", SKY, -2.3)
        right_card = make_column_card("thirds", GRASS, 2.3)
        half = pizza(2, 1, SKY, r"\frac{1}{2}", center_x=-2.3)
        third = pizza(3, 1, GRASS, r"\frac{1}{3}", center_x=2.3)
        warning_bg = RoundedRectangle(width=5.62, height=0.58, corner_radius=0.14, color=ORANGE, stroke_width=2)
        warning_bg.set_fill("#FFF9E8", opacity=0.96)
        warning_bg.move_to([0, FOOTER_Y, 0])
        warning = VGroup(warning_bg, T("These pieces cannot be added yet.", 25, ORANGE).move_to(warning_bg))
        self.play(Write(header), run_time=0.4)
        self.play(FadeIn(tabs), FadeIn(left_card), FadeIn(right_card), run_time=0.45)
        self.play(LaggedStart(FadeIn(half, scale=0.96), FadeIn(third, scale=0.96), lag_ratio=0.18), run_time=0.9)
        self.play(Circumscribe(half[1], color=SKY), Circumscribe(third[1], color=GRASS), run_time=0.75)
        self.play(FadeIn(warning), run_time=0.4)
        self.wait(0.8)
        self.half = half
        self.third = third
        self.intro_cards = VGroup(left_card, right_card)
        self.play(FadeOut(VGroup(header, warning, tabs, left_card, right_card)), run_time=0.3)

    def cut_to_common_denominator(self):
        header = T("Cut both pizzas into sixths", 34, GRAPE).move_to([0, TITLE_Y, 0])
        tabs = make_step_tabs(1)
        left_card = make_column_card("same size cuts", SKY, -2.3)
        right_card = make_column_card("same size cuts", GRASS, 2.3)
        half_sixths = pizza(6, 3, SKY, r"\frac{3}{6}", center_x=-2.3)
        third_sixths = pizza(6, 2, GRASS, r"\frac{2}{6}", center_x=2.3)
        half_badge = equivalence_badge(r"\frac{1}{2}", r"\frac{3}{6}", SKY).move_to([-2.3, FOOTER_Y, 0])
        third_badge = equivalence_badge(r"\frac{1}{3}", r"\frac{2}{6}", GRASS).move_to([2.3, FOOTER_Y, 0])
        bridge = VGroup(half_badge, third_badge)
        self.play(Write(header), run_time=0.4)
        self.play(FadeIn(tabs), FadeIn(left_card), FadeIn(right_card), run_time=0.35)
        self.play(ReplacementTransform(self.half, half_sixths), ReplacementTransform(self.third, third_sixths), run_time=1.0)
        self.play(LaggedStart(Create(half_sixths[2]), Create(third_sixths[2]), lag_ratio=0.15), run_time=0.55)
        self.play(Write(bridge), run_time=0.7)
        self.play(Indicate(half_sixths[5], color=SKY), Indicate(third_sixths[5], color=GRASS), run_time=0.7)
        self.wait(0.8)
        self.half_sixths = half_sixths
        self.third_sixths = third_sixths
        self.play(FadeOut(VGroup(header, bridge, tabs, left_card, right_card)), run_time=0.3)

    def combine_slices(self):
        header = T("Now the pieces match", 34, GRAPE).move_to([0, TITLE_Y, 0])
        tabs = make_step_tabs(2)
        result_card = make_column_card("combined pizza", PINK, CENTER_X)
        result = pizza(6, 5, PINK, r"\frac{5}{6}", center_x=CENTER_X)
        plus = MathTex(r"\frac{3}{6}", "+", r"\frac{2}{6}", "=", r"\frac{5}{6}", font_size=46, color=INK)
        plus[0].set_color(SKY)
        plus[2].set_color(GRASS)
        plus[4].set_color(PINK)
        plus.move_to([0, FOOTER_Y, 0])
        counter = make_slice_counter()
        self.play(Write(header), run_time=0.4)
        self.play(FadeIn(tabs), run_time=0.25)
        self.play(
            self.half_sixths.animate.move_to([LEFT_X, PIZZA_Y, 0]).scale(MINI_SCALE),
            self.third_sixths.animate.move_to([RIGHT_X, PIZZA_Y, 0]).scale(MINI_SCALE),
            run_time=0.7,
        )
        self.play(FadeIn(result_card), FadeIn(result, scale=0.92), Write(counter), run_time=0.8)
        self.play(ReplacementTransform(counter, plus), run_time=0.65)
        self.play(Circumscribe(result, color=PINK), run_time=0.7)
        self.wait(0.8)
        self.result = result
        self.plus = plus
        self.result_card = result_card
        self.play(FadeOut(VGroup(header, tabs, self.half_sixths, self.third_sixths, result_card)), run_time=0.4)

    def final_equation(self):
        title = T("Answer", 38, PINK).move_to([0, TITLE_Y, 0])
        answer = MathTex(r"\frac{1}{2}+\frac{1}{3}=\frac{5}{6}", font_size=60, color=INK)
        answer.move_to([0, -1.45, 0])
        box = SurroundingRectangle(answer, color=GRASS, buff=0.18, corner_radius=0.08)
        takeaway_bg = RoundedRectangle(width=6.25, height=0.58, corner_radius=0.14, color=GRAPE, stroke_width=2)
        takeaway_bg.set_fill("#FFF9E8", opacity=0.96)
        takeaway_bg.move_to([0, FOOTER_Y, 0])
        takeaway = VGroup(takeaway_bg, T("Add numerators only after denominators match.", 23, GRAPE).move_to(takeaway_bg))
        self.play(Write(title), run_time=0.4)
        self.play(self.result.animate.move_to([0, 0.75, 0]), Transform(self.plus, answer), run_time=0.8)
        self.play(Create(box), FadeIn(takeaway), run_time=0.55)
        self.play(Indicate(answer[-1], color=PINK), run_time=0.55)
        self.wait(1.0)

    def clean_exit(self):
        self.play(*[FadeOut(mob) for mob in self.mobjects], run_time=0.5)
        self.wait(0.2)
