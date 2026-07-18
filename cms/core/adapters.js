function atPath(root, path) {
  let current = root;
  for (const part of path) {
    if (!current || typeof current !== "object" || !Object.hasOwn(current, part)) {
      throw new Error(`Caminho de coleção inexistente: ${path.join(".")}.`);
    }
    current = current[part];
  }
  return current;
}

function ensurePath(root, path) {
  let current = root;
  for (const part of path) current = current[part] ??= {};
  return current;
}

function groupedRecords(node, groups, depth = 0, context = {}) {
  if (depth === groups.length) {
    if (!Array.isArray(node)) throw new Error("O agrupamento final deve conter uma lista.");
    return node.map((item) => ({ ...item, ...context }));
  }
  if (!node || typeof node !== "object" || Array.isArray(node)) throw new Error("Agrupamento inválido no JSON.");
  return Object.entries(node).flatMap(([key, child]) =>
    groupedRecords(child, groups, depth + 1, { ...context, [groups[depth]]: key }));
}

export function readRecords(config, data) {
  const collection = atPath(data, config.data.collectionPath);
  if (config.data.adapter === "array") {
    if (!Array.isArray(collection)) throw new Error("A coleção configurada deve ser uma lista.");
    return collection.map((item) => ({ ...item }));
  }
  if (config.data.adapter === "grouped") return groupedRecords(collection, config.data.groups);
  if (config.data.adapter === "matrix") {
    const valueField = config.data.valueField ?? "valor";
    const walk = (node, depth, context) => depth === config.data.groups.length
      ? [{ ...context, [valueField]: node }]
      : Object.entries(node).flatMap(([key, child]) => walk(child, depth + 1, { ...context, [config.data.groups[depth]]: key }));
    return walk(collection, 0, {});
  }
  throw new Error(`Adaptador não reconhecido: ${config.data.adapter}.`);
}

function recordPayload(config, record) {
  const groups = new Set(config.data.groups);
  return Object.fromEntries(Object.entries(record).filter(([key]) => !groups.has(key)));
}

function replaceCollection(data, path, collection) {
  if (!path.length) return collection;
  const parent = ensurePath(data, path.slice(0, -1));
  parent[path.at(-1)] = collection;
  return data;
}

export function writeRecords(config, data, records) {
  if (config.data.adapter === "array") {
    return replaceCollection(data, config.data.collectionPath, records.map((record) => recordPayload(config, record)));
  }
  const grouped = {};
  for (const record of records) {
    let current = grouped;
    config.data.groups.forEach((group, index) => {
      const key = String(record[group]);
      if (index === config.data.groups.length - 1 && config.data.adapter === "matrix") {
        current[key] = record[config.data.valueField ?? "valor"];
      } else if (index === config.data.groups.length - 1) (current[key] ??= []).push(recordPayload(config, record));
      else current = current[key] ??= {};
    });
  }
  return replaceCollection(data, config.data.collectionPath, grouped);
}
