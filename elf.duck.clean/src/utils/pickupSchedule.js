/** Графік точок (Europe/Warsaw) — дзеркало бекенд getPointOpenStateNow + next open. */

/** Коротка позначка «закрито» в кнопках (en-dash, один рядок). */
export const SCHEDULE_CLOSED_MARK = "–";

export function labelWithScheduleClosed(name) {
  const base = String(name || "").trim();
  if (!base) return SCHEDULE_CLOSED_MARK;
  return `${base} ${SCHEDULE_CLOSED_MARK}`;
}

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
 * Чи можна оформити замовлення на СЬОГОДНІ (Warsaw):
 * є робочий графік і час ще не після кінця останнього інтервалу.
 * До openFrom (00:00–12:00) — так; після openTo (20:00–23:59) — ні.
 */
export function canAcceptOrdersToday(point, now = new Date()) {
  const openState = getPointOpenStateNow(point, now);
  if (openState.reason === "OPEN") {
    return {
      ok: true,
      reason: "OPEN",
      openState,
      openFrom: openState.openFrom,
      openTo: openState.openTo,
    };
  }

  if (
    openState.reason === "NO_SCHEDULE" ||
    openState.reason === "CLOSED_TODAY" ||
    openState.reason === "NO_HOURS"
  ) {
    return { ok: false, reason: openState.reason, openState };
  }

  // OUTSIDE_HOURS: до відкриття — можна; після закриття — ні
  const nowMinutes = getWarsawNowMinutes(now);
  const periods = openState.periods || [];
  if (!periods.length) {
    return { ok: false, reason: "NO_HOURS", openState };
  }

  const firstFrom = timeToMinutes(periods[0].openFrom);
  const lastTo = timeToMinutes(periods[periods.length - 1].openTo);

  if (nowMinutes < firstFrom) {
    return {
      ok: true,
      reason: "BEFORE_OPEN",
      openState,
      openFrom: periods[0].openFrom,
      openTo: periods[periods.length - 1].openTo,
    };
  }

  if (nowMinutes > lastTo) {
    return {
      ok: false,
      reason: "AFTER_CLOSE",
      openState,
      openFrom: periods[0].openFrom,
      openTo: periods[periods.length - 1].openTo,
    };
  }

  // між інтервалами в той самий день — ще можна (час прибуття в межах періодів)
  return {
    ok: true,
    reason: "BETWEEN_PERIODS",
    openState,
    openFrom: periods[0].openFrom,
    openTo: periods[periods.length - 1].openTo,
  };
}

/** Наступне відкриття лише в інший календарний день (для підпису після 20:00). */
export function getNextDayOpenInfo(point, now = new Date()) {
  const todayKey = getWarsawDateKey(now);

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

/**
 * Наступне відкриття: сьогоднішній наступний інтервал, інакше найближчий день.
 * @deprecated для UI після закриття краще getNextDayOpenInfo
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

  return getNextDayOpenInfo(point, now);
}

/** @param {(ru: string, pl: string) => string} t */
export function formatNextOpenLabel(nextOpen, t) {
  if (!nextOpen?.openFrom) {
    return "";
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

/**
 * UI: selectable = можна замовити на сьогодні (вкл. до відкриття зміни).
 * Після закриття — сіра; підпис лише якщо є графік на наступний день.
 */
export function getPointScheduleUiState(point, now = new Date()) {
  const accept = canAcceptOrdersToday(point, now);
  const openState = accept.openState || getPointOpenStateNow(point, now);

  if (accept.ok) {
    return {
      openNow: openState.reason === "OPEN",
      selectable: true,
      openState,
      accept,
      nextOpen: null,
      closedLabelRu: "",
      closedLabelPl: "",
    };
  }

  const nextOpen = getNextDayOpenInfo(point, now);
  return {
    openNow: false,
    selectable: false,
    openState,
    accept,
    nextOpen,
    closedLabelRu: nextOpen
      ? `Откроется ${formatDdMm(nextOpen.dateKey)} в ${nextOpen.openFrom}`
      : "",
    closedLabelPl: nextOpen
      ? `Otwarte ${formatDdMm(nextOpen.dateKey)} od ${nextOpen.openFrom}`
      : "",
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
