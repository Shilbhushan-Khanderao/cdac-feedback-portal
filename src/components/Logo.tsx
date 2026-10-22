/**
 * Brand lockup: [C-DAC mark | our own Feedback Portal mark], divided by a vertical rule.
 * Both marks use `currentColor` so they follow the brand palette (green/stone, no blue)
 * via a Tailwind text-* class, the same convention the app already used for its one
 * existing inline icon (see the old header checkmark-square in App.tsx).
 *
 * CdacMark is the C-DAC wordmark shape supplied for this platform. The source asset also
 * had "MUMBAI" baked in as a text element; dropped here because this header is shown to
 * every centre (a batch/session is shared across all centres and courses, not Mumbai-only
 * — see CLAUDE.md), and recoloured from a flat white fill to currentColor so it reads
 * against this app's light header instead of needing a dark backdrop.
 *
 * The path data itself lives in src/lib/brandMark.ts, the single source both this (web,
 * SVG via currentColor) and src/reports/ReportDocument.tsx (PDF, via react-pdf's own
 * Svg/Path primitives, which can't use CSS currentColor) render from.
 */
import { CDAC_MARK_PATH, CDAC_MARK_VIEWBOX } from '../lib/brandMark';

function CdacMark({ className }: { className?: string }) {
  return (
    <svg viewBox={CDAC_MARK_VIEWBOX} className={className} aria-hidden fill="currentColor" stroke="none">
      <path d={CDAC_MARK_PATH} fillRule="evenodd" />
    </svg>
  );
}

/** Our own mark: a speech-bubble with a checkmark, representing "feedback, received". */
function FeedbackMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7a2.5 2.5 0 0 1-2.5 2.5H12l-4 4v-4H6.5A2.5 2.5 0 0 1 4 12.5v-7Z" />
      <path d="M8.5 9l2.5 2.5L15.5 7" />
    </svg>
  );
}

/** [C-DAC mark | our Feedback Portal mark], divided by a vertical rule. */
export function BrandLockup({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-3 ${className}`}>
      <CdacMark className="h-11 w-auto text-brand-800" />
      <span className="h-9 w-px bg-stone-300" aria-hidden />
      <span className="flex items-center gap-1.5 font-semibold tracking-tight text-stone-900">
        <FeedbackMark className="size-5 text-brand-700" />
        Feedback Portal
      </span>
    </span>
  );
}
