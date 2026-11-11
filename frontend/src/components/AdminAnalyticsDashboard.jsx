import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Cpu,
  FileCheck,
  FileText,
  Layers,
  RefreshCw,
  Scale,
  Shield,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { adminAPI } from '../services/api';

/* ── SVG User Growth Timeline Chart ── */
function UserGrowthChart({ timeline = [] }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  const width = 640;
  const height = 190;
  const padLeft = 40;
  const padRight = 20;
  const padTop = 15;
  const padBottom = 30;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxVal = useMemo(() => {
    if (!timeline || timeline.length === 0) return 5;
    const highest = Math.max(...timeline.map((d) => d.cumulative || 0), 5);
    return Math.ceil(highest / 5) * 5;
  }, [timeline]);

  const minVal = 0;

  const points = useMemo(() => {
    if (!timeline || timeline.length === 0) return [];
    return timeline.map((d, i) => {
      const x = padLeft + (i / Math.max(timeline.length - 1, 1)) * chartW;
      const y = padTop + chartH - ((d.cumulative - minVal) / Math.max(maxVal - minVal, 1)) * chartH;
      return { x, y, ...d, index: i };
    });
  }, [timeline, chartW, chartH, maxVal, minVal]);

  const pathD = useMemo(() => {
    if (points.length === 0) return '';
    return points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, '');
  }, [points]);

  const areaD = useMemo(() => {
    if (points.length === 0) return '';
    const firstX = points[0].x;
    const lastX = points[points.length - 1].x;
    const baseY = padTop + chartH;
    return `${pathD} L ${lastX.toFixed(1)} ${baseY} L ${firstX.toFixed(1)} ${baseY} Z`;
  }, [pathD, points, padTop, chartH]);

  if (!timeline || timeline.length === 0) {
    return (
      <div className="flex-center" style={{ height: '200px', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
        No user registration telemetry available for this period.
      </div>
    );
  }

  // Sampled X-axis labels
  const labelInterval = Math.max(Math.floor(timeline.length / 5), 1);
  const activePoint = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div
      className="chart-svg-container"
      onMouseLeave={() => setHoverIndex(null)}
      style={{ position: 'relative', width: '100%', height: '200px' }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart-svg-canvas"
        preserveAspectRatio="none"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const ratio = Math.max(0, Math.min(1, (mouseX - padLeft) / chartW));
          const idx = Math.round(ratio * (timeline.length - 1));
          setHoverIndex(idx);
        }}
      >
        <defs>
          <linearGradient id="userGrowthAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Horizontal Guidelines & Ticks */}
        {[0, 0.5, 1].map((pct, i) => {
          const y = padTop + chartH * (1 - pct);
          const val = Math.round(pct * maxVal);
          return (
            <g key={i}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="var(--color-border-subtle)"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fontFamily="var(--font-mono)"
                fill="var(--color-text-muted)"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Area fill and stroke path */}
        <path d={areaD} fill="url(#userGrowthAreaGrad)" />
        <path
          d={pathD}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* X-axis Date Labels */}
        {points.map((p, i) => {
          if (i % labelInterval !== 0 && i !== points.length - 1) return null;
          const displayDate = p.date ? p.date.slice(5) : '';
          return (
            <text
              key={i}
              x={p.x}
              y={height - 8}
              textAnchor="middle"
              fontSize="9"
              fontFamily="var(--font-mono)"
              fill="var(--color-text-secondary)"
            >
              {displayDate}
            </text>
          );
        })}

        {/* Active hover crosshair and point */}
        {activePoint && (
          <g>
            <line
              x1={activePoint.x}
              y1={padTop}
              x2={activePoint.x}
              y2={padTop + chartH}
              stroke="var(--color-border-strong)"
              strokeDasharray="2 2"
              strokeWidth="1"
            />
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r="4.5"
              fill="var(--color-surface)"
              stroke="var(--color-primary)"
              strokeWidth="2.5"
            />
          </g>
        )}
      </svg>

      {/* Floating Tooltip */}
      {activePoint && (
        <div
          className="chart-floating-tooltip"
          style={{
            left: `${(activePoint.x / width) * 100}%`,
            top: `${(activePoint.y / height) * 100}%`,
          }}
        >
          <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', marginBottom: '2px' }}>
            {activePoint.date}
          </div>
          <div>Cumulative Users: <strong>{activePoint.cumulative}</strong></div>
          <div style={{ color: 'var(--color-text-secondary)' }}>
            New Today: +{activePoint.registrations}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── SVG Document Activity Timeline (Multi-Bar Chart) ── */
function DocumentActivityChart({ timeline = [] }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  const width = 640;
  const height = 190;
  const padLeft = 40;
  const padRight = 20;
  const padTop = 15;
  const padBottom = 30;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxVal = useMemo(() => {
    if (!timeline || timeline.length === 0) return 4;
    const highest = Math.max(...timeline.map((d) => d.uploads || 0), 4);
    return Math.ceil(highest / 4) * 4;
  }, [timeline]);

  if (!timeline || timeline.length === 0) {
    return (
      <div className="flex-center" style={{ height: '200px', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
        No document activity recorded in this period.
      </div>
    );
  }

  const barSlotW = chartW / timeline.length;
  const barW = Math.max(Math.min(barSlotW * 0.65, 18), 3);

  const activeDay = hoverIndex !== null ? timeline[hoverIndex] : null;

  return (
    <div
      className="chart-svg-container"
      onMouseLeave={() => setHoverIndex(null)}
      style={{ position: 'relative', width: '100%', height: '200px' }}
    >
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg-canvas" preserveAspectRatio="none">
        {/* Horizontal Guidelines & Ticks */}
        {[0, 0.5, 1].map((pct, i) => {
          const y = padTop + chartH * (1 - pct);
          const val = Math.round(pct * maxVal);
          return (
            <g key={i}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="var(--color-border-subtle)"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fontFamily="var(--font-mono)"
                fill="var(--color-text-muted)"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Render Bars per day */}
        {timeline.map((d, i) => {
          const xCenter = padLeft + (i + 0.5) * barSlotW;
          const x = xCenter - barW / 2;

          const totalH = (d.uploads / maxVal) * chartH;
          const completedH = (d.completed / maxVal) * chartH;
          const failedH = (d.failed / maxVal) * chartH;
          const processingH = Math.max(0, totalH - completedH - failedH);

          const isHovered = hoverIndex === i;

          return (
            <g
              key={i}
              onMouseEnter={() => setHoverIndex(i)}
              style={{ cursor: 'pointer' }}
            >
              {/* Invisible touch/mouse target area */}
              <rect
                x={padLeft + i * barSlotW}
                y={padTop}
                width={barSlotW}
                height={chartH}
                fill="transparent"
              />

              {d.uploads === 0 ? (
                /* Subtle dot for zero days */
                <circle cx={xCenter} cy={padTop + chartH - 2} r="1.5" fill="var(--color-border)" />
              ) : (
                /* Stacked Bar segments */
                <g opacity={isHovered ? 1 : 0.85}>
                  {/* Processing base/remainder (graphite / slate) */}
                  {processingH > 0 && (
                    <rect
                      x={x}
                      y={padTop + chartH - totalH}
                      width={barW}
                      height={processingH}
                      fill="var(--color-secondary)"
                      rx="1"
                    />
                  )}

                  {/* Failed segment (red) */}
                  {failedH > 0 && (
                    <rect
                      x={x}
                      y={padTop + chartH - completedH - failedH}
                      width={barW}
                      height={failedH}
                      fill="var(--color-danger)"
                      rx="1"
                    />
                  )}

                  {/* Completed segment (green) */}
                  {completedH > 0 && (
                    <rect
                      x={x}
                      y={padTop + chartH - completedH}
                      width={barW}
                      height={completedH}
                      fill="var(--color-success)"
                      rx="1"
                    />
                  )}
                </g>
              )}

              {/* Sampled X date label */}
              {(i % Math.max(Math.floor(timeline.length / 5), 1) === 0 || i === timeline.length - 1) && (
                <text
                  x={xCenter}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                  fill="var(--color-text-secondary)"
                >
                  {d.date ? d.date.slice(5) : ''}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Floating Tooltip */}
      {activeDay && (
        <div
          className="chart-floating-tooltip"
          style={{
            left: `${((padLeft + (hoverIndex + 0.5) * barSlotW) / width) * 100}%`,
            top: '30%',
          }}
        >
          <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', marginBottom: '2px' }}>
            {activeDay.date}
          </div>
          <div>Total Uploads: <strong>{activeDay.uploads}</strong></div>
          <div style={{ color: 'var(--color-success)', fontSize: '10px' }}>
            ✓ Completed: {activeDay.completed}
          </div>
          <div style={{ color: 'var(--color-danger)', fontSize: '10px' }}>
            ✕ Failed: {activeDay.failed}
          </div>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: '10px' }}>
            ⏳ Processing: {activeDay.processing}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── SVG Pipeline Status Donut Chart ── */
function PipelineDonutChart({ breakdown = [], successRate = 0 }) {
  const total = breakdown.reduce((acc, s) => acc + (s.count || 0), 0);

  const colors = {
    completed: 'var(--color-success)',
    processing: 'var(--color-secondary)',
    failed: 'var(--color-danger)',
    pending: 'var(--color-border-strong)',
  };

  const R = 46;
  const C = 2 * Math.PI * R; // ~289.026

  const segments = breakdown.reduce((acc, s) => {
    const fraction = total > 0 ? s.count / total : 0;
    const strokeDasharray = `${(fraction * C).toFixed(2)} ${C.toFixed(2)}`;
    const strokeDashoffset = -1 * acc.accum * C;
    const item = {
      ...s,
      fraction,
      percentage: (fraction * 100).toFixed(1),
      strokeDasharray,
      strokeDashoffset,
      color: colors[s.status] || 'var(--color-text-secondary)',
    };
    return {
      accum: acc.accum + fraction,
      items: [...acc.items, item],
    };
  }, { accum: 0, items: [] }).items;

  return (
    <div className="donut-chart-layout">
      {/* SVG Donut */}
      <div className="donut-svg-wrapper">
        <svg viewBox="0 0 120 120" width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
          {/* Background track circle */}
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke="var(--color-surface-2)"
            strokeWidth="16"
          />

          {/* Slices */}
          {total > 0 &&
            segments.map((seg, i) => (
              <circle
                key={i}
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke={seg.color}
                strokeWidth="16"
                strokeDasharray={seg.strokeDasharray}
                strokeDashoffset={seg.strokeDashoffset}
                strokeLinecap="butt"
              />
            ))}
        </svg>

        {/* Center label */}
        <div className="donut-center-label">
          <span className="donut-center-value">{successRate}%</span>
          <span className="donut-center-sub">Success</span>
        </div>
      </div>

      {/* Legend & Breakdown Stats */}
      <div className="donut-stats-list">
        {segments.map((seg, i) => (
          <div key={i} className="donut-stat-row">
            <div className="flex-center gap-2">
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: seg.color,
                  display: 'inline-block',
                }}
              />
              <span style={{ fontWeight: 500, color: 'var(--color-text)' }}>{seg.label}</span>
            </div>
            <div className="text-mono" style={{ color: 'var(--color-text-secondary)' }}>
              <strong>{seg.count}</strong> ({seg.percentage}%)
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main Admin Analytics Dashboard Component ── */
export default function AdminAnalyticsDashboard() {
  const [period, setPeriod] = useState('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustomRange, setShowCustomRange] = useState(false);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchAnalytics = useCallback(async (selectedPeriod = period, start = customStart, end = customEnd) => {
    try {
      setRefreshing(true);
      setError(null);

      const params = { period: selectedPeriod };
      if (selectedPeriod === 'custom' && start && end) {
        params.startDate = start;
        params.endDate = end;
      }

      const res = await adminAPI.getAnalytics(params);
      if (res?.data?.success) {
        setData(res.data.data);
      } else {
        throw new Error(res?.data?.error?.message || 'Failed to fetch analytics payload.');
      }
    } catch (err) {
      console.error('Analytics load error:', err);
      setError(err?.response?.data?.error?.message || err?.message || 'Failed to load telemetry analytics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, customStart, customEnd]);

  useEffect(() => {
    fetchAnalytics(period);
  }, [period, fetchAnalytics]);

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    if (newPeriod !== 'custom') {
      setShowCustomRange(false);
    } else {
      setShowCustomRange(true);
    }
  };

  const handleApplyCustomRange = (e) => {
    e.preventDefault();
    if (!customStart || !customEnd) return;
    setPeriod('custom');
    fetchAnalytics('custom', customStart, customEnd);
  };

  const metrics = data?.metrics || {};
  const breakdowns = data?.breakdowns || {};
  const timelines = data?.timelines || {};
  const periodInfo = data?.periodInfo || {};

  const formattedDateRange = useMemo(() => {
    if (!periodInfo.startDate || !periodInfo.endDate) return 'Platform Telemetry';
    const s = new Date(periodInfo.startDate).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const e = new Date(periodInfo.endDate).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${s} — ${e}`;
  }, [periodInfo.startDate, periodInfo.endDate]);

  return (
    <div className="admin-analytics-container">
      {/* ── Top Control & Period Bar ── */}
      <div className="admin-analytics-topbar">
        <div className="admin-analytics-header-left">
          <div className="admin-date-range-badge">
            <Calendar size={13} />
            <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>Reporting Window:</span>
            <span>{formattedDateRange}</span>
          </div>
        </div>

        <div className="admin-analytics-controls">

          {/* Reporting Period Filter Pills */}
          <div className="admin-period-pills" role="radiogroup" aria-label="Reporting Period">
            <button
              type="button"
              className={`admin-period-btn${period === '7d' ? ' active' : ''}`}
              onClick={() => handlePeriodChange('7d')}
            >
              7D
            </button>
            <button
              type="button"
              className={`admin-period-btn${period === '30d' ? ' active' : ''}`}
              onClick={() => handlePeriodChange('30d')}
            >
              30D
            </button>
            <button
              type="button"
              className={`admin-period-btn${period === '90d' ? ' active' : ''}`}
              onClick={() => handlePeriodChange('90d')}
            >
              90D
            </button>
            <button
              type="button"
              className={`admin-period-btn${period === 'all' ? ' active' : ''}`}
              onClick={() => handlePeriodChange('all')}
            >
              All Time
            </button>
            <button
              type="button"
              className={`admin-period-btn${period === 'custom' ? ' active' : ''}`}
              onClick={() => handlePeriodChange('custom')}
            >
              Custom
            </button>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm flex-center gap-1"
            onClick={() => fetchAnalytics(period, customStart, customEnd)}
            disabled={refreshing}
            title="Refresh analytics data"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── Custom Date Range Form (when active) ── */}
      {showCustomRange && (
        <form onSubmit={handleApplyCustomRange} className="admin-custom-date-form">
          <div className="flex-center gap-2">
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>From:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              required
            />
          </div>
          <div className="flex-center gap-2">
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>To:</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" style={{ padding: '3px 10px', fontSize: '11px' }}>
            Apply Range
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ padding: '3px 8px', fontSize: '11px' }}
            onClick={() => {
              setShowCustomRange(false);
              setPeriod('30d');
            }}
          >
            Cancel
          </button>
        </form>
      )}

      {/* ── Error Banner ── */}
      {error && (
        <div className="card flex-center gap-3" style={{ borderColor: 'var(--color-danger-border)', background: 'var(--color-danger-bg)' }}>
          <AlertCircle size={18} color="var(--color-danger)" />
          <div style={{ flex: 1, fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>
            <strong>Telemetry Error:</strong> {error}
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fetchAnalytics(period)}>
            Retry
          </button>
        </div>
      )}

      {/* ── Loading Skeleton / Shimmer ── */}
      {loading && !data && (
        <div className="admin-analytics-kpi-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div key={n} className="analytics-kpi-card" style={{ opacity: 0.6 }}>
              <div style={{ height: '12px', width: '60%', background: 'var(--color-surface-2)', borderRadius: '3px' }} />
              <div style={{ height: '28px', width: '40%', background: 'var(--color-surface-2)', borderRadius: '3px', margin: '4px 0' }} />
              <div style={{ height: '10px', width: '80%', background: 'var(--color-surface-2)', borderRadius: '3px' }} />
            </div>
          ))}
        </div>
      )}

      {/* ── Platform Summary Metrics (8 Clean KPI Cards) ── */}
      {data && (
        <>
          <div className="admin-analytics-kpi-grid">
            {/* Total Users */}
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-header">
                <span>Total Registered</span>
                <Users size={13} color="var(--color-text-secondary)" />
              </div>
              <div className="analytics-kpi-value text-mono">{metrics.totalUsers ?? 0}</div>
              <div className="analytics-kpi-sub">
                <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                  +{metrics.newUsersInPeriod ?? 0}
                </span>
                <span>new in period</span>
              </div>
            </div>

            {/* Active Users */}
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-header">
                <span>Active Users</span>
                <UserCheck size={13} color="var(--color-text-secondary)" />
              </div>
              <div className="analytics-kpi-value text-mono">{metrics.activeUsers ?? 0}</div>
              <div className="analytics-kpi-sub">
                <span>
                  {metrics.totalUsers > 0
                    ? `${((metrics.activeUsers / metrics.totalUsers) * 100).toFixed(1)}% platform activation`
                    : '100% active'}
                </span>
              </div>
            </div>

            {/* Total Uploaded Documents */}
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-header">
                <span>Uploaded Documents</span>
                <FileText size={13} color="var(--color-text-secondary)" />
              </div>
              <div className="analytics-kpi-value text-mono">{metrics.totalDocuments ?? 0}</div>
              <div className="analytics-kpi-sub">
                <span>{metrics.docsInPeriod ?? 0} uploads in period</span>
              </div>
            </div>

            {/* Completed Analyses */}
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-header">
                <span>Completed Analyses</span>
                <FileCheck size={13} color="var(--color-text-secondary)" />
              </div>
              <div className="analytics-kpi-value text-mono" style={{ color: 'var(--color-success)' }}>
                {metrics.completedAnalyses ?? 0}
              </div>
              <div className="analytics-kpi-sub">
                <span>Fully indexed with embeddings</span>
              </div>
            </div>

            {/* Pipeline Success Rate */}
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-header">
                <span>Analysis Success Rate</span>
                <CheckCircle2 size={13} color="var(--color-text-secondary)" />
              </div>
              <div className="analytics-kpi-value text-mono">
                {metrics.successRate !== undefined ? `${metrics.successRate}%` : 'N/A'}
              </div>
              <div className="analytics-kpi-sub">
                <span>
                  {metrics.completedAnalyses ?? 0} completed · {metrics.failedAnalyses ?? 0} failed
                </span>
              </div>
            </div>

            {/* Avg Processing Time */}
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-header">
                <span>Avg Processing Duration</span>
                <Clock size={13} color="var(--color-text-secondary)" />
              </div>
              <div className="analytics-kpi-value text-mono">
                {metrics.avgProcessingTimeSec !== null ? `${metrics.avgProcessingTimeSec}s` : 'N/A'}
              </div>
              <div className="analytics-kpi-sub">
                <span>
                  Min: {metrics.minProcessingTimeSec ?? 0}s · Max: {metrics.maxProcessingTimeSec ?? 0}s
                </span>
              </div>
            </div>

            {/* Pipeline Failed Jobs */}
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-header">
                <span>Analysis Exceptions</span>
                <AlertTriangle size={13} color="var(--color-danger)" />
              </div>
              <div
                className="analytics-kpi-value text-mono"
                style={{ color: metrics.failedAnalyses > 0 ? 'var(--color-danger)' : 'var(--color-text)' }}
              >
                {metrics.failedAnalyses ?? 0}
              </div>
              <div className="analytics-kpi-sub">
                <span>Unrecoverable OCR / parser errors</span>
              </div>
            </div>

            {/* Processing Queues */}
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-header">
                <span>Active In Pipeline</span>
                <Cpu size={13} color="var(--color-text-secondary)" />
              </div>
              <div className="analytics-kpi-value text-mono">{metrics.processingAnalyses ?? 0}</div>
              <div className="analytics-kpi-sub">
                <span>Currently processing or queued</span>
              </div>
            </div>
          </div>

          {/* ── Chart Row 1: User Growth Timeline & Pipeline Outcomes ── */}
          <div className="admin-analytics-grid-2col">
            {/* User Growth Chart Card */}
            <div className="analytics-chart-card">
              <div className="analytics-chart-header">
                <div>
                  <h3 className="analytics-chart-title">
                    <TrendingUp size={15} />
                    <span>User Registration Velocity &amp; Growth</span>
                  </h3>
                  <p className="analytics-chart-desc">
                    Daily registrations and cumulative platform account expansion across the selected timeframe.
                  </p>
                </div>
                <div className="chart-legend">
                  <div className="chart-legend-item">
                    <span className="chart-legend-dot" style={{ background: 'var(--color-primary)' }} />
                    <span>Cumulative Users</span>
                  </div>
                </div>
              </div>

              <UserGrowthChart timeline={timelines.userGrowth} period={period} />
            </div>

            {/* Analysis Pipeline Outcomes (Donut) */}
            <div className="analytics-chart-card">
              <div className="analytics-chart-header">
                <div>
                  <h3 className="analytics-chart-title">
                    <CheckCircle2 size={15} />
                    <span>Analysis Pipeline Outcomes</span>
                  </h3>
                  <p className="analytics-chart-desc">
                    Breakdown of document analysis statuses and completion ratio.
                  </p>
                </div>
              </div>

              <PipelineDonutChart
                breakdown={breakdowns.status || []}
                successRate={metrics.successRate ?? 0}
              />
            </div>
          </div>

          {/* ── Chart Row 2: Document Activity & Types Breakdown ── */}
          <div className="admin-analytics-grid-2col">
            {/* Document Activity Chart Card */}
            <div className="analytics-chart-card">
              <div className="analytics-chart-header">
                <div>
                  <h3 className="analytics-chart-title">
                    <FileText size={15} />
                    <span>Document Processing Activity &amp; Ingestion</span>
                  </h3>
                  <p className="analytics-chart-desc">
                    Daily uploaded files categorized by processing outcome (Completed, Failed, In-Flight).
                  </p>
                </div>
                <div className="chart-legend">
                  <div className="chart-legend-item">
                    <span className="chart-legend-dot" style={{ background: 'var(--color-success)' }} />
                    <span>Completed</span>
                  </div>
                  <div className="chart-legend-item">
                    <span className="chart-legend-dot" style={{ background: 'var(--color-danger)' }} />
                    <span>Failed</span>
                  </div>
                  <div className="chart-legend-item">
                    <span className="chart-legend-dot" style={{ background: 'var(--color-secondary)' }} />
                    <span>Processing</span>
                  </div>
                </div>
              </div>

              <DocumentActivityChart timeline={timelines.documentActivity} />
            </div>

            {/* Document Type Distribution Card */}
            <div className="analytics-chart-card">
              <div className="analytics-chart-header">
                <div>
                  <h3 className="analytics-chart-title">
                    <Layers size={15} />
                    <span>Contract Categories &amp; Formats</span>
                  </h3>
                  <p className="analytics-chart-desc">
                    Classification distribution across legal document domains.
                  </p>
                </div>
              </div>

              <div className="dist-bar-list">
                {(!breakdowns.documentTypes || breakdowns.documentTypes.length === 0) ? (
                  <div className="text-xs muted">No classified document types in this period.</div>
                ) : (
                  breakdowns.documentTypes.map((t, idx) => (
                    <div key={idx} className="dist-bar-item">
                      <div className="dist-bar-meta">
                        <span style={{ textTransform: 'capitalize' }}>{t.type}</span>
                        <span className="text-mono text-xs">
                          {t.count} ({t.percentage}%)
                        </span>
                      </div>
                      <div className="dist-bar-track">
                        <div
                          className="dist-bar-fill"
                          style={{
                            width: `${t.percentage}%`,
                            background: idx === 0 ? 'var(--color-primary)' : 'var(--color-secondary)',
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}

                {/* Formats Pills */}
                <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border-subtle)' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Supported Ingestion Formats
                  </span>
                  <div className="flex-center gap-2" style={{ justifyContent: 'flex-start', marginTop: '6px' }}>
                    {(breakdowns.fileFormats || []).map((f, i) => (
                      <span key={i} className="badge badge-neutral" style={{ fontFamily: 'var(--font-mono)' }}>
                        {(f.format || 'unknown').toUpperCase()} · {f.count} ({f.percentage}%)
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Chart Row 3: Legal Risk & Clause Intelligence Telemetry ── */}
          <div className="admin-analytics-grid-equal">
            {/* Risk Telemetry Card */}
            <div className="analytics-chart-card">
              <div className="analytics-chart-header">
                <div>
                  <h3 className="analytics-chart-title">
                    <Shield size={15} />
                    <span>Contract Risk Profile Telemetry</span>
                  </h3>
                  <p className="analytics-chart-desc">
                    Aggregated exposure metrics across analyzed contracts.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                      Average Risk Score
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-text)' }} className="text-mono">
                      {breakdowns.risk?.avgRiskScore !== null ? `${breakdowns.risk.avgRiskScore} / 100` : 'Pending'}
                    </div>
                  </div>
                  <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
                    {breakdowns.risk?.totalEvaluated || 0} Contracts Evaluated
                  </span>
                </div>

                {/* Risk Level Bands */}
                <div className="dist-bar-list">
                  {[
                    { label: 'Low Risk (0–39)', key: 'low', color: 'var(--color-success)' },
                    { label: 'Medium Risk (40–69)', key: 'medium', color: 'var(--color-warning)' },
                    { label: 'High Risk (70–89)', key: 'high', color: 'var(--color-danger)' },
                    { label: 'Critical Risk (90–100)', key: 'critical', color: 'var(--color-critical)' },
                  ].map((band, idx) => {
                    const count = breakdowns.risk?.levels?.[band.key] || 0;
                    const totalEvaluated = breakdowns.risk?.totalEvaluated || 1;
                    const pct = totalEvaluated > 0 ? ((count / totalEvaluated) * 100).toFixed(0) : 0;

                    return (
                      <div key={idx} className="dist-bar-item">
                        <div className="dist-bar-meta">
                          <span style={{ fontSize: '11px' }}>{band.label}</span>
                          <span className="text-mono text-xs">{count}</span>
                        </div>
                        <div className="dist-bar-track">
                          <div
                            className="dist-bar-fill"
                            style={{ width: `${count > 0 ? Math.max(pct, 5) : 0}%`, background: band.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Top Clauses Extracted Card */}
            <div className="analytics-chart-card">
              <div className="analytics-chart-header">
                <div>
                  <h3 className="analytics-chart-title">
                    <Scale size={15} />
                    <span>Top Identified Legal Clause Types</span>
                  </h3>
                  <p className="analytics-chart-desc">
                    Frequency of clauses flagged by the AI extraction pipeline.
                  </p>
                </div>
              </div>

              <div className="dist-bar-list">
                {(!breakdowns.clauses || breakdowns.clauses.length === 0) ? (
                  <div className="text-xs muted">No clause data extracted in this reporting period.</div>
                ) : (
                  breakdowns.clauses.map((c, idx) => {
                    const maxClauseCount = breakdowns.clauses[0]?.count || 1;
                    const pct = ((c.count / maxClauseCount) * 100).toFixed(0);

                    return (
                      <div key={idx} className="dist-bar-item">
                        <div className="dist-bar-meta">
                          <span style={{ textTransform: 'capitalize', fontSize: '12px' }}>{(c.type || 'Standard Clause').replace(/_/g, ' ')}</span>
                          <span className="text-mono text-xs" style={{ fontWeight: 600 }}>{c.count} instances</span>
                        </div>
                        <div className="dist-bar-track">
                          <div
                            className="dist-bar-fill"
                            style={{
                              width: `${pct}%`,
                              background: 'var(--color-primary)',
                              opacity: 0.9 - idx * 0.08,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
