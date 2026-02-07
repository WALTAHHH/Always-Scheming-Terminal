"use client";

import { isPublicCompany } from "@/lib/companies";
import { openCompanyDrawer } from "./CompanyDrawer";

interface CompanyTagProps {
  name: string;
  className?: string;
}

export function CompanyTag({ name, className = "" }: CompanyTagProps) {
  const isPublic = isPublicCompany(name);

  if (isPublic) {
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openCompanyDrawer(name);
        }}
        className={`text-[9px] px-1 py-0.5 bg-ast-border/50 text-ast-muted rounded hover:bg-ast-accent/20 hover:text-ast-accent transition-colors cursor-pointer ${className}`}
        title={`View ${name} market data`}
      >
        {name} 📈
      </button>
    );
  }

  return (
    <span className={`text-[9px] px-1 py-0.5 bg-ast-border/50 text-ast-muted rounded ${className}`}>
      {name}
    </span>
  );
}
