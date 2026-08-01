import Image from "next/image";

type Props = {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
};

export function AppDeviceFrame({ src, alt, priority = false, className = "" }: Props) {
  return (
    <div className={`relative mx-auto w-full max-w-xl ${className}`}>
      <div className="rounded-[1.75rem] border border-white/20 bg-slate-900/90 p-2 shadow-2xl shadow-sky-900/30 ring-1 ring-white/10">
        <div className="mb-2 flex items-center gap-1.5 px-2 pt-1">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/90" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/90" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/90" />
          <span className="ml-2 truncate text-[10px] text-white/50">app.climaris.com.br</span>
        </div>
        <div className="aspect-[16/10] overflow-hidden rounded-[1.25rem] bg-surface-elevated">
          <Image
            src={src}
            alt={alt}
            width={1280}
            height={800}
            priority={priority}
            fetchPriority={priority ? "high" : "auto"}
            className="h-full w-full object-cover object-top"
            unoptimized
          />
        </div>
      </div>
      <div
        className="pointer-events-none absolute -inset-6 -z-10 rounded-full bg-primary/20 blur-3xl"
        aria-hidden
      />
    </div>
  );
}
