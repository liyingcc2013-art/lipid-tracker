'use client';

import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { LineChart as LineChartIcon, Info, Sparkles, Calendar } from 'lucide-react';
import { CategoryPanel, TestItem } from '../api/extract-lipid-data/route';

export interface LabResultRecord {
  id: string;
  patient_id: string;
  test_date: string;
  metrics: CategoryPanel[];
  created_at?: string;
}

interface HealthTrendChartProps {
  patientName?: string;
  patientIc?: string;
  labResults: LabResultRecord[];
  onUploadClick?: () => void;
}

const PALETTE = [
  '#0d9488', // teal-600
  '#6366f1', // indigo-500
  '#f43f5e', // rose-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#06b6d4', // cyan-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
];

export default function HealthTrendChart({
  patientName,
  labResults,
}: HealthTrendChartProps) {
  // Extract all unique category panel names from all historical lab results
  const categories = useMemo(() => {
    const catSet = new Set<string>();
    labResults.forEach((record) => {
      if (Array.isArray(record.metrics)) {
        record.metrics.forEach((cat) => {
          if (cat.category) {
            catSet.add(cat.category.trim());
          }
        });
      }
    });

    const list = Array.from(catSet);
    // Sort standard ones first if available
    const standardOrder = [
      'LIPID PROFILE',
      'DIABETES MELLITUS PROFILE',
      'GLYCEMIC CONTROL',
      'LIVER PROFILE',
      'KIDNEY PROFILE',
    ];

    list.sort((a, b) => {
      const idxA = standardOrder.indexOf(a.toUpperCase());
      const idxB = standardOrder.indexOf(b.toUpperCase());
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    return list;
  }, [labResults]);

  const [activeCategory, setActiveCategory] = useState<string>('');

  // Auto-set active category if not set or invalid
  const currentCategory = useMemo(() => {
    if (activeCategory && categories.includes(activeCategory)) {
      return activeCategory;
    }
    return categories.length > 0 ? categories[0] : '';
  }, [activeCategory, categories]);

  // Transform labResults for the selected category into time-series chart data
  const { chartData, testNames, unitMap } = useMemo(() => {
    if (!currentCategory || labResults.length === 0) {
      return { chartData: [], testNames: [], unitMap: {} as Record<string, string> };
    }

    const testNameSet = new Set<string>();
    const units: Record<string, string> = {};

    const data = labResults.map((record) => {
      const dateLabel = record.test_date || 'Unknown Date';
      const point: Record<string, string | number | null> = {
        date: dateLabel,
      };

      if (Array.isArray(record.metrics)) {
        const matchingCat = record.metrics.find(
          (c) => c.category && c.category.trim().toUpperCase() === currentCategory.toUpperCase()
        );

        if (matchingCat && Array.isArray(matchingCat.tests)) {
          matchingCat.tests.forEach((t: TestItem) => {
            if (t.name && typeof t.value === 'number') {
              testNameSet.add(t.name);
              point[t.name] = t.value;
              if (t.unit && !units[t.name]) {
                units[t.name] = t.unit;
              }
            }
          });
        }
      }

      return point;
    });

    return {
      chartData: data,
      testNames: Array.from(testNameSet),
      unitMap: units,
    };
  }, [currentCategory, labResults]);

  if (!labResults || labResults.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <LineChartIcon className="w-4 h-4 text-teal-600" />
              Multi-Panel Health Trend
            </h4>
            <p className="text-xs text-slate-500">
              Comprehensive metric visualization across report dates
            </p>
          </div>
        </div>
        <div className="h-56 rounded-xl bg-slate-50/70 border border-dashed border-slate-200 flex flex-col items-center justify-center p-4 text-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
            <LineChartIcon className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-slate-700">No historical lab records found</p>
          <p className="text-xs text-slate-500 max-w-sm">
            Upload a blood report PDF above to begin tracking and visualizing health trends over time.
          </p>
        </div>
      </div>
    );
  }

  const isSingleEntry = labResults.length === 1;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-5 shadow-2xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <LineChartIcon className="w-5 h-5 text-teal-600" />
            Multi-Panel Health Trend
          </h4>
          <p className="text-xs text-slate-500">
            {patientName ? `Tracking ${patientName}` : 'Patient health metrics'} • {labResults.length} test record(s) on file
          </p>
        </div>

        {/* Panel Tabs / Toggles */}
        {categories.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {categories.map((cat) => {
              const isActive = cat === currentCategory;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Single Entry Prompt Banner */}
      {isSingleEntry && (
        <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-xl flex items-start gap-3 text-xs text-amber-900">
          <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold text-amber-900">
              Single lab record loaded ({labResults[0].test_date || '1 date'})
            </p>
            <p className="text-amber-800/90 leading-snug">
              Showing a baseline data point. Upload additional lab reports from other dates to generate interactive multi-point trend lines!
            </p>
          </div>
        </div>
      )}

      {/* Chart Canvas */}
      <div className="pt-2">
        {chartData.length > 0 && testNames.length > 0 ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1' }}
                  dy={8}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1' }}
                  dx={-4}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-800 text-xs space-y-1.5 min-w-[160px]">
                          <p className="font-semibold text-teal-300 border-b border-slate-700/80 pb-1 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            {label}
                          </p>
                          <div className="space-y-1 pt-0.5">
                            {payload.map((entry, i) => {
                              const name = String(entry.name || '');
                              const unit = unitMap[name] ? ` ${unitMap[name]}` : '';
                              return (
                                <div key={i} className="flex items-center justify-between gap-3 text-slate-200">
                                  <span className="flex items-center gap-1.5">
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: entry.color }}
                                    />
                                    {name}:
                                  </span>
                                  <span className="font-mono font-bold text-white">
                                    {entry.value}
                                    {unit}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: 15, fontSize: '12px' }}
                  formatter={(value) => (
                    <span className="text-xs font-medium text-slate-700">
                      {value} {unitMap[value] ? `(${unitMap[value]})` : ''}
                    </span>
                  )}
                />
                {testNames.map((testName, idx) => (
                  <Line
                    key={testName}
                    type="monotone"
                    dataKey={testName}
                    name={testName}
                    stroke={PALETTE[idx % PALETTE.length]}
                    strokeWidth={2.5}
                    activeDot={{ r: 6, strokeWidth: 2, fill: '#fff' }}
                    dot={{ r: isSingleEntry ? 6 : 4, fill: PALETTE[idx % PALETTE.length] }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-56 rounded-xl bg-slate-50/70 border border-slate-200 flex flex-col items-center justify-center text-center p-4 space-y-2">
            <Info className="w-6 h-6 text-slate-400" />
            <p className="text-xs text-slate-600 font-medium">
              No test metrics extracted for panel &quot;{currentCategory}&quot;.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
