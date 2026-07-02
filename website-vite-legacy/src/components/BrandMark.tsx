type Props = {
  className?: string;
  showName?: boolean;
  onDark?: boolean;
};

export function BrandMark({ className = "", showName = true, onDark = false }: Props) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-hero shadow-card"
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 text-white"
        >
          <line x1="12" y1="2" x2="12" y2="22" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
          <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
      </div>
      {showName ? (
        <span className={`text-lg font-bold tracking-tight ${onDark ? "text-white" : "text-text"}`}>
          Climaris
        </span>
      ) : null}
    </div>
  );
}
