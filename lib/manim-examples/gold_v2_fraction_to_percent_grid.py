"""
Gold v2: convert a fraction into a percentage with a 10 by 10 grid.
Prompt: Explain how to convert a fraction into a percentage for 5th grade
students in an intuitive way.

Visual QA notes:
- The 10 by 10 grid is always exactly 100 cells.
- For 3/5, each fifth becomes 20 cells; 3 fifths becomes 60 cells.
- Fraction, grid, and percent occupy separate vertical slots.
- Grid center is fixed at y=0.15 with labels on rails at y=1.92 and y=-1.62.
- Equation and final percent stay below the grid and inside x in [-5.8, 5.8].

Run: manim -qm gold_v2_fraction_to_percent_grid.py Lesson
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
GRID_Y = 0.15
EQUATION_Y = -2.55
CELL = 0.25
GAP = 0.025
HIGHLIGHTED = 60
GRID_ROWS = 10
GRID_COLS = 10
GRID_TOTAL = GRID_ROWS * GRID_COLS
FIFTH_SIZE = 20
LEFT_PANEL_X = -3.55
RIGHT_PANEL_X = 3.55


def T(s, size=36, color=INK):
    return Text(str(s), font_size=size, color=color, weight=BOLD)


def make_info_card(title, value, accent, width=2.55):
    card = RoundedRectangle(
        width=width,
        height=1.25,
        corner_radius=0.16,
        color=accent,
        stroke_width=3,
    )
    card.set_fill("#FFF9E8", opacity=0.96)
    title_text = T(title, 18, accent).move_to([0, 0.3, 0])
    value_text = MathTex(value, font_size=40, color=INK).move_to([0, -0.22, 0])
    return VGroup(card, title_text, value_text)


def make_step_tabs(active_index):
    labels = ["scale", "shade", "name"]
    colors = [ORANGE, SKY, GRASS]
    tabs = VGroup()
    for index, label in enumerate(labels):
        active = index == active_index
        tab = RoundedRectangle(
            width=1.12,
            height=0.36,
            corner_radius=0.09,
            color=colors[index],
            stroke_width=2,
        )
        tab.set_fill(colors[index] if active else BG, opacity=1)
        text = T(label, 16, BG if active else colors[index])
        tabs.add(VGroup(tab, text))
    tabs.arrange(RIGHT, buff=0.16).move_to([0, 2.52, 0])
    return tabs


def make_grid_brace(width, color, label):
    brace = BraceBetweenPoints([-width / 2, 0, 0], [width / 2, 0, 0], direction=UP, color=color, stroke_width=2.5)
    text = T(label, 18, color).next_to(brace, UP, buff=0.08)
    return VGroup(brace, text)


def percent_grid(highlighted, show_bands=True):
    highlighted = min(highlighted, GRID_TOTAL)
    cells = VGroup()
    bands = VGroup()
    band_width = GRID_COLS * CELL + (GRID_COLS - 1) * GAP
    band_height = 2 * CELL + GAP
    for row in range(GRID_ROWS):
        for col in range(GRID_COLS):
            index = row * GRID_COLS + col
            square = Square(side_length=CELL, color=INK, stroke_width=0.9)
            square.set_fill(SKY if index < highlighted else PANEL_BG, opacity=0.86)
            x = (col - 4.5) * (CELL + GAP)
            y = (4.5 - row) * (CELL + GAP)
            square.move_to([x, y, 0])
            cells.add(square)
    if show_bands:
        for band in range(5):
            band_box = RoundedRectangle(
                width=band_width + 0.1,
                height=band_height + 0.08,
                corner_radius=0.05,
                color=GRAPE if band < 3 else ORANGE,
                stroke_width=2,
            )
            y = np.linspace(3.95, -4.05, 5)[band] * (CELL + GAP)
            band_box.move_to([0, y, 0])
            band_box.set_fill(opacity=0)
            bands.add(band_box)
    border = SurroundingRectangle(cells, color=INK, buff=0.02)
    brace = make_grid_brace(band_width, ORANGE, "100 equal squares").move_to([0, 1.78, 0])
    return VGroup(cells, border, bands, brace)


def make_hundred_machine():
    left = make_info_card("fraction", r"\frac{3}{5}", SKY).move_to([LEFT_PANEL_X, 0.55, 0])
    multiplier = VGroup(
        RoundedRectangle(width=1.32, height=1.0, corner_radius=0.14, color=ORANGE, stroke_width=3).set_fill("#FFF9E8", opacity=0.96),
        MathTex(r"\times 20", font_size=32, color=ORANGE),
    ).move_to([0, 0.55, 0])
    right = make_info_card("hundredths", r"\frac{60}{100}", PINK).move_to([RIGHT_PANEL_X, 0.55, 0])
    arrow_1 = Arrow([LEFT_PANEL_X + 1.4, 0.55, 0], [-0.82, 0.55, 0], color=ORANGE, buff=0.1, stroke_width=5)
    arrow_2 = Arrow([0.82, 0.55, 0], [RIGHT_PANEL_X - 1.4, 0.55, 0], color=ORANGE, buff=0.1, stroke_width=5)
    caption_bg = RoundedRectangle(width=5.4, height=0.52, corner_radius=0.13, color=GRAPE, stroke_width=2)
    caption_bg.set_fill("#FFF9E8", opacity=0.96)
    caption_bg.move_to([0, -0.75, 0])
    caption = T("Multiply top and bottom by the same number.", 22, GRAPE).move_to(caption_bg)
    return VGroup(left, arrow_1, multiplier, arrow_2, right, VGroup(caption_bg, caption))


def make_percent_result():
    percent = MathTex(r"\frac{60}{100}", "=", "60", r"\%", font_size=58, color=INK)
    percent[0].set_color(PINK)
    percent[2].set_color(GRASS)
    percent[3].set_color(GRASS)
    percent.move_to([0, EQUATION_Y, 0])
    box = SurroundingRectangle(VGroup(percent[2], percent[3]), color=GRASS, buff=0.12, corner_radius=0.08)
    note_bg = RoundedRectangle(width=5.45, height=0.52, corner_radius=0.13, color=GRASS, stroke_width=2)
    note_bg.set_fill("#FFF9E8", opacity=0.96)
    note_bg.move_to([0, -1.62, 0])
    note = T("Percent is the numerator when the denominator is 100.", 21, GRASS).move_to(note_bg)
    return VGroup(percent, box, VGroup(note_bg, note))


class Lesson(Scene):
    def construct(self):
        self.intro()
        self.scale_to_hundred()
        self.fill_grid()
        self.reveal_percent()
        self.clean_exit()

    def intro(self):
        title = T("Fraction to percent", 42, PINK).move_to([0, TITLE_Y, 0])
        fraction_card = make_info_card("start with", r"\frac{3}{5}", SKY).move_to([-2.4, 0.9, 0])
        percent_card = make_info_card("rename as", r"?\%", GRAPE).move_to([2.4, 0.9, 0])
        arrow = Arrow([-0.82, 0.9, 0], [0.82, 0.9, 0], color=ORANGE, buff=0.12, stroke_width=5)
        cue_bg = RoundedRectangle(width=4.8, height=0.6, corner_radius=0.14, color=GRAPE, stroke_width=2)
        cue_bg.set_fill("#FFF9E8", opacity=0.96)
        cue_bg.move_to([0, EQUATION_Y, 0])
        cue = VGroup(cue_bg, T("Percent means out of 100.", 28, GRAPE).move_to(cue_bg))
        self.play(Write(title), run_time=0.5)
        self.play(FadeIn(fraction_card, scale=0.96), GrowArrow(arrow), FadeIn(percent_card, scale=0.96), run_time=0.8)
        self.play(FadeIn(cue), run_time=0.4)
        self.play(Indicate(fraction_card[2], color=SKY), Indicate(percent_card[2], color=GRAPE), run_time=0.65)
        self.wait(0.7)
        self.fraction = fraction_card
        self.question = percent_card
        self.arrow = arrow
        self.cue = cue

    def scale_to_hundred(self):
        tabs = make_step_tabs(0)
        machine = make_hundred_machine()
        equation = MathTex(r"\frac{3}{5}", "=", r"\frac{3 \times 20}{5 \times 20}", "=", r"\frac{60}{100}", font_size=42, color=INK)
        equation[0].set_color(SKY)
        equation[4].set_color(PINK)
        equation.move_to([0, EQUATION_Y, 0])
        self.play(FadeOut(VGroup(self.arrow, self.question, self.cue, self.fraction)), run_time=0.35)
        self.play(FadeIn(tabs), FadeIn(machine, shift=UP * 0.12), run_time=0.8)
        self.play(Indicate(machine[2], color=ORANGE), Indicate(machine[4][2], color=PINK), run_time=0.75)
        self.play(Write(equation), run_time=0.9)
        self.wait(0.6)
        self.equation = equation
        self.machine = machine
        self.tabs = tabs

    def fill_grid(self):
        grid = percent_grid(HIGHLIGHTED).move_to([0, GRID_Y, 0])
        tabs = make_step_tabs(1)
        label_bg = RoundedRectangle(width=5.0, height=0.56, corner_radius=0.14, color=SKY, stroke_width=2)
        label_bg.set_fill("#FFF9E8", opacity=0.96)
        label_bg.move_to([0, -1.62, 0])
        label = VGroup(label_bg, T("3 fifths = 3 groups of 20 = 60 squares", 22, SKY).move_to(label_bg))
        fifth_labels = VGroup()
        for index in range(5):
            color = SKY if index < 3 else ORANGE
            text = T(str(FIFTH_SIZE), 16, color).move_to([-1.62, 1.08 - index * 0.55, 0])
            dot = Dot(text.get_left() + LEFT * 0.16, radius=0.035, color=color)
            fifth_labels.add(VGroup(dot, text))
        self.play(FadeOut(VGroup(self.machine, self.tabs)), FadeIn(tabs), run_time=0.35)
        self.play(FadeIn(grid[1]), run_time=0.25)
        self.play(Create(grid[2]), FadeIn(grid[3]), run_time=0.55)
        self.play(LaggedStart(*[FadeIn(cell, scale=0.85) for cell in grid[0]], lag_ratio=0.008), run_time=1.2)
        self.play(FadeIn(fifth_labels), FadeIn(label), run_time=0.45)
        self.play(Circumscribe(VGroup(*grid[0][:HIGHLIGHTED]), color=SKY), run_time=0.7)
        self.wait(0.5)
        self.grid = grid
        self.grid_label = label
        self.fifth_labels = fifth_labels
        self.tabs = tabs

    def reveal_percent(self):
        tabs = make_step_tabs(2)
        result = make_percent_result()
        percent, box, note = result
        self.play(FadeOut(self.equation), FadeOut(self.grid_label), FadeOut(self.fifth_labels), ReplacementTransform(self.tabs, tabs), run_time=0.4)
        self.play(Write(percent), FadeIn(note), run_time=0.7)
        self.play(Create(box), Circumscribe(self.grid, color=SKY), run_time=0.8)
        self.play(Indicate(VGroup(percent[2], percent[3]), color=GRASS), run_time=0.6)
        self.wait(1.0)

    def clean_exit(self):
        self.play(*[FadeOut(mob) for mob in self.mobjects], run_time=0.5)
        self.wait(0.2)
