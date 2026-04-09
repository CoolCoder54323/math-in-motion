# Math Animation Studio

Turn any worksheet problem or concept into a short, narrated animation plan
for elementary / middle-school students.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind v4 + shadcn/ui primitives
- Zustand for global client state
- Sonner for toast notifications
- Mathpix `v3/text` for handwritten-math OCR
- OpenAI `gpt-4o` for the animation-plan generator

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Environment Variables

Create a `.env.local` in the project root:

```
MATHPIX_APP_ID=your_mathpix_app_id_here
MATHPIX_APP_KEY=your_mathpix_app_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

### How to get the keys

**Mathpix** (free tier — 1,000 requests/month)

1. Sign up at https://accounts.mathpix.com/signup
2. Go to the Mathpix Console → API Keys
3. Create a new OCR app; copy the `app_id` and `app_key`

**OpenAI**

1. Sign up / log in at https://platform.openai.com
2. Create an API key in the dashboard (Settings → API Keys)
3. Ensure billing is enabled and you have access to the `gpt-4o` model

Restart `npm run dev` after editing `.env.local` so the new values are picked
up by the server.

## API Routes

### `POST /api/ocr`

`multipart/form-data` with a single `file` field (PNG/JPG/PDF). Returns:

```json
{ "success": true, "latex": "\\frac{1}{2} + \\frac{1}{4}", "text": "$\\frac{1}{2} + \\frac{1}{4}$" }
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

1. **Without OCR** — fastest path. Type a concept into the right-hand column
   (e.g. "Explain place value for 2nd graders") and click **Generate
   animation**. The preview below renders the full plan.
2. **With OCR** — grab any worksheet image:
   - Screenshot a fraction problem from a textbook PDF and hit ⌘V on the page
     — it lands in the upload zone.
   - A phone photo of handwritten `1/2 + 1/4 = ?` on paper.
   - Any PNG/JPG with clean printed math.
   Click **Analyze problem**, wait for the toast, then click **Generate
   animation** — the concept text plus extracted LaTeX are both sent to the
   LLM.
3. **Error cases** — unset `OPENAI_API_KEY` and click Generate (expect a
   toast); upload a blank image (Mathpix returns an error surfaced as a
   toast).
