"""
Long Division with Remainders — Teacher Animation Tool (v3)
Run: manim -pqh long_division.py LongDivisionWorksheet
"""
from manim import *
import numpy as np

# ── Palette ────────────────────────────────────────────────────────────────
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

LARGE = 46   # dividend / divisor / quotient digits
WORK  = 36   # work-area numbers
SMALL = 24   # labels / captions

STEP_DATA = [
    ("D", "Divide",     GRASS),
    ("M", "Multiply",   ORANGE),
    ("S", "Subtract",   PINK),
    ("B", "Bring Down", GRAPE),
]


def T(s, size=40, color=INK):
    return Text(s, font_size=size, color=color, weight=BOLD)


# ── Scene ──────────────────────────────────────────────────────────────────
class LongDivisionWorksheet(Scene):

    def construct(self):
        self.mascot = None
        self.tracker_boxes = []
        self.tracker_colors = [c for _, _, c in STEP_DATA]

        self.intro()
        for i, (dividend, divisor) in enumerate(
            [(568, 3), (826, 6), (599, 2), (473, 9), (602, 5), (735, 4)], 1
        ):
            self.solve(i, dividend, divisor)
        self.outro()

    # ── Mascot ──────────────────────────────────────────────────────────────
    def build_mascot(self):
        star = Star(n=5, outer_radius=0.5, inner_radius=0.22,
                    color=SUN, fill_opacity=1, stroke_color=INK, stroke_width=3)
        el = Dot(star.get_center() + LEFT  * 0.1 + UP * 0.07, radius=0.04, color=INK)
        er = Dot(star.get_center() + RIGHT * 0.1 + UP * 0.07, radius=0.04, color=INK)
        sm = Arc(radius=0.10, start_angle=PI + 0.45, angle=PI - 0.9,
                 color=INK, stroke_width=3).move_to(star.get_center() + DOWN * 0.04)
        return VGroup(star, el, er, sm)

    def bounce(self, n=1):
        if self.mascot is None:
            return
        for _ in range(n):
            self.play(self.mascot.animate.shift(UP   * 0.2), run_time=0.17)
            self.play(self.mascot.animate.shift(DOWN * 0.2), run_time=0.17)

    # ── DMSB tracker ────────────────────────────────────────────────────────
    def build_tracker(self):
        boxes = []
        for letter, name, _ in STEP_DATA:
            rect = RoundedRectangle(
                width=2.5, height=0.62, corner_radius=0.16,
                fill_color=PANEL_BG, fill_opacity=1,
                stroke_color=INK, stroke_width=2.5,
            )
            lbl = Text(f"{letter}  {name}", font_size=22, color=INK, weight=BOLD)
            lbl.move_to(rect)
            boxes.append(VGroup(rect, lbl))

        self.tracker_boxes = boxes
        rows  = VGroup(*boxes).arrange(DOWN, buff=0.22)
        title = T("Steps", size=26, color=INK)
        panel = VGroup(title, rows).arrange(DOWN, buff=0.28)
        panel.move_to(RIGHT * 4.2 + DOWN * 0.2)
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
        self.play(*anims, run_time=0.22)

    def reset_tracker(self):
        anims = []
        for rect, lbl in self.tracker_boxes:
            anims += [rect.animate.set_fill(PANEL_BG, opacity=1),
                      lbl.animate.set_color(INK)]
        if anims:
            self.play(*anims, run_time=0.22)

    # ── Intro ────────────────────────────────────────────────────────────────
    def intro(self):
        self.mascot = self.build_mascot().to_corner(UR, buff=0.4)

        title = T("Long Division", size=62, color=PINK)
        sub   = T("with Remainders", size=36, color=SKY).next_to(title, DOWN, buff=0.25)

        dots = VGroup(*[
            Dot(radius=0.19, color=c, fill_opacity=1, stroke_color=INK, stroke_width=3)
            for c in [PINK, SKY, GRASS, SUN, GRAPE, ORANGE]
        ]).arrange(RIGHT, buff=0.4).next_to(sub, DOWN, buff=0.5)

        self.play(Write(title), FadeIn(self.mascot))
        self.play(FadeIn(sub, shift=UP))
        self.play(LaggedStart(*[FadeIn(d, scale=0.3) for d in dots], lag_ratio=0.12))
        self.bounce(2)

        steps = VGroup(*[
            T(txt, size=30, color=col)
            for txt, col in [
                ("D — Divide",     GRASS),
                ("M — Multiply",   ORANGE),
                ("S — Subtract",   PINK),
                ("B — Bring down", GRAPE),
            ]
        ]).arrange(DOWN, aligned_edge=LEFT, buff=0.22).next_to(dots, DOWN, buff=0.5)

        self.play(LaggedStart(*[Write(s) for s in steps], lag_ratio=0.2))
        self.wait(1.0)
        self.play(
            FadeOut(VGroup(title, sub, dots, steps)),
            self.mascot.animate.scale(0.65).to_corner(UR, buff=0.3),
        )

    # ── Solver ───────────────────────────────────────────────────────────────
    def solve(self, num, dividend, divisor):
        digit_strs = list(str(dividend))
        n          = len(digit_strs)
        digits     = [int(d) for d in digit_strs]

        # Header
        header = T(f"Problem {num}   {dividend} ÷ {divisor}", size=32, color=PINK)
        header.to_edge(UP, buff=0.25)

        # DMSB tracker
        tracker = self.build_tracker()

        # ── Build the bracket layout ────────────────────────────────────────
        div_mob  = T(str(divisor), size=LARGE, color=SKY)
        dd_mobs  = VGroup(*[T(d, size=LARGE, color=INK) for d in digit_strs])
        dd_mobs.arrange(RIGHT, buff=0.5)
        dd_mobs.next_to(div_mob, RIGHT, buff=0.65)

        layout = VGroup(div_mob, dd_mobs)
        layout.move_to(LEFT * 2.5 + UP * 1.7)

        # Geometry for bracket lines
        top_y    = dd_mobs.get_top()[1]    + 0.22
        left_x   = dd_mobs.get_left()[0]   - 0.18
        right_x  = dd_mobs.get_right()[0]  + 0.22
        bot_y    = dd_mobs.get_bottom()[1] - 0.22

        h_bar   = Line([left_x, top_y, 0], [right_x, top_y, 0], color=INK, stroke_width=5)
        v_bar   = Line([left_x, top_y, 0], [left_x,  bot_y, 0], color=INK, stroke_width=5)
        bracket = VGroup(h_bar, v_bar)

        quotient_y   = top_y + 0.52
        work_start_y = dd_mobs.get_bottom()[1] - 0.58   # first subtract row y

        # Per-digit column anchors
        digit_xs     = [dd_mobs[i].get_center()[0] for i in range(n)]
        digit_rights = [dd_mobs[i].get_right()[0]  for i in range(n)]

        self.play(
            FadeIn(header,  shift=DOWN),
            FadeIn(tracker, shift=LEFT),
            FadeIn(div_mob, shift=RIGHT),
            FadeIn(dd_mobs),
            Create(bracket),
        )

        # ── Step through the division ────────────────────────────────────────
        quotient_mobs = []
        work_group    = VGroup()
        remainder     = 0
        work_y        = work_start_y   # tracks where the next subtract line goes

        for idx in range(n):
            current = remainder * 10 + digits[idx]
            q       = current // divisor
            sub_val = q * divisor
            new_rem = current - sub_val

            # Highlight the active dividend digit
            hi = SurroundingRectangle(
                dd_mobs[idx], color=SUN, buff=0.07, stroke_width=4, corner_radius=0.08
            )
            self.play(Create(hi), run_time=0.28)

            # ── D: Write quotient digit ──────────────────────────────────────
            self.highlight_step(0)
            q_mob = T(str(q), size=LARGE, color=GRASS)
            q_mob.move_to([digit_xs[idx], quotient_y, 0])
            self.play(Write(q_mob))
            quotient_mobs.append(q_mob)

            # ── M: Write the multiply result (what we subtract) ─────────────
            self.highlight_step(1)
            sub_mob = T(f"−{sub_val}", size=WORK, color=ORANGE)
            sub_mob.set_y(work_y)
            sub_mob.align_to(dd_mobs[idx], RIGHT)
            self.play(Write(sub_mob))

            # ── S: Draw line and result ──────────────────────────────────────
            self.highlight_step(2)
            line_y = sub_mob.get_bottom()[1] - 0.10
            line = Line(
                [sub_mob.get_left()[0]  - 0.08, line_y, 0],
                [sub_mob.get_right()[0] + 0.08, line_y, 0],
                color=INK, stroke_width=4,
            )
            self.play(Create(line))

            res_mob = T(str(new_rem), size=WORK, color=GRAPE)
            res_mob.set_y(line_y - 0.38)
            res_mob.align_to(dd_mobs[idx], RIGHT)
            self.play(Write(res_mob))

            self.play(FadeOut(hi), run_time=0.18)

            # ── B: Bring down next digit ─────────────────────────────────────
            if idx < n - 1:
                self.highlight_step(3)

                # Arrow curving from the next dividend digit down to the work area
                arrow_target = np.array([digit_rights[idx + 1],
                                         res_mob.get_center()[1] + 0.22, 0])
                arrow = CurvedArrow(
                    dd_mobs[idx + 1].get_bottom() + DOWN * 0.05,
                    arrow_target,
                    angle=-TAU / 8,
                    color=GRAPE, stroke_width=4,
                )
                self.play(Create(arrow), run_time=0.32)

                # Animate the digit dropping down
                brought = T(digit_strs[idx + 1], size=WORK, color=GRAPE)
                brought.next_to(res_mob, RIGHT, buff=0.06)
                self.play(FadeIn(brought, shift=DOWN * 0.22))
                self.play(FadeOut(arrow), run_time=0.18)

                # Merge result + brought into a combined number
                combined_val = new_rem * 10 + digits[idx + 1]
                combined = T(str(combined_val), size=WORK, color=GRAPE)
                combined.set_y(res_mob.get_center()[1])
                combined.align_to(dd_mobs[idx + 1], RIGHT)

                self.play(ReplacementTransform(VGroup(res_mob, brought), combined))
                work_group.add(sub_mob, line, combined)
                work_y = combined.get_center()[1] - 0.52
            else:
                work_group.add(sub_mob, line, res_mob)
                work_y = res_mob.get_center()[1] - 0.45

            remainder = new_rem

        # ── Remainder callout ────────────────────────────────────────────────
        self.reset_tracker()
        last_result = work_group[-1]
        rem_box = SurroundingRectangle(
            last_result, color=PINK, stroke_width=4, buff=0.1, corner_radius=0.09
        )
        rem_lbl = T(f"R = {remainder}", size=SMALL + 2, color=PINK)
        rem_lbl.next_to(rem_box, DOWN, buff=0.15)
        rem_lbl.align_to(rem_box, RIGHT)
        self.play(Create(rem_box), Write(rem_lbl))
        work_group.add(rem_box, rem_lbl)

        # ── Answer banner ────────────────────────────────────────────────────
        quotient_val = dividend // divisor
        banner = RoundedRectangle(
            width=9.5, height=1.1, corner_radius=0.32,
            fill_color=SUN, fill_opacity=0.55,
            stroke_color=PINK, stroke_width=5,
        ).to_edge(DOWN, buff=0.22)
        ans = T(
            f"{dividend} ÷ {divisor}  =  {quotient_val}  R {remainder}",
            size=36, color=INK,
        ).move_to(banner)

        self.play(FadeIn(banner, scale=0.88), Write(ans))
        self.bounce(2)
        self.wait(1.3)

        # Cleanup
        self.play(FadeOut(VGroup(
            header, tracker, layout, bracket,
            *quotient_mobs, work_group, banner, ans,
        )))

    # ── Outro ────────────────────────────────────────────────────────────────
    def outro(self):
        msg = T("You're a Math Superstar!", size=52, color=PINK)
        np.random.seed(42)
        sparkles = VGroup(*[
            Star(n=5, outer_radius=0.22, inner_radius=0.09,
                 color=c, fill_opacity=1, stroke_color=INK, stroke_width=2)
            for c in ([SUN, SKY, GRASS, PINK, GRAPE, ORANGE] * 2)
        ])
        for s in sparkles:
            s.move_to([np.random.uniform(-5.5, 5.5), np.random.uniform(-3.2, 3.2), 0])

        self.play(Write(msg))
        self.play(LaggedStart(*[FadeIn(s, scale=2) for s in sparkles], lag_ratio=0.08))
        self.bounce(3)
        self.wait(2)
