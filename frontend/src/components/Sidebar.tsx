"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Bot,
  LayoutDashboard,
  PieChart,
  Table2,
  Settings,
  PanelLeftClose,
  PanelRightClose,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils"; // Using the global cn utility

// ---- props ----
interface SidebarProps {
  isMobileOpen: boolean;
  setMobileOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isExpanded: boolean;
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
}

// ---- nav model ----
const navSections = [
  {
    title: "General",
    links: [{ href: "/overview", icon: LayoutDashboard, label: "Overview" }],
  },
  {
    title: "Finance",
    links: [
      { href: "/portfolio", icon: PieChart, label: "Portfolio" },
      { href: "/brokers", icon: Table2, label: "Brokers" },
      { href: "/stockbot", icon: Bot, label: "Stockbot" },
    ],
  },
  {
    title: "System",
    links: [{ href: "/settings", icon: Settings, label: "Settings" }],
  },
];

// ---- component ----
export default function Sidebar({ isMobileOpen, setMobileOpen, isExpanded, setExpanded }: SidebarProps) {
  const pathname = usePathname() ?? "";

  const handleLinkClick = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileOpen(false);
    }
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "group fixed left-0 top-0 z-40 hidden h-screen border-r bg-black/40 backdrop-blur",
          "supports-[backdrop-filter]:backdrop-blur-md border-white/10 lg:block",
          "transition-[width] duration-300 ease-out",
          isExpanded ? "w-64" : "w-[76px]"
        )}
      >
        <SidebarInner
          pathname={pathname}
          expanded={isExpanded}
          setExpanded={setExpanded}
          onLinkClick={handleLinkClick}
        />
      </aside>

      {/* Mobile Sheet */}
      <Sheet open={isMobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[80vw] p-0 bg-black/70 backdrop-blur supports-[backdrop-filter]:backdrop-blur-md border-white/10"
        >
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
          </SheetHeader>
          <SidebarInner
            pathname={pathname}
            expanded // Mobile is always expanded
            setExpanded={() => {}} // No-op for mobile
            onLinkClick={() => setMobileOpen(false)}
            isMobile
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

/* ---------------- subcomponents ---------------- */

function SidebarInner({
  pathname,
  expanded,
  setExpanded,
  onLinkClick,
  isMobile,
}: {
  pathname: string;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  onLinkClick: () => void;
  isMobile?: boolean;
}) {
  return (
    <TooltipProvider delayDuration={80}>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4">
          <button
            className="flex items-center gap-2"
            onClick={() => {
              if (!isMobile && typeof window !== "undefined" && window.innerWidth >= 1024) {
                setExpanded(!expanded);
              }
            }}
          >
            {expanded ? (
              <span className="text-2xl font-extrabold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Jarvis
              </span>
            ) : (
              <div className="size-10 relative">
                <Image
                  src="/BotLogo.png"
                  alt="Jarvis"
                  fill
                  className="object-contain invert brightness-200 mix-blend-screen"
                />
              </div>
            )}
          </button>

          {!isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="text-zinc-300 hover:text-white"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <PanelLeftClose size={18} /> : <PanelRightClose size={18} />}
            </Button>
          )}
        </div>

        <Separator className="border-white/10" />

        {/* Nav */}
        <ScrollArea className="flex-1 px-2 py-3">
          <nav className="space-y-6 text-sm text-zinc-300">
            {navSections.map(({ title, links }) => (
              <div key={title} className="space-y-2">
                {expanded && (
                  <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    {title}
                  </div>
                )}
                <ul className="space-y-1">
                  {links.map(({ href, icon: Icon, label }) => {
                    const isActive = pathname === href;
                    const item = (
                      <Link
                        href={href}
                        onClick={onLinkClick}
                        className={cn(
                          "flex items-center rounded-md px-3 py-2 transition-colors",
                          "hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                          expanded ? "gap-3 justify-start" : "justify-center",
                          isActive
                            ? "bg-indigo-500/25 text-white ring-1 ring-inset ring-indigo-400/40"
                            : "text-zinc-300"
                        )}
                      >
                        <Icon
                          size={18}
                          className={cn(
                            "shrink-0",
                            isActive ? "text-white" : "text-zinc-300"
                          )}
                        />
                        {expanded && <span className="text-sm">{label}</span>}
                        {/* active indicator pill */}
                        {!expanded && isActive && (
                          <span className="absolute right-0 h-6 w-1 rounded-l bg-indigo-400" />
                        )}
                      </Link>
                    );

                    return (
                      <li key={href} className="relative">
                        {expanded ? (
                          item
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>{item}</TooltipTrigger>
                            <TooltipContent side="right">{label}</TooltipContent>
                          </Tooltip>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </ScrollArea>

        <Separator className="border-white/10" />

        {/* Footer: user / settings quick menu */}
        <div className={cn("p-3", expanded ? "px-3" : "px-2")}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start gap-3 text-left text-zinc-300 hover:text-white",
                  expanded ? "px-2" : "px-0"
                )}
              >
                <div className="flex size-8 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500/40 to-purple-600/40 ring-1 ring-white/10">
                  <User size={16} />
                </div>
                {expanded && (
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Trader</span>
                    <span className="text-xs text-zinc-500">@you</span>
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={expanded ? "start" : "end"} className="w-52">
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href="/settings">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/brokers">Brokers</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => alert("Sign out (wire this)")}>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </TooltipProvider>
  );
}
