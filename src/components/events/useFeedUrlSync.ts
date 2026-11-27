"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import type { SortMode } from "@/services/events/queryParams";
import type { CategoryFilter } from "./CategoryFilterBar";
import { feedStateFromLocation, syncFeedUrl } from "./EventBrowserUrl";

/**
 * Mirror category / sort / search into the address bar, and apply Back/Forward.
 * Category and sort push; search typing replaces.
 */
export function useFeedUrlSync({
  pathname,
  category,
  sortMode,
  search,
  searchInput,
  setCategory,
  setSortMode,
  setSearchInput,
  setSearch,
}: {
  pathname: string;
  category: CategoryFilter;
  sortMode: SortMode;
  search: string;
  searchInput: string;
  setCategory: Dispatch<SetStateAction<CategoryFilter>>;
  setSortMode: Dispatch<SetStateAction<SortMode>>;
  setSearchInput: Dispatch<SetStateAction<string>>;
  setSearch: Dispatch<SetStateAction<string>>;
}) {
  const prevUrlRef = useRef({ category, sort: sortMode, search });

  useEffect(() => {
    if (searchInput.trim() === search) return;
    const t = setTimeout(() => setSearch(searchInput.trim()), 200);
    return () => clearTimeout(t);
  }, [searchInput, search, setSearch]);

  useEffect(() => {
    const next = { category, sort: sortMode, search };
    syncFeedUrl(pathname, next, prevUrlRef.current);
    prevUrlRef.current = next;
  }, [pathname, category, sortMode, search]);

  useEffect(() => {
    const onPopState = () => {
      const fromUrl = feedStateFromLocation();
      prevUrlRef.current = fromUrl;
      setCategory(fromUrl.category);
      setSortMode(fromUrl.sort);
      setSearchInput(fromUrl.search);
      setSearch(fromUrl.search);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [setCategory, setSortMode, setSearchInput, setSearch]);
}
