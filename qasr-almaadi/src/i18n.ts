import { useSyncExternalStore } from "react";
export type Language = "ar" | "en";
const catalogs = import.meta.glob<Record<string, string>>("./locales/*.json", {
  eager: true,
  import: "default",
});
const messages: Record<string, string> = Object.assign(
  {},
  ...Object.values(catalogs),
);
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
const dictionary = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [normalize(key), value]),
);
let language: Language =
  localStorage.getItem("nicu-language") === "en" ? "en" : "ar";
const listeners = new Set<() => void>();
export const getLanguage = () => language;
export const getLocale = () => (language === "en" ? "en-GB" : "ar-EG");
function applyLanguage() {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "en" ? "ltr" : "rtl";
  document.cookie = `nicu_language=${language}; Path=/; SameSite=Lax`;
  document.title =
    language === "en"
      ? "Qasr Al Maadi | Hospital Management"
      : "قصر المعادي | إدارة المستشفى";
}
applyLanguage();
export function setLanguage(value: Language) {
  language = value;
  localStorage.setItem("nicu-language", value);
  applyLanguage();
  listeners.forEach((listener) => listener());
}
export function useLanguage() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, getLanguage);
}
export function t(
  source: string,
  params: Record<string, string | number> = {},
): string {
  let output =
    language === "en" && dictionary[normalize(source)] !== undefined
      ? (source.match(/^\s*/)?.[0] || "") +
        dictionary[normalize(source)] +
        (source.match(/\s*$/)?.[0] || "")
      : source;
  for (const [key, value] of Object.entries(params))
    output = output.replaceAll(`{${key}}`, String(value));
  return output;
}
export function confirmAction(message: string) {
  return window.confirm(t(message));
}
