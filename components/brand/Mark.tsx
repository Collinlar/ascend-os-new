// The AscendSME mark: a four-square grid, two solid and two at half
// opacity, reading as connected parts of one thing. Taken from the design
// identity and used wherever the platform names itself.

export function Mark({
  size = 32,
  tone = "teal",
}: {
  size?: number;
  tone?: "teal" | "white";
}) {
  const dot = Math.round(size * 0.19);
  const gap = Math.round(size * 0.09);
  const dotColour = tone === "white" ? "#0E8C7F" : "#FFFFFF";

  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.31),
        background: tone === "white" ? "#FFFFFF" : "#0E8C7F",
      }}
    >
      <span
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap,
        }}
      >
        {[1, 0.55, 0.55, 1].map((opacity, i) => (
          <span
            key={i}
            style={{
              width: dot,
              height: dot,
              borderRadius: Math.max(Math.round(dot * 0.33), 2),
              background: dotColour,
              opacity,
            }}
          />
        ))}
      </span>
    </span>
  );
}

export function Wordmark({
  tone = "dark",
  size = 19,
}: {
  tone?: "dark" | "light";
  size?: number;
}) {
  return (
    <span className="flex items-center gap-[11px]">
      <Mark size={Math.round(size * 1.7)} tone={tone === "light" ? "white" : "teal"} />
      <span
        className={`font-extrabold tracking-[-0.02em] ${
          tone === "light" ? "text-white" : "text-ink"
        }`}
        style={{ fontSize: size }}
      >
        AscendSME
      </span>
    </span>
  );
}

// The mono eyebrow that sits above a headline and names the product set.
export function Eyebrow({
  children,
  tone = "teal",
}: {
  children: React.ReactNode;
  tone?: "teal" | "mint" | "muted";
}) {
  const colour =
    tone === "mint"
      ? "text-teal-mint"
      : tone === "muted"
        ? "text-soft-grey"
        : "text-teal-dark";
  return (
    <p
      className={`mono text-[11.5px] font-medium uppercase tracking-eyebrow ${colour}`}
    >
      {children}
    </p>
  );
}
