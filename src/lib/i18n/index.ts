import { az, type Dictionary } from "./az";
import { en } from "./en";

export const LANGS = ["az", "en"] as const;
export type Lang = (typeof LANGS)[number];

export const dictionaries: Record<Lang, Dictionary> = { az, en };
export const defaultLang: Lang = "az";

export type { Dictionary };
export { az, en };
