import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crmFetch, CRM_API_URL } from '@/lib/crmFetch';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

export default function Stock() {
  const queryClient = useQueryClient();
  const [pickupPointId, setPickupPointId] = useState('');
  const [draftQty, setDraftQty] = useState({});

  const { data: meta } = useQuery({
    queryKey: ['crm-inventory-meta'],
    enabled: Boolean(CRM_API_URL),
    queryFn: async () => {
      const res = await crmFetch('/crm/inventory/pickup-points');
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || 'INVENTORY_META_FAILED');
      }
      return json;
    },
  });

  const pickupPoints = Array.isArray(meta?.pickupPoints)
    ? meta.pickupPoints
    : [];

  useEffect(() => {
    if (!pickupPointId && pickupPoints[0]?.id) {
      setPickupPointId(pickupPoints[0].id);
    }
  }, [pickupPointId, pickupPoints]);

  const {
    data: stockData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['crm-inventory-stock', pickupPointId],
    enabled: Boolean(CRM_API_URL && pickupPointId),
    queryFn: async () => {
      const res = await crmFetch(
        `/crm/inventory/stock?pickupPointId=${encodeURIComponent(pickupPointId)}`
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || 'INVENTORY_STOCK_FAILED');
      }
      return json;
    },
  });

  useEffect(() => {
    const next = {};
    for (const product of stockData?.products || []) {
      for (const flavor of product.flavors || []) {
        const key = `${product.productId}:${flavor.flavorId}`;
        next[key] = String(flavor.totalQty ?? 0);
      }
    }
    setDraftQty(next);
  }, [stockData]);

  const products = Array.isArray(stockData?.products)
    ? stockData.products
    : [];

  const dirtyUpdates = useMemo(() => {
    const updates = [];
    for (const product of products) {
      for (const flavor of product.flavors || []) {
        const key = `${product.productId}:${flavor.flavorId}`;
        const draft = Number(draftQty[key]);
        const original = Number(flavor.totalQty || 0);
        if (!Number.isFinite(draft) || draft < 0) {
          continue;
        }
        if (draft !== original) {
          updates.push({
            productId: product.productId,
            flavorId: flavor.flavorId,
            totalQty: draft,
          });
        }
      }
    }
    return updates;
  }, [products, draftQty]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await crmFetch('/crm/inventory/stock', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupPointId,
          updates: dirtyUpdates,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || 'INVENTORY_UPDATE_FAILED');
      }
      return json;
    },
    onSuccess: (result) => {
      toast({
        title: 'Остатки сохранены',
        description: `Обновлено позиций: ${result?.applied ?? 0}`,
      });
      queryClient.invalidateQueries({
        queryKey: ['crm-inventory-stock', pickupPointId],
      });
    },
    onError: (e) => {
      toast({
        variant: 'destructive',
        title: 'Не удалось сохранить',
        description: e?.message || 'INVENTORY_UPDATE_FAILED',
      });
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold text-foreground">
          Остатки на складе
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Точка → товар → количество по вкусам (как быстрый режим в админ-боте).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[12px] text-muted-foreground">Склад</label>
        <select
          className="input-base min-w-[200px]"
          value={pickupPointId}
          onChange={(e) => setPickupPointId(e.target.value)}
        >
          {pickupPoints.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>

        <Button
          type="button"
          disabled={
            !dirtyUpdates.length || saveMutation.isPending
          }
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending
            ? 'Сохраняем…'
            : `Сохранить (${dirtyUpdates.length})`}
        </Button>
      </div>

      {isLoading && (
        <div className="text-[13px] text-muted-foreground">
          Загружаем остатки…
        </div>
      )}

      {isError && (
        <div className="text-[13px] text-red-400">
          {error?.message || 'INVENTORY_STOCK_FAILED'}
        </div>
      )}

      {!isLoading && !isError && (
        <div className="space-y-4">
          {products.map((product) => (
            <div
              key={product.productId}
              className="rounded-2xl border border-border-soft bg-[hsl(232_26%_6%)] p-4"
            >
              <div className="mb-3 text-[14px] font-medium text-foreground">
                {product.title || product.productKey}
              </div>
              <div className="space-y-2">
                {(product.flavors || []).map((flavor) => {
                  const key = `${product.productId}:${flavor.flavorId}`;
                  return (
                    <div
                      key={flavor.flavorId}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="text-[13px] text-muted-foreground">
                        {flavor.label}
                        {flavor.reservedQty > 0 && (
                          <span className="ml-2 text-[11px] text-muted-2">
                            (резерв {flavor.reservedQty})
                          </span>
                        )}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className={cn(
                          'input-base w-24 text-right tabular-nums',
                          Number(draftQty[key]) !==
                            Number(flavor.totalQty || 0) &&
                            'ring-1 ring-[hsl(255_100%_68%/0.35)]'
                        )}
                        value={draftQty[key] ?? ''}
                        onChange={(e) =>
                          setDraftQty((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {products.length === 0 && (
            <div className="text-[13px] text-muted-foreground">
              Нет активных товаров с вкусами.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
