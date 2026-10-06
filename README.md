# Intelligo ID Marketing Kit

**marketing.intelligo.id** — the Intelligo ID marketing team's internal creative workspace.

> AI-powered creative workspace for marketing, content, and campaign production.

The MVP module is the **AI Image Generator**. A marketer writes a short brief, for example
_"Poster promo Bootcamp AI Tools untuk karyawan"_. The server-side **Intelligo Style Engine** turns it into a
complete image prompt with the brand palette, design language, logo policy, marketing logic and
"never invent facts" rules. It then calls OpenAI with the user's own API key.

```
Idea → Prompt → Intelligo Style Engine → GPT-Image → Creative
```

## Carousel (multi-slide)

The **Carousel** tab produces a whole carousel in one flow. A main agent plans and verifies every slide before
anything is generated:

```
Brief → PLANNER (OpenAI text model, structured JSON) → VERIFIER (rule-based, 1 auto-revision)
      → REVIEW (marketer edits / approves each slide) → COVER first (style anchor)
      → remaining slides in parallel (max 3) → per-slide retry · ZIP download · history
```

1. **Planner** (`lib/carousel-planner.ts`). It uses the user's own key and the Responses API with a strict JSON schema.
   The plan has a shared style guide (art direction, background, typography, grid, motif) and, for each slide, a role,
   headline, supporting text, visual concept and subject.
   - It tries the models in `CAROUSEL_PLANNER_MODEL` in order (default `gpt-6-astra,gpt-5.5`).
   - If none is available, it falls back to the template planner (`lib/carousel-template.ts`).
   - Invalid keys and billing errors are shown to the user instead of falling back to the template.
2. **Verifier** (`lib/carousel-verifier.ts`). These checks are rule-based on purpose. It flags:
   - prices, dates, percentages, large numbers, URLs and handles that are not in the brief
   - overclaims ("dijamin kerja")
   - QR codes or logos the brief didn't ask for
   - headlines that are too long
   - repeated subjects
   - quoted brief text that isn't used

   If it finds errors, the planner gets one revision round. The same verifier runs in the browser, so edits are
   re-checked live.
3. **Review**. The marketer edits copy, visuals and the style guide.
   - If errors remain, they must tick an explicit acknowledgement before generating.
   - In Developer Mode, each slide shows the exact internal prompt it will be generated with.
4. **Generation** (`components/CarouselGenerator.tsx`).
   - Slide 1 is generated first, then downsized and attached as a style anchor to every other slide.
   - The other slides run in parallel, with at most 3 requests in flight. Each is its own `/api/generate` request,
     which avoids function timeouts and response-size limits.
   - The prompts are rebuilt server-side from the approved plan (`buildCarouselSlidePrompt`).
   - Fatal errors (invalid key, billing) stop the queue. Any other failed slide can be retried individually.

The story skeleton condenses HOOK → PROBLEM → INSIGHT → SOLUTION → PROGRAM → BENEFITS → OFFER / SCHEDULE → CTA
for 3–8 slides (`lib/carousel.ts`).

## Stack

Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript, Tailwind CSS 4, the OpenAI Node SDK and Vitest.

## Getting started

```bash
npm install
cp .env.example .env.local      # then set MARKETING_ACCESS_CODE
npm run dev                     # http://localhost:3000
```

| Variable                | Required | Purpose                                                                                     |
| ----------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `MARKETING_ACCESS_CODE` | yes      | Access code for the access screen. Validated server-side only.                               |
| `SESSION_SECRET`        | no       | Extra secret mixed into the session signing key.                                            |
| `IMAGE_OUTPUT_FORMAT`   | no       | `png` (default), `jpeg` or `webp`.                                                          |
| `CAROUSEL_PLANNER_MODEL` | no    | Comma-separated text models for the carousel planner, tried in order. Default `gpt-6-astra,gpt-5.5`. |
| `SITE_URL`              | no       | Canonical URL for metadata. Defaults to `https://marketing.intelligo.id`.                   |

**No OpenAI API key goes in the environment.** Users enter their own key in the UI.

## Scripts

```bash
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # Vitest unit tests (prompt builder, sizes, detection, auth, error mapping)
npm run build      # production build
```

## Project structure

```
app/
  page.tsx                 → redirects to /login or /dashboard
  login/page.tsx           → access screen
  dashboard/page.tsx       → workspace (AI Image module)
  api/auth/route.ts        → POST login · DELETE logout
  api/generate/route.ts    → image generation (server-side OpenAI call)
  api/prompt-preview/      → Developer Mode: internal prompt preview
  api/carousel/plan/       → carousel planner + verifier (no image generation)
  api/carousel/prompt/     → Developer Mode: internal prompt of one carousel slide
components/                → AccessGate, Header, ImageGenerator, GenerationSettings,
                             ReferenceUploader, PromptInput, QuickPrompts, ImagePreview,
                             HistoryPanel, DeveloperMode
lib/
  intelligo-style.ts       → BRAND SYSTEM, NEGATIVE RULES, MARKETING RULES (edit to tune the style)
  prompt-builder.ts        → buildIntelligoPrompt(), buildCarouselSlidePrompt()
  carousel*.ts             → carousel skeleton/validation, planner agent, template fallback, verifier
  content-detection.ts     → keyword heuristics (content type, funnel, audience, exact text, URLs…)
  image-settings.ts        → models, qualities, format presets and size rules (all configurable)
  openai.ts                → per-request OpenAI client and human-readable error mapping
  auth.ts                  → access code check and signed HTTP-only session cookie
  modules.ts               → workspace module registry (Content / Campaign / Assets = Coming Soon)
  history-store.ts         → IndexedDB generation history (browser only)
proxy.ts                   → redirects unauthenticated /dashboard requests
```

### Tuning the visual style

The marketing team can refine the brand without touching API code. Edit `lib/intelligo-style.ts` to change:

- the palette, art directions, negative rules and logo rules
- the funnel logic, carousel flow and content-type directions

### Changing models, quality or sizes

Edit `lib/image-settings.ts`:

- `IMAGE_MODELS`, `QUALITY_OPTIONS`, `FORMAT_PRESETS`, `SIZE_RULES`

If the API rejects a quality or a custom resolution, the server retries once with `high` or the nearest standard size
and tells the user. Every other error is shown as a short Indonesian message.

## Security model

- The access code is compared in constant time on the server. It never reaches the client bundle.
- A successful login sets a 12-hour HMAC-signed, `HttpOnly`, `SameSite=Lax` cookie. It is `Secure` in production.
  - Changing `MARKETING_ACCESS_CODE` or `SESSION_SECRET` signs everyone out.
- Every API route verifies the session and rejects cross-origin requests.
- Login attempts are throttled per server instance (best effort).
- The OpenAI API key:
  - is kept only in React memory and is gone after a refresh or logout
  - is sent over HTTPS for a single request
  - is used by a client created for that request only
  - is never stored, logged or returned
- Internal prompts are built server-side. Only authenticated users can see them, and only in Developer Mode.
- OpenAI errors are mapped to safe messages, and logs hold only status, code and request ID.
- Responses carry security headers (`X-Frame-Options`, HSTS, nosniff, `noindex`).

## Deployment (Vercel or any Next.js host)

1. Set `MARKETING_ACCESS_CODE` in the project's environment variables. Never commit it.
2. Point `marketing.intelligo.id` at the deployment. The host serves it over HTTPS.
3. `app/api/generate` sets `maxDuration = 300`, because high-quality generations can take minutes.
   Make sure your plan allows long-running functions.
4. Hosts with a function response limit (Vercel: 4.5 MB) may reject large PNGs.
   If that happens, set `IMAGE_OUTPUT_FORMAT=webp` or `jpeg`.
   Reference images are already compressed in the browser to at most 4 MB.

## Roadmap

The module registry and types are ready for these phases:

- **Phase 2:** Content Generator
- **Phase 3:** Campaign Generator
- **Phase 4:** Asset Library
- **Phase 5:** Team Workspace
