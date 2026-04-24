"""
Gold v2: area vs perimeter with a rectangular garden.
Prompt: Help students understand the difference between area and perimeter
using a rectangular garden example.

Visual QA notes:
- Garden is a 5 by 3 grid, cell size 0.55, centered at y=0.28.
- Area fill happens inside cells; perimeter trace follows the outside border.
- Dimension labels attach to the garden border, not guessed scene positions.
- Result cards and takeaway stay inside the safe frame.
- Fence posts sit outside the bed; nothing overlaps the title, captions, or cards.

Run: manim -qm gold_v2_area_perimeter_garden.py Lesson
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
SUBTITLE_Y = 2.56
GARDEN_Y = 0.28
CALLOUT_Y = 1.94
CARD_Y = -2.34
TAKEAWAY_Y = -3.14
ROWS = 3
COLS = 5
CELL = 0.55
GARDEN_WIDTH = COLS * CELL
GARDEN_HEIGHT = ROWS * CELL
SAFE_CARD_WIDTH = 3.55


def T(s, size=36, color=INK):
    return Text(str(s), font_size=size, color=color, weight=BOLD)


def soft_panel(width, height, fill="#FFF8E8", stroke=INK):
    panel = RoundedRectangle(
        width=width,
        height=height,
        corner_radius=0.18,
        color=stroke,
        stroke_width=2,
    )
    panel.set_fill(fill, opacity=0.9)
    return panel


def plant_icon(index, scale=1.0):
    angle = index * TAU / 7
    stem = Line(ORIGIN, UP * 0.13, color=GRASS, stroke_width=2.2)
    leaf_left = Ellipse(width=0.12, height=0.055, color=GRASS, stroke_width=1.4)
    leaf_left.set_fill(GRASS, opacity=0.92).rotate(0.55).move_to(UP * 0.075 + LEFT * 0.045)
    leaf_right = Ellipse(width=0.12, height=0.055, color=GRASS, stroke_width=1.4)
    leaf_right.set_fill(GRASS, opacity=0.92).rotate(-0.55).move_to(UP * 0.095 + RIGHT * 0.045)
    bloom = Dot(UP * 0.18, radius=0.035, color=[PINK, SUN, SKY][index % 3])
    icon = VGroup(stem, leaf_left, leaf_right, bloom).scale(scale)
    icon.rotate(0.08 * np.sin(angle))
    return icon


def garden_cell(row, col):
    square = Square(side_length=CELL, color=INK, stroke_width=1.4)
    square.set_fill(PANEL_BG, opacity=0.78)
    shade = Square(side_length=CELL * 0.82, stroke_width=0)
    shade.set_fill("#F6E7B7", opacity=0.64)
    shade.move_to(square)
    sprout = plant_icon(row * COLS + col, scale=0.9)
    cell = VGroup(square, shade, sprout)
    x = (col - (COLS - 1) / 2) * CELL
    y = ((ROWS - 1) / 2 - row) * CELL
    cell.move_to([x, y, 0])
    cell.row = row
    cell.col = col
    return cell


def fence_post(point, height=0.34):
    post = RoundedRectangle(
        width=0.075,
        height=height,
        corner_radius=0.025,
        color=INK,
        stroke_width=1.5,
    )
    post.set_fill("#B8793B", opacity=1)
    cap = Triangle(color=INK, stroke_width=1.3).scale(0.055)
    cap.set_fill("#B8793B", opacity=1).rotate(PI / 3)
    post.move_to(point)
    cap.next_to(post, UP, buff=-0.005)
    return VGroup(post, cap)


def perimeter_segments(border, offset=0.18, color=ORANGE):
    left = border.get_left()[0]
    right = border.get_right()[0]
    top = border.get_top()[1]
    bottom = border.get_bottom()[1]
    top_line = Line([left, top + offset, 0], [right, top + offset, 0], color=color, stroke_width=8)
    right_line = Line([right + offset, top, 0], [right + offset, bottom, 0], color=color, stroke_width=8)
    bottom_line = Line([right, bottom - offset, 0], [left, bottom - offset, 0], color=color, stroke_width=8)
    left_line = Line([left - offset, bottom, 0], [left - offset, top, 0], color=color, stroke_width=8)
    return VGroup(top_line, right_line, bottom_line, left_line)


def dimension_tag(label, anchor, direction, color=GRAPE):
    text = MathTex(label, font_size=28, color=color)
    bubble = RoundedRectangle(
        width=max(0.75, text.width + 0.24),
        height=0.38,
        corner_radius=0.09,
        color=color,
        stroke_width=2.4,
    )
    bubble.set_fill("#FFF8E8", opacity=0.96)
    text.move_to(bubble)
    tag = VGroup(bubble, text)
    tag.next_to(anchor, direction, buff=0.1)
    return tag


def build_garden():
    cells = VGroup()
    for row in range(ROWS):
        for col in range(COLS):
            cells.add(garden_cell(row, col))

    soil = RoundedRectangle(
        width=GARDEN_WIDTH + 0.34,
        height=GARDEN_HEIGHT + 0.34,
        corner_radius=0.15,
        color=INK,
        stroke_width=2,
    )
    soil.set_fill("#C99555", opacity=0.34)
    soil.move_to(cells)
    border = SurroundingRectangle(cells, color=INK, buff=0, corner_radius=0)

    fence = perimeter_segments(border, offset=0.16)
    post_points = [
        border.get_corner(UL) + LEFT * 0.16 + UP * 0.16,
        border.get_corner(UR) + RIGHT * 0.16 + UP * 0.16,
        border.get_corner(DR) + RIGHT * 0.16 + DOWN * 0.16,
        border.get_corner(DL) + LEFT * 0.16 + DOWN * 0.16,
    ]
    posts = VGroup(*[fence_post(point) for point in post_points])

    width_arrow = DoubleArrow(
        border.get_left(),
        border.get_right(),
        buff=0,
        color=GRAPE,
        stroke_width=3,
        tip_length=0.16,
    ).next_to(border, DOWN, buff=0.42)
    height_arrow = DoubleArrow(
        border.get_bottom(),
        border.get_top(),
        buff=0,
        color=GRAPE,
        stroke_width=3,
        tip_length=0.16,
    ).next_to(border, RIGHT, buff=0.42)
    width_tag = dimension_tag(r"5\text{ units}", width_arrow, DOWN, GRAPE)
    height_tag = dimension_tag(r"3\text{ units}", height_arrow, RIGHT, GRAPE)

    garden = VGroup(soil, cells, border, fence, posts, width_arrow, height_arrow, width_tag, height_tag)
    garden.cells = cells
    garden.border = border
    garden.fence = fence
    garden.posts = posts
    garden.dims = VGroup(width_arrow, height_arrow, width_tag, height_tag)
    garden.move_to([0, GARDEN_Y, 0])
    return garden


def classroom_pointer(label, color, side=LEFT):
    dot = Dot(radius=0.08, color=color)
    ring = Circle(radius=0.16, color=color, stroke_width=3)
    text = T(label, 24, color)
    body = VGroup(dot, ring, text).arrange(RIGHT, buff=0.13)
    body.move_to([side[0] * 3.55, CALLOUT_Y, 0])
    return body


def result_card(title, expression, note, color):
    title_mob = T(title, 24, color)
    expression_mob = MathTex(expression, font_size=33, color=INK)
    note_mob = T(note, 17, INK)
    inner = VGroup(title_mob, expression_mob, note_mob).arrange(DOWN, buff=0.11)
    box = RoundedRectangle(
        width=SAFE_CARD_WIDTH,
        height=1.34,
        corner_radius=0.16,
        color=color,
        stroke_width=3,
    )
    box.set_fill("#FFF8E8", opacity=0.97)
    accent = Rectangle(width=SAFE_CARD_WIDTH, height=0.12, stroke_width=0)
    accent.set_fill(color, opacity=0.95).next_to(box, UP, buff=-0.12)
    inner.move_to(box.get_center() + DOWN * 0.03)
    return VGroup(box, accent, inner)


def make_area_highlights(cells):
    fills = VGroup()
    numbers = VGroup()
    for index, cell in enumerate(cells, start=1):
        fill = cell[1].copy()
        fill.set_fill(SKY, opacity=0.82)
        fill.set_stroke(width=0)
        number = Text(str(index), font_size=16, color=INK, weight=BOLD).move_to(cell)
        fills.add(fill)
        numbers.add(number)
    return VGroup(fills, numbers)


def make_side_labels(fence):
    labels = VGroup(
        MathTex("5", font_size=30, color=ORANGE).next_to(fence[0], UP, buff=0.08),
        MathTex("3", font_size=30, color=ORANGE).next_to(fence[1], RIGHT, buff=0.08),
        MathTex("5", font_size=30, color=ORANGE).next_to(fence[2], DOWN, buff=0.08),
        MathTex("3", font_size=30, color=ORANGE).next_to(fence[3], LEFT, buff=0.08),
    )
    return labels


class Lesson(Scene):
    def construct(self):
        self.intro()
        self.show_area()
        self.show_perimeter()
        self.compare()
        self.clean_exit()

    def intro(self):
        title = T("Garden: area vs perimeter", 40, GRASS).move_to([0, TITLE_Y, 0])
        subtitle = T("Same rectangle. Two different measurements.", 24, GRAPE).move_to([0, SUBTITLE_Y, 0])
        garden = build_garden()
        dims = garden.dims
        question_panel = soft_panel(4.4, 0.54).move_to([0, -1.42, 0])
        question = T("What do we count?", 24, INK).move_to(question_panel)

        self.play(Write(title), FadeIn(subtitle, shift=DOWN * 0.08), run_time=0.65)
        self.play(FadeIn(garden[0], scale=0.96), run_time=0.3)
        self.play(LaggedStart(*[FadeIn(cell, scale=0.78) for cell in garden.cells], lag_ratio=0.025), run_time=0.95)
        self.play(Create(garden.border), FadeIn(dims), FadeIn(question_panel), Write(question), run_time=0.65)
        self.wait(0.45)

        self.title = title
        self.subtitle = subtitle
        self.garden = garden
        self.dims = dims
        self.question = VGroup(question_panel, question)

    def show_area(self):
        area_label = T("Area counts the inside squares", 28, SKY).move_to([0, CALLOUT_Y, 0])
        highlights = make_area_highlights(self.garden.cells)
        area_card = result_card("AREA", r"5 \times 3 = 15", "15 square units inside", SKY).move_to([-2.28, CARD_Y, 0])
        area_pointer = classroom_pointer("inside", SKY, LEFT)
        area_ring = SurroundingRectangle(self.garden.cells, color=SKY, buff=0.04, corner_radius=0.06)

        self.play(FadeOut(self.question), FadeOut(self.dims), FadeIn(area_label, shift=DOWN * 0.1), run_time=0.45)
        self.play(LaggedStart(*[FadeIn(fill, scale=0.82) for fill in highlights[0]], lag_ratio=0.035), run_time=0.9)
        self.play(LaggedStart(*[Write(number) for number in highlights[1]], lag_ratio=0.025), run_time=0.65)
        self.play(Create(area_ring), FadeIn(area_pointer, shift=RIGHT * 0.12), FadeIn(area_card, shift=UP * 0.15), run_time=0.65)
        self.play(Circumscribe(self.garden.cells, color=SKY), run_time=0.55)
        self.wait(0.45)

        self.area_label = area_label
        self.area_highlights = highlights
        self.area_card = area_card
        self.area_pointer = area_pointer
        self.area_ring = area_ring

    def show_perimeter(self):
        perimeter_label = T("Perimeter is the fence around it", 28, ORANGE).move_to([0, CALLOUT_Y, 0])
        perimeter_card = result_card("PERIMETER", r"5+3+5+3=16", "16 units around", ORANGE).move_to([2.28, CARD_Y, 0])
        perimeter_pointer = classroom_pointer("around", ORANGE, RIGHT)
        side_labels = make_side_labels(self.garden.fence)
        fence_glow = self.garden.fence.copy().set_color(ORANGE).set_stroke(width=11, opacity=0.34)

        self.play(
            ReplacementTransform(self.area_label, perimeter_label),
            FadeOut(self.area_pointer),
            FadeOut(self.area_ring),
            run_time=0.45,
        )
        self.play(FadeIn(fence_glow), LaggedStart(*[Create(side) for side in self.garden.fence], lag_ratio=0.18), run_time=1.05)
        self.play(FadeIn(self.garden.posts, scale=0.88), LaggedStart(*[Write(label) for label in side_labels], lag_ratio=0.12), run_time=0.65)
        self.play(FadeIn(perimeter_pointer, shift=LEFT * 0.12), FadeIn(perimeter_card, shift=UP * 0.15), run_time=0.55)
        self.play(Indicate(self.garden.fence, color=ORANGE), run_time=0.7)
        self.wait(0.45)

        self.perimeter_label = perimeter_label
        self.perimeter_card = perimeter_card
        self.perimeter_pointer = perimeter_pointer
        self.side_labels = side_labels
        self.fence_glow = fence_glow

    def compare(self):
        summary = soft_panel(7.8, 0.54).move_to([0, TAKEAWAY_Y, 0])
        takeaway = T("Inside is area. Around is perimeter.", 25, GRAPE).move_to(summary)
        card_group = VGroup(self.area_card, self.perimeter_card)
        final_ring = SurroundingRectangle(card_group, color=GRAPE, buff=0.16, corner_radius=0.14)
        bridge = MathTex(
            r"\text{square units}",
            r"\neq",
            r"\text{edge units}",
            font_size=30,
            color=INK,
        ).move_to([0, -1.45, 0])
        bridge[0].set_color(SKY)
        bridge[2].set_color(ORANGE)

        self.play(Indicate(self.area_card, color=SKY), Indicate(self.perimeter_card, color=ORANGE), run_time=0.75)
        self.play(Write(bridge), run_time=0.55)
        self.play(Create(final_ring), FadeIn(summary), Write(takeaway), run_time=0.55)
        self.play(Circumscribe(card_group, color=GRAPE), run_time=0.65)
        self.wait(1.0)

    def clean_exit(self):
        self.play(*[FadeOut(mob) for mob in self.mobjects], run_time=0.5)
        self.wait(0.2)
