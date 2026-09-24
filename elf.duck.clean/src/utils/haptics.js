export const haptic = {
  light: () => window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light"),
  medium: () => window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("medium"),
  heavy: () => window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("heavy"),
  soft: () => window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("soft"),
  rigid: () => window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("rigid"),

  success: () =>  window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success"),

  error: () => window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error"),

  warning: () => window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("warning"),
};