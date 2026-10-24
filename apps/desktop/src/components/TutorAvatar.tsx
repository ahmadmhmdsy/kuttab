// How the tutor looks in a voice session (decision 0002 item 13): the orb, a
// face, or a small character. 2D SVG and CSS only; the state drives the motion.
import type { TutorLook } from "../state.ts";

export type AvatarState = "idle" | "listening" | "thinking" | "speaking";

export function TutorAvatar({ look, state }: { look: TutorLook; state: AvatarState }) {
  if (look === "orb") return <div className={`live-orb ${state}`} aria-hidden />;
  return (
    <svg className={`avatar avatar-${look} ${state}`} viewBox="0 0 200 200" aria-hidden>
      {look === "character" && (
        <g className="avatar-body">
          <path d="M50 200 Q50 150 100 145 Q150 150 150 200 Z" />
          <rect x="88" y="128" width="24" height="22" rx="8" />
        </g>
      )}
      <g className="avatar-head">
        {look === "character" && <path className="avatar-hair" d="M48 78 Q52 28 100 26 Q148 28 152 78 Q130 52 100 54 Q70 52 48 78 Z" />}
        <circle className="avatar-skin" cx="100" cy={look === "character" ? 82 : 100} r={look === "character" ? 52 : 80} />
        <g transform={look === "character" ? "translate(100 82) scale(0.65) translate(-100 -100)" : undefined}>
          <g className="avatar-eyes">
            <ellipse cx="72" cy="88" rx="9" ry="11" />
            <ellipse cx="128" cy="88" rx="9" ry="11" />
          </g>
          <g className="avatar-brows">
            <path d="M60 70 Q72 64 84 70" />
            <path d="M116 70 Q128 64 140 70" />
          </g>
          <ellipse className="avatar-mouth" cx="100" cy="130" rx="18" ry="5" />
        </g>
      </g>
      {state === "thinking" && (
        <g className="avatar-dots">
          <circle cx="160" cy="40" r="5" />
          <circle cx="174" cy="26" r="7" />
          <circle cx="190" cy="10" r="9" />
        </g>
      )}
    </svg>
  );
}
