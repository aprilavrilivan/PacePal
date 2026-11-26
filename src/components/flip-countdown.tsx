type FlipCountdownProps = {
  isRunning: boolean;
  remainingSeconds: number;
};

function timeParts(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return {
    accessible: `倒计时 ${hours}小时${minutes}分${seconds}秒`,
    groups: [hours, minutes, seconds].map((value) =>
      String(value).padStart(2, "0"),
    ),
  };
}

function FlipDigit({ digit, position }: { digit: string; position: number }) {
  return (
    <span
      aria-hidden="true"
      className="relative flex min-w-10 flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#181b27] py-3 text-[clamp(2.7rem,7vw,5.5rem)] leading-none font-semibold tracking-[-0.08em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_14px_30px_rgba(0,0,0,0.24)] sm:min-w-14 sm:rounded-2xl sm:py-5"
    >
      <span className="flip-clock-digit" key={`${position}-${digit}`}>
        {digit}
      </span>
      <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/65" />
      <span className="pointer-events-none absolute inset-x-0 top-[calc(50%+1px)] h-px bg-white/5" />
    </span>
  );
}

export function FlipCountdown({
  isRunning,
  remainingSeconds,
}: FlipCountdownProps) {
  const { accessible, groups } = timeParts(remainingSeconds);

  return (
    <div
      aria-label={accessible}
      aria-live="polite"
      className="w-full"
      role="timer"
    >
      <div className="flex items-center justify-center gap-1.5 sm:gap-2.5">
        {groups.map((group, groupIndex) => (
          <div
            className="contents"
            key={["hours", "minutes", "seconds"][groupIndex]}
          >
            <span className="flex min-w-0 flex-1 gap-1 sm:gap-2">
              {group.split("").map((digit, digitIndex) => (
                <FlipDigit
                  digit={digit}
                  key={`${digitIndex}-${digit}`}
                  position={groupIndex * 2 + digitIndex}
                />
              ))}
            </span>
            {groupIndex < groups.length - 1 ? (
              <span
                aria-hidden="true"
                className={`pb-2 text-3xl font-semibold text-violet-300 sm:text-5xl ${
                  isRunning ? "animate-pulse" : ""
                }`}
              >
                :
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="mt-3 grid grid-cols-3 gap-7 px-2 text-center text-[0.7rem] font-semibold tracking-[0.22em] text-slate-500 uppercase sm:mt-4 sm:text-xs"
      >
        <span>小时</span>
        <span>分钟</span>
        <span>秒</span>
      </div>
    </div>
  );
}
