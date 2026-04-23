from manim import *

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

class RevealCard(Scene):
    CORRECT_ANSWER = "The answer is..."
    EXPLANATION = ""
    SHOW_MISCONCEPTION_WARNING = False
    MISCONCEPTION_TEXT = ""

    def construct(self):
        answer_text = T(self.CORRECT_ANSWER, size=44, color=GRASS)
        answer_text.move_to(UP * 0.5)

        correct_label = T("Correct!", size=28, color=GRAPE)
        correct_label.next_to(answer_text, UP, buff=0.3)

        anims = [FadeIn(correct_label, shift=DOWN * 0.2), Write(answer_text)]
        if self.SHOW_MISCONCEPTION_WARNING and self.MISCONCEPTION_TEXT:
            wrong_text = T(f"Not: {self.MISCONCEPTION_TEXT}", size=24, color=ORANGE)
            wrong_text.next_to(answer_text, DOWN, buff=0.4)
            cross = Line(
                wrong_text.get_left() + LEFT * 0.1,
                wrong_text.get_right() + RIGHT * 0.1,
                color=ORANGE,
                stroke_width=3,
            )

        self.play(*anims, run_time=0.8)

        if self.SHOW_MISCONCEPTION_WARNING and self.MISCONCEPTION_TEXT:
            self.play(FadeIn(wrong_text), run_time=0.4)
            self.play(Create(cross), run_time=0.4)

        if self.EXPLANATION:
            expl_text = T(self.EXPLANATION, size=26, color=INK)
            buff = 1.2 if self.SHOW_MISCONCEPTION_WARNING and self.MISCONCEPTION_TEXT else 0.7
            expl_text.next_to(answer_text, DOWN, buff=buff)
            self.play(FadeIn(expl_text), run_time=0.5)

        self.wait(1.5)

        self.play(
            *[FadeOut(mob) for mob in self.mobjects],
            run_time=0.5,
        )