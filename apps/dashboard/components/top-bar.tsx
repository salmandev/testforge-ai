"use client";

import { useAuth } from "./auth-provider";
import { Globe, Moon, Sun, User } from "lucide-react";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

type Locale = "en" | "ar";

const LOCALES: Record<Locale, { label: string; flag: string }> = {
  en: { label: "English", flag: "🇬🇧" },
  ar: { label: "العربية", flag: "🇸🇦" },
};

export function TopBar() {
  const { isAuthenticated } = useAuth();
  const { theme, setTheme } = useTheme();
  const [locale, setLocale] = useState<Locale>("en");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const toggleLocale = () => {
    const next: Locale = locale === "en" ? "ar" : "en";
    setLocale(next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    localStorage.setItem("testforge_locale", next);
  };

  useEffect(() => {
    const saved = localStorage.getItem("testforge_locale") as Locale | null;
    if (saved && saved !== locale) {
      setLocale(saved);
      document.documentElement.lang = saved;
      document.documentElement.dir = saved === "ar" ? "rtl" : "ltr";
    }
  }, []);

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {locale === "ar" ? "لوحة التحكم" : "TestForge AI"}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Locale Toggle */}
        <button
          onClick={toggleLocale}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm",
            "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            "transition-colors"
          )}
          title={locale === "en" ? "Switch to Arabic" : "التبديل إلى الإنجليزية"}
        >
          <Globe className="h-4 w-4" />
          <span>{LOCALES[locale].flag}</span>
          <span className="hidden sm:inline">{LOCALES[locale].label}</span>
        </button>

        {/* Theme Toggle */}
        {mounted && (
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        )}

        {/* User */}
        <div className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="hidden sm:inline text-sm">
            {isAuthenticated ? (locale === "ar" ? "مستخدم" : "User") : (locale === "ar" ? "ضيف" : "Guest")}
          </span>
        </div>
      </div>
    </header>
  );
}
