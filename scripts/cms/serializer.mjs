function compactValue(value, depth, eol) {
  const indent = "  ".repeat(depth);
  const childIndent = "  ".repeat(depth + 1);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    if (value.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
      const compactObject = (item) => `{ ${Object.entries(item)
        .map(([key, child]) => `${JSON.stringify(key)}: ${JSON.stringify(child)}`).join(", ")} }`;
      return `[${eol}${value.map((item) => `${childIndent}${compactObject(item)}`).join(`,${eol}`)}${eol}${indent}]`;
    }
    return JSON.stringify(value);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return "{}";
    return `{${eol}${entries.map(([key, child]) =>
      `${childIndent}${JSON.stringify(key)}: ${compactValue(child, depth + 1, eol)}`).join(`,${eol}`)}${eol}${indent}}`;
  }
  return JSON.stringify(value);
}

export function serializeData(config, data, originalText = "") {
  const eol = config.serialization?.preserveEol && originalText.includes("\r\n") ? "\r\n" : "\n";
  if (config.serialization?.style === "compact-records") return `${compactValue(data, 0, eol)}${eol}`;
  return `${JSON.stringify(data, null, 2).replace(/\n/g, eol)}${eol}`;
}
