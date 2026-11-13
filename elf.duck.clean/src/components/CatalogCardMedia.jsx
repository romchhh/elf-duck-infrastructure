import React, { useState } from "react";
import { getBakedCardImageUrl, hasBakedCardImage } from "../lib/cardMedia.js";

/**
 * Картка каталогу: одне запечене фото, або фон+утка.
 * Якщо baked URL віддав 404 — автоматично показуємо шари.
 */
export default function CatalogCardMedia({
  item,
  eager = false,
  duckClassFallback = "cardImageLeft",
  showOverlay = false,
}) {
  const bakedUrl = getBakedCardImageUrl(item);
  const [bakedFailed, setBakedFailed] = useState(false);
  const useBaked = hasBakedCardImage(item) && !bakedFailed;
  const loading = eager ? "eager" : "lazy";
  const fetchpriority = eager ? "high" : "low";

  if (useBaked) {
    return (
      <img
        src={bakedUrl}
        className="cardImageFull cardImageFull--baked"
        alt=""
        loading={loading}
        decoding="async"
        fetchpriority={fetchpriority}
        onError={() => setBakedFailed(true)}
      />
    );
  }

  return (
    <>
      {item?.cardBgUrl ? (
        <img
          src={item.cardBgUrl}
          className={item.classCardBg || "cardImageFull"}
          alt=""
          loading={loading}
          decoding="async"
          fetchpriority={fetchpriority}
        />
      ) : null}

      {item?.cardDuckUrl ? (
        <img
          src={item.cardDuckUrl}
          className={item.classCardDuck || duckClassFallback}
          alt=""
          loading={loading}
          decoding="async"
          fetchpriority={fetchpriority}
        />
      ) : null}

      {showOverlay || item?.showOverlay ? <div className="cardOverlay" /> : null}
    </>
  );
}
