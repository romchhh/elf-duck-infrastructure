const TZ = "Europe/Warsaw";

export function getWarsawParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const map = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour || 0),
    minute: Number(map.minute || 0),
    second: Number(map.second || 0),
  };
}

export function monthKeyFromParts({ year, month }) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Ключ місяця розіграшу для поточної дати (Варшава). */
export function getActiveGiveawayMonthKey(date = new Date()) {
  const parts = getWarsawParts(date);
  return monthKeyFromParts(parts);
}

/** 1–25 — прийом участі; 26–31 — блок результатів (якщо розіграш проведено). */
export function isGiveawayParticipationWindow(date = new Date()) {
  const { day } = getWarsawParts(date);
  return day >= 1 && day <= 25;
}

export function isGiveawayResultsWindow(date = new Date()) {
  const { day } = getWarsawParts(date);
  return day >= 26;
}

/** Мілісекунди до 1-го числа наступного місяця (00:00 Europe/Warsaw). */
export function msUntilNextGiveawayMonth(date = new Date()) {
  const parts = getWarsawParts(date);
  let nextYear = parts.year;
  let nextMonth = parts.month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }

  const targetUtc = Date.parse(
    `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+01:00`
  );

  const probe = new Date(targetUtc);
  const probeParts = getWarsawParts(probe);
  if (probeParts.month !== nextMonth || probeParts.day !== 1) {
    return Date.parse(
      `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+02:00`
    ) - date.getTime();
  }

  return targetUtc - date.getTime();
}

export function resolveGiveawayUiPhase(monthDoc, date = new Date()) {
  const status = String(monthDoc?.status || "open").trim();

  if (status === "drawn" || status === "credited" || status === "notified") {
    return "results";
  }

  if (isGiveawayParticipationWindow(date)) {
    return "active";
  }

  if (isGiveawayResultsWindow(date)) {
    return "awaiting_draw";
  }

  return "results";
}
