import React from "react";
import likedIcon from "../assets/likedIcon.webp";
import buyIcon from "../assets/buyIcon.webp";
import { t } from "../utils/i18n";
import { getBakedCardImageUrl, hasBakedCardImage } from "../lib/cardMedia.js";

const ProductCard = React.memo(function ProductCard({
  product,
  isFavorite,
  onToggleFavorite,
  onOpenCheckout,
}) {
  const baked = hasBakedCardImage(product);

  return (
    <div className="productCard">
      {baked ? (
        <img
          className="productCardBg productCardBg--baked"
          src={getBakedCardImageUrl(product)}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div
          className="productCardBg"
          style={{
            backgroundImage: `url(${product.cardBgUrl || ""})`,
          }}
        />
      )}

      {!baked && product.cardDuckUrl ? (
        <img
          className={`productCardDuck ${product.classCardDuck || ""}`}
          src={product.cardDuckUrl}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : null}

      <div className="productCardContent">
        <div className="productCardTitles">
          <div className="productCardTitle1">{product.title1 || ""}</div>
          <div className="productCardTitle2">{product.title2 || ""}</div>
        </div>

        <div className={`productCardActions ${product.classActions || ""}`}>
          <button
            type="button"
            className="productFavoriteBtn"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(product);
            }}
          >
            <img src={likedIcon} alt="" />
            {isFavorite ? t("СОХРАНЕНО", "ZAPISANE") : t("СОХРАНИТЬ", "ZAPISZ")}
          </button>

          <button
            type="button"
            className="productBuyBtn"
            onClick={(e) => {
              e.stopPropagation();
              onOpenCheckout(product);
            }}
          >
            <img src={buyIcon} alt="" />
            {t("КУПИТЬ", "KUP")}
          </button>
        </div>
      </div>
    </div>
  );
});

export default ProductCard;