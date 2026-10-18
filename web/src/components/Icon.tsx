type IconName = "arrow" | "chevron" | "copy" | "refresh" | "thumb";

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

  return (
    <svg className={down ? "thumb-down" : ""} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3Zm0 0 4-7a2 2 0 0 1 2 2v5h5a2 2 0 0 1 2 2l-1.5 7a2 2 0 0 1-2 2H7" />
    </svg>
  );
}
