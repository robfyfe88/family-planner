import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import format from "date-fns/format";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDay(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return format(d, "EEE d MMM");
}