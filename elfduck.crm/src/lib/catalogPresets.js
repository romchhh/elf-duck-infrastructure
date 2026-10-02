export const PRODUCT_LAYOUTS = [
  {
    id: 1,
    label: 'Утка справа / кнопки справа',
    value: {
      classCardDuck: 'productCardImageRight',
      classActions: 'productActionsRight',
    },
  },
  {
    id: 2,
    label: 'Утка слева / кнопки слева',
    value: {
      classCardDuck: 'productCardImageLeft',
      classActions: 'productActionsLeft',
    },
  },
];

export const CATEGORY_VARIANTS = [
  {
    id: 1,
    label: 'Вариант 1',
    value: {
      classCardDuck: 'cardImageLeft',
      titleClass: 'cardTitle',
      showOverlay: true,
    },
  },
  {
    id: 2,
    label: 'Вариант 2',
    value: {
      classCardDuck: 'cardImageRight',
      titleClass: 'cardTitle2',
      showOverlay: false,
    },
  },
  {
    id: 3,
    label: 'Вариант 3',
    value: {
      classCardDuck: 'cardImageLeft2',
      titleClass: 'cardTitle2',
      showOverlay: false,
    },
  },
  {
    id: 4,
    label: 'Вариант 4',
    value: {
      classCardDuck: 'cardImageRight2',
      titleClass: 'cardTitle',
      showOverlay: true,
    },
  },
];

export const PRODUCT_BADGE_PRESETS = [
  { label: 'Без бейджа', newBadge: '', classNewBadge: '' },
  { label: 'SALE', newBadge: 'SALE', classNewBadge: 'actionBadge sale' },
  { label: 'NEW', newBadge: 'NEW', classNewBadge: 'actionBadge new' },
];

export const defaultCategoryForm = () => ({
  title: '',
  key: '',
  badgeText: '',
  badgeSide: 'left',
  showOverlay: false,
  classCardDuck: 'cardImageLeft',
  titleClass: 'cardTitle',
  cardBgUrl: '',
  cardDuckUrl: '',
  sortOrder: 0,
  isActive: true,
});

export const defaultProductForm = () => ({
  categoryKey: '',
  productKey: '',
  title1: '',
  title2: '',
  titleModal: '',
  price: 0,
  cardBgUrl: '',
  cardDuckUrl: '',
  orderImgUrl: '',
  classCardDuck: '',
  classActions: '',
  classNewBadge: '',
  newBadge: '',
  accentColor: '',
  sortOrder: 0,
  isActive: true,
});
