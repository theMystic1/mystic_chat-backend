// utils/validateMediaUrl.ts
export const isValidPublicUrl = (u: unknown) => {
  if (typeof u !== "string") return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};
