export function translitRuToLat(input) {
  const s = String(input || "").trim().toLowerCase();
  const map = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ъ: "",
    ы: "y",
    ь: "",
    э: "e",
    ю: "yu",
    я: "ya",
  };

  let out = "";
  for (const ch of s) {
    if (map[ch] !== undefined) out += map[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else out += "-";
  }

  out = out.replace(/-+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
  if (out.length < 2) out = "category";
  if (out.length > 32) out = out.slice(0, 32).replace(/-+$/, "");
  return out;
}
