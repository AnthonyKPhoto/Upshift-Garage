// Small / Medium / Large product photos on the vehicle page's mod views. Remembered per browser
// (localStorage, like the view mode). Class strings are written out in full so Tailwind keeps them.

export type ModImageSize = "sm" | "md" | "lg";
export const MOD_IMAGE_SIZES: { id: ModImageSize; label: string; title: string }[] = [
  { id: "sm", label: "S", title: "Small photos" },
  { id: "md", label: "M", title: "Medium photos" },
  { id: "lg", label: "L", title: "Large photos" },
];
export const MOD_IMAGE_SIZE_KEY = "bv-mod-img-size";

export function readModImageSize(): ModImageSize {
  try {
    const v = localStorage.getItem(MOD_IMAGE_SIZE_KEY);
    return v === "sm" || v === "md" || v === "lg" ? v : "sm";
  } catch { return "sm"; }
}

/** Box classes per view. `null` = no photo at that size (compact and kanban stay text-only on Small). */
export const MOD_IMAGE_CLASS = {
  card:     { sm: "w-14 h-14",  md: "w-24 h-24",  lg: "w-28 h-28 sm:w-40 sm:h-40" },
  compact:  { sm: null,         md: "w-8 h-8",    lg: "w-12 h-12" },
  timeline: { sm: "w-10 h-10",  md: "w-16 h-16",  lg: "w-24 h-24" },
  kanban:   { sm: null,         md: "h-24",       lg: "h-36" },
  gallery:  {
    sm: "grid-cols-3 sm:grid-cols-4 md:grid-cols-6",
    md: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
    lg: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
  },
} as const;
