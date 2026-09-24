/** Статичні превʼю товарів CRM (public/products/*.webp). */
export const productImageByKey = {
  'vozol-prime-30-ml': '/products/vozol-prime-30-ml.webp',
  'chaser-for-pods-30-ml': '/products/chaser-for-pods-30-ml.webp',
  'elf-duck-moon-40k': '/products/elf-duck-moon-40k.webp',
  'elfliq-30-ml': '/products/elfliq-30-ml.webp',
  'oxva-pod': '/products/oxva-pod.webp',
  'puffy-30-ml': '/products/puffy-30-ml.webp',
  'xros-5-mini-pod': '/products/xros-5-mini-pod.webp',
  'xros-cartridge': '/products/xros-cartridge.webp',
  'elf-duck-bc-45000': '/products/elf-duck-bc-45000.webp',
  'cartridge-oxva': '/products/cartridge-oxva.webp',
  'chaser-black-30-ml-2': '/products/chaser-black-30-ml-2.webp',
  'chaser-black-30-ml': '/products/chaser-black-30-ml.webp',
  'chaser-special-30-ml': '/products/chaser-special-30-ml.webp',
  'elf-duck-1500-2': '/products/elf-duck-1500-2.webp',
  'elf-duck-1500': '/products/elf-duck-1500.webp',
  'elf-duck-3000': '/products/elf-duck-3000.webp',
  'elf-duck-bc-20k': '/products/elf-duck-bc-20k.webp',
  'elf-duck-combo-30k-pro': '/products/elf-duck-combo-30k-pro.webp',
  'elf-duck-d3-25k': '/products/elf-duck-d3-25k.webp',
  'elf-duck-gh-33000-pro': '/products/elf-duck-gh-33000-pro.webp',
  'elf-duck-ice-king-30k': '/products/elf-duck-ice-king-30k.webp',
  'elf-duck-planet-25k': '/products/elf-duck-planet-25k.webp',
  'elf-duck-trio-40k': '/products/elf-duck-trio-40k.webp',
  'ethereum-30-ml': '/products/ethereum-30-ml.webp',
  'puffy-30-ml-70-mg': '/products/puffy-30-ml-70-mg.webp',
  'xros-5-pod': '/products/xros-5-pod.webp',
  'yami-30ml': '/products/yami-30ml.webp',
  'elfx-pod': '/products/elfx-pod.webp',
};

export const BRAND_LOGO_URL = '/brand/elfduck-logo.webp';

export function resolveProductImage(productKey, imageUrl) {
  return (
    productImageByKey[productKey] ||
    imageUrl ||
    ''
  );
}
