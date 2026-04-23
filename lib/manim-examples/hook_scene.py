"""
hook_scene.py
─────────────────────────────────────────────────────────────────────────────
CANONICAL REFERENCE — Hook scene template.

PURPOSE FOR CODEGEN
  Use this as the template for any role="hook" scene.  A hook scene:
  - Opens with a real-world visual (NOT fraction notation yet)
  - Poses a question the student wants to know the answer to
  - Ends with a question mark and a narration pause
  - Does NOT yet show any mathematical notation

KEY RULES ENFORCED HERE:
  1. NO fraction notation (MathTex fractions, LaTeX \\frac) in a hook scene.
     The hook is purely visual.  Notation appears in the "introduce" scene.
  2. The question mark appears AFTER the visual, not simultaneously.
  3. self.wait(2.0) at the end is the narration pause — voice-over fills this.
  4. Mascot is ABSENT from the hook scene intentionally.  It will FadeIn at
     the start of the introduce scene, making its first appearance feel like
     a character entering the lesson.  If you add the mascot to the hook,
     remove it from this file's instructions and document the change.
  5. Title goes to TOP EDGE, question mark goes CENTRE or LOWER-CENTRE — they
     must not overlap.  Verify: title bottom y vs question_mark top y.

LAYOUT (for this pizza example):
  title       : to_edge(UP, buff=0.4)  → center ≈ y = +3.2
  title height≈ 0.65 units → title bottom ≈ +2.9
  pizza 1     : x = −3.3, y = 0.0,  radius = 1.6
  pizza 2     : x = +3.3, y = 0.0,  radius = 1.6
  question "?" : y = +1.8   (top ≈ +2.4, well below title bottom ≈ +2.9 ✓)
  gap title↔? : +2.9 − +2.4 = 0.5  ✓
"""

from manim import *
import numpy as np

# ── Shared palette ────────────────────────────────────────────────────────
BG       = "#FFF4D6"
INK      = "#2D2013"
PINK     = "#FF6FA3"
SKY      = "#4FC3F7"
GRASS    = "#56C42A"
SUN      = "#FFD23F"
GRAPE    = "#9B59D0"
ORANGE   = "#FF8C42"

config.background_color = BG

# ── Helpers ───────────────────────────────────────────────────────────────

def T(s: str, size: int = 36, color: str = INK) -> Text:
    return Text(s, font_size=size, color=color, weight=BOLD)


def pizza_circle(center: np.ndarray, radius: float,
                 shaded_slices: int, total_slices: int = 4) -> VGroup:
    """
    Build a pizza-style circle with `total_slices` equal wedges and
    `shaded_slices` filled in SUN yellow.

    Crust fill is a warm ORANGE at low opacity — looks like dough.
    Shaded slices are SUN yellow at 0.65 opacity — looks like cheese/topping.
    """
    circle = Circle(
        radius=radius,
        stroke_color=INK, stroke_width=4,
        fill_color=ORANGE, fill_opacity=0.15,
    ).move_to(center)

    lines = VGroup()
    for i in range(total_slices):
        angle = i * TAU / total_slices
        tip   = center + radius * np.array([np.cos(angle), np.sin(angle), 0])
        lines.add(Line(center, tip, color=INK, stroke_width=3))

    sectors = VGroup()
    for i in range(shaded_slices):
        start_angle = i * TAU / total_slices
        s = Sector(
            radius=radius,
            angle=TAU / total_slices,
            start_angle=start_angle,
            fill_color=SUN,
            fill_opacity=0.65,
            stroke_width=0,
        ).move_to(center)
        sectors.add(s)

    return VGroup(circle, lines, sectors)


# ── Scene ─────────────────────────────────────────────────────────────────

class HookPizzaFractions(Scene):
    """
    Hook scene: two pizzas with different numbers of eaten slices.
    Visual question: "If you combine the eaten pieces, how much pizza is that?"

    Structure:
      1. Title slides in from top                       ~1.0 s
      2. Left pizza fades in                            ~0.6 s
      3. Right pizza fades in with slight lag           ~0.6 s
      4. Bite-mark labels ("1 slice eaten", "2 slices eaten")  ~0.5 s
      5. "?" appears at screen center                   ~0.5 s
      6. Narration pause                                 2.0 s
      7. Clean exit                                     ~0.5 s
    Total ≈ 6 s  (within 5–15 s hook budget)
    """

    # Explicit layout constants — change these to adjust without hunting
    # through the code for magic numbers
    PIZZA_Y      =  0.0
    PIZZA_X      =  3.3
    PIZZA_RADIUS =  1.6
    QUESTION_Y   =  1.8   # large "?" — safe gap from title top (see module docstring)
    LABEL_BUFF   =  0.35  # gap from pizza bottom to bite-count label

    def construct(self):
        self.show_title()
        self.show_pizzas()
        self.show_question()

        # Narration pause — voice-over fills this window
        self.wait(2.0)

        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.5)
        self.wait(0.2)

    def show_title(self):
        # Hook titles should name the REAL-WORLD context, not the math concept.
        # ("Pizza slices" not "Adding Fractions") — the math concept name
        # belongs in the introduce scene title.
        title = T("Sharing Pizza — How Much Did We Eat?", size=38, color=PINK)
        title.to_edge(UP, buff=0.45)

        # Animate from slightly above its final position for a drop-in feel
        title.shift(UP * 0.3)
        self.play(title.animate.shift(DOWN * 0.3), Write(title),
                  run_time=0.9, rate_func=smooth)
        self.wait(0.4)
        self.title = title

    def show_pizzas(self):
        p1_center = np.array([-self.PIZZA_X, self.PIZZA_Y, 0])
        p2_center = np.array([ self.PIZZA_X, self.PIZZA_Y, 0])

        pizza1 = pizza_circle(p1_center, self.PIZZA_RADIUS, shaded_slices=1)
        pizza2 = pizza_circle(p2_center, self.PIZZA_RADIUS, shaded_slices=2)

        # Bite-count labels — plain language, NO fraction notation
        lbl1 = T("1 slice eaten", size=24, color=INK)
        lbl1.next_to(pizza1, DOWN, buff=self.LABEL_BUFF)
        lbl2 = T("2 slices eaten", size=24, color=INK)
        lbl2.next_to(pizza2, DOWN, buff=self.LABEL_BUFF)

        # LaggedStart gives a left-then-right reveal feel
        self.play(
            LaggedStart(
                FadeIn(pizza1, scale=0.85),
                FadeIn(pizza2, scale=0.85),
                lag_ratio=0.35,
            ),
            run_time=1.0,
        )
        self.play(
            LaggedStart(Write(lbl1), Write(lbl2), lag_ratio=0.3),
            run_time=0.5,
        )
        self.wait(0.6)

    def show_question(self):
        """
        Large "?" at QUESTION_Y.  Scale-in animation (scale=1.8 → 1.0) gives
        a "popping into existence" feel that draws the eye.

        LAYOUT CHECK: title bottom ≈ +2.9, question_mark center = +1.8,
        question_mark height at size=80 ≈ 1.1 units → top ≈ +2.35.
        Gap = 2.9 − 2.35 = 0.55  ✓  no overlap.
        """
        q = T("?", size=80, color=GRAPE)
        q.move_to([0, self.QUESTION_Y, 0])

        # Start large, shrink to final size — pop effect
        q.scale(1.8)
        self.play(q.animate.scale(1 / 1.8), FadeIn(q), run_time=0.5)
        self.wait(0.3)
