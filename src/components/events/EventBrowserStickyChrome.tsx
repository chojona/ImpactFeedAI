import { AnimatePresence, motion } from "framer-motion";

import { CategoryFilterBar, type CategoryFilter } from "./CategoryFilterBar";
import { SearchBar } from "./SearchBar";
import type { CategoryParam } from "@/services/events/queryParams";

export function EventBrowserStickyChrome({
  visible,
  searchInput,
  onSearchChange,
  resultCount,
  category,
  onCategoryChange,
  counts,
}: {
  visible: boolean;
  searchInput: string;
  onSearchChange: (value: string) => void;
  resultCount: number;
  category: CategoryFilter;
  onCategoryChange: (value: CategoryFilter) => void;
  counts: Record<CategoryParam, number>;
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed inset-x-0 top-16 z-10 border-b border-line bg-canvas/92 backdrop-blur-xl"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-3 sm:px-6 lg:flex-row lg:items-center lg:gap-4">
            <div className="lg:w-80 lg:shrink-0">
              <SearchBar
                value={searchInput}
                onChange={onSearchChange}
                resultCount={resultCount}
              />
            </div>
            <div className="lg:min-w-0 lg:flex-1">
              <CategoryFilterBar
                active={category}
                onChange={onCategoryChange}
                counts={counts}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
