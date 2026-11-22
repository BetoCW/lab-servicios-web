import mongoose from 'mongoose';
import { isSupabaseOn, getPool } from '../config/supabase.config';

// /health: el proceso esta vivo (liveness). /ready: las bases responden (readiness).
export const health = (req, res) => res.json({
  status: 'ok',
  service: 'app_restful_express',
  uptime_s: Math.round(process.uptime()),
  timestamp: new Date().toISOString(),
});

export const ready = async (req, res) => {
  const checks = { mongodb: 'down', supabase: 'off' };
  checks.mongodb = mongoose.connection.readyState === 1 ? 'up' : 'down';
  if (isSupabaseOn()) {
    try {
      await getPool().query('SELECT 1');
      checks.supabase = 'up';
    } catch (e) {
      checks.supabase = 'down';
    }
  }
  const ok = checks.mongodb === 'up' && checks.supabase !== 'down';
  res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'degraded', checks });
};
