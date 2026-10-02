import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { CRM_API_URL } from '@/lib/crmFetch';
import {
  CATEGORY_VARIANTS,
  PRODUCT_BADGE_PRESETS,
  PRODUCT_LAYOUTS,
  defaultCategoryForm,
  defaultProductForm,
} from '@/lib/catalogPresets';
import {
  deleteCategory,
  deleteFlavor,
  deleteProduct,
  listCategories,
  listProducts,
  saveCategory,
  saveProduct,
  uploadCatalogImage,
  upsertFlavor,
} from '@/lib/catalogApi';
import { Chip, Field, Section } from '@/pages/push/pushFormUi';
import {
  CategoryGridCard,
  CategoryPreviewPanel,
  ProductGridCard,
  ProductPreviewPanel,
} from '@/pages/catalog/CatalogVisual';
import {
  FlavorGradientPickers,
  RgbTripletField,
} from '@/pages/catalog/CatalogColorFields';

function ImageUrlField({ label, value, onChange, compact }) {
  const [uploading, setUploading] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadCatalogImage(file);
      onChange(url);
      toast({ title: 'Загружено' });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Ошибка загрузки',
        description: String(err?.message || err),
      });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <Field label={label}>
      <div
        className={cn(
          'relative overflow-hidden rounded-xl border border-dashed border-border bg-[hsl(232_22%_8%)]',
          compact ? 'p-2' : 'p-3'
        )}
      >
        {value ? (
          <img
            src={value}
            alt=""
            className={cn(
              'w-full rounded-lg object-contain bg-black/30',
              compact ? 'max-h-28' : 'max-h-36'
            )}
          />
        ) : (
          <div className={cn('flex items-center justify-center text-[12px] text-muted-2', compact ? 'h-20' : 'h-28')}>
            Нет изображения
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Input
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="URL"
            className="h-8 flex-1 font-mono text-[11px]"
          />
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] hover:bg-muted/30">
            <Upload className="h-3.5 w-3.5" />
            {uploading ? '…' : 'Файл'}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} />
          </label>
        </div>
      </div>
    </Field>
  );
}

function CategoryEditorDialog({ open, onOpenChange, initial, onSaved }) {
  const [form, setForm] = useState(defaultCategoryForm());

  React.useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        title: initial.title || '',
        key: initial.key || '',
        badgeText: initial.badgeText || '',
        badgeSide: initial.badgeSide === 'right' ? 'right' : 'left',
        showOverlay: !!initial.showOverlay,
        classCardDuck: initial.classCardDuck || 'cardImageLeft',
        titleClass: initial.titleClass || 'cardTitle',
        cardBgUrl: initial.cardBgUrl || '',
        cardDuckUrl: initial.cardDuckUrl || '',
        sortOrder: Number(initial.sortOrder || 0),
        isActive: initial.isActive !== false,
      });
    } else {
      setForm(defaultCategoryForm());
    }
  }, [open, initial]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const saveMut = useMutation({
    mutationFn: () => saveCategory(initial?._id, form),
    onSuccess: () => {
      toast({ title: initial ? 'Категория сохранена' : 'Категория создана' });
      onSaved();
      onOpenChange(false);
    },
    onError: (e) =>
      toast({ variant: 'destructive', title: 'Ошибка', description: String(e.message) }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Категория' : 'Новая категория'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 py-2 lg:grid-cols-2">
          <CategoryPreviewPanel form={form} />

          <div className="space-y-4">
            <Field label="Название">
              <Input value={form.title} onChange={(e) => set({ title: e.target.value })} />
            </Field>
            {!initial && (
              <Field label="Key (опционально)">
                <Input value={form.key} onChange={(e) => set({ key: e.target.value })} />
              </Field>
            )}

            <Section label="Макет">
              <div className="flex flex-wrap gap-2">
                {CATEGORY_VARIANTS.map((v) => (
                  <Chip
                    key={v.id}
                    active={
                      form.classCardDuck === v.value.classCardDuck &&
                      form.titleClass === v.value.titleClass
                    }
                    onClick={() => set(v.value)}
                  >
                    {v.label}
                  </Chip>
                ))}
              </div>
            </Section>

            <div className="grid gap-3 sm:grid-cols-2">
              <ImageUrlField label="Фон" value={form.cardBgUrl} onChange={(v) => set({ cardBgUrl: v })} compact />
              <ImageUrlField label="Утка" value={form.cardDuckUrl} onChange={(v) => set({ cardDuckUrl: v })} compact />
            </div>

            <Field label="Плашка">
              <Input value={form.badgeText} onChange={(e) => set({ badgeText: e.target.value })} />
            </Field>
            <div className="flex gap-2">
              <Chip active={form.badgeSide === 'left'} onClick={() => set({ badgeSide: 'left' })}>Слева</Chip>
              <Chip active={form.badgeSide === 'right'} onClick={() => set({ badgeSide: 'right' })}>Справа</Chip>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span className="text-[13px]">Overlay</span>
              <Switch checked={form.showOverlay} onCheckedChange={(v) => set({ showOverlay: v })} />
            </div>
            <Field label="Порядок">
              <Input type="number" value={form.sortOrder} onChange={(e) => set({ sortOrder: Number(e.target.value) })} />
            </Field>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span className="text-[13px]">В магазине</span>
              <Switch checked={form.isActive} onCheckedChange={(v) => set({ isActive: v })} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.title.trim()}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductEditorDialog({ open, onOpenChange, initial, categories, onSaved }) {
  const [form, setForm] = useState(defaultProductForm());
  const [flavors, setFlavors] = useState([]);
  const [newFlavor, setNewFlavor] = useState({ label: '', gradient0: '#1a1a2e', gradient1: '#4a4a6a' });

  React.useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        categoryKey: initial.categoryKey || '',
        productKey: initial.productKey || '',
        title1: initial.title1 || '',
        title2: initial.title2 || '',
        titleModal: initial.titleModal || '',
        price: Number(initial.price || 0),
        cardBgUrl: initial.cardBgUrl || '',
        cardDuckUrl: initial.cardDuckUrl || '',
        orderImgUrl: initial.orderImgUrl || '',
        classCardDuck: initial.classCardDuck || '',
        classActions: initial.classActions || '',
        classNewBadge: initial.classNewBadge || '',
        newBadge: initial.newBadge || '',
        accentColor: initial.accentColor || '',
        sortOrder: Number(initial.sortOrder || 0),
        isActive: initial.isActive !== false,
      });
      setFlavors(Array.isArray(initial.flavors) ? initial.flavors : []);
    } else {
      setForm({ ...defaultProductForm(), categoryKey: categories[0]?.key || '' });
      setFlavors([]);
    }
  }, [open, initial, categories]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const saveMut = useMutation({
    mutationFn: () => saveProduct(initial?._id, form),
    onSuccess: () => {
      toast({ title: 'Товар сохранён' });
      onSaved();
      onOpenChange(false);
    },
    onError: (e) =>
      toast({ variant: 'destructive', title: 'Ошибка', description: String(e.message) }),
  });

  const flavorMut = useMutation({
    mutationFn: () =>
      upsertFlavor(initial._id, {
        label: newFlavor.label.trim(),
        gradient: [newFlavor.gradient0, newFlavor.gradient1],
        isActive: true,
      }),
    onSuccess: (product) => {
      setFlavors(product.flavors || []);
      setNewFlavor({ label: '', gradient0: '#1a1a2e', gradient1: '#4a4a6a' });
      onSaved();
    },
  });

  const removeFlavorMut = useMutation({
    mutationFn: (flavorId) => deleteFlavor(initial._id, flavorId),
    onSuccess: (product) => {
      setFlavors(product.flavors || []);
      onSaved();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Товар' : 'Новый товар'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 py-2 lg:grid-cols-[minmax(0,280px)_1fr]">
          <div className="space-y-3">
            <ProductPreviewPanel form={form} />
            {form.orderImgUrl ? (
              <div className="rounded-xl border border-border p-2">
                <div className="mb-1 text-[10px] uppercase text-muted-2">Оформление заказа</div>
                <img src={form.orderImgUrl} alt="" className="max-h-24 w-full rounded object-contain" />
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <Field label="Категория">
              <select
                className="input-base w-full"
                value={form.categoryKey}
                onChange={(e) => set({ categoryKey: e.target.value })}
              >
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c._id} value={c.key}>{c.title}</option>
                ))}
              </select>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Название 1">
                <Input value={form.title1} onChange={(e) => set({ title1: e.target.value })} />
              </Field>
              <Field label="Название 2">
                <Input value={form.title2} onChange={(e) => set({ title2: e.target.value })} />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Цена, zł">
                <Input type="number" value={form.price} onChange={(e) => set({ price: Number(e.target.value) })} />
              </Field>
              <Field label="Порядок">
                <Input type="number" value={form.sortOrder} onChange={(e) => set({ sortOrder: Number(e.target.value) })} />
              </Field>
            </div>

            <Section label="Расположение">
              <div className="flex flex-wrap gap-2">
                {PRODUCT_LAYOUTS.map((l) => (
                  <Chip
                    key={l.id}
                    active={form.classCardDuck === l.value.classCardDuck}
                    onClick={() => set(l.value)}
                  >
                    {l.id === 1 ? 'Утка справа' : 'Утка слева'}
                  </Chip>
                ))}
              </div>
            </Section>

            <div className="grid gap-3 sm:grid-cols-2">
              <ImageUrlField label="Фон" value={form.cardBgUrl} onChange={(v) => set({ cardBgUrl: v })} compact />
              <ImageUrlField label="Утка" value={form.cardDuckUrl} onChange={(v) => set({ cardDuckUrl: v })} compact />
            </div>
            <ImageUrlField label="Картинка заказа" value={form.orderImgUrl} onChange={(v) => set({ orderImgUrl: v })} compact />

            <Section label="Бейдж">
              <div className="flex flex-wrap gap-2">
                {PRODUCT_BADGE_PRESETS.map((p) => (
                  <Chip
                    key={p.label}
                    active={form.newBadge === p.newBadge}
                    onClick={() => set({ newBadge: p.newBadge, classNewBadge: p.classNewBadge })}
                  >
                    {p.label}
                  </Chip>
                ))}
              </div>
            </Section>

            <RgbTripletField
              label="Accent RGB (акцент страницы)"
              value={form.accentColor}
              onChange={(v) => set({ accentColor: v })}
            />

            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span className="text-[13px]">В магазине</span>
              <Switch checked={form.isActive} onCheckedChange={(v) => set({ isActive: v })} />
            </div>

            {initial ? (
              <Section label="Вкусы">
                <div className="flex flex-wrap gap-2">
                  {flavors.map((f) => (
                    <span
                      key={f._id}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[12px]"
                      style={{
                        background: `linear-gradient(135deg, ${f.gradient?.[0] || '#333'}, ${f.gradient?.[1] || '#666'})`,
                      }}
                    >
                      <span className="rounded-full bg-black/40 px-1.5 py-0.5 text-white">{f.label}</span>
                      <button
                        type="button"
                        className="text-white/80 hover:text-white"
                        onClick={() => removeFlavorMut.mutate(f._id)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="mt-2 space-y-3">
                  <Field label="Название вкуса">
                    <Input
                      placeholder="Например, Mango Ice"
                      value={newFlavor.label}
                      onChange={(e) => setNewFlavor((x) => ({ ...x, label: e.target.value }))}
                    />
                  </Field>
                  <FlavorGradientPickers
                    gradient0={newFlavor.gradient0}
                    gradient1={newFlavor.gradient1}
                    onChange0={(v) => setNewFlavor((x) => ({ ...x, gradient0: v }))}
                    onChange1={(v) => setNewFlavor((x) => ({ ...x, gradient1: v }))}
                  />
                </div>
                <Button type="button" size="sm" variant="secondary" className="mt-2" disabled={!newFlavor.label.trim()} onClick={() => flavorMut.mutate()}>
                  + Вкус
                </Button>
              </Section>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.categoryKey || !form.title1.trim()}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Catalog() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('products');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [catDialog, setCatDialog] = useState({ open: false, item: null });
  const [prodDialog, setProdDialog] = useState({ open: false, item: null });
  const [toggleId, setToggleId] = useState('');

  const enabled = Boolean(CRM_API_URL);

  const { data: categories = [], isLoading: catLoading } = useQuery({
    queryKey: ['crm-catalog-categories'],
    enabled,
    queryFn: () => listCategories({ activeOnly: false }),
  });

  const { data: products = [], isLoading: prodLoading } = useQuery({
    queryKey: ['crm-catalog-products', categoryFilter],
    enabled,
    queryFn: () => listProducts({ activeOnly: false, categoryKey: categoryFilter }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['crm-catalog-categories'] });
    qc.invalidateQueries({ queryKey: ['crm-catalog-products'] });
  };

  const catTitleByKey = useMemo(() => {
    const m = new Map();
    for (const c of categories) m.set(c.key, c.title);
    return m;
  }, [categories]);

  const q = search.trim().toLowerCase();

  const filteredCategories = useMemo(() => {
    if (!q) return categories;
    return categories.filter(
      (c) =>
        String(c.title || '').toLowerCase().includes(q) ||
        String(c.key || '').toLowerCase().includes(q)
    );
  }, [categories, q]);

  const filteredProducts = useMemo(() => {
    if (!q) return products;
    return products.filter((p) => {
      const title = [p.title1, p.title2, p.productKey].join(' ').toLowerCase();
      return title.includes(q);
    });
  }, [products, q]);

  const delCat = useMutation({
    mutationFn: deleteCategory,
    onSuccess: refresh,
    onError: (e) =>
      toast({
        variant: 'destructive',
        title: 'Не удалось удалить',
        description: e.message === 'CATEGORY_HAS_PRODUCTS'
          ? 'Сначала уберите товары из категории'
          : String(e.message),
      }),
  });

  const delProd = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      refresh();
      toast({ title: 'Удалено' });
    },
  });

  const toggleCat = useMutation({
    mutationFn: (c) => saveCategory(c._id, { isActive: !c.isActive }),
    onMutate: (c) => setToggleId(c._id),
    onSettled: () => setToggleId(''),
    onSuccess: refresh,
  });

  const toggleProd = useMutation({
    mutationFn: (p) => saveProduct(p._id, { isActive: !p.isActive }),
    onMutate: (p) => setToggleId(p._id),
    onSettled: () => setToggleId(''),
    onSuccess: refresh,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold text-foreground">Каталог магазина</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Карточки как в mini app: фон, утка, плашки, цены. Клик по карточке — редактирование.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Chip active={tab === 'products'} onClick={() => setTab('products')}>Товары</Chip>
          <Chip active={tab === 'categories'} onClick={() => setTab('categories')}>Категории</Chip>
        </div>

        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск…"
            className="pl-9"
          />
        </div>

        {tab === 'products' ? (
          <select
            className="input-base min-w-[160px]"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">Все категории</option>
            {categories.map((c) => (
              <option key={c._id} value={c.key}>{c.title}</option>
            ))}
          </select>
        ) : null}

        <Button
          size="sm"
          onClick={() =>
            tab === 'categories'
              ? setCatDialog({ open: true, item: null })
              : setProdDialog({ open: true, item: null })
          }
        >
          <Plus className="mr-1 h-4 w-4" />
          {tab === 'categories' ? 'Категория' : 'Товар'}
        </Button>
      </div>

      {tab === 'categories' ? (
        catLoading ? (
          <p className="text-[13px] text-muted-2">Загрузка…</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredCategories.map((c) => (
              <CategoryGridCard
                key={c._id}
                category={c}
                toggling={toggleId === c._id}
                onEdit={(item) => setCatDialog({ open: true, item })}
                onDelete={(item) => {
                  if (window.confirm(`Удалить «${item.title}»?`)) delCat.mutate(item._id);
                }}
                onToggleActive={(item) => toggleCat.mutate(item)}
              />
            ))}
          </div>
        )
      ) : prodLoading ? (
        <p className="text-[13px] text-muted-2">Загрузка…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProducts.map((p) => (
            <ProductGridCard
              key={p._id}
              product={p}
              categoryTitle={catTitleByKey.get(p.categoryKey)}
              toggling={toggleId === p._id}
              onEdit={(item) => setProdDialog({ open: true, item })}
              onDelete={(item) => {
                if (window.confirm('Удалить товар?')) delProd.mutate(item._id);
              }}
              onToggleActive={(item) => toggleProd.mutate(item)}
            />
          ))}
        </div>
      )}

      {!catLoading && tab === 'categories' && filteredCategories.length === 0 && (
        <p className="text-center text-[13px] text-muted-2">Ничего не найдено</p>
      )}
      {!prodLoading && tab === 'products' && filteredProducts.length === 0 && (
        <p className="text-center text-[13px] text-muted-2">Ничего не найдено</p>
      )}

      <CategoryEditorDialog
        open={catDialog.open}
        onOpenChange={(o) => setCatDialog((s) => ({ ...s, open: o }))}
        initial={catDialog.item}
        onSaved={refresh}
      />
      <ProductEditorDialog
        open={prodDialog.open}
        onOpenChange={(o) => setProdDialog((s) => ({ ...s, open: o }))}
        initial={prodDialog.item}
        categories={categories}
        onSaved={refresh}
      />
    </div>
  );
}
