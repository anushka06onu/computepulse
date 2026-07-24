import { useEffect, useMemo, useState } from 'react'
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

function f1From(precision: number, recall: number) {
  const d = precision + recall
  return d > 0 ? (2 * precision * recall) / d : 0
}

export function EvidencePage() {
  const { health } = useApp()
  const [data, setData] = useState<MetricsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (health?.ready === false) return
    api
      .metrics()
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [health?.ready])

  const chartData = useMemo(() => {
    if (!data) return []
    const b = data.baseline
    const m = data.model
    const modelAuc =
      m.auc || data.eval?.roc_auc || data.cv.auc_mean || 0
    const baselineAuc = b.auc || 0
    const modelF1 = m.f1 || f1From(m.precision, m.recall)
    const baselineF1 = b.f1 || f1From(b.precision, b.recall)

    // Always rebuild so a stale/truncated comparison payload can't zero F1 / ROC-AUC.
    return [
      {
        metric: 'Accuracy',
        baseline: b.accuracy * 100,
        model: m.accuracy * 100,
      },
      {
        metric: 'Precision',
        baseline: b.precision * 100,
        model: m.precision * 100,
      },
      {
        metric: 'Recall',
        baseline: b.recall * 100,
        model: m.recall * 100,
      },
      {
        metric: 'F1',
        baseline: baselineF1 * 100,
        model: modelF1 * 100,
      },
      {
        metric: 'ROC-AUC',
        baseline: baselineAuc * 100,
        model: modelAuc * 100,
      },
    ]
  }, [data])

  if (error) return <p className="banner">{error}</p>
  if (!data) return <div className="skeleton" style={{ height: 240 }} />

  const baselineAcc = data.baseline.accuracy * 100
  const modelAcc = data.model.accuracy * 100
  // Prefer holdout eval ROC-AUC when model_results.auc was missing/truncated.
  const modelAuc = data.model.auc || data.eval?.roc_auc || data.cv.auc_mean || 0
  const baselineAuc = data.baseline.auc || 0
  const aucDelta = modelAuc - baselineAuc
  const modelF1 =
    (data.model.f1 || f1From(data.model.precision, data.model.recall)) * 100
  const baselineF1 =
    (data.baseline.f1 ||
      f1From(data.baseline.precision, data.baseline.recall)) * 100

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            <BarChart3 size={12} /> Validation
          </div>
          <h1>System Accuracy</h1>
          <p>
            Real performance scores from live production data — not
            demo placeholders. Baseline rules and the Failure risk model are
            scored on the same stratified 20% test split.
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
          label="Basic Rules accuracy"
          value={
            <>
              <CountUp end={baselineAcc} decimals={1} />%
            </>
          }
        />
        <KPI
          label="AI Accuracy"
          value={
            <>
              <CountUp end={modelAcc} decimals={1} />%
            </>
          }
          delta={`+${(modelAcc - baselineAcc).toFixed(1)} pts`}
          tone="healthy"
        />
        <KPI
          label="Prediction Confidence"
          value={<CountUp end={modelAuc} decimals={3} />}
          delta={
            baselineAuc > 0
              ? `+${aucDelta.toFixed(3)} vs baseline`
              : data.eval?.roc_auc
                ? 'Holdout eval'
                : undefined
          }
          tone="healthy"
        />
        <KPI
          label="F1 score"
          value={
            <>
              <CountUp end={modelF1} decimals={1} />%
            </>
          }
          delta={`+${(modelF1 - baselineF1).toFixed(1)} pts`}
          tone="healthy"
        />
        <KPI
          label="Reliability Score"
          value={
            <>
              <CountUp end={data.cv.auc_mean} decimals={3} /> ±{' '}
              {data.cv.auc_std.toFixed(3)}
            </>
          }
        />
        <KPI
          label="Precision Score"
          value={<CountUp end={data.eval?.pr_auc ?? 0} decimals={3} />}
          tone="healthy"
        />
        <KPI
          label="Top-5% Caught Failures"
          value={
            <>
              <CountUp end={(data.eval?.top5_recall ?? 0) * 100} decimals={1} />%
            </>
          }
        />
        <KPI
          label="Confidence Error"
          value={<CountUp end={data.eval?.ece ?? 0} decimals={3} />}
        />

      </motion.div>

      {data.fusion || data.placement_lift ? (
        <Reveal delay={0.05}>
          <div className="panel">
            <div className="panel-inner-core">
              <div className="panel-header">
                <div>
                  <h2>Optimization & Savings</h2>
                  <p className="panel-sub">
                    Analysis based on {data.eval?.n_rows?.toLocaleString() ?? '—'} records
                  </p>
                </div>
              </div>
              {data.fusion ? (
                <p>
                  Health Score = Combined Risk ({data.fusion.w_risk}) + Anomalies ({data.fusion.w_anomaly})
                </p>
              ) : null}
              {data.placement_lift ? (
                <p className="caption" style={{ marginBottom: 0 }}>
                  Estimated improvement:{' '}
                  {(data.placement_lift.relative_reduction_vs_risk_only * 100).toFixed(1)}
                  % fewer failures with smart placement
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
                <h2>Basic Rules vs ComputePulse AI</h2>
                <p className="panel-sub">
                  Based on {data.eval?.n_test?.toLocaleString() ?? '—'} test
                  samples of {(data.eval?.n_rows ?? data.provenance?.n_rows)?.toLocaleString() ?? '—'}{' '}
                  total
                </p>
              </div>
            </div>
            <div style={{ width: '100%', height: 340 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} barGap={6}>
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
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: 'var(--ink-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${v}`}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'var(--color-elevated, #f1f3f6)' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar
                    dataKey="baseline"
                    name="Basic Rules"
                    fill="var(--color-critical, #dc2626)"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive
                    animationDuration={700}
                    animationEasing="ease-out"
                  />
                  <Bar
                    dataKey="model"
                    name="ComputePulse AI"
                    fill="var(--color-healthy, #059669)"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive
                    animationBegin={80}
                    animationDuration={700}
                    animationEasing="ease-out"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="caption" style={{ marginTop: 12, marginBottom: 0 }}>
              {data.provenance?.note ??
                data.eval?.provenance ??
                'Scored on the identical holdout split for both bars.'}
            </p>
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
                  <p className="panel-sub">
                    Same holdout test set ({data.eval?.n_test?.toLocaleString() ?? '—'}{' '}
                    rows)
                  </p>
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
                  <p className="panel-sub">Feature Importance (AI Reasons)</p>
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
                      isAnimationActive
                      animationDuration={700}
                      animationEasing="ease-out"
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




