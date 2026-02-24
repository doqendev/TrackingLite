"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BookOpen, ChevronDown } from "lucide-react";
import { PLATFORM_GUIDES } from "@/lib/guide-content";

interface SetupGuideProps {
  platformKey: string;
}

export function SetupGuide({ platformKey }: SetupGuideProps) {
  const t = useTranslations("integrations");
  const [open, setOpen] = useState(false);

  const steps = PLATFORM_GUIDES[platformKey];
  if (!steps || steps.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg bg-white/[0.02] border border-white/[0.06] overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
        onClick={() => setOpen((prev) => !prev)}
      >
        <BookOpen className="h-4 w-4 text-brand-500 shrink-0" />
        <span className="flex-1 text-sm font-medium text-foreground">
          {t("setupGuide")}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          open ? "max-h-[2000px]" : "max-h-0"
        }`}
      >
        <div className="px-4 pb-4 space-y-4 border-t border-white/[0.06] pt-4">
          {steps.map((step, index) => (
            <div key={index} className="flex gap-3">
              <div className="flex-shrink-0 h-6 w-6 rounded-full bg-brand-500/20 text-brand-500 flex items-center justify-center text-xs font-bold">
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {t(step.titleKey as Parameters<typeof t>[0])}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t(step.descriptionKey as Parameters<typeof t>[0])}
                </p>
                {step.image && (
                  <img
                    src={step.image}
                    alt={t(step.titleKey as Parameters<typeof t>[0])}
                    className="mt-2 rounded-lg border border-white/[0.08] w-full"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
