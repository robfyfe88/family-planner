export default function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div>
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-xl font-semibold leading-tight">{value}</div>
      {sub ? <div className="text-xs opacity-60 mt-0.5">{sub}</div> : null}
    </div>
  );
}
