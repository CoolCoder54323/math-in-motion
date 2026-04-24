import type { SceneIR, SceneIRAction, SceneIRAnchor, SceneIRObject } from "./types";

const DEFAULT_SAFE_AREA = {
  xMin: -6.5,
  xMax: 6.5,
  yMin: -3.5,
  yMax: 3.5,
};

function toPython(value: unknown): string {
  return pythonLiteral(value, 0);
}

function pythonLiteral(value: unknown, indentLevel: number): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "None";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const indent = " ".repeat(indentLevel);
    const childIndent = " ".repeat(indentLevel + 2);
    return `[\n${value
      .map((entry) => `${childIndent}${pythonLiteral(entry, indentLevel + 2)}`)
      .join(",\n")}\n${indent}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const indent = " ".repeat(indentLevel);
    const childIndent = " ".repeat(indentLevel + 2);
    return `{\n${entries
      .map(([key, entryValue]) => `${childIndent}${JSON.stringify(key)}: ${pythonLiteral(entryValue, indentLevel + 2)}`)
      .join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(String(value));
}

function compoundHint(spec: SceneIRObject): string {
  switch (spec.kind) {
    case "compound.pizza_ratio":
      return "Pizza ratio visual with sectors and ratio label";
    case "compound.array_grid":
      return "Array/grid with highlighted cells";
    case "compound.percent_grid":
      return "10x10 percent grid with highlighted cells";
    case "compound.fraction_percent_board":
      return "Fraction to percent conversion board";
    case "compound.misconception_panel":
      return "Two-column misconception panel with wrong and right lanes";
    case "compound.callout_card":
      return "Callout card with title and body";
    case "compound.asset_stage":
      return "Asset-led stage area with caption";
    case "compound.number_line_walk":
      return "Number-line walk with start/end markers and jump arc";
    case "compound.grouped_dots":
      return "Grouped dots model for arrays and multiplication";
    case "compound.split_shape":
      return "Shape split into equal parts with highlighted portion";
    case "compound.trace_path":
      return "Path that can be traced to show distance around";
    case "compound.grid_fill":
      return "Area/grid fill model";
    case "compound.equation_ladder":
      return "Step-by-step equation ladder";
    case "compound.story_stage":
      return "Small story stage with character and caption";
    case "compound.character":
      return "Expressive reusable character with pose and emotion props";
    default:
      return spec.kind;
  }
}

function actionHint(action: SceneIRAction): string {
  switch (action.type) {
    case "show":
      return `show ${action.targets.join(", ")}`;
    case "hide":
      return `hide ${action.targets.join(", ")}`;
    case "transform":
      return `transform ${action.from} -> ${action.to}`;
    case "emphasize":
      return `emphasize ${action.targets.join(", ")}`;
    case "highlight":
      return `highlight ${action.targets.join(", ")}`;
    case "move":
      return `move ${action.targets.join(", ")}`;
    case "wait":
      return `wait ${action.seconds}s`;
    case "custom":
      return `custom ${action.block}`;
    case "recipe":
      return `recipe ${action.recipe}`;
  }
}

export function buildSceneBlueprintComment(sceneIR: SceneIR): string {
  const objectLines = sceneIR.objects
    .map((obj) => `#   - ${obj.id}: ${compoundHint(obj)}`)
    .join("\n");
  const beatLines = sceneIR.beats
    .map((beat) => `#   - ${beat.id}: ${beat.actions.map(actionHint).join("; ")}`)
    .join("\n");
  return [
    "# LAYOUT PLAN",
    `# Scene: ${sceneIR.metadata.sceneId}`,
    objectLines || "#   - no objects",
    "# BEATS",
    beatLines || "#   - no beats",
  ].join("\n");
}

export function getSceneSafeArea(sceneIR: SceneIR) {
  return sceneIR.layout.safeArea ?? DEFAULT_SAFE_AREA;
}

export function getManimKitPython(): string {
  return `from manim import *
import numpy as np
import json
import os
import re
from pathlib import Path

BG = "#FFF4D6"
INK = "#2D2013"
PINK = "#FF6FA3"
SKY = "#4FC3F7"
GRASS = "#56C42A"
SUN = "#FFD23F"
GRAPE = "#9B59D0"
ORANGE = "#FF8C42"
PANEL_BG = "#E8D5A3"
RED_ACCENT = "#E45757"
config.background_color = BG

DEFAULT_SAFE_AREA = {"xMin": -6.5, "xMax": 6.5, "yMin": -3.5, "yMax": 3.5}

PROP_ALIASES = {
    "fontSize": "font_size",
    "fillOpacity": "fill_opacity",
    "fillColor": "fill_color",
    "strokeWidth": "stroke_width",
    "strokeColor": "stroke_color",
    "startAngle": "start_angle",
    "endAngle": "end_angle",
    "xRange": "x_range",
    "includeNumbers": "include_numbers",
    "includeTicks": "include_ticks",
    "numbersToInclude": "numbers_to_include",
    "cellSize": "cell_size",
}

def symbol_value(value):
    if isinstance(value, str):
        symbols = {
            "PI": PI,
            "TAU": TAU,
            "UP": UP,
            "DOWN": DOWN,
            "LEFT": LEFT,
            "RIGHT": RIGHT,
            "ORIGIN": ORIGIN,
            "WHITE": WHITE,
            "BLACK": BLACK,
            "BLUE": BLUE,
            "GREEN": GREEN,
            "RED": RED,
            "YELLOW": YELLOW,
            "PURPLE": PURPLE,
            "ORANGE": ORANGE,
            "PINK": PINK,
            "GRAY": GRAY,
            "GREY": GRAY,
            "SKY": SKY,
            "GRASS": GRASS,
            "SUN": SUN,
            "GRAPE": GRAPE,
            "INK": INK,
            "PANEL_BG": PANEL_BG,
            "RED_ACCENT": RED_ACCENT,
        }
        return symbols.get(value, value)
    return value

def compat_props(props):
    result = {}
    for key, value in (props or {}).items():
        resolved = symbol_value(value)
        result[key] = resolved
        alias = PROP_ALIASES.get(key)
        if alias:
            result[alias] = resolved
    return result

def T(s, size=40, color=INK):
    return Text(str(s), font_size=size, color=color, weight=BOLD)

def readable_math_text(value):
    text = str(value)
    text = re.sub(r"\\\\frac\\{([^{}]+)\\}\\{([^{}]+)\\}", r"\\1/\\2", text)
    text = text.replace("\\\\times", "×")
    text = text.replace("\\\\cdot", "·")
    text = text.replace("\\\\text{", "").replace("}", "")
    text = text.replace("\\\\", "")
    return text

def build_mascot():
    return build_character({"shape": "star", "expression": "happy", "bodyColor": SUN, "scale": 0.8})

def build_character(props=None):
    props = compat_props(props or {})
    shape = props.get("shape", "star")
    expression = props.get("expression", "happy")
    pose = props.get("pose", "neutral")
    body_color = symbol_value(props.get("bodyColor", SUN))
    accent_color = symbol_value(props.get("accentColor", SKY))
    stroke_color = symbol_value(props.get("strokeColor", INK))
    scale = props.get("scale", 1.0)

    if shape == "circle":
        body = Circle(radius=0.48, color=stroke_color, stroke_width=3)
        body.set_fill(body_color, opacity=1)
    elif shape == "gem":
        body = RegularPolygon(n=6, radius=0.52, color=stroke_color, stroke_width=3)
        body.set_fill(body_color, opacity=1)
    else:
        body = Star(n=5, outer_radius=0.58, inner_radius=0.26, color=stroke_color, stroke_width=3)
        body.set_fill(body_color, opacity=1)

    eye_y = 0.10
    eye_dx = 0.13
    if expression == "curious":
        left_eye = Circle(radius=0.045, color=stroke_color, stroke_width=2).move_to(body.get_center() + LEFT * eye_dx + UP * eye_y)
        right_eye = Dot(radius=0.04, color=stroke_color).move_to(body.get_center() + RIGHT * eye_dx + UP * (eye_y + 0.02))
    elif expression == "surprised":
        left_eye = Circle(radius=0.045, color=stroke_color, stroke_width=2).move_to(body.get_center() + LEFT * eye_dx + UP * eye_y)
        right_eye = Circle(radius=0.045, color=stroke_color, stroke_width=2).move_to(body.get_center() + RIGHT * eye_dx + UP * eye_y)
    else:
        left_eye = Dot(radius=0.045, color=stroke_color).move_to(body.get_center() + LEFT * eye_dx + UP * eye_y)
        right_eye = Dot(radius=0.045, color=stroke_color).move_to(body.get_center() + RIGHT * eye_dx + UP * eye_y)

    if expression == "surprised":
        mouth = Circle(radius=0.055, color=stroke_color, stroke_width=3).move_to(body.get_center() + DOWN * 0.08)
    elif expression == "thinking":
        mouth = Line(LEFT * 0.08, RIGHT * 0.08, color=stroke_color, stroke_width=3).move_to(body.get_center() + DOWN * 0.10)
    else:
        mouth = Arc(radius=0.13, start_angle=PI + 0.35, angle=PI - 0.7, color=stroke_color, stroke_width=3).move_to(body.get_center() + DOWN * 0.05)

    left_arm = Line(LEFT * 0.35, LEFT * 0.72 + DOWN * 0.02, color=stroke_color, stroke_width=4)
    right_target = RIGHT * 0.72 + (UP * 0.20 if pose in {"point", "celebrate"} else DOWN * 0.02)
    right_arm = Line(RIGHT * 0.35, right_target, color=stroke_color, stroke_width=4)
    left_arm.move_to(body.get_center() + LEFT * 0.47)
    right_arm.move_to(body.get_center() + RIGHT * 0.47)
    sparkle = Star(n=4, outer_radius=0.12, inner_radius=0.05, color=accent_color, fill_opacity=1, stroke_width=0)
    sparkle.move_to(body.get_center() + RIGHT * 0.68 + UP * 0.45)
    parts = [left_arm, right_arm, body, left_eye, right_eye, mouth]
    if pose == "celebrate":
        parts.append(sparkle)
    character = VGroup(*parts).scale(scale)
    if props.get("label"):
        label = T(props.get("label"), size=props.get("labelSize", 22), color=stroke_color)
        label.next_to(character, DOWN, buff=0.18)
        character = VGroup(character, label)
    return character

class RuntimeSceneProxy:
    def __init__(self, scene, registry):
        object.__setattr__(self, "_scene", scene)
        object.__setattr__(self, "_registry", registry)

    def __getattr__(self, name):
        registry = object.__getattribute__(self, "_registry")
        if name in registry:
            return registry[name]
        return getattr(object.__getattribute__(self, "_scene"), name)

    def __getitem__(self, key):
        return object.__getattribute__(self, "_registry")[key]

    def __setattr__(self, name, value):
        if name in {"_scene", "_registry"}:
            object.__setattr__(self, name, value)
            return
        setattr(object.__getattribute__(self, "_scene"), name, value)

class SceneRuntime:
    def __init__(self, scene, scene_ir, scene_dir):
        self.scene = scene
        self.scene_ir = scene_ir
        self.scene_dir = Path(scene_dir)
        self.registry = {}
        self.object_specs = {spec["id"]: spec for spec in scene_ir.get("objects", [])}
        self.related_map = {
            spec["id"]: list(spec.get("relatedTo", []))
            for spec in scene_ir.get("objects", [])
        }
        self.visible = set()
        self.snapshots = []
        self.time_cursor = 0.0
        self.preflight_report_path = os.environ.get("MIM_PREFLIGHT_REPORT")
        self.namespace = {
            "scene": scene,
            "runtime": self,
            "registry": self.registry,
            "np": np,
            "T": T,
            "RuntimeSceneProxy": RuntimeSceneProxy,
            "compat_props": compat_props,
            "symbol_value": symbol_value,
            "readable_math_text": readable_math_text,
            "build_mascot": build_mascot,
            "BG": BG,
            "INK": INK,
            "PINK": PINK,
            "SKY": SKY,
            "GRASS": GRASS,
            "SUN": SUN,
            "GRAPE": GRAPE,
            "ORANGE": ORANGE,
            "PANEL_BG": PANEL_BG,
            "RED_ACCENT": RED_ACCENT,
            "WHITE": WHITE,
            "BLACK": BLACK,
            "BLUE": BLUE,
            "GREEN": GREEN,
            "RED": RED,
            "YELLOW": YELLOW,
            "PURPLE": PURPLE,
            "GRAY": GRAY,
            "GREY": GRAY,
            "Text": Text,
            "MathTex": MathTex,
            "Circle": Circle,
            "Arc": Arc,
            "Sector": Sector,
            "Square": Square,
            "Rectangle": Rectangle,
            "RoundedRectangle": RoundedRectangle,
            "Star": Star,
            "RegularPolygon": RegularPolygon,
            "VGroup": VGroup,
            "Group": Group,
            "Dot": Dot,
            "Arrow": Arrow,
            "Line": Line,
            "Brace": Brace,
            "NumberLine": NumberLine,
            "ImageMobject": ImageMobject,
            "SVGMobject": SVGMobject,
            "FadeIn": FadeIn,
            "FadeOut": FadeOut,
            "Create": Create,
            "Write": Write,
            "ReplacementTransform": ReplacementTransform,
            "Transform": Transform,
            "TransformMatchingTex": TransformMatchingTex,
            "Indicate": Indicate,
            "Circumscribe": Circumscribe,
            "LaggedStart": LaggedStart,
            "GrowFromCenter": GrowFromCenter,
            "GrowArrow": GrowArrow,
            "Uncreate": Uncreate,
            "UP": UP,
            "DOWN": DOWN,
            "LEFT": LEFT,
            "RIGHT": RIGHT,
            "ORIGIN": ORIGIN,
            "PI": PI,
            "TAU": TAU,
        }
        self._install_custom_blocks()

    def _install_custom_blocks(self):
        blocks = self.scene_ir.get("customBlocks") or {}
        helpers = blocks.get("helpers")
        if helpers:
            exec(helpers, self.namespace, self.namespace)
        for bucket in ("objectFactories", "timeline", "updaters"):
            for entry in blocks.get(bucket, []) or []:
                code = entry.get("code")
                if code:
                    exec(code, self.namespace, self.namespace)

    def safe_area(self):
        return self.scene_ir.get("layout", {}).get("safeArea") or DEFAULT_SAFE_AREA

    def zone_map(self):
        return {zone["id"]: zone for zone in self.scene_ir.get("layout", {}).get("zones", [])}

    def resolve_anchor(self, anchor):
        anchor = anchor or {}
        zone = self.zone_map().get(anchor.get("zone"))
        if zone is None:
            return np.array([0.0, 0.0, 0.0])
        x = zone["x"]
        y = zone["y"]
        width = zone["width"]
        height = zone["height"]
        align = anchor.get("align", "center")
        if "left" in align:
            x -= width / 2
        elif "right" in align:
            x += width / 2
        if "top" in align:
            y += height / 2
        elif "bottom" in align:
            y -= height / 2
        x += anchor.get("dx", 0.0)
        y += anchor.get("dy", 0.0)
        return np.array([x, y, 0.0])

    def register(self, object_id, mob, spec=None):
        spec = spec or self.object_specs.get(object_id, {})
        self.registry[object_id] = mob
        self.namespace[object_id] = mob
        self.related_map[object_id] = list(spec.get("relatedTo", []))
        return mob

    def get(self, object_id):
        return self.registry[object_id]

    def asset_path(self, name):
        return str(self.scene_dir / name)

    def _highlight_key(self, value):
        if isinstance(value, str):
            cleaned = value.replace(":", ",")
            parts = [part.strip() for part in cleaned.split(",")]
            if len(parts) >= 2:
                return f"{int(float(parts[0]))}:{int(float(parts[1]))}"
        if isinstance(value, dict):
            return f"{int(float(value.get('row')))}:{int(float(value.get('col')))}"
        if isinstance(value, (list, tuple)) and len(value) >= 2:
            return f"{int(float(value[0]))}:{int(float(value[1]))}"
        return None

    def _highlight_keys(self, values):
        keys = set()
        for item in values or []:
            try:
                key = self._highlight_key(item)
                if key is not None:
                    keys.add(key)
            except Exception:
                continue
        return keys

    def _safe_float(self, value, default=0.0):
        try:
            return float(value or default)
        except Exception:
            return default

    def _color(self, value, default=INK):
        resolved = symbol_value(value)
        return resolved if resolved is not None else default

    def _text_color(self, value, default=INK):
        if isinstance(value, str) and value.upper() in {"WHITE", "YELLOW", "GRAY", "GREY"}:
            return default
        resolved = self._color(value, default)
        try:
            if resolved in {WHITE, YELLOW, GRAY}:
                return default
        except Exception:
            pass
        return resolved

    def _direction(self, value, default=DOWN):
        resolved = symbol_value(value)
        return resolved if resolved is not None else default

    def _safe_font_size(self, mob):
        try:
            value = getattr(mob, "font_size", None)
            if value is None:
                return None
            return float(value)
        except Exception:
            return None

    def _point3(self, value, fallback):
        if value is None:
            value = fallback
        arr = np.array(value, dtype=float).flatten()
        if arr.size == 2:
            arr = np.array([arr[0], arr[1], 0.0])
        elif arr.size == 1:
            arr = np.array([arr[0], 0.0, 0.0])
        elif arr.size >= 3:
            arr = np.array([arr[0], arr[1], arr[2]])
        else:
            arr = np.array(fallback, dtype=float).flatten()
            if arr.size == 2:
                arr = np.array([arr[0], arr[1], 0.0])
        return arr

    def build_object(self, spec):
        kind = spec["kind"]
        props = compat_props(spec.get("props") or {})
        mob = None
        if kind == "text":
            mob = T(props.get("text", ""), size=props.get("fontSize", props.get("font_size", 40)), color=self._text_color(props.get("color"), INK))
        elif kind == "math":
            text = readable_math_text(props.get("tex", props.get("texString", props.get("tex_string", ""))))
            mob = T(text, size=props.get("fontSize", props.get("font_size", 36)), color=self._text_color(props.get("color"), INK))
            if props.get("scale"):
                mob.scale(props.get("scale"))
        elif kind == "rectangle":
            mob = Rectangle(
                width=props.get("width", 2.4),
                height=props.get("height", 1.4),
                color=self._color(props.get("strokeColor"), INK),
            )
            mob.set_fill(self._color(props.get("fillColor"), PANEL_BG), opacity=props.get("fillOpacity", 0.75))
        elif kind == "rounded_rect":
            mob = RoundedRectangle(
                width=props.get("width", 2.4),
                height=props.get("height", 1.4),
                corner_radius=props.get("cornerRadius", 0.18),
                color=self._color(props.get("strokeColor"), INK),
            )
            mob.set_fill(self._color(props.get("fillColor"), PANEL_BG), opacity=props.get("fillOpacity", 0.75))
        elif kind == "circle":
            mob = Circle(radius=props.get("radius", 0.9), color=self._color(props.get("strokeColor", props.get("color")), INK))
            mob.set_fill(self._color(props.get("fillColor", props.get("color")), SKY), opacity=props.get("fillOpacity", 0.2))
        elif kind == "dot":
            mob = Dot(radius=props.get("radius", 0.08), color=self._color(props.get("color"), INK))
        elif kind == "line":
            mob = Line(
                self._point3(props.get("start"), LEFT),
                self._point3(props.get("end"), RIGHT),
                color=self._color(props.get("color"), INK),
            )
        elif kind == "arrow":
            mob = Arrow(
                self._point3(props.get("start"), LEFT),
                self._point3(props.get("end"), RIGHT),
                color=self._color(props.get("color"), ORANGE),
                buff=props.get("buff", 0.2),
            )
        elif kind == "brace":
            target_id = props.get("target")
            direction_name = props.get("direction", "DOWN")
            direction = {"UP": UP, "DOWN": DOWN, "LEFT": LEFT, "RIGHT": RIGHT}.get(direction_name, DOWN)
            mob = Brace(self.get(target_id), direction=direction)
        elif kind == "number_line":
            x_range = props.get("xRange", [0, 10, 1])
            if len(x_range) == 2:
                x_range = [x_range[0], x_range[1], 1]
            mob = NumberLine(
                x_range=x_range,
                length=props.get("length", 6),
                color=self._color(props.get("color"), INK),
                include_numbers=props.get("includeNumbers", True),
            )
        elif kind == "compound.callout_card":
            title = T(props.get("title", ""), size=props.get("titleSize", 28), color=props.get("titleColor", INK))
            body = T(props.get("body", ""), size=props.get("bodySize", 22), color=props.get("bodyColor", INK))
            body.next_to(title, DOWN, buff=0.22)
            inner = VGroup(title, body)
            box = RoundedRectangle(
                width=max(inner.width + 0.6, props.get("width", inner.width + 0.6)),
                height=max(inner.height + 0.6, props.get("height", inner.height + 0.6)),
                corner_radius=props.get("cornerRadius", 0.22),
                color=props.get("strokeColor", INK),
            )
            box.set_fill(props.get("fillColor", PANEL_BG), opacity=props.get("fillOpacity", 0.92))
            inner.move_to(box.get_center())
            mob = VGroup(box, inner)
        elif kind == "compound.asset_stage":
            asset = props.get("asset")
            if asset and asset.lower().endswith(".svg"):
                actor = SVGMobject(self.asset_path(asset))
            elif asset:
                actor = ImageMobject(self.asset_path(asset))
            else:
                actor = build_mascot()
            actor.scale(props.get("scale", 1.0))
            caption = T(props.get("caption", ""), size=props.get("captionSize", 24), color=props.get("captionColor", INK))
            caption.next_to(actor, DOWN, buff=0.25)
            mob = VGroup(actor, caption)
        elif kind == "compound.pizza_ratio":
            numerator = int(props.get("numerator", 3))
            denominator = max(int(props.get("denominator", 5)), 1)
            radius = props.get("radius", 1.05)
            sectors = []
            for index in range(denominator):
                sector = Sector(
                    radius=radius,
                    start_angle=index * TAU / denominator,
                    angle=TAU / denominator,
                    color=INK,
                    stroke_width=2,
                )
                fill = PINK if index < numerator else PANEL_BG
                sector.set_fill(fill, opacity=0.95)
                sectors.append(sector)
            pizza = VGroup(*sectors)
            label = MathTex(r"\\frac{%s}{%s}" % (numerator, denominator), color=INK).scale(props.get("labelScale", 1.0))
            label.next_to(pizza, DOWN, buff=0.28)
            mob = VGroup(pizza, label)
        elif kind == "compound.array_grid":
            rows = max(int(props.get("rows", 3)), 1)
            cols = max(int(props.get("cols", 4)), 1)
            highlight = self._highlight_keys(props.get("highlighted", []))
            cell = props.get("cellSize", 0.55)
            cells = []
            for row in range(rows):
                for col in range(cols):
                    square = Square(side_length=cell, color=INK, stroke_width=2)
                    fill = SKY if f"{row}:{col}" in highlight else PANEL_BG
                    square.set_fill(fill, opacity=0.95)
                    square.move_to(np.array([(col - (cols - 1) / 2) * (cell + 0.05), ((rows - 1) / 2 - row) * (cell + 0.05), 0]))
                    cells.append(square)
            mob = VGroup(*cells)
        elif kind == "compound.percent_grid":
            highlighted = int(props.get("highlighted", 35))
            cell = props.get("cellSize", 0.28)
            cells = []
            for row in range(10):
                for col in range(10):
                    index = row * 10 + col
                    square = Square(side_length=cell, color=INK, stroke_width=1)
                    square.set_fill(SKY if index < highlighted else PANEL_BG, opacity=0.95)
                    square.move_to(np.array([(col - 4.5) * (cell + 0.03), (4.5 - row) * (cell + 0.03), 0]))
                    cells.append(square)
            label = T(f"{highlighted}%", size=26, color=INK)
            grid = VGroup(*cells)
            label.next_to(grid, DOWN, buff=0.22)
            mob = VGroup(grid, label)
        elif kind == "compound.fraction_percent_board":
            frac = MathTex(props.get("fractionTex", r"\\frac{3}{5}"), color=INK).scale(props.get("fractionScale", 1.2))
            arrow = Arrow(LEFT * 0.8, RIGHT * 0.8, color=ORANGE, buff=0.1)
            percent = T(props.get("percentText", "60%"), size=42, color=INK)
            row = VGroup(frac, arrow, percent).arrange(RIGHT, buff=0.35)
            caption = T(props.get("caption", ""), size=22, color=INK)
            caption.next_to(row, DOWN, buff=0.25)
            mob = VGroup(row, caption)
        elif kind == "compound.misconception_panel":
            wrong = T(props.get("wrongTitle", "Wrong way"), size=26, color=ORANGE)
            wrong_body = T(props.get("wrongBody", ""), size=22, color=INK)
            wrong_body.next_to(wrong, DOWN, buff=0.15)
            wrong_box = RoundedRectangle(width=3.4, height=max(1.8, wrong_body.height + 0.8), corner_radius=0.22, color=ORANGE)
            wrong_box.set_fill("#FFE3D2", opacity=0.95)
            wrong_group = VGroup(wrong_box, VGroup(wrong, wrong_body).move_to(wrong_box.get_center()))

            right = T(props.get("rightTitle", "Right way"), size=26, color=SKY)
            right_body = T(props.get("rightBody", ""), size=22, color=INK)
            right_body.next_to(right, DOWN, buff=0.15)
            right_box = RoundedRectangle(width=3.4, height=max(1.8, right_body.height + 0.8), corner_radius=0.22, color=SKY)
            right_box.set_fill("#DFF3FF", opacity=0.95)
            right_group = VGroup(right_box, VGroup(right, right_body).move_to(right_box.get_center()))

            mob = VGroup(wrong_group, right_group).arrange(RIGHT, buff=0.45)
        elif kind == "compound.grouped_dots":
            groups = max(int(props.get("groups", props.get("rows", 3))), 1)
            per_group = max(int(props.get("perGroup", props.get("cols", 3))), 1)
            dot_radius = props.get("dotRadius", 0.13)
            spacing = props.get("spacing", 0.28)
            group_spacing = props.get("groupSpacing", 0.55)
            palette = props.get("colors") or [SKY, GRASS, SUN, PINK, GRAPE, ORANGE]
            highlight_group = props.get("highlightGroup")
            highlight_color = self._color(props.get("highlightColor"), SUN)
            rows = []
            for group_index in range(groups):
                color = self._color(palette[group_index % len(palette)], SKY)
                if highlight_group is not None and int(highlight_group) == group_index:
                    color = highlight_color
                dots = VGroup(*[Dot(radius=dot_radius, color=color) for _ in range(per_group)])
                dots.arrange(RIGHT, buff=spacing)
                if props.get("boxed", True):
                    box = RoundedRectangle(
                        width=max(1.0, dots.width + 0.35),
                        height=max(0.7, dots.height + 0.35),
                        corner_radius=0.12,
                        color=color,
                    )
                    box.set_fill(color, opacity=0.12)
                    dots.move_to(box.get_center())
                    rows.append(VGroup(box, dots))
                else:
                    rows.append(dots)
            direction = DOWN if props.get("arrange", "right") == "down" else RIGHT
            mob = VGroup(*rows).arrange(direction, buff=group_spacing)
            if props.get("label"):
                label = T(props.get("label"), size=props.get("labelSize", 26), color=self._color(props.get("labelColor"), INK))
                label.next_to(mob, DOWN, buff=0.28)
                mob = VGroup(mob, label)
        elif kind == "compound.number_line_walk":
            start = float(props.get("start", 0))
            end = float(props.get("end", 10))
            step = float(props.get("step", 1))
            from_value = float(props.get("from", start))
            to_value = float(props.get("to", end))
            x_range = props.get("xRange") or [start, end, step]
            if len(x_range) == 2:
                x_range = [x_range[0], x_range[1], step]
            line = NumberLine(
                x_range=x_range,
                length=props.get("length", 8),
                color=self._color(props.get("lineColor", props.get("color")), INK),
                include_numbers=props.get("includeNumbers", True),
            )
            start_dot = Dot(line.n2p(from_value), radius=props.get("dotRadius", 0.12), color=self._color(props.get("startColor"), SKY))
            end_dot = Dot(line.n2p(to_value), radius=props.get("dotRadius", 0.12), color=self._color(props.get("endColor"), GRASS))
            label = T(props.get("label", f"{from_value:g} to {to_value:g}"), size=props.get("labelSize", 26), color=self._color(props.get("labelColor"), INK))
            label.next_to(line, DOWN, buff=0.35)
            arc_height = props.get("arcHeight", 0.7)
            arc = ArcBetweenPoints(line.n2p(from_value), line.n2p(to_value), angle=-PI / 2 if to_value < from_value else PI / 2)
            arc.set_color(self._color(props.get("arcColor"), ORANGE))
            arc.shift(UP * arc_height * 0.15)
            mob = VGroup(line, arc, start_dot, end_dot, label)
        elif kind == "compound.split_shape":
            parts = max(int(props.get("parts", props.get("splitCount", 2))), 1)
            if props.get("highlighted") is not None:
                highlighted = max(int(props.get("highlighted")), 0)
            elif props.get("highlightIndex") is not None:
                highlighted = max(int(props.get("highlightIndex")) + 1, 0)
            else:
                highlighted = 1
            shape = props.get("shape", "circle")
            fill_color = self._color(props.get("highlightColor", props.get("fillColor", props.get("color"))), SKY)
            empty_color = self._color(props.get("emptyColor"), PANEL_BG)
            stroke_color = self._color(props.get("strokeColor"), INK)
            fill_opacity = props.get("highlightOpacity", props.get("fillOpacity", 0.9))
            pieces = []
            if shape == "rectangle":
                width = props.get("width", 4.0)
                height = props.get("height", 2.0)
                for index in range(parts):
                    piece = Rectangle(width=width / parts, height=height, color=stroke_color, stroke_width=2)
                    piece.set_fill(fill_color if index < highlighted else empty_color, opacity=fill_opacity if index < highlighted else 0.45)
                    piece.move_to(RIGHT * ((index - (parts - 1) / 2) * width / parts))
                    pieces.append(piece)
            else:
                radius = props.get("radius", 1.45)
                for index in range(parts):
                    piece = Sector(
                        radius=radius,
                        start_angle=index * TAU / parts,
                        angle=TAU / parts,
                        color=stroke_color,
                        stroke_width=2,
                    )
                    piece.set_fill(fill_color if index < highlighted else empty_color, opacity=fill_opacity if index < highlighted else 0.45)
                    pieces.append(piece)
            visual = VGroup(*pieces)
            label_text = readable_math_text(props.get("label", props.get("labelTex", rf"\\frac{{{highlighted}}}{{{parts}}}")))
            label = T(label_text, size=props.get("labelSize", 30), color=self._text_color(props.get("labelColor"), INK)).scale(props.get("labelScale", 1.0))
            label.next_to(visual, DOWN, buff=0.3)
            mob = VGroup(visual, label)
        elif kind == "compound.trace_path":
            width = props.get("width", 4.0)
            height = props.get("height", 2.4)
            rect = RoundedRectangle(width=width, height=height, corner_radius=props.get("cornerRadius", 0.08), color=self._color(props.get("strokeColor"), ORANGE))
            rect.set_fill(self._color(props.get("fillColor"), PANEL_BG), opacity=props.get("fillOpacity", 0.1))
            label = T(props.get("label", "trace the path"), size=props.get("labelSize", 24), color=self._color(props.get("labelColor"), INK))
            label.next_to(rect, DOWN, buff=0.25)
            mob = VGroup(rect, label)
        elif kind == "compound.grid_fill":
            rows = max(int(props.get("rows", 4)), 1)
            cols = max(int(props.get("cols", 6)), 1)
            highlighted = max(int(props.get("highlighted", rows * cols)), 0)
            cell = props.get("cellSize", 0.42)
            cells = []
            for row in range(rows):
                for col in range(cols):
                    index = row * cols + col
                    square = Square(side_length=cell, color=self._color(props.get("strokeColor"), INK), stroke_width=1.5)
                    square.set_fill(self._color(props.get("fillColor"), GRASS) if index < highlighted else PANEL_BG, opacity=0.82)
                    square.move_to(np.array([(col - (cols - 1) / 2) * (cell + 0.04), ((rows - 1) / 2 - row) * (cell + 0.04), 0]))
                    cells.append(square)
            grid = VGroup(*cells)
            if props.get("label"):
                label = T(props.get("label"), size=props.get("labelSize", 24), color=self._color(props.get("labelColor"), INK))
                label.next_to(grid, DOWN, buff=0.25)
                mob = VGroup(grid, label)
            else:
                mob = grid
        elif kind == "compound.equation_ladder":
            steps = props.get("steps") or []
            if not steps:
                steps = [props.get("equation", "")]
            lines = VGroup(*[
                T(readable_math_text(step), size=props.get("fontSize", 28), color=self._color(props.get("color"), INK)).scale(props.get("scale", 0.85))
                for step in steps
            ]).arrange(DOWN, aligned_edge=LEFT, buff=props.get("buff", 0.28))
            mob = lines
        elif kind == "compound.story_stage":
            title = T(props.get("title", ""), size=props.get("titleSize", 30), color=self._color(props.get("titleColor"), INK))
            actor = build_character({
                "shape": props.get("characterShape", "star"),
                "expression": props.get("expression", "happy"),
                "pose": props.get("pose", "point"),
                "bodyColor": props.get("bodyColor", SUN),
                "accentColor": props.get("accentColor", SKY),
                "scale": props.get("actorScale", 1.4),
            })
            caption = T(props.get("caption", ""), size=props.get("captionSize", 23), color=self._color(props.get("captionColor"), INK))
            row = VGroup(actor, caption).arrange(RIGHT, buff=0.35)
            row.next_to(title, DOWN, buff=0.25)
            mob = VGroup(title, row)
        elif kind == "compound.character":
            mob = build_character(props)
        elif kind.startswith("custom.factory."):
            factory_name = kind.split(".", 2)[2]
            if factory_name not in self.namespace:
                raise ValueError(f"Unknown custom factory: {factory_name}")
            mob = self.namespace[factory_name](self, spec)
        else:
            title = T(spec.get("role") or kind, size=20, color=INK)
            box = RoundedRectangle(width=2.8, height=1.0, corner_radius=0.18, color=INK)
            box.set_fill(PANEL_BG, opacity=0.85)
            title.move_to(box.get_center())
            mob = VGroup(box, title)

        point = self.resolve_anchor(spec.get("anchor"))
        mob.move_to(point)
        scale = props.get("scale")
        if scale:
            mob.scale(scale)
        return self.register(spec["id"], mob, spec)

    def build_objects(self):
        ordered = sorted(
            self.scene_ir.get("objects", []),
            key=lambda item: item.get("zIndex", 0)
        )
        for spec in ordered:
            self.build_object(spec)

    def ensure_objects_added(self, object_ids):
        to_add = []
        for object_id in object_ids:
            mob = self.get(object_id)
            if mob not in self.scene.mobjects:
                to_add.append(mob)
        if to_add:
            self.scene.add(*to_add)

    def _play(self, *animations, run_time=None):
        if run_time is None:
            self.scene.play(*animations)
        else:
            self.scene.play(*animations, run_time=run_time)

    def _animation_for(self, name, target):
        name = (name or "fade_in").lower()
        if name == "create":
            return Create(target)
        if name == "write":
            return Write(target)
        if name == "grow":
            return GrowArrow(target) if isinstance(target, Arrow) else FadeIn(target)
        if name == "indicate":
            return Indicate(target)
        return FadeIn(target)

    def _hide_animation_for(self, name, target):
        name = (name or "fade_out").lower()
        if name == "uncreate":
            return Uncreate(target)
        return FadeOut(target)

    def run_action(self, action):
        action_type = action["type"]
        if action_type == "show":
            targets = [self.get(target_id) for target_id in action["targets"]]
            self.ensure_objects_added(action["targets"])
            animations = [self._animation_for(action.get("animation"), mob) for mob in targets]
            run_time = action.get("runTime")
            if len(animations) == 1:
                self._play(animations[0], run_time=run_time)
            else:
                self._play(LaggedStart(*animations, lag_ratio=action.get("stagger", 0.12)), run_time=run_time)
            self.visible.update(action["targets"])
            self.time_cursor += run_time or 0.8
        elif action_type == "hide":
            targets = [self.get(target_id) for target_id in action["targets"]]
            animations = [self._hide_animation_for(action.get("animation"), mob) for mob in targets]
            run_time = action.get("runTime")
            self._play(*animations, run_time=run_time)
            for target_id in action["targets"]:
                self.visible.discard(target_id)
            self.time_cursor += run_time or 0.5
        elif action_type == "transform":
            source = self.get(action["from"])
            target = self.get(action["to"])
            self.ensure_objects_added([action["from"], action["to"]])
            animation = action.get("animation", "replacement").lower()
            if animation == "matching_tex":
                self._play(TransformMatchingTex(source, target), run_time=action.get("runTime"))
            else:
                self._play(ReplacementTransform(source, target), run_time=action.get("runTime"))
            self.visible.discard(action["from"])
            self.visible.add(action["to"])
            self.time_cursor += action.get("runTime") or 0.8
        elif action_type == "emphasize":
            animations = []
            for target_id in action["targets"]:
                mob = self.get(target_id)
                if action.get("animation", "indicate").lower() == "circumscribe":
                    animations.append(Circumscribe(mob, color=action.get("color", ORANGE)))
                else:
                    animations.append(Indicate(mob, color=action.get("color", ORANGE)))
            self._play(*animations, run_time=action.get("runTime"))
            self.time_cursor += action.get("runTime") or 0.5
        elif action_type == "highlight":
            if action.get("color"):
                animations = [
                    self.get(target_id).animate.set_color(self._color(action.get("color"), ORANGE))
                    for target_id in action["targets"]
                ]
            else:
                animations = [
                    Circumscribe(self.get(target_id), color=ORANGE)
                    for target_id in action["targets"]
                ]
            self._play(*animations, run_time=action.get("runTime"))
            self.time_cursor += action.get("runTime") or 0.4
        elif action_type == "move":
            point = self.resolve_anchor(action["anchor"])
            animations = [self.get(target_id).animate.move_to(point) for target_id in action["targets"]]
            self._play(*animations, run_time=action.get("runTime"))
            self.time_cursor += action.get("runTime") or 0.6
        elif action_type == "wait":
            seconds = action.get("seconds", 0.3)
            self.scene.wait(seconds)
            self.time_cursor += seconds
        elif action_type == "custom":
            block_id = action["block"]
            func = self.namespace.get(block_id)
            if callable(func):
                result = func(self)
                if result is not None:
                    self.namespace[block_id + "_result"] = result
            elif block_id in self.namespace:
                exec(str(self.namespace[block_id]), self.namespace, self.namespace)
            else:
                raise ValueError(f"Unknown custom block: {block_id}")
            self.time_cursor += action.get("runTime") or 0.4
        elif action_type == "recipe":
            self.run_recipe(action)

    def run_recipe(self, action):
        recipe = action.get("recipe", "")
        targets = action.get("targets") or []
        props = compat_props(action.get("props") or {})
        run_time = action.get("runTime") or props.get("runTime")
        if recipe == "count_in":
            mobs = [self.get(target_id) for target_id in targets]
            self.ensure_objects_added(targets)
            animations = []
            for mob in mobs:
                children = list(mob) if hasattr(mob, "__iter__") else [mob]
                animations.extend([FadeIn(child, scale=0.92) for child in children])
            self._play(LaggedStart(*animations, lag_ratio=props.get("stagger", 0.08)), run_time=run_time or 1.2)
            self.visible.update(targets)
            self.time_cursor += run_time or 1.2
        elif recipe == "trace":
            mobs = [self.get(target_id) for target_id in targets]
            self.ensure_objects_added(targets)
            self._play(*[Create(mob) for mob in mobs], run_time=run_time or 1.0)
            self.visible.update(targets)
            self.time_cursor += run_time or 1.0
        elif recipe == "shade":
            color = self._color(props.get("color"), SUN)
            opacity = props.get("opacity", 0.65)
            animations = []
            for target_id in targets:
                mob = self.get(target_id)
                animations.append(mob.animate.set_fill(color, opacity=opacity))
            self._play(*animations, run_time=run_time or 0.7)
            self.visible.update(targets)
            self.time_cursor += run_time or 0.7
        elif recipe == "jump":
            if not targets:
                return
            mob = self.get(targets[0])
            self.ensure_objects_added([targets[0]])
            point = None
            if props.get("to"):
                point = self._point3(props.get("to"), mob.get_center())
            elif props.get("anchor"):
                point = self.resolve_anchor(props.get("anchor"))
            if point is not None:
                self._play(mob.animate.move_to(point), run_time=run_time or 0.8)
            else:
                self._play(Indicate(mob, color=self._color(props.get("color"), ORANGE)), run_time=run_time or 0.6)
            self.visible.add(targets[0])
            self.time_cursor += run_time or 0.8
        elif recipe == "gather":
            point = self.resolve_anchor(props.get("anchor")) if props.get("anchor") else ORIGIN
            animations = [self.get(target_id).animate.move_to(point) for target_id in targets]
            self._play(*animations, run_time=run_time or 0.9)
            self.visible.update(targets)
            self.time_cursor += run_time or 0.9
        elif recipe == "split":
            mobs = [self.get(target_id) for target_id in targets]
            self.ensure_objects_added(targets)
            self._play(*[Circumscribe(mob, color=self._color(props.get("color"), ORANGE)) for mob in mobs], run_time=run_time or 0.8)
            self.visible.update(targets)
            self.time_cursor += run_time or 0.8
        elif recipe == "morph_to_equation" and len(targets) >= 2:
            source = self.get(targets[0])
            target = self.get(targets[1])
            self.ensure_objects_added(targets)
            self._play(ReplacementTransform(source, target), run_time=run_time or 1.0)
            self.visible.discard(targets[0])
            self.visible.add(targets[1])
            self.time_cursor += run_time or 1.0
        elif recipe == "camera_focus":
            if hasattr(self.scene, "camera") and hasattr(self.scene.camera, "frame") and targets:
                mob = self.get(targets[0])
                self._play(self.scene.camera.frame.animate.move_to(mob).set(width=max(mob.width * 1.8, 4)), run_time=run_time or 0.8)
            else:
                self.scene.wait(run_time or 0.4)
            self.time_cursor += run_time or 0.8
        elif recipe in {"bounce", "nod", "celebrate", "point"}:
            mobs = [self.get(target_id) for target_id in targets]
            self.ensure_objects_added(targets)
            if recipe == "point":
                self._play(*[Indicate(mob, color=self._color(props.get("color"), ORANGE)) for mob in mobs], run_time=run_time or 0.6)
                self.time_cursor += run_time or 0.6
            else:
                distance = props.get("distance", 0.18 if recipe != "celebrate" else 0.28)
                cycles = int(props.get("cycles", 1 if recipe != "celebrate" else 2))
                for _ in range(max(cycles, 1)):
                    self._play(*[mob.animate.shift(UP * distance) for mob in mobs], run_time=(run_time or 0.4) / 2)
                    self._play(*[mob.animate.shift(DOWN * distance) for mob in mobs], run_time=(run_time or 0.4) / 2)
                self.time_cursor += (run_time or 0.4) * max(cycles, 1)
        else:
            self.scene.wait(run_time or 0.3)
            self.time_cursor += run_time or 0.3

    def snapshot(self, beat_id):
        rows = []
        for object_id, mob in self.registry.items():
            if mob is None:
                continue
            try:
                center = mob.get_center()
                width = self._safe_float(getattr(mob, "width", 0.0))
                height = self._safe_float(getattr(mob, "height", 0.0))
                row = {
                    "id": object_id,
                    "kind": self.object_specs.get(object_id, {}).get("kind", "unknown"),
                    "visible": object_id in self.visible,
                    "centerX": float(center[0]),
                    "centerY": float(center[1]),
                    "width": width,
                    "height": height,
                    "xMin": float(center[0] - width / 2),
                    "xMax": float(center[0] + width / 2),
                    "yMin": float(center[1] - height / 2),
                    "yMax": float(center[1] + height / 2),
                    "relatedTo": self.related_map.get(object_id, []),
                }
                font_size = self._safe_font_size(mob)
                if font_size is not None:
                    row["fontSize"] = font_size
                rows.append(row)
            except Exception:
                continue
        self.snapshots.append({
            "beatId": beat_id,
            "timestampSeconds": self.time_cursor,
            "objects": rows,
        })

    def run_beats(self):
        for beat in self.scene_ir.get("beats", []):
            for action in beat.get("actions", []):
                self.run_action(action)
            if beat.get("holdSeconds"):
                self.scene.wait(beat["holdSeconds"])
                self.time_cursor += beat["holdSeconds"]
            self.snapshot(beat["id"])

    def final_cleanup(self):
        mobs = [mob for mob in self.scene.mobjects]
        if mobs:
            self.scene.play(*[FadeOut(mob) for mob in mobs])
            self.time_cursor += 0.4
        self.scene.wait(0.3)
        self.time_cursor += 0.3

    def persist_snapshots(self):
        if not self.preflight_report_path:
            return
        report_path = Path(self.preflight_report_path)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps({
            "snapshots": self.snapshots,
            "safeArea": self.safe_area(),
        }, indent=2), encoding="utf-8")
`;
}

export function buildCompiledPython(
  sceneIR: SceneIR,
  className: string,
  designMode: "ir" | "hybrid" | "raw",
): string {
  const blueprintComment = buildSceneBlueprintComment(sceneIR);
  const rawConstruct = sceneIR.customBlocks?.rawConstruct?.trim();
  if (designMode === "raw" && rawConstruct) {
    return `from manim import *
import numpy as np
from manim_kit import *

SCENE_IR = ${toPython(sceneIR)}

${blueprintComment}

class ${className}(${sceneIR.metadata.baseClass ?? "Scene"}):
    def construct(self):
        runtime = SceneRuntime(self, SCENE_IR, Path(__file__).parent)
        runtime.objects = runtime.registry
        self.objects = runtime.registry
${indentPython(rawConstruct, 8)}
        runtime.snapshot("raw_final")
        runtime.persist_snapshots()
`;
  }

  return `from manim import *
import numpy as np
from manim_kit import *

SCENE_IR = ${toPython(sceneIR)}

${blueprintComment}

class ${className}(${sceneIR.metadata.baseClass ?? "Scene"}):
    def construct(self):
        runtime = SceneRuntime(self, SCENE_IR, Path(__file__).parent)
        runtime.build_objects()
        runtime.run_beats()
        runtime.final_cleanup()
        runtime.persist_snapshots()
`;
}

function indentPython(source: string, spaces: number): string {
  const indent = " ".repeat(spaces);
  return source
    .split("\n")
    .map((line) => (line.trim().length === 0 ? line : `${indent}${line}`))
    .join("\n");
}

export function normalizeAnchor(anchor?: SceneIRAnchor): SceneIRAnchor | undefined {
  if (!anchor) return undefined;
  return {
    zone: anchor.zone,
    align: anchor.align ?? "center",
    dx: anchor.dx ?? 0,
    dy: anchor.dy ?? 0,
    widthPct: anchor.widthPct,
    heightPct: anchor.heightPct,
  };
}
