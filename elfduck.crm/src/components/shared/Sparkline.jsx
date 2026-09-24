import React from 'react';
import { ResponsiveContainer, LineChart, Line, Area, AreaChart } from 'recharts';

export default function Sparkline({ data = [], color = 'hsl(255 100% 68%)', area = false, height = 36 }) {
  const points = data.map((v, i) => ({ i, v }));
  const Chart = area ? AreaChart : LineChart;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {area ? (
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#spark-${color})`} dot={false} />
        ) : (
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
        )}
      </Chart>
    </ResponsiveContainer>
  );
}