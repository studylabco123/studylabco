import { cn } from "@/lib/cn";

/**
 * Conical flask, a molecule and the logo's lightbulb rays, drawn in the logo's
 * navy line and sky fills. Decorative only.
 */
export function LabIllustration({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 360 320"
      className={cn("h-auto w-full", className)}
      fill="none"
      stroke="#001a42"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* rays above the flask mouth, echoing the logo's lightbulb */}
      <g stroke="#78b3e8" strokeWidth="5">
        <path d="M150 16 L144 4" />
        <path d="M172 12 V0" />
        <path d="M194 16 L200 4" />
      </g>

      {/* molecule */}
      <g strokeWidth="3.5">
        <path d="M262 92 L300 62 M262 92 L304 126 M262 92 L222 70" />
        <circle cx="262" cy="92" r="18" fill="#ffffff" />
        <circle cx="304" cy="58" r="12" fill="#b4d6f4" />
        <circle cx="308" cy="130" r="12" fill="#b4d6f4" />
        <circle cx="218" cy="66" r="9" fill="#cfe7fa" />
      </g>

      {/* liquid */}
      <path
        d="M127 188 C142 180 154 196 170 188 C186 180 198 196 214 188 L244 252 C250 264 242 272 230 272 H114 C102 272 94 264 100 252 Z"
        fill="#b4d6f4"
        stroke="none"
      />
      {/* bubbles */}
      <g strokeWidth="3" fill="#ffffff">
        <circle cx="150" cy="232" r="7" />
        <circle cx="186" cy="248" r="5" />
        <circle cx="172" cy="214" r="4" />
        <circle cx="168" cy="160" r="5" fill="none" />
        <circle cx="178" cy="132" r="3.5" fill="none" />
      </g>
      {/* flask */}
      <path d="M146 24 H198 M154 24 V118 L98 246 C88 268 100 280 120 280 H224 C244 280 256 268 246 246 L190 118 V24" />
      {/* graduation marks */}
      <g strokeWidth="3">
        <path d="M160 58 H172 M160 78 H168 M160 98 H172" />
      </g>
      {/* bench line */}
      <path d="M40 296 H320" stroke="#cfe7fa" strokeWidth="6" />
    </svg>
  );
}
