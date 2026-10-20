/**
 * Shared CRM list sorting helpers (in-memory after row build, before pagination).
 */

export function parseSortQuery(query = {}, allowedKeys = []) {
  const allowed = allowedKeys instanceof Set ? allowedKeys : new Set(allowedKeys);
  const sortKey = String(query?.sortKey || "").trim();
  const sortDirection =
    String(query?.sortDirection || "desc").toLowerCase() === "asc"
      ? "asc"
      : "desc";

  return {
    sortKey: allowed.has(sortKey) ? sortKey : "",
    sortDirection,
  };
}

function toSortable(value) {
  if (value == null || value === "") return null;

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  const asString = String(value).trim();
  if (!asString) return null;

  // ISO / date-like strings
  if (/^\d{4}-\d{2}-\d{2}/.test(asString) || /^\d{2}\.\d{2}\.\d{4}/.test(asString)) {
    const time = new Date(asString).getTime();
    if (Number.isFinite(time)) return time;
  }

  const asNumber = Number(asString.replace(",", "."));
  if (asString !== "" && Number.isFinite(asNumber) && /^-?\d+(\.\d+)?$/.test(asString.replace(",", "."))) {
    return asNumber;
  }

  return asString.toLocaleLowerCase("ru");
}

export function compareSortValues(left, right, direction = "desc") {
  const a = toSortable(left);
  const b = toSortable(right);

  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  let result = 0;
  if (typeof a === "number" && typeof b === "number") {
    result = a - b;
  } else {
    result = String(a).localeCompare(String(b), "ru", {
      numeric: true,
      sensitivity: "base",
    });
  }

  return direction === "asc" ? result : -result;
}

/**
 * @param {Array} rows
 * @param {string} sortKey
 * @param {'asc'|'desc'} sortDirection
 * @param {Record<string, (row: any) => any>} [getters]
 */
export function sortRows(rows, sortKey, sortDirection = "desc", getters = {}) {
  if (!sortKey || !Array.isArray(rows) || rows.length < 2) {
    return rows;
  }

  const getValue =
    typeof getters[sortKey] === "function"
      ? getters[sortKey]
      : (row) => row?.[sortKey];

  return [...rows].sort((a, b) =>
    compareSortValues(getValue(a), getValue(b), sortDirection)
  );
}
