import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { name: 'Mon', price: 450 },
  { name: 'Tue', price: 420 },
  { name: 'Wed', price: 380 },
  { name: 'Thu', price: 510 },
  { name: 'Fri', price: 590 },
  { name: 'Sat', price: 650 },
  { name: 'Sun', price: 580 },
];

export const PriceChart: React.FC = () => {
  return (
    <div className="h-48 w-full mt-4 bg-white/50 rounded-xl p-4 backdrop-blur-sm border border-slate-200">
      <h3 className="text-sm font-semibold text-slate-600 mb-2">Price Trend (Next 7 Days)</h3>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis 
            dataKey="name" 
            axisLine={false} 
            tickLine={false} 
            tick={{fontSize: 12, fill: '#94a3b8'}}
          />
          <YAxis hide domain={['dataMin - 50', 'dataMax + 50']} />
          <Tooltip 
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          />
          <Area 
            type="monotone" 
            dataKey="price" 
            stroke="#3b82f6" 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#colorPrice)" 
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};