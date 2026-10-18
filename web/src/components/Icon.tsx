type IconName =
  | "arrow"
  | "chevron"
  | "copy"
  | "keyboard"
  | "microphone"
  | "refresh"
  | "stop"
  | "thumb"
  | "volume";

interface IconProps {
  name: IconName;
  down?: boolean;
}

export function Icon({ name, down = false }: IconProps) {
  if (name === "chevron") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m9 5 7 7-7 7" />
      </svg>
    );
  }

  if (name === "arrow") {
    return (
      <svg viewBox="0 0 32 24" aria-hidden="true">
        <path d="M3 12h24M18 3l9 9-9 9" />
      </svg>
    );
  }

  if (name === "refresh") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6.1 9a6.5 6.5 0 0 1 10.8-2L20 12M4 12l3.1 5a6.5 6.5 0 0 0 10.8-2" />
      </svg>
    );
  }

  if (name === "copy") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="8" y="8" width="12" height="14" rx="1.5" />
        <path d="M16 5V3H5a2 2 0 0 0-2 2v13h2" />
      </svg>
    );
  }

  if (name === "volume") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4Z" />
        <path d="M16 9a5 5 0 0 1 0 6M18.5 6.5a9 9 0 0 1 0 11" />
      </svg>
    );
  }

  if (name === "keyboard") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
        <path d="M6 9h.01M9 9h.01M12 9h.01M15 9h.01M18 9h.01M6 12h.01M9 12h.01M12 12h.01M15 12h.01M18 12h.01M8 15h8" />
      </svg>
    );
  }

  if (name === "microphone") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
      </svg>
    );
  }

  if (name === "stop") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="5" width="14" height="14" rx="2" />
      </svg>
    );
  }

  return (
    <svg className={down ? "thumb-down" : ""} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3Zm0 0 4-7a2 2 0 0 1 2 2v5h5a2 2 0 0 1 2 2l-1.5 7a2 2 0 0 1-2 2H7" />
    </svg>
  );
}
