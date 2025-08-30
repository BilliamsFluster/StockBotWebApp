"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
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
import { cn } from "@/lib/utils";
import { logout } from "@/api/client";
import { useProfile } from "@/api/user";
import { useAuth } from "@/context/AuthContext";

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

const slug = (s: string) => s.toLowerCase().trim().replace(/\s+/g, "-");

// ---- component ----
export default function Sidebar({ isMobileOpen, setMobileOpen, isExpanded, setExpanded }: SidebarProps) {
  const pathname = usePathname() ?? "";

  const handleLinkClick = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileOpen(false);
    }
  };

  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
  } = useProfile();
  const username = profile?.username || "Guest";

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "group fixed left-0 top-0 z-40 hidden h-screen border-r bg-background/80 backdrop-blur",
          "supports-[backdrop-filter]:backdrop-blur-md lg:block",
          "transition-[width] duration-300 ease-out",
          isExpanded ? "w-64" : "w-[76px]"
        )}
      >
        <SidebarInner
          pathname={pathname}
          expanded={isExpanded}
          setExpanded={setExpanded}
          onLinkClick={handleLinkClick}
          username={username}
          profileLoading={profileLoading}
          profileError={profileError}
        />
      </aside>

      {/* Mobile Sheet */}
      <Sheet open={isMobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[80vw] border-r p-0 bg-background/90 backdrop-blur supports-[backdrop-filter]:backdrop-blur-md"
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
            username={username}
            profileLoading={profileLoading}
            profileError={profileError}
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
  username,
  profileLoading,
  profileError,
}: {
  pathname: string;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  onLinkClick: () => void;
  isMobile?: boolean;
  username: string;
  profileLoading: boolean;
  profileError: boolean;
}) {
  const router = useRouter();
  const { setUser } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      router.push("/");
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

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
            aria-label="Toggle sidebar width"
          >
            {expanded ? (
              <span className="text-2xl font-extrabold text-primary">Jarvis</span>
            ) : (
              <div className="size-10 relative">
                <Image
                  src="/BotLogo.png"
                  alt="Jarvis"
                  fill
                  className="object-contain dark:invert dark:brightness-200 dark:mix-blend-screen"
                />
              </div>
            )}
          </button>

          {!isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
            >
              {expanded ? <PanelLeftClose size={18} /> : <PanelRightClose size={18} />}
            </Button>
          )}
        </div>

        <Separator />

        {/* Nav */}
        <ScrollArea className="flex-1 px-2 py-3">
          <nav className="space-y-6 text-sm">
            {navSections.map(({ title, links }) => (
              <div key={title} className="space-y-2">
                {expanded && (
                  <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                    {title}
                  </div>
                )}
                <ul className="space-y-1">
                  {links.map(({ href, icon: Icon, label }) => {
                    const isActive = pathname === href;
                    const hook = `nav-${slug(label)}`; // stable hook for navigate()
                    const item = (
                      <Link
                        href={href}
                        data-test={hook}                             // ← EVERY nav link
                        aria-label={`Nav ${label}`}
                        aria-current={isActive ? "page" : undefined}
                        onClick={onLinkClick}
                        className={cn(
                          "flex items-center rounded-md px-3 py-2 transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                          expanded ? "gap-3 justify-start" : "justify-center",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )}
                      >
                        <Icon size={18} className="shrink-0" />
                        {expanded && <span className="text-sm">{label}</span>}
                        {!expanded && isActive && (
                          <span className="absolute right-0 h-6 w-1 rounded-l bg-primary" />
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

        <Separator />

        {/* Footer: user / settings quick menu */}
        <div className={cn("p-3", expanded ? "px-3" : "px-2")}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start gap-3 text-left text-muted-foreground hover:text-foreground",
                  expanded ? "px-2" : "px-0"
                )}
              >
                <div className="flex size-8 items-center justify-center rounded-md bg-primary/20 ring-1 ring-border">
                  <User size={16} />
                </div>
                {expanded && (
                  <div className="flex flex-col">
                    {profileLoading ? (
                      <span className="text-sm text-muted-foreground">Loading...</span>
                    ) : (
                      <>
                        <span className="text-sm font-medium text-foreground">{username}</span>
                        <span className="text-xs text-muted-foreground">@{username.toLowerCase()}</span>
                        {profileError && (
                          <span className="text-xs text-destructive">Error loading profile</span>
                        )}
                      </>
                    )}
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={expanded ? "start" : "end"} className="w-52">
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href="/settings" data-test={`menu-${slug("Settings")}`}>Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/brokers" data-test={`menu-${slug("Brokers")}`}>Brokers</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {/* Sign out is a button action, not a link */}
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </TooltipProvider>
  );
}
