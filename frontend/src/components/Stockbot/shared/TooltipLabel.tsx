import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactNode, LabelHTMLAttributes } from "react";

interface TooltipLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  tooltip: ReactNode;
  children?: ReactNode;
}

export function TooltipLabel({
  className,
  children,
  tooltip,
  ...props
}: TooltipLabelProps) {
  return (
    <div className="flex items-center gap-1">
      <Label className={cn("text-sm font-medium", className)} {...props}>
        {children}
      </Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </div>
  );
}
