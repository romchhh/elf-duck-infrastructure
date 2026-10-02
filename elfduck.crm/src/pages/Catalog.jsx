import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, Upload } from 'lucide-react';
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

function ImageUrlField({ label, value, onChange }) {
  const [uploading, setUploading] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadCatalogImage(file);
      onChange(url);
      toast({ title: 'Изображение загружено' });
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…"
          className="font-mono text-[12px]"
        />
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] hover:bg-muted/40">
          <Upload className="h-3.5 w-3.5" />
          {uploading ? '…' : 'PNG'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} />
        </label>
      </div>
      {value ? (
        <img src={value} alt="" className="mt-2 h-20 w-auto max-w-full rounded-lg border border-border object-contain bg-black/20" />
      ) : null}
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
      toast({ title: initial ? 'Категория обновлена' : 'Категория создана' });
      onSaved();
      onOpenChange(false);
    },
    onError: (e) =>
      toast({ variant: 'destructive', title: 'Ошибка', description: String(e.message) }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Редактировать категорию' : 'Новая категория'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Название">
            <Input value={form.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Key (пусто = автогенерация)">
            <Input value={form.key} onChange={(e) => set({ key: e.target.value })} disabled={!!initial} />
          </Field>

          <Section label="Макет карточки">
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

          <ImageUrlField label="Фон (cardBgUrl)" value={form.cardBgUrl} onChange={(v) => set({ cardBgUrl: v })} />
          <ImageUrlField label="Утка (cardDuckUrl)" value={form.cardDuckUrl} onChange={(v) => set({ cardDuckUrl: v })} />

          <Field label="Плашка (текст)">
            <Input value={form.badgeText} onChange={(e) => set({ badgeText: e.target.value })} />
          </Field>
          <Section label="Сторона плашки">
            <div className="flex gap-2">
              <Chip active={form.badgeSide === 'left'} onClick={() => set({ badgeSide: 'left' })}>Слева</Chip>
              <Chip active={form.badgeSide === 'right'} onClick={() => set({ badgeSide: 'right' })}>Справа</Chip>
            </div>
          </Section>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <span className="text-[13px]">Затемнение (overlay)</span>
            <Switch checked={form.showOverlay} onCheckedChange={(v) => set({ showOverlay: v })} />
          </div>

          <Field label="sortOrder">
            <Input type="number" value={form.sortOrder} onChange={(e) => set({ sortOrder: Number(e.target.value) })} />
          </Field>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <span className="text-[13px]">Активна в магазине</span>
            <Switch checked={form.isActive} onCheckedChange={(v) => set({ isActive: v })} />
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
  const [newFlavor, setNewFlavor] = useState({ label: '', gradient0: '#111111', gradient1: '#333333' });

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
    mutationFn: async () => {
      const saved = await saveProduct(initial?._id, form);
      return saved;
    },
    onSuccess: () => {
      toast({ title: initial ? 'Товар обновлён' : 'Товар создан' });
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
      setNewFlavor({ label: '', gradient0: '#111111', gradient1: '#333333' });
      toast({ title: 'Вкус сохранён' });
      onSaved();
    },
    onError: (e) =>
      toast({ variant: 'destructive', title: 'Вкус', description: String(e.message) }),
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Редактировать товар' : 'Новый товар'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Категория">
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px]"
              value={form.categoryKey}
              onChange={(e) => set({ categoryKey: e.target.value })}
            >
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c._id} value={c.key}>{c.title} ({c.key})</option>
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
            <Field label="Цена (PLN)">
              <Input type="number" value={form.price} onChange={(e) => set({ price: Number(e.target.value) })} />
            </Field>
            <Field label="productKey">
              <Input value={form.productKey} onChange={(e) => set({ productKey: e.target.value })} disabled={!!initial} />
            </Field>
          </div>

          <Section label="Расположение утки и кнопок">
            <div className="flex flex-wrap gap-2">
              {PRODUCT_LAYOUTS.map((l) => (
                <Chip
                  key={l.id}
                  active={form.classCardDuck === l.value.classCardDuck}
                  onClick={() => set(l.value)}
                >
                  {l.label}
                </Chip>
              ))}
            </div>
          </Section>

          <ImageUrlField label="Фон карточки" value={form.cardBgUrl} onChange={(v) => set({ cardBgUrl: v })} />
          <ImageUrlField label="Утка на карточке" value={form.cardDuckUrl} onChange={(v) => set({ cardDuckUrl: v })} />
          <ImageUrlField label="Картинка в оформлении заказа" value={form.orderImgUrl} onChange={(v) => set({ orderImgUrl: v })} />

          <Section label="Бейдж на карточке">
            <div className="flex flex-wrap gap-2">
              {PRODUCT_BADGE_PRESETS.map((p) => (
                <Chip
                  key={p.label}
                  active={form.newBadge === p.newBadge && form.classNewBadge === p.classNewBadge}
                  onClick={() => set({ newBadge: p.newBadge, classNewBadge: p.classNewBadge })}
                >
                  {p.label}
                </Chip>
              ))}
            </div>
            <Input
              className="mt-2"
              placeholder="Свой текст бейджа"
              value={form.newBadge}
              onChange={(e) => set({ newBadge: e.target.value })}
            />
          </Section>

          <Field label="Название в модалке заказа">
            <Input value={form.titleModal} onChange={(e) => set({ titleModal: e.target.value })} />
          </Field>
          <Field label="Accent RGB (напр. 32, 130, 231)">
            <Input value={form.accentColor} onChange={(e) => set({ accentColor: e.target.value })} />
          </Field>

          <Field label="sortOrder">
            <Input type="number" value={form.sortOrder} onChange={(e) => set({ sortOrder: Number(e.target.value) })} />
          </Field>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <span className="text-[13px]">Активен в магазине</span>
            <Switch checked={form.isActive} onCheckedChange={(v) => set({ isActive: v })} />
          </div>

          {initial ? (
            <Section label="Вкусы (для остатков и заказов)">
              <ul className="space-y-2 text-[13px]">
                {flavors.map((f) => (
                  <li key={f._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                    <span>{f.label}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removeFlavorMut.mutate(f._id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Input
                  placeholder="Название вкуса"
                  value={newFlavor.label}
                  onChange={(e) => setNewFlavor((x) => ({ ...x, label: e.target.value }))}
                />
                <Input
                  value={newFlavor.gradient0}
                  onChange={(e) => setNewFlavor((x) => ({ ...x, gradient0: e.target.value }))}
                />
                <Input
                  value={newFlavor.gradient1}
                  onChange={(e) => setNewFlavor((x) => ({ ...x, gradient1: e.target.value }))}
                />
              </div>
              <Button
                type="button"
                className="mt-2"
                variant="secondary"
                size="sm"
                disabled={!newFlavor.label.trim() || flavorMut.isPending}
                onClick={() => flavorMut.mutate()}
              >
                Добавить вкус
              </Button>
            </Section>
          ) : (
            <p className="text-[12px] text-muted-2">Вкусы можно добавить после создания товара.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || !form.categoryKey || !form.title1.trim()}
          >
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Catalog() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('categories');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [catDialog, setCatDialog] = useState({ open: false, item: null });
  const [prodDialog, setProdDialog] = useState({ open: false, item: null });

  const enabled = Boolean(CRM_API_URL);

  const { data: categories = [], isLoading: catLoading } = useQuery({
    queryKey: ['crm-catalog-categories'],
    enabled,
    queryFn: () => listCategories({ activeOnly: false }),
  });

  const { data: products = [], isLoading: prodLoading } = useQuery({
    queryKey: ['crm-catalog-products', categoryFilter],
    enabled,
    queryFn: () =>
      listProducts({ activeOnly: false, categoryKey: categoryFilter }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['crm-catalog-categories'] });
    qc.invalidateQueries({ queryKey: ['crm-catalog-products'] });
  };

  const delCat = useMutation({
    mutationFn: deleteCategory,
    onSuccess: refresh,
    onError: (e) =>
      toast({
        variant: 'destructive',
        title: 'Не удалось удалить',
        description: e.message === 'CATEGORY_HAS_PRODUCTS'
          ? 'Сначала перенесите или удалите товары в категории'
          : String(e.message),
      }),
  });

  const delProd = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      refresh();
      toast({ title: 'Товар удалён' });
    },
    onError: (e) =>
      toast({ variant: 'destructive', title: 'Ошибка', description: String(e.message) }),
  });

  const catTitleByKey = useMemo(() => {
    const m = new Map();
    for (const c of categories) m.set(c.key, c.title);
    return m;
  }, [categories]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={tab === 'categories'} onClick={() => setTab('categories')}>Категории</Chip>
        <Chip active={tab === 'products'} onClick={() => setTab('products')}>Товары</Chip>
      </div>

      {tab === 'categories' ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setCatDialog({ open: true, item: null })}>
              <Plus className="mr-1 h-4 w-4" /> Категория
            </Button>
          </div>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-muted/30 text-[11px] uppercase text-muted-2">
                <tr>
                  <th className="px-3 py-2">Название</th>
                  <th className="px-3 py-2">Key</th>
                  <th className="px-3 py-2">Плашка</th>
                  <th className="px-3 py-2">Порядок</th>
                  <th className="px-3 py-2">Статус</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {catLoading ? (
                  <tr><td className="px-3 py-4 text-muted-2" colSpan={6}>Загрузка…</td></tr>
                ) : (
                  categories.map((c) => (
                    <tr key={c._id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{c.title}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-muted-2">{c.key}</td>
                      <td className="px-3 py-2">{c.badgeText || '—'}</td>
                      <td className="px-3 py-2">{c.sortOrder}</td>
                      <td className="px-3 py-2">{c.isActive ? 'Вкл' : 'Выкл'}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="icon" variant="ghost" onClick={() => setCatDialog({ open: true, item: c })}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (window.confirm(`Удалить категорию «${c.title}»?`)) delCat.mutate(c._id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <select
              className="rounded-lg border border-border bg-background px-3 py-2 text-[13px]"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">Все категории</option>
              {categories.map((c) => (
                <option key={c._id} value={c.key}>{c.title}</option>
              ))}
            </select>
            <Button size="sm" onClick={() => setProdDialog({ open: true, item: null })}>
              <Plus className="mr-1 h-4 w-4" /> Товар
            </Button>
          </div>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-muted/30 text-[11px] uppercase text-muted-2">
                <tr>
                  <th className="px-3 py-2">Товар</th>
                  <th className="px-3 py-2">Категория</th>
                  <th className="px-3 py-2">Цена</th>
                  <th className="px-3 py-2">Вкусы</th>
                  <th className="px-3 py-2">Статус</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {prodLoading ? (
                  <tr><td className="px-3 py-4 text-muted-2" colSpan={6}>Загрузка…</td></tr>
                ) : (
                  products.map((p) => (
                    <tr key={p._id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <div className="font-medium">{[p.title1, p.title2].filter(Boolean).join(' ')}</div>
                        <div className="font-mono text-[10px] text-muted-2">{p.productKey}</div>
                      </td>
                      <td className="px-3 py-2">{catTitleByKey.get(p.categoryKey) || p.categoryKey}</td>
                      <td className="px-3 py-2">{p.price} zł</td>
                      <td className="px-3 py-2">{(p.flavors || []).length}</td>
                      <td className="px-3 py-2">{p.isActive ? 'Вкл' : 'Выкл'}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="icon" variant="ghost" onClick={() => setProdDialog({ open: true, item: p })}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (window.confirm('Удалить товар?')) delProd.mutate(p._id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
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
