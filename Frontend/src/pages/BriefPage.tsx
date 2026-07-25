import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { pageVariants } from '../motion/presets'
import { DailyActionBrief } from '../components/DailyActionBrief'

export function BriefPage() {
  return (
    <motion.div
      className="page"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <DailyActionBrief />

      <div className="dab-model-strip" aria-label="Open model panels">
        <Link to="/app/fleet" className="dab-model-tile">
          <span className="dab-model-num">Model 1</span>
          <span className="dab-model-name">Failure Risk</span>
          <span className="dab-model-desc">Fleet health & node scores</span>
        </Link>
        <Link to="/app/placement" className="dab-model-tile">
          <span className="dab-model-num">Model 2</span>
          <span className="dab-model-name">Job Placement</span>
          <span className="dab-model-desc">Recommend / avoid hosts</span>
        </Link>
        <Link to="/app/optimize" className="dab-model-tile">
          <span className="dab-model-num">Model 3</span>
          <span className="dab-model-name">Idle GPU Savings</span>
          <span className="dab-model-desc">Reclaim underutilized capacity</span>
        </Link>
      </div>
    </motion.div>
  )
}
