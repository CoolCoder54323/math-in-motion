from manim import *
import numpy as np

BG      = "#FFF4D6"
INK     = "#2D2013"
PINK    = "#FF6FA3"
SKY     = "#4FC3F7"
GRASS   = "#56C42A"
SUN     = "#FFD23F"
GRAPE   = "#9B59D0"
ORANGE  = "#FF8C42"
PANEL_BG = "#E8D5A3"
config.background_color = BG

def T(s, size=40, color=INK):
    return Text(s, font_size=size, color=color)

class QuestionCard(Scene):
    QUESTION = "What do you think?"
    HOLD_SECONDS = 3.0

    def construct(self):
        panel = RoundedRectangle(
            corner_radius=0.3,
            width=10,
            height=3.5,
            color=PANEL_BG,
            fill_opacity=1,
            stroke_color=INK,
            stroke_width=2,
        )

        dots = VGroup(*[
            Dot(radius=0.12, color=INK).shift(RIGHT * (i - 1) * 0.45)
            for i in range(3)
        ]).next_to(panel, DOWN, buff=0.3)

        question_text = T(self.QUESTION, size=36, color=INK)
        question_text.move_to(panel.get_center())

        think_label = T("Think about it...", size=24, color=GRAPE)
        think_label.next_to(panel, UP, buff=0.3)

        self.play(
            FadeIn(panel, shift=0.2 * UP),
            Write(question_text),
            run_time=0.8,
        )
        self.play(FadeIn(think_label), FadeIn(dots), run_time=0.4)

        for _ in range(int(self.HOLD_SECONDS / 0.9)):
            self.play(
                LaggedStart(
                    *[dot.animate.scale(1.5) for dot in dots],
                    lag_ratio=0.3,
                ),
                run_time=0.45,
            )
            self.play(
                LaggedStart(
                    *[dot.animate.scale(1 / 1.5) for dot in dots],
                    lag_ratio=0.3,
                ),
                run_time=0.45,
            )

        self.play(
            FadeOut(panel),
            FadeOut(question_text),
            FadeOut(think_label),
            FadeOut(dots),
            run_time=0.5,
        )