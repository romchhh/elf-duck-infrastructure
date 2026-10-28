import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { crmFetchJson } from "@/lib/crmFetch";
import { toast } from "@/components/ui/use-toast";
import Badge from "@/components/shared/Badge";

const STATUS_LABELS = {
  open: "Приём участников",
  drawn: "Итоги готовы",
  credited: "Призы начислены",
  notified: "Уведомления отправлены",
};

export default function Giveaway() {
  const queryClient = useQueryClient();
  const [monthKey, setMonthKey] = useState("");
  const [drawPhrase, setDrawPhrase] = useState("");
  const [creditPhrase, setCreditPhrase] = useState("");
  const [notifyPhrase, setNotifyPhrase] = useState("");

  const { data: monthsData } = useQuery({
    queryKey: ["crm-giveaway-months"],
    queryFn: () => crmFetchJson("/crm/giveaway/months"),
  });

  const months = monthsData?.months || [];
  const activeMonthKey = monthKey || months[0]?.monthKey || "";

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["crm-giveaway-current", activeMonthKey],
    queryFn: () =>
      crmFetchJson(
        `/crm/giveaway/current?monthKey=${encodeURIComponent(activeMonthKey)}`
      ),
    enabled: Boolean(activeMonthKey),
    refetchInterval: 30_000,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["crm-giveaway-current"] });
    await queryClient.invalidateQueries({ queryKey: ["crm-giveaway-months"] });
  };

  const drawMutation = useMutation({
    mutationFn: () =>
      crmFetchJson(`/crm/giveaway/${encodeURIComponent(activeMonthKey)}/draw`, {
        method: "POST",
        body: JSON.stringify({ confirmPhrase: drawPhrase }),
      }),
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
        `/crm/giveaway/${encodeURIComponent(activeMonthKey)}/credit`,
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
        `/crm/giveaway/${encodeURIComponent(activeMonthKey)}/notify`,
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

  const canDraw = status === "open" && (data?.entriesCount ?? 0) > 0;
  const canCredit =
    status === "drawn" ||
    (status === "credited" &&
      winners.some((row) => !row.creditedAt));
  const canNotify =
    (status === "credited" || status === "notified") &&
    winners.some((row) => row.creditedAt && !row.notifiedAt);

  const prizeSum = useMemo(
    () => winners.reduce((s, w) => s + Number(w.amountZl || 0), 0),
    [winners]
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-[13px] leading-relaxed text-amber-100/90">
        Розыгрыш проводится <b>вручную</b>: сначала «Провести розыгрыш», затем
        проверьте список, «Начислить призы», и только потом «Отправить
        победителям». BLIK-заказы не участвуют и не дают кэшбэк.
      </div>

      <div className="rounded-2xl surface-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-[12px] text-muted-2">Месяц</label>
          <select
            className="input-base max-w-[180px]"
            value={activeMonthKey}
            onChange={(e) => setMonthKey(e.target.value)}
          >
            {months.map((row) => (
              <option key={row.monthKey} value={row.monthKey}>
                {row.monthKey}
              </option>
            ))}
          </select>
          <Badge>{STATUS_LABELS[status] || status}</Badge>
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-[12px]"
            onClick={() => refetch()}
          >
            Обновить
          </button>
        </div>

        {isLoading ? (
          <p className="mt-4 text-[12px] text-muted-2">Загрузка…</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Metric label="Участников" value={data?.participantsCount ?? 0} />
            <Metric label="Записей (покупок)" value={data?.entriesCount ?? 0} />
            <Metric label="Сумма призов" value={`${prizeSum || 0} zł`} />
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ActionCard
          title="1. Провести розыгрыш"
          disabled={!canDraw || drawMutation.isPending}
          hint='Введите фразу «ПРОВЕСТИ РОЗЫГРЫШ»'
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
        <h3 className="text-[14px] font-semibold">Победители</h3>
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
                  <th className="py-1 pr-3">Сумма</th>
                  <th className="py-1 pr-3">Начислено</th>
                  <th className="py-1">Уведомление</th>
                </tr>
              </thead>
              <tbody>
                {winners.map((row) => (
                  <tr key={row.place} className="border-t border-border/60">
                    <td className="py-2 pr-3">{row.place}</td>
                    <td className="py-2 pr-3">
                      {row.username
                        ? `@${row.username}`
                        : row.firstName || row.telegramId}
                    </td>
                    <td className="py-2 pr-3">{row.amountZl} zł</td>
                    <td className="py-2 pr-3">
                      {row.creditedAt ? "✓" : "—"}
                    </td>
                    <td className="py-2">{row.notifiedAt ? "✓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl border border-border bg-[hsl(232_26%_7%)] p-3">
      <div className="text-[11px] text-muted-2">{label}</div>
      <div className="mt-1 text-[18px] font-semibold">{value}</div>
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
