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

def T(s, size=40, color=INK):
    return Text(str(s), font_size=size, color=color, weight=BOLD)

def build_mascot():
    body = Circle(radius=0.25, fill_color=SKY, fill_opacity=1, stroke_width=0)
    eye1 = Dot(color=INK).scale(0.6).move_to(body.get_center() + UP * 0.08 + LEFT * 0.08)
    eye2 = Dot(color=INK).scale(0.6).move_to(body.get_center() + UP * 0.08 + RIGHT * 0.08)
    smile = ArcBetweenPoints(
        body.get_center() + LEFT * 0.1 + DOWN * 0.05,
        body.get_center() + RIGHT * 0.1 + DOWN * 0.05,
        angle=-PI / 3,
    )
    return VGroup(body, eye1, eye2, smile)

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
            "Text": Text,
            "MathTex": MathTex,
            "Circle": Circle,
            "Square": Square,
            "Rectangle": Rectangle,
            "RoundedRectangle": RoundedRectangle,
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
            "UP": UP,
            "DOWN": DOWN,
            "LEFT": LEFT,
            "RIGHT": RIGHT,
            "ORIGIN": ORIGIN,
            "PI": PI,
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
        props = spec.get("props") or {}
        mob = None
        if kind == "text":
            mob = T(props.get("text", ""), size=props.get("fontSize", 40), color=props.get("color", INK))
        elif kind == "math":
            mob = MathTex(props.get("tex", ""), color=props.get("color", INK))
            if props.get("scale"):
                mob.scale(props.get("scale"))
        elif kind == "rectangle":
            mob = Rectangle(
                width=props.get("width", 2.4),
                height=props.get("height", 1.4),
                color=props.get("strokeColor", INK),
            )
            mob.set_fill(props.get("fillColor", PANEL_BG), opacity=props.get("fillOpacity", 0.75))
        elif kind == "rounded_rect":
            mob = RoundedRectangle(
                width=props.get("width", 2.4),
                height=props.get("height", 1.4),
                corner_radius=props.get("cornerRadius", 0.18),
                color=props.get("strokeColor", INK),
            )
            mob.set_fill(props.get("fillColor", PANEL_BG), opacity=props.get("fillOpacity", 0.75))
        elif kind == "circle":
            mob = Circle(radius=props.get("radius", 0.9), color=props.get("strokeColor", INK))
            mob.set_fill(props.get("fillColor", SKY), opacity=props.get("fillOpacity", 0.2))
        elif kind == "dot":
            mob = Dot(radius=props.get("radius", 0.08), color=props.get("color", INK))
        elif kind == "line":
            mob = Line(
                self._point3(props.get("start"), LEFT),
                self._point3(props.get("end"), RIGHT),
                color=props.get("color", INK),
            )
        elif kind == "arrow":
            mob = Arrow(
                self._point3(props.get("start"), LEFT),
                self._point3(props.get("end"), RIGHT),
                color=props.get("color", ORANGE),
                buff=props.get("buff", 0.2),
            )
        elif kind == "brace":
            target_id = props.get("target")
            direction_name = props.get("direction", "DOWN")
            direction = {"UP": UP, "DOWN": DOWN, "LEFT": LEFT, "RIGHT": RIGHT}.get(direction_name, DOWN)
            mob = Brace(self.get(target_id), direction=direction)
        elif kind == "number_line":
            x_range = props.get("xRange", [0, 10, 1])
            mob = NumberLine(x_range=x_range, length=props.get("length", 6), color=props.get("color", INK))
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
            animations = [self.get(target_id).animate.set_color(action["color"]) for target_id in action["targets"]]
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

  const blocks = sceneIR.customBlocks ?? {};
  const helpers = blocks.helpers?.trim() ?? "";
  const rawFactories = blocks.objectFactories?.length
    ? blocks.objectFactories.map((entry) => normalizeObjectFactoryBlock(entry.id, entry.code)).join("\n\n")
    : "";
  const rawTimeline = blocks.timeline?.length
    ? blocks.timeline.map((entry) => normalizeTimelineBlock(entry.id, entry.code)).join("\n\n")
    : "";
  const rawUpdaters = blocks.updaters?.length
    ? blocks.updaters.map((entry) => entry.code.trim()).join("\n\n")
    : "";

  return `from manim import *
import numpy as np
from manim_kit import *

SCENE_IR = ${toPython(sceneIR)}

${helpers}
${helpers && rawFactories ? "\n" : ""}${rawFactories}
${(helpers || rawFactories) && rawTimeline ? "\n" : ""}${rawTimeline}
${(helpers || rawFactories || rawTimeline) && rawUpdaters ? "\n" : ""}${rawUpdaters}

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

function normalizeTimelineBlock(blockId: string, source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "";
  if (/^\s*def\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/m.test(trimmed)) {
    return trimmed;
  }

  const fnName = blockId.replace(/[^A-Za-z0-9_]/g, "_") || "timeline_block";
  return [
    `def ${fnName}(runtime):`,
    "    scene = runtime.scene",
    "    self = scene",
    "    objects = runtime.registry",
    "    runtime.objects = runtime.registry",
    "    self.objects = runtime.registry",
    "    for object_id, mob in runtime.registry.items():",
    "        setattr(self, object_id, mob)",
    indentPython(trimmed, 4),
  ].join("\n");
}

function normalizeObjectFactoryBlock(blockId: string, source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "";

  const fnName = blockId.replace(/[^A-Za-z0-9_]/g, "_") || "object_factory";
  const exactFactoryPattern = new RegExp(`^\\s*def\\s+${fnName}\\s*\\(`, "m");
  if (exactFactoryPattern.test(trimmed)) {
    return trimmed;
  }

  const definedFunctions = Array.from(trimmed.matchAll(/^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm));
  if (definedFunctions.length > 0) {
    const firstHelper = definedFunctions[0]?.[1];
    return [
      trimmed,
      "",
      `def ${fnName}(runtime, spec):`,
      "    scene = runtime.scene",
      "    self = RuntimeSceneProxy(scene, runtime.registry)",
      "    props = spec.get(\"props\") or {}",
      `    helper = ${firstHelper}`,
      "    argc = getattr(getattr(helper, \"__code__\", None), \"co_argcount\", 0)",
      "    if argc >= 2:",
      "        return helper(scene, props)",
      "    if argc == 1:",
      "        return helper(scene)",
      "    return helper()",
    ].join("\n");
  }

  return [
    `def ${fnName}(runtime, spec):`,
    "    scene = runtime.scene",
    "    self = RuntimeSceneProxy(scene, runtime.registry)",
    "    props = spec.get(\"props\") or {}",
    indentPython(trimmed, 4),
  ].join("\n");
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
