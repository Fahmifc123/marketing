"use client";

const QUICK_PROMPTS: Array<{ group: string; prompts: string[] }> = [
  {
    group: "Marketing",
    prompts: [
      "Poster promo bootcamp Data Science",
      "Poster promo AI Tools for Work Productivity",
      "Poster Job Ready Program",
      "Recruitment Junior Trainer",
      "Affiliate Program campaign",
    ],
  },
  {
    group: "Educational",
    prompts: ["Carousel edukasi AI untuk kerja", "Visual belajar Python", "Visual Data Science", "Visual AI automation"],
  },
  {
    group: "Career",
    prompts: ["Career development campaign", "Job seeker campaign", "Portfolio campaign"],
  },
];

interface Props {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

/** Populates the prompt input. Never generates on click. */
export default function QuickPrompts({ onSelect, disabled }: Props) {
  return (
    <details className="group mt-3">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded text-xs font-semibold text-navy-600 hover:text-navy [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="transition-transform group-open:rotate-90">
          ›
        </span>
        Quick prompts
      </summary>
      <div className="mt-3 space-y-3">
        {QUICK_PROMPTS.map(({ group, prompts }) => (
          <div key={group}>
            <p className="mb-1.5 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">{group}</p>
            <ul className="flex flex-wrap gap-1.5">
              {prompts.map((p) => (
                <li key={p}>
                  <button
                    type="button"
                    onClick={() => onSelect(p)}
                    disabled={disabled}
                    className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-navy transition-colors hover:border-navy-400 hover:bg-pale disabled:opacity-50"
                  >
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
