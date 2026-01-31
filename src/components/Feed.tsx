"use client";

import type { FeedItem } from "@/lib/database.types";
import { FeedRow } from "./FeedRow";

interface FeedProps {
  items: FeedItem[];
}

export function Feed({ items }: FeedProps) {
  return (
    <div className="divide-y divide-ast-border">
      {items.map((item) => (
        <FeedRow key={item.id} item={item} />
      ))}
    </div>
  );
}
