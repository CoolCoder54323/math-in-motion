# Math Animation Studio

Turn any worksheet problem or concept into a short, narrated animation that
plays on the page for elementary / middle-school students.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind v4 + shadcn/ui primitives
- Zustand for global client state
- Sonner for toast notifications
- OpenAI `gpt-4o` (vision) for worksheet analysis and the animation-plan generator
- `manim-web` for in-browser canvas animation
- Web Speech API for narration

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Environment Variables

Create a `.env.local` in the project root:

```
OPENAI_API_KEY=your_openai_api_key_here
```

### How to get the key

**OpenAI**

1. Sign up / log in at https://platform.openai.com
2. Create an API key in the dashboard (Settings → API Keys)
3. Ensure billing is enabled and you have access to the `gpt-4o` model

Restart `npm run dev` after editing `.env.local` so the new values are picked
up by the server.

## API Routes

### `POST /api/analyze-image`

`multipart/form-data` with a single `file` field (PNG/JPG). GPT-4o vision
returns a structured description of the worksheet:

```json
{
  "success": true,
  "text": "Problems:\n  1. ...\n\nContext: ...\n\nThemes: pizzas",
  "analysis": {
    "problems": ["..."],
    "context": "...",
    "themes": ["pizzas"]
  }
}
```

### `POST /api/generate-plan`

JSON body: `{ "conceptText": string, "latexProblem"?: string }`. Returns:

```json
{
  "success": true,
  "plan": {
    "title": "Adding Fractions with Unlike Denominators",
    "estimatedDuration": 55,
    "steps": [
      { "description": "...", "visualHint": "...", "narration": "..." }
    ]
  }
}
```

## Testing Locally

1. **Without the API** — in development the preview stage shows a "load dummy
   plan" affordance. Click it to drop a hard-coded 3-step plan into the store
   and exercise the canvas + narration without hitting OpenAI.
2. **Without vision** — type a concept into the right-hand column (e.g.
   "Explain place value for 2nd graders") and click **Generate animation**.
3. **With vision** — grab any worksheet image:
   - Screenshot a fraction problem from a textbook PDF and hit ⌘V on the page
     — it lands in the upload zone.
   - A phone photo of `1/2 + 1/4 = ?` on paper.
   - Any PNG/JPG with clean printed math.
   Click **Analyze problem**, wait for the toast, then click **Generate
   animation** — the concept text plus the prose description are both sent
   to the LLM. Hit **Play** in the preview to render the animation and hear
   the narration.
4. **Error cases** — unset `OPENAI_API_KEY` and click Generate (expect a
   toast).
