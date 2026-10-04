/** Графік точок (Europe/Warsaw) — дзеркало бекенд getPointOpenStateNow + next open. */

export function getWarsawDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getWarsawNowMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hh = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const mm = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return hh * 60 + mm;
}

export function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

function addWarsawCalendarDays(dateKey, days) {
  const m = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  // Noon UTC avoids DST edge cases when shifting calendar days for Warsaw
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return getWarsawDateKey(d);
}

function formatDdMm(dateKey) {
  const m = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}.${m[2]}`;
}

function normalizePeriod(raw) {
  if (!raw || typeof raw !== "object") return null;

  const from = String(
    raw?.openFrom ?? raw?.from ?? raw?.start ?? raw?.startTime ?? raw?.timeFrom ?? ""
  ).trim();

  const to = String(
    raw?.openTo ?? raw?.to ?? raw?.end ?? raw?.endTime ?? raw?.timeTo ?? ""
  ).trim();

  if (!from || !to) return null;
  return { openFrom: from, openTo: to };
}

export function getSchedulePeriods(schedule) {
  if (!schedule || typeof schedule !== "object") return [];

  if (
    schedule?.isOpen === false ||
    schedule?.closed === true ||
    schedule?.isActive === false
  ) {
    return [];
  }

  const periodsRaw =
    (Array.isArray(schedule?.periods) && schedule.periods) ||
    (Array.isArray(schedule?.timePeriods) && schedule.timePeriods) ||
    (Array.isArray(schedule?.ranges) && schedule.ranges) ||
    (Array.isArray(schedule?.slots) && schedule.slots) ||
    [];

  const normalized = periodsRaw
    .map(normalizePeriod)
    .filter(Boolean)
    .sort((a, b) => timeToMinutes(a.openFrom) - timeToMinutes(b.openFrom));

  const fallbackOpenFrom = String(schedule?.openFrom || schedule?.from || "").trim();
  const fallbackOpenTo = String(schedule?.openTo || schedule?.to || "").trim();

  if (!normalized.length && fallbackOpenFrom && fallbackOpenTo) {
    normalized.push({ openFrom: fallbackOpenFrom, openTo: fallbackOpenTo });
  }

  return normalized;
}

function getScheduleMap(point) {
  const raw = point?.scheduleByDate;
  if (!raw) return {};
  if (raw instanceof Map) {
    return Object.fromEntries(raw.entries());
  }
  return typeof raw === "object" ? raw : {};
}

export function getScheduleForDateKey(point, dateKey) {
  const map = getScheduleMap(point);
  return map?.[dateKey] || null;
}

export function getPointOpenStateNow(point, now = new Date()) {
  const dateKey = getWarsawDateKey(now);
  const schedule = getScheduleForDateKey(point, dateKey);

  if (!schedule) {
    return {
      isOpen: false,
      reason: "NO_SCHEDULE",
      openFrom: "",
      openTo: "",
      periods: [],
      dateKey,
    };
  }

  if (
    schedule?.isOpen === false ||
    schedule?.closed === true ||
    schedule?.isActive === false
  ) {
    return {
      isOpen: false,
      reason: "CLOSED_TODAY",
      openFrom: "",
      openTo: "",
      periods: [],
      dateKey,
    };
  }

  const periods = getSchedulePeriods(schedule);
  if (!periods.length) {
    return {
      isOpen: false,
      reason: "NO_HOURS",
      openFrom: "",
      openTo: "",
      periods: [],
      dateKey,
    };
  }

  const nowMinutes = getWarsawNowMinutes(now);
  const activePeriod = periods.find((period) => {
    const fromMinutes = timeToMinutes(period.openFrom);
    const toMinutes = timeToMinutes(period.openTo);
    return nowMinutes >= fromMinutes && nowMinutes <= toMinutes;
  });

  if (activePeriod) {
    return {
      isOpen: true,
      reason: "OPEN",
      openFrom: activePeriod.openFrom,
      openTo: activePeriod.openTo,
      periods,
      dateKey,
    };
  }

  return {
    isOpen: false,
    reason: "OUTSIDE_HOURS",
    openFrom: periods[0]?.openFrom || "",
    openTo: periods[periods.length - 1]?.openTo || "",
    periods,
    dateKey,
  };
}

/**
 * Наступне відкриття: сьогоднішній наступний інтервал, інакше найближчий день у scheduleByDate.
 */
export function getNextOpenInfo(point, now = new Date()) {
  const todayKey = getWarsawDateKey(now);
  const nowMinutes = getWarsawNowMinutes(now);
  const todaySchedule = getScheduleForDateKey(point, todayKey);
  const todayPeriods = getSchedulePeriods(todaySchedule);

  const laterToday = todayPeriods.find(
    (p) => timeToMinutes(p.openFrom) > nowMinutes
  );
  if (laterToday) {
    return {
      dateKey: todayKey,
      openFrom: laterToday.openFrom,
      openTo: laterToday.openTo,
      isToday: true,
    };
  }

  for (let offset = 1; offset <= 14; offset++) {
    const dateKey = addWarsawCalendarDays(todayKey, offset);
    if (!dateKey) break;
    const schedule = getScheduleForDateKey(point, dateKey);
    const periods = getSchedulePeriods(schedule);
    if (!periods.length) continue;
    return {
      dateKey,
      openFrom: periods[0].openFrom,
      openTo: periods[0].openTo,
      isToday: false,
    };
  }

  return null;
}

/** @param {(ru: string, pl: string) => string} t */
export function formatNextOpenLabel(nextOpen, t) {
  if (!nextOpen?.openFrom) {
    return t
      ? t("Временно закрыто", "Tymczasowo zamknięte")
      : "Временно закрыто";
  }

  if (nextOpen.isToday) {
    return t
      ? t(
          `Откроется сегодня в ${nextOpen.openFrom}`,
          `Otwarte dziś od ${nextOpen.openFrom}`
        )
      : `Откроется сегодня в ${nextOpen.openFrom}`;
  }

  const ddMm = formatDdMm(nextOpen.dateKey);
  return t
    ? t(
        `Откроется ${ddMm} в ${nextOpen.openFrom}`,
        `Otwarte ${ddMm} od ${nextOpen.openFrom}`
      )
    : `Откроется ${ddMm} в ${nextOpen.openFrom}`;
}

export function getPointScheduleUiState(point, now = new Date()) {
  const openState = getPointOpenStateNow(point, now);
  if (openState.isOpen) {
    return {
      openNow: true,
      openState,
      nextOpen: null,
      closedLabel: "",
    };
  }

  const nextOpen = getNextOpenInfo(point, now);
  return {
    openNow: false,
    openState,
    nextOpen,
    closedLabelRu: nextOpen
      ? nextOpen.isToday
        ? `Откроется сегодня в ${nextOpen.openFrom}`
        : `Откроется ${formatDdMm(nextOpen.dateKey)} в ${nextOpen.openFrom}`
      : "Временно закрыто",
    closedLabelPl: nextOpen
      ? nextOpen.isToday
        ? `Otwarte dziś od ${nextOpen.openFrom}`
        : `Otwarte ${formatDdMm(nextOpen.dateKey)} od ${nextOpen.openFrom}`
      : "Tymczasowo zamknięte",
  };
}

export function isPickupPointKey(point) {
  const key = String(point?.key || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");
  return key && key !== "delivery" && key !== "delivery-2";
}

export function isDeliveryWarehouseKey(point) {
  const key = String(point?.key || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");
  return key === "delivery" || key === "delivery-2";
}
