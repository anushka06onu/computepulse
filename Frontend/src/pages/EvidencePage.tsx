import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { motion } from 'framer-motion'
import { BarChart3 } from 'lucide-react'
import { api, type MetricsResponse } from '../api/client'
import { useApp } from '../context/AppContext'
import { KPI, CountUp } from '../components/KPI'
import { Reveal } from '../components/Reveal'
import { ChartTooltip } from '../components/ChartTooltip'
import { staggerContainer } from '../motion/presets'

export function EvidencePage() {
  const { health } = useApp()
  const [data, setData] = useState<MetricsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (health && !health.ready) return
    api
      .metrics()
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [health])

  if (error) return <p className="banner">{error}</p>
  if (!data) return <div className="skeleton" style={{ height: 240 }} />

  const baselineAcc = data.baseline.accuracy * 100
  const modelAcc = data.model.accuracy * 100
  const modelAuc = data.model.auc
  const baselineAuc = data.baseline.auc

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            <BarChart3 size={12} /> Validation
          </div>
          <h1>Model Evidence</h1>
          <p>
            Supporting metrics behind the risk scores — baseline vs ComputePulse
            AI on real holdout data.
          </p>
        </div>
      </div>

      <motion.div
        className="kpi-grid"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        <KPI
          label="Baseline accuracy"
          value={
            <>
              <CountUp end={baselineAcc} decimals={1} />%
            </>
          }
        />
        <KPI
          label="ComputePulse accuracy"
          value={
            <>
              <CountUp end={modelAcc} decimals={1} />%
            </>
          }
          delta={`+${(modelAcc - baselineAcc).toFixed(1)} pts`}
          tone="healthy"
        />
        <KPI
          label="ROC-AUC"
          value={<CountUp end={modelAuc} decimals={3} />}
          delta={`+${(modelAuc - baselineAuc).toFixed(3)}`}
          tone="healthy"
        />
        <KPI
          label="5-fold CV AUC"
          value={
            <>
              <CountUp end={data.cv.auc_mean} decimals={3} /> ±{' '}
              {data.cv.auc_std.toFixed(3)}
            </>
          }
        />
        <KPI
          label="PR-AUC"
          value={<CountUp end={data.eval?.pr_auc ?? 0} decimals={3} />}
          tone="healthy"
        />
        <KPI
          label="Top-5% recall"
          value={
            <>
              <CountUp end={(data.eval?.top5_recall ?? 0) * 100} decimals={1} />%
            </>
          }
        />
        <KPI
          label="ECE"
          value={<CountUp end={data.eval?.ece ?? 0} decimals={3} />}
        />
        <KPI
          label="Model version"
          value={
            <span style={{ fontSize: 14 }}>{data.model_version ?? '—'}</span>
          }
        />
      </motion.div>

      {data.fusion || data.placement_lift ? (
        <Reveal delay={0.05}>
          <div className="panel">
            <div className="panel-inner-core">
              <div className="panel-header">
                <div>
                  <h2>Ops fusion & placement lift</h2>
                  <p className="panel-sub">
                    Dataset rows on disk: {data.eval?.n_rows?.toLocaleString() ?? '—'}
                  </p>
                </div>
              </div>
              {data.fusion ? (
                <p>
                  Fused risk = {data.fusion.w_risk}·risk + {data.fusion.w_anomaly}
                  ·anomaly×100
                </p>
              ) : null}
              {data.placement_lift ? (
                <p className="caption" style={{ marginBottom: 0 }}>
                  Offline placement lift (vs risk-only):{' '}
                  {(data.placement_lift.relative_reduction_vs_risk_only * 100).toFixed(1)}
                  % relative fail-rate reduction · policy risk_anomaly_v2
                </p>
              ) : null}
            </div>
          </div>
        </Reveal>
      ) : null}

      <Reveal delay={0.1}>
        <div className="panel">
          <div className="panel-inner-core">
            <div className="panel-header">
              <div>
                <h2>Baseline vs ComputePulse AI</h2>
                <p className="panel-sub">Scores in percent</p>
              </div>
            </div>
            <div style={{ width: '100%', height: 340 }}>
              <ResponsiveContainer>
                <BarChart data={data.comparison} barGap={6}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border, #e5e7eb)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="metric"
                    tick={{ fontSize: 12, fill: 'var(--ink-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--ink-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'var(--color-elevated, #f1f3f6)' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar
                    dataKey="baseline"
                    name="Baseline"
                    fill="var(--color-critical, #dc2626)"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="model"
                    name="ComputePulse AI"
                    fill="var(--color-healthy, #059669)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </Reveal>

      <div className="grid-2">
        <Reveal delay={0.2}>
          <div className="panel" style={{ height: '100%' }}>
            <div className="panel-inner-core" style={{ height: '100%' }}>
              <div className="panel-header">
                <div>
                  <h2>Confusion matrix</h2>
                  <p className="panel-sub">Real test set</p>
                </div>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th />
                      <th>Pred. healthy</th>
                      <th>Pred. failure</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Actual healthy</td>
                      <td>{data.confusion.true_negative}</td>
                      <td>{data.confusion.false_positive}</td>
                    </tr>
                    <tr>
                      <td>Actual failure</td>
                      <td>{data.confusion.false_negative}</td>
                      <td>{data.confusion.true_positive}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="caption">
                Real failures caught:{' '}
                <strong style={{ color: 'var(--ink)' }}>
                  {(data.confusion.failures_caught * 100).toFixed(1)}%
                </strong>
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.3}>
          <div className="panel" style={{ height: '100%' }}>
            <div className="panel-inner-core" style={{ height: '100%' }}>
              <div className="panel-header">
                <div>
                  <h2>Global feature importance</h2>
                  <p className="panel-sub">Mean |SHAP| on test data</p>
                </div>
              </div>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={data.feature_importance}
                    layout="vertical"
                    margin={{ left: 8 }}
                  >
                    <defs>
                      <linearGradient
                        id="importanceGradient"
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="0"
                      >
                        <stop
                          offset="0%"
                          stopColor="var(--color-info, #0d9488)"
                          stopOpacity={0.6}
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--color-info, #0d9488)"
                          stopOpacity={1}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border, #e5e7eb)"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: 'var(--ink-muted)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="feature"
                      width={110}
                      tick={{ fontSize: 11, fill: 'var(--ink-muted)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={<ChartTooltip />}
                      cursor={{ fill: 'var(--color-elevated, #f1f3f6)' }}
                    />
                    <Bar
                      dataKey="importance"
                      fill="url(#importanceGradient)"
                      radius={[0, 6, 6, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  )
}

