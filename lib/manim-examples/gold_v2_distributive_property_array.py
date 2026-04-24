"""
Gold v2: distributive property with a relatable garden array.
Prompt: What is the distributive property? Explain it visually with a
relatable real-world example.

Visual QA notes:
- One 4 by 7 garden array is split into 4 by 5 and 4 by 2 sections.
- Grid geometry is computed from row, column, and cell constants.
- Column groups are selected by row/column metadata, never by fragile VGroup slices.
- Bottom equations stay above y=-3.25 with a clear final frame.
- Array, labels, split markers, and equation trays use explicit layout constants.

Run: manim -qm gold_v2_distributive_property_array.py Lesson
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
STORY_Y = 2.26
GRID_Y = 0.48
CAPTION_Y = -1.12
EQUATION_Y = -2.34
RESULT_Y = -3.02
ROWS = 4
LEFT_COLS = 5
RIGHT_COLS = 2
COLS = LEFT_COLS + RIGHT_COLS
CELL = 0.43
GAP_AFTER_SPLIT = 0.09


def T(s, size=36, color=INK):
    return Text(str(s), font_size=size, color=color, weight=BOLD)


def soft_panel(width, height, color="#FFF8E8", stroke=INK):
    shadow = RoundedRectangle(width=width, height=height, corner_radius=0.18, stroke_width=0)
    shadow.set_fill(INK, opacity=0.11).shift(0.07 * RIGHT + 0.07 * DOWN)
    panel = RoundedRectangle(width=width, height=height, corner_radius=0.18, color=stroke, stroke_width=1.7)
    panel.set_fill(color, opacity=0.76)
    return VGroup(shadow, panel)


class PlantCell(VGroup):
    def __init__(self, row, col, fill):
        super().__init__()
        self.row = row
        self.col = col
        soil = RoundedRectangle(width=CELL, height=CELL, corner_radius=0.045, color=INK, stroke_width=1.5)
        soil.set_fill(fill, opacity=0.68)
        mound = ArcBetweenPoints(LEFT * 0.13, RIGHT * 0.13, angle=-PI / 2, color="#7A4F2A", stroke_width=2.2)
        mound.shift(DOWN * 0.075)
        stem = Line(DOWN * 0.06, UP * 0.105, color=GRASS, stroke_width=2.6)
        leaf_l = Ellipse(width=0.13, height=0.06, color=GRASS, stroke_width=0).set_fill(GRASS, opacity=0.82)
        leaf_l.rotate(PI / 8).shift(UP * 0.055 + LEFT * 0.052)
        leaf_r = Ellipse(width=0.13, height=0.06, color=GRASS, stroke_width=0).set_fill(GRASS, opacity=0.82)
        leaf_r.rotate(-PI / 8).shift(UP * 0.075 + RIGHT * 0.055)
        seed = Dot(radius=0.015, color=SUN).shift(UP * 0.14)
        self.add(soil, mound, stem, leaf_l, leaf_r, seed)


class GardenArray(VGroup):
    def __init__(self):
        super().__init__()
        self.cells = VGroup()
        for row in range(ROWS):
            for col in range(COLS):
                fill = SKY if col < LEFT_COLS else ORANGE
                cell = PlantCell(row, col, fill)
                extra_gap = GAP_AFTER_SPLIT if col >= LEFT_COLS else 0
                x = (col - (COLS - 1) / 2) * CELL + extra_gap
                y = ((ROWS - 1) / 2 - row) * CELL
                cell.move_to([x, y, 0])
                self.cells.add(cell)
        fence = self._build_fence()
        self.add(fence, self.cells)

    def _build_fence(self):
        width = COLS * CELL + GAP_AFTER_SPLIT + 0.22
        height = ROWS * CELL + 0.22
        rails = VGroup(
            Line(LEFT * width / 2, RIGHT * width / 2, color="#A66A3F", stroke_width=4).shift(UP * height / 2),
            Line(LEFT * width / 2, RIGHT * width / 2, color="#A66A3F", stroke_width=4).shift(DOWN * height / 2),
        )
        posts = VGroup()
        for x in np.linspace(-width / 2, width / 2, 8):
            post = RoundedRectangle(width=0.045, height=height + 0.16, corner_radius=0.018, stroke_width=0)
            post.set_fill("#A66A3F", opacity=0.72).move_to([x, 0, 0])
            posts.add(post)
        return VGroup(posts, rails)

    def cells_in_columns(self, start_col, end_col):
        return VGroup(*[cell for cell in self.cells if start_col <= cell.col < end_col])


class SplitBrace(VGroup):
    def __init__(self, target, text, color, direction=DOWN):
        super().__init__()
        brace = Brace(target, direction, buff=0.07, color=color)
        label = MathTex(text, font_size=29, color=color).next_to(brace, direction, buff=0.06)
        pill = RoundedRectangle(width=label.width + 0.34, height=label.height + 0.18, corner_radius=0.12, color=color, stroke_width=1.4)
        pill.set_fill(BG, opacity=0.9).move_to(label)
        self.add(brace, pill, label)


class EquationTray(VGroup):
    def __init__(self, equation, width, accent=INK):
        super().__init__()
        tray = RoundedRectangle(width=width, height=0.58, corner_radius=0.14, color=accent, stroke_width=1.6)
        tray.set_fill("#FFF8E8", opacity=0.88)
        equation.move_to(tray)
        self.add(tray, equation)
        self.equation = equation


class Lesson(Scene):
    def construct(self):
        self.intro()
        self.show_full_array()
        self.split_array()
        self.write_distributed_expression()
        self.clean_exit()

    def intro(self):
        title = T("Distributive property in a garden", 39, GRASS).move_to([0, TITLE_Y, 0])
        story_panel = soft_panel(7.4, 0.82)
        story = T("4 rows. Each row has 7 plants.", 28, INK).move_to([0, STORY_Y, 0])
        story_panel.move_to(story)
        setup = MathTex("4", r"\times", "7", "=", "4", r"\times", "(", "5", "+", "2", ")", font_size=42, color=INK)
        setup[7].set_color(SKY)
        setup[9].set_color(ORANGE)
        setup.next_to(story_panel, DOWN, buff=0.22)
        self.play(Write(title), run_time=0.5)
        self.play(FadeIn(story_panel, scale=0.97), Write(story), Write(setup), run_time=0.75)
        self.wait(0.55)
        self.play(FadeOut(VGroup(story_panel, story, setup)), run_time=0.35)
        self.title = title

    def show_full_array(self):
        garden = GardenArray().move_to([0, GRID_Y, 0])
        border = SurroundingRectangle(garden.cells, color=INK, buff=0.09, corner_radius=0.08)
        row_label = MathTex("4", r"\text{ rows}", font_size=31, color=GRASS).next_to(border, LEFT, buff=0.34)
        col_label = MathTex("7", r"\text{ plants in each row}", font_size=31, color=GRAPE).next_to(border, UP, buff=0.22)
        full_eq = MathTex("4", r"\times", "7", "=", "28", font_size=42, color=INK)
        tray = EquationTray(full_eq, 2.72, INK).move_to([0, EQUATION_Y, 0])
        self.play(LaggedStart(*[FadeIn(cell, scale=0.82) for cell in garden.cells], lag_ratio=0.022), FadeIn(garden[0]), run_time=1.05)
        self.play(Create(border), Write(row_label), Write(col_label), FadeIn(tray), Write(full_eq), run_time=0.72)
        self.wait(0.45)
        self.garden = garden
        self.border = border
        self.row_label = row_label
        self.col_label = col_label
        self.full_tray = tray
        self.full_label = full_eq

    def split_array(self):
        left_group = self.garden.cells_in_columns(0, LEFT_COLS)
        right_group = self.garden.cells_in_columns(LEFT_COLS, COLS)
        split_x = (left_group.get_right()[0] + right_group.get_left()[0]) / 2
        split_line = DashedLine(
            [split_x, self.garden.cells.get_bottom()[1] - 0.13, 0],
            [split_x, self.garden.cells.get_top()[1] + 0.13, 0],
            color=PINK,
            stroke_width=5,
            dash_length=0.12,
        )
        left_box = SurroundingRectangle(left_group, color=SKY, buff=0.075, corner_radius=0.06)
        right_box = SurroundingRectangle(right_group, color=ORANGE, buff=0.075, corner_radius=0.06)
        left_brace = SplitBrace(left_group, r"4\times5", SKY).move_to([left_group.get_center()[0], CAPTION_Y, 0])
        right_brace = SplitBrace(right_group, r"4\times2", ORANGE).move_to([right_group.get_center()[0], CAPTION_Y, 0])
        cue = T("Break 7 into friendlier chunks: 5 + 2", 26, GRAPE).move_to([0, 2.07, 0])
        self.play(FadeIn(cue, shift=DOWN * 0.08), Create(split_line), run_time=0.55)
        self.play(Create(left_box), Create(right_box), FadeIn(left_brace), FadeIn(right_brace), run_time=0.68)
        self.play(Indicate(left_group, color=SKY), Indicate(right_group, color=ORANGE), run_time=0.78)
        self.wait(0.35)
        self.left_group = left_group
        self.right_group = right_group
        self.split_line = split_line
        self.left_box = left_box
        self.right_box = right_box
        self.left_brace = left_brace
        self.right_brace = right_brace
        self.cue = cue

    def write_distributed_expression(self):
        distributed = MathTex("4", r"\times", "(", "5", "+", "2", ")", "=", "4", r"\times", "5", "+", "4", r"\times", "2", font_size=38, color=INK)
        distributed[3].set_color(SKY)
        distributed[5].set_color(ORANGE)
        distributed[10].set_color(SKY)
        distributed[14].set_color(ORANGE)
        distributed_tray = EquationTray(distributed, 6.45, GRAPE).move_to([0, EQUATION_Y, 0])
        result = MathTex("20", "+", "8", "=", "28", font_size=46, color=INK)
        result[0].set_color(SKY)
        result[2].set_color(ORANGE)
        result[4].set_color(PINK)
        result_tray = EquationTray(result, 3.18, PINK).move_to([0, RESULT_Y, 0])
        final_box = SurroundingRectangle(result[4], color=PINK, buff=0.12, corner_radius=0.08)
        self.play(ReplacementTransform(self.full_tray, distributed_tray), run_time=0.85)
        self.play(FadeIn(result_tray, shift=UP * 0.08), Write(result), run_time=0.55)
        self.play(Circumscribe(self.left_box, color=SKY), Circumscribe(self.right_box, color=ORANGE), run_time=0.8)
        self.play(Create(final_box), Circumscribe(result[4], color=PINK, time_width=0.5), run_time=0.45)
        self.wait(1.0)

    def clean_exit(self):
        self.play(*[FadeOut(mob) for mob in self.mobjects], run_time=0.5)
        self.wait(0.2)
