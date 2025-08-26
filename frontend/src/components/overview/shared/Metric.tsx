export function Metric({label, value}:{label:string; value:string}) {
  return (
    <div className="bg-muted/40 rounded-lg p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-mono text-card-foreground">{value}</div>
    </div>
  );
}
