import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, RefreshCw, Users } from "lucide-react";
import { crmFetchJson } from "@/lib/crmFetch";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

const STATUS_LABELS = {
  open: "Приём участников",
  drawn: "Итоги готовы",
  credited: "Призы начислены",
  notified: "Уведомления отправлены",
};

const STATUS_BADGE = {
  open: "border-[hsl(214_84%_60%/0.35)] bg-[hsl(214_84%_60%/0.12)] text-[hsl(214_90%_72%)]",
  drawn: "border-[hsl(36_92%_56%/0.35)] bg-[hsl(36_92%_56%/0.12)] text-[hsl(36_90%_64%)]",
  credited: "border-[hsl(142_64%_47%/0.35)] bg-[hsl(142_64%_47%/0.12)] text-[hsl(142_70%_60%)]",
  notified: "border-[hsl(255_100%_68%/0.35)] bg-[hsl(255_100%_68%/0.12)] text-[hsl(255_100%_75%)]",
};

function formatMonthLabel(monthKey) {
  const [y, m] = String(monthKey || "").split("-");
  if (!y || !m) return monthKey;
  const d = new Date(Number(y), Number(m) - 1, 1);
  if (Number.isNaN(d.getTime())) return monthKey;
  return d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatClientLabel(row) {
  if (row?.username) return `@${row.username}`;
  const name = [row?.firstName, row?.lastName].filter(Boolean).join(" ").trim();
  return name || "—";
}

function formatZl(value) {
  return `${Number(value || 0).toFixed(2)} zł`;
}

function StatusPill({ status }) {
  const key = String(status || "open");
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
        STATUS_BADGE[key] || STATUS_BADGE.open
      )}
    >
      {STATUS_LABELS[key] || key}
    </span>
  );
}

const DEFAULT_TIERS = [
  { fromPlace: 1, toPlace: 5, amountZl: 150 },
  { fromPlace: 6, toPlace: 10, amountZl: 100 },
  { fromPlace: 11, toPlace: 25, amountZl: 50 },
];

function tiersPrizeSum(winnerCount, tiers) {
  const count = Math.max(1, Number(winnerCount || 1));
  let total = 0;
  for (let place = 1; place <= count; place += 1) {
    const tier = (tiers || []).find(
      (row) =>
        place >= Number(row.fromPlace || 0) && place <= Number(row.toPlace || 0)
    );
    total += Number(tier?.amountZl || 0);
  }
  return Number(total.toFixed(2));
}

export default function Giveaway() {
  const queryClient = useQueryClient();
  const [selectedMonthKey, setSelectedMonthKey] = useState(null);
  const [participantQuery, setParticipantQuery] = useState("");
  const [drawPhrase, setDrawPhrase] = useState("");
  const [creditPhrase, setCreditPhrase] = useState("");
  const [notifyPhrase, setNotifyPhrase] = useState("");
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const {
    data: monthsData,
    isLoading: monthsLoading,
    refetch: refetchMonths,
  } = useQuery({
    queryKey: ["crm-giveaway-months"],
    queryFn: () => crmFetchJson("/crm/giveaway/months"),
  });

  const months = monthsData?.months || [];

  const {
    data,
    isLoading: detailLoading,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ["crm-giveaway-current", selectedMonthKey],
    queryFn: () =>
      crmFetchJson(
        `/crm/giveaway/current?monthKey=${encodeURIComponent(selectedMonthKey)}`
      ),
    enabled: Boolean(selectedMonthKey),
    refetchInterval: selectedMonthKey ? 30_000 : false,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["crm-giveaway-months"] });
    await queryClient.invalidateQueries({ queryKey: ["crm-giveaway-current"] });
  };

  React.useEffect(() => {
    if (!selectedMonthKey || !data?.settings) return;
    setSettingsDraft({
      winnerCount: Number(data.settings.winnerCount || 25),
      prizeTiers: (data.settings.prizeTiers || DEFAULT_TIERS).map((row) => ({
        fromPlace: Number(row.fromPlace || 1),
        toPlace: Number(row.toPlace || 1),
        amountZl: Number(row.amountZl || 0),
      })),
      rulesRu: String(data.settings.rulesRu || ""),
      rulesPl: String(data.settings.rulesPl || ""),
    });
  }, [selectedMonthKey, data?.settings, data?.month?.updatedAt]);

  const settingsMutation = useMutation({
    mutationFn: () =>
      crmFetchJson(
        `/crm/giveaway/${encodeURIComponent(selectedMonthKey)}/settings`,
        {
          method: "PATCH",
          body: JSON.stringify(settingsDraft || {}),
        }
      ),
    onSuccess: async () => {
      await invalidate();
      toast({ title: "Настройки розыгрыша сохранены" });
    },
    onError: (error) => {
      toast({
        title: "Не удалось сохранить настройки",
        description: error?.message,
        variant: "destructive",
      });
    },
  });

  const drawMutation = useMutation({
    mutationFn: () =>
      crmFetchJson(
        `/crm/giveaway/${encodeURIComponent(selectedMonthKey)}/draw`,
        {
          method: "POST",
          body: JSON.stringify({ confirmPhrase: drawPhrase }),
        }
      ),
    onSuccess: async () => {
      setDrawPhrase("");
      await invalidate();
      toast({ title: "Розыгрыш проведён" });
    },
    onError: (error) => {
      toast({
        title: "Не удалось провести розыгрыш",
        description: error?.message,
        variant: "destructive",
      });
    },
  });

  const creditMutation = useMutation({
    mutationFn: () =>
      crmFetchJson(
        `/crm/giveaway/${encodeURIComponent(selectedMonthKey)}/credit`,
        {
          method: "POST",
          body: JSON.stringify({ confirmPhrase: creditPhrase }),
        }
      ),
    onSuccess: async (payload) => {
      setCreditPhrase("");
      await invalidate();
      toast({
        title: "Начисление выполнено",
        description: `Зачислено: ${payload?.result?.credited ?? "—"}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка начисления",
        description: error?.message,
        variant: "destructive",
      });
    },
  });

  const notifyMutation = useMutation({
    mutationFn: () =>
      crmFetchJson(
        `/crm/giveaway/${encodeURIComponent(selectedMonthKey)}/notify`,
        {
          method: "POST",
          body: JSON.stringify({ confirmPhrase: notifyPhrase }),
        }
      ),
    onSuccess: async (payload) => {
      setNotifyPhrase("");
      await invalidate();
      toast({
        title: "Уведомления отправлены",
        description: `Доставлено: ${payload?.result?.sent ?? "—"}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка отправки",
        description: error?.message,
        variant: "destructive",
      });
    },
  });

  const status = String(data?.month?.status || "open");
  const winners = data?.winners || [];
  const participants = data?.participants || [];
  const settingsEditable = status === "open";
  const draftWinnerCount = Number(settingsDraft?.winnerCount || 25);
  const draftTiers = settingsDraft?.prizeTiers || DEFAULT_TIERS;
  const draftPrizePool = tiersPrizeSum(draftWinnerCount, draftTiers);

  const filteredParticipants = useMemo(() => {
    const q = participantQuery.trim().toLowerCase();
    if (!q) return participants;
    return participants.filter((row) => {
      const hay = [
        row.telegramId,
        row.username,
        row.firstName,
        row.lastName,
      ]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [participants, participantQuery]);

  const canDraw = status === "open" && (data?.entriesCount ?? 0) > 0;
  const canCredit =
    status === "drawn" ||
    (status === "credited" && winners.some((row) => !row.creditedAt));
  const canNotify =
    (status === "credited" || status === "notified") &&
    winners.some((row) => row.creditedAt && !row.notifiedAt);

  const prizeSum = useMemo(
    () => winners.reduce((s, w) => s + Number(w.amountZl || 0), 0),
    [winners]
  );
  const revenue = data?.revenue;

  if (!selectedMonthKey) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-[13px] leading-relaxed text-amber-100/90">
          Выберите месяц розыгрыша, чтобы увидеть участников, провести
          розыгрыш и начислить призы. BLIK-заказы не участвуют и не дают
          кэшбэк.
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-[15px] font-semibold text-foreground">
            Розыгрыши по месяцам
          </h2>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground"
            onClick={() => refetchMonths()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Обновить
          </button>
        </div>

        {monthsLoading ? (
          <p className="text-[12px] text-muted-2">Загрузка…</p>
        ) : !months.length ? (
          <div className="rounded-2xl surface-card p-6 text-[13px] text-muted-2">
            Пока нет месяцев розыгрыша. Они появятся после первого участника
            или открытия страницы в активном месяце.
          </div>
        ) : (
          <div className="grid gap-2">
            {months.map((row) => (
              <button
                key={row.monthKey}
                type="button"
                onClick={() => {
                  setParticipantQuery("");
                  setSettingsOpen(false);
                  setSelectedMonthKey(row.monthKey);
                }}
                className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-[hsl(232_26%_6%)] p-4 text-left transition-colors hover:border-[hsl(255_100%_68%/0.35)] hover:bg-[hsl(255_100%_68%/0.06)]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[hsl(255_100%_68%/0.12)] text-[hsl(255_100%_75%)]">
                  <Users className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold capitalize text-foreground">
                      {formatMonthLabel(row.monthKey)}
                    </span>
                    <span className="text-[11px] text-muted-2">
                      {row.monthKey}
                    </span>
                    <StatusPill status={row.status} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
                    <span>
                      Участников:{" "}
                      <b className="text-foreground">
                        {row.participantsCount ?? 0}
                      </b>
                    </span>
                    <span>
                      Покупок:{" "}
                      <b className="text-foreground">
                        {row.entriesCount ?? 0}
                      </b>
                    </span>
                    {(row.winnersCount ?? 0) > 0 ? (
                      <span>
                        Победителей:{" "}
                        <b className="text-foreground">{row.winnersCount}</b>
                      </span>
                    ) : null}
                    {(row.netEarnedZl ?? 0) > 0 ? (
                      <span>
                        Выручка:{" "}
                        <b className="text-foreground">
                          {formatZl(row.netEarnedZl)}
                        </b>
                      </span>
                    ) : null}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-2 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setSelectedMonthKey(null)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Все месяцы
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-heading text-[16px] font-semibold capitalize text-foreground">
            {formatMonthLabel(selectedMonthKey)}
          </h2>
          <p className="text-[11px] text-muted-2">{selectedMonthKey}</p>
        </div>
        <StatusPill status={status} />
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-[12px]"
          onClick={() => refetchDetail()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Обновить
        </button>
      </div>

      <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-[13px] leading-relaxed text-amber-100/90">
        Сначала «Провести розыгрыш», проверьте победителей, «Начислить призы»,
        затем «Отправить победителям».
      </div>

      {detailLoading ? (
        <p className="text-[12px] text-muted-2">Загрузка…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Участников" value={data?.participantsCount ?? 0} />
            <Metric label="Записей (покупок)" value={data?.entriesCount ?? 0} />
            <Metric
              label="Сумма призов"
              value={`${prizeSum || data?.prizePreview || draftPrizePool || 0} zł`}
            />
            <Metric
              label="Розыгрыш"
              value={formatDateTime(data?.month?.drawnAt)}
              small
            />
          </div>

          {settingsDraft ? (
            <div className="rounded-2xl surface-card p-4 space-y-4">
              <button
                type="button"
                className="flex w-full items-start justify-between gap-3 text-left"
                onClick={() => setSettingsOpen((open) => !open)}
                aria-expanded={settingsOpen}
              >
                <div>
                  <h3 className="text-[14px] font-semibold">
                    Настройки розыгрыша
                  </h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-2">
                    {settingsOpen
                      ? "Количество победителей и суммы призов по местам. Менять можно только пока месяц в статусе «Приём участников»."
                      : `Призовой фонд ${formatZl(draftPrizePool)} · победителей ${draftWinnerCount}`}
                  </p>
                </div>
                <ChevronRight
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0 text-muted-2 transition-transform",
                    settingsOpen && "rotate-90"
                  )}
                />
              </button>

              {settingsOpen ? (
              <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-[12px]">
                  <span className="mb-1 block text-muted-2">
                    Количество победителей
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    disabled={!settingsEditable || settingsMutation.isPending}
                    value={draftWinnerCount}
                    onChange={(e) =>
                      setSettingsDraft((prev) => ({
                        ...(prev || {}),
                        winnerCount: Number(e.target.value || 1),
                      }))
                    }
                    className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-[13px]"
                  />
                </label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] text-muted-2">
                    Призы по местам (диапазон → сумма zł)
                  </span>
                  {settingsEditable ? (
                    <button
                      type="button"
                      className="text-[11px] text-[hsl(255_100%_75%)] hover:underline"
                      onClick={() =>
                        setSettingsDraft((prev) => ({
                          ...(prev || {}),
                          prizeTiers: [
                            ...(prev?.prizeTiers || []),
                            {
                              fromPlace: draftWinnerCount,
                              toPlace: draftWinnerCount,
                              amountZl: 50,
                            },
                          ],
                        }))
                      }
                    >
                      + диапазон
                    </button>
                  ) : null}
                </div>

                <div className="space-y-2">
                  {draftTiers.map((tier, index) => (
                    <div
                      key={`tier-${index}`}
                      className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2"
                    >
                      <input
                        type="number"
                        min={1}
                        disabled={!settingsEditable || settingsMutation.isPending}
                        value={tier.fromPlace}
                        onChange={(e) => {
                          const value = Number(e.target.value || 1);
                          setSettingsDraft((prev) => {
                            const next = [...(prev?.prizeTiers || [])];
                            next[index] = { ...next[index], fromPlace: value };
                            return { ...(prev || {}), prizeTiers: next };
                          });
                        }}
                        className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-[12px]"
                        placeholder="с"
                      />
                      <input
                        type="number"
                        min={1}
                        disabled={!settingsEditable || settingsMutation.isPending}
                        value={tier.toPlace}
                        onChange={(e) => {
                          const value = Number(e.target.value || 1);
                          setSettingsDraft((prev) => {
                            const next = [...(prev?.prizeTiers || [])];
                            next[index] = { ...next[index], toPlace: value };
                            return { ...(prev || {}), prizeTiers: next };
                          });
                        }}
                        className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-[12px]"
                        placeholder="по"
                      />
                      <input
                        type="number"
                        min={0}
                        step="1"
                        disabled={!settingsEditable || settingsMutation.isPending}
                        value={tier.amountZl}
                        onChange={(e) => {
                          const value = Number(e.target.value || 0);
                          setSettingsDraft((prev) => {
                            const next = [...(prev?.prizeTiers || [])];
                            next[index] = { ...next[index], amountZl: value };
                            return { ...(prev || {}), prizeTiers: next };
                          });
                        }}
                        className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-[12px]"
                        placeholder="zł"
                      />
                      {settingsEditable && draftTiers.length > 1 ? (
                        <button
                          type="button"
                          className="rounded-lg border border-border px-2 text-[11px] text-muted-2 hover:text-foreground"
                          onClick={() =>
                            setSettingsDraft((prev) => ({
                              ...(prev || {}),
                              prizeTiers: (prev?.prizeTiers || []).filter(
                                (_row, i) => i !== index
                              ),
                            }))
                          }
                        >
                          ×
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <label className="block text-[12px]">
                  <span className="mb-1 block text-muted-2">
                    Правила (RU), опционально
                  </span>
                  <textarea
                    rows={4}
                    disabled={!settingsEditable || settingsMutation.isPending}
                    value={settingsDraft.rulesRu || ""}
                    onChange={(e) =>
                      setSettingsDraft((prev) => ({
                        ...(prev || {}),
                        rulesRu: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-[12px] leading-relaxed"
                    placeholder="Пусто = стандартные правила"
                  />
                </label>
                <label className="block text-[12px]">
                  <span className="mb-1 block text-muted-2">
                    Правила (PL), опционально
                  </span>
                  <textarea
                    rows={4}
                    disabled={!settingsEditable || settingsMutation.isPending}
                    value={settingsDraft.rulesPl || ""}
                    onChange={(e) =>
                      setSettingsDraft((prev) => ({
                        ...(prev || {}),
                        rulesPl: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-[12px] leading-relaxed"
                    placeholder="Puste = domyślne zasady"
                  />
                </label>
              </div>

              {settingsEditable ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={settingsMutation.isPending}
                    onClick={() => settingsMutation.mutate()}
                    className="rounded-lg bg-[hsl(255_100%_68%)] px-4 py-2 text-[12px] font-semibold text-[hsl(232_40%_10%)] disabled:opacity-50"
                  >
                    {settingsMutation.isPending ? "…" : "Сохранить настройки"}
                  </button>
                  <button
                    type="button"
                    disabled={settingsMutation.isPending}
                    onClick={() =>
                      setSettingsDraft({
                        winnerCount: 25,
                        prizeTiers: DEFAULT_TIERS.map((row) => ({ ...row })),
                        rulesRu: "",
                        rulesPl: "",
                      })
                    }
                    className="rounded-lg border border-border px-4 py-2 text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    Сбросить к 25 / 2000 zł
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-muted-2">
                  После проведения розыгрыша настройки только для просмотра.
                </p>
              )}
              </>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-2xl surface-card p-4">
            <h3 className="text-[14px] font-semibold">
              Выручка по заказам розыгрыша
            </h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-2">
              Уникальные реальные заказы из записей участников (тестовые
              записи не считаются). Нетто — сумма к оплате после промокода и
              списанного кэшбека (
              <code className="text-[10px]">cashbackRemainingToPayZl</code>
              ).
              {data?.revenueFixedAtDraw ? (
                <span className="mt-1 block text-amber-200/90">
                  Зафиксировано на момент розыгрыша.
                </span>
              ) : null}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric label="Заказов" value={revenue?.ordersCount ?? 0} />
              <Metric label="Брутто (total)" value={formatZl(revenue?.grossTotalZl)} />
              <Metric label="Промокоды" value={`− ${formatZl(revenue?.promoDiscountZl)}`} />
              <Metric
                label="Кэшбек в оплате"
                value={`− ${formatZl(revenue?.cashbackAppliedZl)}`}
              />
              <Metric
                label="Итого заработано"
                value={formatZl(revenue?.netEarnedZl)}
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ActionCard
              title="1. Провести розыгрыш"
              disabled={!canDraw || drawMutation.isPending}
              hint='Фраза «ПРОВЕСТИ РОЗЫГРЫШ»'
              phrase={drawPhrase}
              onPhraseChange={setDrawPhrase}
              onSubmit={() => {
                if (
                  !window.confirm(
                    "Провести розыгрыш сейчас? Действие необратимо для этого месяца."
                  )
                ) {
                  return;
                }
                drawMutation.mutate();
              }}
              buttonLabel={drawMutation.isPending ? "…" : "Провести"}
            />
            <ActionCard
              title="2. Начислить призы"
              disabled={!canCredit || creditMutation.isPending}
              hint='Фраза «НАЧИСЛИТЬ ПРИЗЫ»'
              phrase={creditPhrase}
              onPhraseChange={setCreditPhrase}
              onSubmit={() => {
                if (
                  !window.confirm(
                    "Начислить кэшбек всем победителям этого месяца?"
                  )
                ) {
                  return;
                }
                creditMutation.mutate();
              }}
              buttonLabel={creditMutation.isPending ? "…" : "Начислить"}
            />
            <ActionCard
              title="3. Отправить победителям"
              disabled={!canNotify || notifyMutation.isPending}
              hint='Фраза «ОТПРАВИТЬ ПОБЕДИТЕЛЯМ»'
              phrase={notifyPhrase}
              onPhraseChange={setNotifyPhrase}
              onSubmit={() => {
                if (
                  !window.confirm(
                    "Отправить персональные сообщения всем победителям в Telegram?"
                  )
                ) {
                  return;
                }
                notifyMutation.mutate();
              }}
              buttonLabel={notifyMutation.isPending ? "…" : "Отправить"}
            />
          </div>

          <div className="rounded-2xl surface-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-[14px] font-semibold">
                Участники ({participants.length})
              </h3>
              <input
                className="input-base max-w-xs text-[12px]"
                placeholder="Поиск: id, @username, имя"
                value={participantQuery}
                onChange={(e) => setParticipantQuery(e.target.value)}
              />
            </div>
            {!participants.length ? (
              <p className="mt-3 text-[12px] text-muted-2">
                Пока никто не нажал «Участвовать» в миниапп и нет тестовых
                записей.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="text-muted-2">
                      <th className="py-1 pr-3">Клиент</th>
                      <th className="py-1 pr-3">Telegram ID</th>
                      <th className="py-1 pr-3">Покупок</th>
                      <th className="py-1 pr-3">Выручка</th>
                      <th className="py-1 pr-3">Вступил</th>
                      <th className="py-1">Примечание</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredParticipants.map((row) => (
                      <tr
                        key={row.telegramId}
                        className="border-t border-border/60"
                      >
                        <td className="py-2 pr-3">
                          {row.username
                            ? `@${row.username}`
                            : [row.firstName, row.lastName]
                                .filter(Boolean)
                                .join(" ") || "—"}
                          <div className="font-mono text-[10px] text-muted-2">
                            {row.telegramId}
                          </div>
                        </td>
                        <td className="py-2 pr-3 font-mono text-[11px]">
                          {row.telegramId}
                        </td>
                        <td className="py-2 pr-3">
                          <span className="font-semibold">
                            {row.entriesCount ?? 0}
                          </span>
                          {(row.testEntriesCount ?? 0) > 0 ? (
                            <span className="ml-1 text-[10px] text-amber-200/80">
                              ({row.testEntriesCount} тест)
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 font-medium">
                          {formatZl(row.netEarnedZl)}
                          {(row.ordersCount ?? 0) > 0 ? (
                            <span className="ml-1 text-[10px] font-normal text-muted-2">
                              ({row.ordersCount} зак.)
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {formatDateTime(row.joinedAt)}
                        </td>
                        <td className="py-2 text-muted-2">
                          {row.testSeed ? "тест" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredParticipants.length === 0 ? (
                  <p className="mt-2 text-[12px] text-muted-2">
                    Ничего не найдено по запросу.
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <div className="rounded-2xl surface-card p-4">
            <h3 className="text-[14px] font-semibold">
              Победители ({winners.length})
            </h3>
            {!winners.length ? (
              <p className="mt-2 text-[12px] text-muted-2">
                Список появится после розыгрыша.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="text-muted-2">
                      <th className="py-1 pr-3">Место</th>
                      <th className="py-1 pr-3">Клиент</th>
                      <th className="py-1 pr-3">Покупок</th>
                      <th className="py-1 pr-3">Выручка</th>
                      <th className="py-1 pr-3">Участие</th>
                      <th className="py-1 pr-3">Сумма</th>
                      <th className="py-1 pr-3">Начислено</th>
                      <th className="py-1">Уведомление</th>
                    </tr>
                  </thead>
                  <tbody>
                    {winners.map((row) => (
                      <tr
                        key={row.place}
                        className="border-t border-border/60"
                      >
                        <td className="py-2 pr-3 font-semibold">{row.place}</td>
                        <td className="py-2 pr-3">
                          <div>{formatClientLabel(row)}</div>
                          <div className="font-mono text-[10px] text-muted-2">
                            {row.telegramId}
                          </div>
                        </td>
                        <td className="py-2 pr-3">
                          <span className="font-semibold">
                            {row.entriesCount ?? 0}
                          </span>
                          {(row.testEntriesCount ?? 0) > 0 ? (
                            <span className="ml-1 text-[10px] text-amber-200/80">
                              ({row.testEntriesCount} тест)
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 font-medium">
                          {formatZl(row.netEarnedZl)}
                          {(row.ordersCount ?? 0) > 0 ? (
                            <span className="ml-1 text-[10px] font-normal text-muted-2">
                              ({row.ordersCount} зак.)
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 text-[11px] text-muted-foreground">
                          {formatDateTime(row.joinedAt)}
                          {row.testSeed ? (
                            <span className="ml-1 text-amber-200/80">тест</span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3">{row.amountZl} zł</td>
                        <td className="py-2 pr-3">
                          {row.creditedAt ? "✓" : "—"}
                        </td>
                        <td className="py-2">
                          {row.notifiedAt ? "✓" : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, small }) {
  return (
    <div className="rounded-xl border border-border bg-[hsl(232_26%_7%)] p-3">
      <div className="text-[11px] text-muted-2">{label}</div>
      <div
        className={cn(
          "mt-1 font-semibold",
          small ? "text-[12px] text-muted-foreground" : "text-[18px]"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ActionCard({
  title,
  hint,
  phrase,
  onPhraseChange,
  onSubmit,
  buttonLabel,
  disabled,
}) {
  return (
    <div className="rounded-2xl surface-card p-4">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      <p className="mt-1 text-[11px] text-muted-2">{hint}</p>
      <input
        className="input-base mt-3"
        value={phrase}
        onChange={(e) => onPhraseChange(e.target.value)}
        placeholder={hint}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={onSubmit}
        className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg bg-gradient-to-r from-[hsl(255_100%_68%)] to-[hsl(280_90%_60%)] text-[12px] font-medium text-white disabled:opacity-40"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
