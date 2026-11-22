// Joins class names. A conditional class as `${on ? " on" : ""}` loses its space to
// prettier-plugin-tailwindcss, which trims class strings, and glues into another class.
export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");
