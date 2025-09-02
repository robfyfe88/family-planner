export default function WeekBars({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  const labels = ["S", "M", "T", "W", "T", "F", "S"];
  return (
    <div className="grid grid-cols-7 gap-2">
      {counts.map((n, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <div className="h-24 w-7 rounded bg-gray-100 border relative overflow-hidden">
            <div
              className="absolute bottom-0 left-0 right-0 bg-violet-600/80"
              style={{ height: `${(n / max) * 100}%` }}
              aria-label={`${labels[i]} has ${n} activity(ies)`}
            />
          </div>
          <div className="text-[11px] opacity-70">{labels[i]}</div>
          <div className="text-[11px] opacity-80">{n}</div>
        </div>
      ))}
    </div>
  );
}
