import { CRM_TIME_ZONE } from "./constants.js";

export function getWarsawParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CRM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type) =>
    Number(parts.find((part) => part.type === type)?.value || 0);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

export function getWarsawOffsetMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CRM_TIME_ZONE,
    timeZoneName: "longOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const offsetText = String(
    parts.find((part) => part.type === "timeZoneName")?.value ||
      "GMT+00:00"
  );

  const match = offsetText.match(/GMT([+-])(\d{2}):(\d{2})/);

  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;

  return (
    sign *
    (Number(match[2]) * 60 + Number(match[3]))
  );
}

export function warsawLocalToUtc({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
}) {
  const probe = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      second
    )
  );

  const offsetMinutes =
    getWarsawOffsetMinutes(probe);

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      second
    ) -
      offsetMinutes * 60 * 1000
  );
}

export function addDays(date, days) {
  return new Date(
    date.getTime() +
      Number(days) * 24 * 60 * 60 * 1000
  );
}

export function parseDateOnly(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function shiftCalendarMonth(
  parts,
  deltaMonths
) {
  const anchor = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1 + deltaMonths,
      1
    )
  );

  const year =
    anchor.getUTCFullYear();

  const month =
    anchor.getUTCMonth() + 1;

  const daysInMonth =
    new Date(
      Date.UTC(
        year,
        month,
        0
      )
    ).getUTCDate();

  return {
    year,
    month,
    day: Math.min(
      parts.day,
      daysInMonth
    ),
  };
}

// ======================================================
// PERIODS
// ======================================================

export function getPeriodRange(
  period = "month",
  fromRaw = "",
  toRaw = ""
) {
  const now = new Date();
  const nowParts = getWarsawParts(now);

  // ------------------------------
  // CUSTOM PERIOD
  // ------------------------------

  if (fromRaw || toRaw) {
    if (!fromRaw || !toRaw) {
      throw new Error("INVALID_CUSTOM_PERIOD");
    }

    const fromParts = parseDateOnly(fromRaw);
    const toParts = parseDateOnly(toRaw);

    if (!fromParts || !toParts) {
      throw new Error("INVALID_CUSTOM_PERIOD");
    }

    const from =
      warsawLocalToUtc(fromParts);

    // "to" пользователя включительно
    const toDayStart =
      warsawLocalToUtc(toParts);

    const to =
      addDays(toDayStart, 1);

    if (to <= from) {
      throw new Error("INVALID_CUSTOM_PERIOD");
    }

    const previousFromParts =
    shiftCalendarMonth(
        fromParts,
        -1
    );

    const previousToParts =
    shiftCalendarMonth(
        toParts,
        -1
    );

    const previousFrom =
    warsawLocalToUtc(
        previousFromParts
    );

    const previousToDayStart =
    warsawLocalToUtc(
        previousToParts
    );

    const previousTo =
    addDays(
        previousToDayStart,
        1
    );

    return {
    key: "custom",
    from,
    to,
    previousFrom,
    previousTo,
    };
  }

  const todayStart = warsawLocalToUtc({
    year: nowParts.year,
    month: nowParts.month,
    day: nowParts.day,
  });

  const key = String(period || "month")
    .trim()
    .toLowerCase();

  // ------------------------------
  // TODAY
  // ------------------------------

  if (key === "today") {
    const elapsedMs =
      now.getTime() -
      todayStart.getTime();

    const previousFrom =
      addDays(todayStart, -1);

    return {
      key: "today",

      from: todayStart,
      to: now,

      previousFrom,

      previousTo: new Date(
        previousFrom.getTime() +
          elapsedMs
      ),
    };
  }

  // ------------------------------
  // CURRENT CALENDAR WEEK
  // Monday -> now
  // ------------------------------

  if (key === "week") {
    const weekday =
      new Intl.DateTimeFormat(
        "en-US",
        {
          timeZone: CRM_TIME_ZONE,
          weekday: "short",
        }
      ).format(now);

    const weekdayOffset =
      {
        Mon: 0,
        Tue: 1,
        Wed: 2,
        Thu: 3,
        Fri: 4,
        Sat: 5,
        Sun: 6,
      }[weekday] ?? 0;

    const from =
      addDays(
        todayStart,
        -weekdayOffset
      );

    return {
      key: "week",

      from,
      to: now,

      previousFrom:
        addDays(from, -7),

      previousTo:
        addDays(now, -7),
    };
  }

  // ------------------------------
  // LAST 90 DAYS
  // ------------------------------

  if (key === "3m") {
    const from =
      addDays(now, -90);

    return {
      key: "3m",

      from,
      to: now,

      previousFrom:
        addDays(from, -90),

      previousTo: from,
    };
  }

  // ------------------------------
  // LAST 180 DAYS
  // ------------------------------

  if (key === "6m") {
    const from =
      addDays(now, -180);

    return {
      key: "6m",

      from,
      to: now,

      previousFrom:
        addDays(from, -180),

      previousTo: from,
    };
  }

  // ------------------------------
  // ALL TIME
  // ------------------------------

  if (key === "all") {
    return {
      key: "all",

      from:
        new Date(
          "2000-01-01T00:00:00.000Z"
        ),

      to: now,

      previousFrom: null,
      previousTo: null,
    };
  }

  // ------------------------------
  // CURRENT CALENDAR MONTH
  // 1st -> now
  // ------------------------------

  const from =
    warsawLocalToUtc({
      year: nowParts.year,
      month: nowParts.month,
      day: 1,
    });

  // предыдущий месяц
  const previousMonthAnchor =
    new Date(
      Date.UTC(
        nowParts.year,
        nowParts.month - 2,
        1
      )
    );

  const previousYear =
    previousMonthAnchor
      .getUTCFullYear();

  const previousMonth =
    previousMonthAnchor
      .getUTCMonth() + 1;

  const previousFrom =
    warsawLocalToUtc({
      year: previousYear,
      month: previousMonth,
      day: 1,
    });

  /*
   * Сравниваем одинаковую часть месяца.
   *
   * Например:
   *
   * 1 сентября -> 2 сентября 20:00
   *
   * против
   *
   * 1 августа -> 2 августа 20:00
   */

  const daysInPreviousMonth =
    new Date(
      Date.UTC(
        previousYear,
        previousMonth,
        0
      )
    ).getUTCDate();

  const comparisonDay =
    Math.min(
      nowParts.day,
      daysInPreviousMonth
    );

  const previousTo =
    warsawLocalToUtc({
      year: previousYear,
      month: previousMonth,
      day: comparisonDay,
      hour: nowParts.hour,
      minute: nowParts.minute,
      second: nowParts.second,
    });

  return {
    key: "month",

    from,
    to: now,

    previousFrom,
    previousTo,
  };
}

export function getWarsawDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CRM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}
