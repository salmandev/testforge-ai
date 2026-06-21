"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "./auth-provider";
import {
  LayoutDashboard,
  FlaskConical,
  Building2,
  BarChart3,
  Settings,
  LogOut,
  Zap,
  FolderKanban,
  ShieldCheck,
  BrainCircuit,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", label_ar: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", label_ar: "المشاريع", icon: FolderKanban },
  { href: "/suites", label: "Test Suites", label_ar: "مجموعات الاختبار", icon: FlaskConical },
  { href: "/d365", label: "Dynamics 365", label_ar: "داينامكس ٣٦٥", icon: Building2 },
  { href: "/compliance", label: "Compliance", label_ar: "الامتثال", icon: ShieldCheck },
  { href: "/ai-insights", label: "AI Insights", label_ar: "رؤى الذكاء", icon: BrainCircuit },
  { href: "/reports", label: "Reports", label_ar: "التقارير", icon: BarChart3 },
  { href: "/settings", label: "Settings", label_ar: "الإعدادات", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const isRTL = typeof document !== "undefined" && document.documentElement.dir === "rtl";

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-card">
      <div className="flex items-center gap-2 border-b px-6 py-4">
        <Zap className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold">TestForge AI</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          const displayLabel = isRTL ? item.label_ar : item.label;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
              title={isRTL ? item.label : item.label_ar}
            >
              <Icon className="h-4 w-4" />
              {displayLabel}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
