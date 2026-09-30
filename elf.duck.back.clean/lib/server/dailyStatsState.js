/** Лише захист від паралельних прогонів в одному процесі; dedupe — у Mongo (dailyStatsDedupe). */
export const dailyStatsState = {
  running: false,
};
