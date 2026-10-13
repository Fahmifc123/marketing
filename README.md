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

## Meta Ads Carousel

This is a tab for marketers who write the final prompt in ChatGPT.

1. Paste the ChatGPT answer.
   - Slides are split on headings like `Slide 1:`, `**Slide 2 – Problem**`, `Slide ke-3` or `Card 4`.
   - Text before the first slide applies to every card.
   - Text with no headings becomes a single image.
2. Tick the sizes you need. Each tick is an exact Meta Ads Manager export:

   | Size | Ratio | Placement |
   | --- | --- | --- |
   | 1080×1350 | 4:5 | Feed |
   | 1080×1080 | 1:1 | Square |
   | 1080×1920 | 9:16 | Stories & Reels |

3. Review and edit each card's prompt. Meta allows at most 10 cards. In Developer Mode you can see each card's final
   prompt.
4. Generate. This makes slides × sizes images:
   - Card 1 is made first in the master size, the first ticked size in the order 4:5 → 1:1 → 9:16. It becomes the
     style anchor for the other cards.
   - The other cards are then made in the master size, in parallel.
   - Every other size is then adapted from the same card's master image, so the copy and design match across
     placements.
   - At most 3 requests run at a time. A failed card can be retried on its own.
5. Downloads are resized in the browser to the exact pixel size. "Download All" gives a ZIP with one folder per size
   (`1080x1350/card-01-1080x1350.png`, …).

The pasted prompt is the primary creative direction. `buildMetaAdSlidePrompt` adds the Intelligo brand system
wherever the prompt leaves gaps. It also adds Meta placement safe zones (Stories/Reels keep the top 14% and bottom 20%
clear). The logo and no-invention rules always apply.

### Official logo (auto)

The image model never draws the logo.

1. In **Tempel logo resmi otomatis** (shared controls), upload the official logo once. It is saved in this browser
   (IndexedDB). An optional white version can be added for dark backgrounds.
2. With auto-logo on, every prompt asks the model to keep an exact corner zone empty (`lib/logo-placement.ts`). For
   9:16, that zone sits inside the Stories/Reels safe area.
3. The browser then composites the original logo file into that zone, scaled only. If the zone is dark and a white
   version is saved, the white version is used.
4. Style anchors and size masters stay logo-free, so the model never copies the logo into other images.

### App-rendered copy (Meta Ads)

With **Teks dipasang aplikasi** on (the default):
1. The image model renders **no text**. Quoted copy is stripped from its prompt, and it keeps a calm text zone at the
   top or bottom (`lib/text-layout.ts`). That zone avoids the logo and the Stories/Reels interface areas.
2. Headline, supporting text and CTA are read from the pasted prompt:
   - Labeled quotes like `Headline "…"`, `Teks pendukung "…"`, `Tombol "…"` are used first.
   - Unlabeled quotes fill the headline, then the supporting text.
   - Each card's copy can be edited in the review step.
3. The browser typesets the copy (`lib/text-render.ts`):
   - Inter font, with an orange CTA button.
   - Navy or white text, chosen from the background.
   - A soft navy gradient behind the text on busy backgrounds.
   - Text auto-shrinks to fit the zone.
4. Copy and logo are composed on the exact final frame (1080×1350 / 1080×1080 / 1080×1920), so they are never cropped.
5. **Edit teks** in the results re-typesets that card in every size from the raw images. No new API calls are made.

### ChatGPT instructions

**Belum punya prompt? Minta ke ChatGPT dulu** (Meta Ads tab) copies ready-made instructions for ChatGPT
(`lib/chatgpt-instructions.ts`). They contain the brief, the card count, the chosen sizes, the logo corner and the brand
rules (no invented prices, URLs or QR codes). ChatGPT then answers in exactly the `Gaya umum:` / `Slide N:` format the
paste parser expects.

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
  api/meta-ads/prompt/     → Developer Mode: internal prompt of one Meta Ads card
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
