import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, ResponsiveContainer, Tooltip
} from 'recharts';
import './HabitSpiderChart.css';

const DEFAULT_HABITS = [
  { key: 'trained', label: 'Trained' },
  { key: 'protein', label: 'Hit Protein' },
  { key: 'steps', label: '10k Steps' },
  { key: 'sleep', label: '8hrs Sleep' },
  { key: 'water', label: '2L Water' },
];

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

export default function HabitSpiderChart({ period = 30, compact = false }) {
  const { clientData } = useAuth();
  const { isDark } = useTheme();
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientData?.id) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        // Load custom habits config
        const customDoc = await getDoc(doc(db, 'customHabits', clientData.id));
        let customHabits = [];
        let hiddenDefaults = [];
        if (customDoc.exists()) {
          const data = customDoc.data();
          customHabits = data.habits || [];
          hiddenDefaults = data.hiddenDefaults || [];
        }

        // Build active habits list
        const activeHabits = [
          ...DEFAULT_HABITS.filter(h => !hiddenDefaults.includes(h.key)),
          ...customHabits.map(h => ({ key: `custom_${h.id}`, label: h.label })),
        ];

        // Load habit logs for the period
        const logsRef = collection(db, 'habitLogs');
        const q = query(logsRef, where('clientId', '==', clientData.id));
        const snap = await getDocs(q);

        // Filter to the period range
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - period);
        const cutoffStr = formatDate(cutoff);

        const logsInRange = snap.docs
          .map(d => d.data())
          .filter(l => l.date >= cutoffStr);

        // Calculate completion % for each habit
        const data = activeHabits.map(habit => {
          let completed = 0;
          logsInRange.forEach(log => {
            if (log.habits && log.habits[habit.key]) completed++;
          });
          const pct = period > 0 ? Math.round((completed / period) * 100) : 0;
          return {
            habit: habit.label,
            value: pct,
            fullMark: 100,
          };
        });

        if (!cancelled) setChartData(data);
      } catch (err) {
        console.error('Error loading spider chart data:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [clientData?.id, period]);

  if (loading) {
    return (
      <div className={`spider-loading${compact ? ' spider-compact' : ''}`}>
        <div className="spider-spinner" />
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className={`spider-empty${compact ? ' spider-compact' : ''}`}>
        <p>No habits configured yet</p>
      </div>
    );
  }

  const primaryColor = isDark ? '#DA3F4F' : '#B8313D';
  const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
  const textColor = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(55,55,55,0.8)';
  const chartHeight = compact ? 220 : 280;

  return (
    <div className={`spider-chart-wrap${compact ? ' spider-compact' : ''}`}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <RadarChart cx="50%" cy="50%" outerRadius={compact ? '65%' : '70%'} data={chartData}>
          <PolarGrid stroke={gridColor} />
          <PolarAngleAxis
            dataKey="habit"
            tick={{ fill: textColor, fontSize: compact ? 10 : 11, fontFamily: 'Inter, sans-serif', fontWeight: 500 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={false}
            axisLine={false}
          />
          <Radar
            name="Completion"
            dataKey="value"
            stroke={primaryColor}
            fill={primaryColor}
            fillOpacity={0.2}
            strokeWidth={2}
            dot={{ r: 3, fill: primaryColor, strokeWidth: 0 }}
          />
          <Tooltip
            contentStyle={{
              background: isDark ? '#1a1a1f' : '#fff',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e0e0e0'}`,
              borderRadius: 10,
              fontFamily: 'Inter, sans-serif',
              fontSize: 12,
              color: isDark ? '#fff' : '#373737',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
            formatter={(value) => [`${value}%`, 'Completion']}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
