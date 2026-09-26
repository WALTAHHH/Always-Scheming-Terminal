"use client";

import { useState, useEffect } from "react";
import { fetchEntityByAlias } from "@/lib/entity-client";
import { openCompanyDrawer } from "./CompanyDrawer";

interface CompanyTagProps {
  name: string;
  className?: string;
}

export function CompanyTag({ name, className = "" }: CompanyTagProps) {
  const [entityExists, setEntityExists] = useState(false);

  useEffect(() => {
    fetchEntityByAlias(name).then((entity) => setEntityExists(entity !== null));
  }, [name]);

  if (entityExists) {
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openCompanyDrawer(name);
        }}
        className={`text-[10px] px-1 py-0.5 bg-ast-surface text-ast-text/70 rounded border border-ast-border hover:bg-ast-accent/20 hover:text-ast-accent transition-colors cursor-pointer ${className}`}
        title={`View ${name} coverage`}
      >
        {name}
      </button>
    );
  }

  // Entity not in DB — still show as plain tag (no 📈 icon — that was public-only)
  return (
    <span className={`text-[10px] px-1 py-0.5 bg-ast-surface text-ast-text/70 rounded border border-ast-border ${className}`}>
      {name}
    </span>
  );
}
