import React, {
  createContext,
  useContext,
  useMemo,
  useState,
} from 'react';

const PeriodContext = createContext(null);

export function PeriodProvider({ children }) {
  const [period, setPeriod] = useState('Месяц');

  const [customRange, setCustomRange] =
    useState(null);

  const range = useMemo(() => {
    if (
      period !== 'Свой период' ||
      !customRange
    ) {
      return null;
    }

    return customRange;
  }, [period, customRange]);

  const value = useMemo(
    () => ({
      period,
      setPeriod,
      range,
      customRange,
      setCustomRange,
    }),
    [
      period,
      range,
      customRange,
    ]
  );

  return (
    <PeriodContext.Provider value={value}>
      {children}
    </PeriodContext.Provider>
  );
}

export function usePeriod() {
  return (
    useContext(PeriodContext) || {
      period: 'Месяц',
      setPeriod: () => {},
      range: null,
      customRange: null,
      setCustomRange: () => {},
    }
  );
}