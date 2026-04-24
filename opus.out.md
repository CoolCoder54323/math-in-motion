◇ injected env (6) from .env.local // tip: ◈ secrets for agents [www.dotenvx.com]
# Redesigning for Pedagogical Animation Generation

The core issue: your pipeline optimizes for **correctness and visual polish**, but teaching is about **directing attention over time**. Let me break this into the three leverage points you asked about.

---

## 1. Plan Schema Redesign

The current schema treats scenes as "descriptions + math content." That's a *what*, not a *how-to-teach*. Upgrade it to encode pedagogical intent as first-class structure.

### Proposed schema

```json
{
  "lesson": {
    "topic": "string",
    "gradeBand": "K-2 | 3-5 | 6-8",
    "learningObjective": "Student can ...",
    "priorKnowledge": ["..."],
    "targetMisconceptions": [
      {
        "id": "M1",
        "description": "Students think 1/2 + 1/3 = 2/5 (add numerators and denominators)",
        "addressedInScene": "scene_3"
      }
    ],
    "anchorRepresentation": "area_model | number_line | set_model | ..."
  },
  "scenes": [
    {
      "sceneId": "scene_1",
      "role": "hook | activate_prior | introduce | worked_example | prediction | guided_practice | address_misconception | synthesize",
      "learningBeat": "One sentence: what the student should understand by the end",
      "durationSec": 25,
      "beats": [
        {
          "type": "introduce | focus | predict | pause | reveal | compare | annotate | fade_context",
          "durationSec": 4,
          "narration": "What do you think happens when...?",
          "onScreen": {
            "focus": ["obj_id_A"],
            "dim": ["obj_id_B", "obj_id_C"],
            "annotate": [{"target": "obj_id_A", "label": "numerator", "color": "PINK"}]
          },
          "expectedStudentThought": "They'll probably try to add denominators",
          "waitAfter": 2.0
        }
      ],
      "semanticColorMap": {
        "PINK": "numerator / part",
        "SKY": "denominator / whole",
        "GRAPE": "result",
        "ORANGE": "misconception / watch-out"
      },
      "maxConcurrentElements": 5,
      "exitState": "only result + labeled axes remain"
    }
  ]
}
```

### Why this works
- **`role`** forces the planner to produce a pedagogical arc, not just sequential facts. You can require that every lesson contain at least one `prediction`, one `address_misconception`, and one `synthesize`.
- **`beats`** replace free-form steps with a typed vocabulary that codegen knows how to render. `predict` → always followed by `pause` with wait ≥ 2s. `focus` → dims everything else.
- **`semanticColorMap`** is per-scene but consistent within a lesson — now color carries meaning, not decoration.
- **`expectedStudentThought`** is surprisingly powerful: it forces the LLM planner to think about cognition, and gives you something to validate against.
- **`exitState`** prevents scene-end clutter and forces intentional transitions.

---

## 2. Codegen Constraints

Right now codegen has freedom to produce whatever Manim does the job. Replace that with **beat-level primitives** that encode good pedagogy by construction.

### Provide a small DSL / helper library injected into every scene

```python
# teach_primitives.py (preloaded into codegen context)

def focus_on(scene, target, others, dim_opacity=0.25, run_time=0.6):
    """Standard attention shift: dim everything else, optionally scale target."""
    scene.play(
        *[m.animate.set_opacity(dim_opacity) for m in others],
        Indicate(target, scale_factor=1.1),
        run_time=run_time,
    )

def predict_pause(scene, question_text, wait=3.0):
    """Pose a question, hold silence."""
    q = T(question_text, size=36, color=INK)
    q.to_edge(UP)
    scene.play(Write(q))
    scene.wait(wait)
    return q

def reveal(scene, mobj, from_=None, run_time=0.8):
    """Controlled reveal — never just FadeIn into a crowded frame."""
    ...

def annotate(scene, target, label, color=PINK, side=UP):
    """Draw labeled arrow/bracket. Always removed before next beat unless pinned."""
    ...

def clear_except(scene, keep, run_time=0.5):
    """Enforce exitState."""
    ...
```

### Hard constraints in the codegen system prompt

Add these to your prompt (replacing or augmenting the existing constraints):

```
BEAT-LEVEL RULES (enforced):
1. Every `predict` beat MUST be followed by scene.wait(>=2.0) before any reveal.
2. After a `focus` beat, non-focused mobjects must be at opacity <= 0.3.
3. Maximum `maxConcurrentElements` VMobjects on screen at any time.
   If adding a new element would exceed this, emit a `fade_context` beat first.
4. Color assignments MUST follow scene.semanticColorMap. No decorative color.
5. Every labeled mathematical quantity must have a T() label within 0.5 units.
6. Narration text and on-screen text must not duplicate verbatim — 
   on-screen is a CUE (≤6 words), narration is the explanation.
7. No more than 2 things may animate simultaneously (LaggedStart/AnimationGroup
   counts as 1 if visually a single motion).
8. Every scene ends with clear_except(exitState_objects).

RENDER RULES:
- Prefer Transform over Create+FadeOut chains for "same object, new state"
- Use Indicate or Circumscribe for attention, never arbitrary color flashes
- run_time defaults: focus 0.6s, reveal 0.8s, transform 1.2s, pause beats 2-3s
```

### Pattern templates per beat type

Give codegen a library of canonical Manim snippets keyed by `beat.type`. The LLM fills slots rather than inventing structure. This is the single biggest quality lever — free-form Manim generation is where consistency dies.

---

## 3. Automatic Validation / Scoring

Run a **static pedagogy linter** between Codegen and Render, and a **rubric-based LLM judge** after render.

### Static checks (cheap, deterministic)

Parse the generated Python with `ast` and check:

| Check | Rule |
|---|---|
| Pacing floor | `sum(scene.wait(x))` ≥ `0.15 * durationSec` |
| Prediction honored | Every `predict` beat has a `scene.wait(≥2.0)` before next `play` |
| Element budget | Track `add`/`play(Create…)` minus `Remove`/`FadeOut`; must stay ≤ `maxConcurrentElements` |
| Color discipline | Every color literal/constant used must appear in `semanticColorMap` |
| Focus enforcement | After a `focus_on` call, non-target opacities actually set |
| Exit state | Last beat includes `clear_except` or equivalent |
| Label proximity | For each MathTex/numeric mobject, a T() exists within 1.0 unit (AST heuristic on `.next_to`) |

Failures → regenerate that scene with specific feedback. This catches 70%+ of the "non-teaching" feel automatically.

### Rubric judge (LLM, post-render)

Render a low-res preview and frame-sample it (e.g., 1 frame/sec). Feed frames + narration + plan to a judge model with a fixed rubric:

```
Score 1-5 on each:
- Attention direction: Is it always clear where to look?
- Cognitive pacing: Are there moments for the student to think?
- Scaffolding: Does each step build on the previous?
- Misconception handling: Are likely errors surfaced and corrected?
- Visual load: Does any frame feel crowded?
- Semantic color: Does color consistently mean the same thing?

For any dimension scoring <4, return a concrete fix targeting a specific sceneId.
```

Feed those fixes back into a single regeneration pass. Cap at 2 iterations to bound cost.

### Golden-set regression

Maintain ~20 reference lessons across topics (fractions, long division, integers, geometry, ratios). Every pipeline change reruns them; judge scores must not regress. This is what gives you *consistent* quality across topics — the thing a prompt alone won't do.

---

## Concrete Rollout Order

If I were shipping this incrementally:

1. **Week 1:** Add `role`, `beats` (typed), `semanticColorMap`, `targetMisconceptions` to the plan schema. Update planner prompt with required beat types per lesson.
2. **Week 2:** Ship the `teach_primitives` helper module and require codegen to use it. Add 4–5 pattern templates per beat type to examples.
3. **Week 3:** Build the static linter (AST-based). Wire it as a gate before render with scene-specific regeneration.
4. **Week 4:** Rubric judge + golden set. Iterate prompts against scores.

The biggest wins come from steps 1 and 2 — the schema change forces pedagogical thinking into the plan, and the primitive library makes good pacing the path of least resistance for the codegen model. Validation (step 3+) then stops regressions.

One meta-point: your current system treats pedagogy as something the LLM will figure out from context. It won't — consistently. Encoding it as schema + primitives + linter turns "please teach well" into "comply with this structure," which is what LLMs are actually good at.
