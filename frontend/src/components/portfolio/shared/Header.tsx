import { Badge } from "@/components/ui/badge";

export default function Header({ title, timestamp, activeBroker }: { title: string; timestamp: string; activeBroker?: string }) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl md:text-3xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400">
          {title}
        </h1>
        {activeBroker && <Badge variant="outline">Active: {activeBroker}</Badge>}
      </div>
      <div className="text-sm text-muted-foreground">{timestamp}</div>
    </div>
  );
}
