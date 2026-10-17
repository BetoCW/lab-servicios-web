//! Riesgo de portafolio: matriz de P&L por escenarios, simulación Monte Carlo,
//! margen Reg T (por pierna, estilo CBOE) y margen estilo SPAN (16 escenarios).
//!
//! Las opciones se revalúan con Black-Scholes (aproximación europea), que es lo que
//! hacen también los arreglos de riesgo SPAN de las cámaras de compensación.

use crate::bs::{self, Contract, Kind};
use crate::math::Rng;

/// Pierna de portafolio. En FFI son 6 f64: [tipo, strike, t, qty, vol, multiplicador]
/// tipo: 1 = call, -1 = put, 0 = acción/subyacente.
#[derive(Clone, Copy, Debug)]
pub struct Leg {
    pub kind: f64,
    pub strike: f64,
    pub t: f64,
    /// Con signo: positivo = largo, negativo = corto.
    pub qty: f64,
    pub vol: f64,
    pub multiplier: f64,
}

pub const LEG_STRIDE: usize = 6;

impl Leg {
    pub fn from_slice(s: &[f64]) -> Leg {
        Leg { kind: s[0], strike: s[1], t: s[2], qty: s[3], vol: s[4], multiplier: s[5] }
    }

    fn is_stock(&self) -> bool {
        self.kind == 0.0
    }

    /// Valor unitario (sin qty ni multiplicador) bajo un escenario.
    fn unit_value(&self, spot: f64, rate: f64, div: f64, vol_shift: f64, dt: f64) -> f64 {
        if self.is_stock() {
            return spot;
        }
        bs::price(&Contract {
            kind: Kind::from_f64(self.kind),
            spot,
            strike: self.strike,
            t: (self.t - dt).max(0.0),
            rate,
            div,
            vol: (self.vol + vol_shift).max(1e-4),
        })
    }

    fn value(&self, spot: f64, rate: f64, div: f64, vol_shift: f64, dt: f64) -> f64 {
        self.qty * self.multiplier * self.unit_value(spot, rate, div, vol_shift, dt)
    }
}

pub fn portfolio_value(legs: &[Leg], spot: f64, rate: f64, div: f64, vol_shift: f64, dt: f64) -> f64 {
    legs.iter().map(|l| l.value(spot, rate, div, vol_shift, dt)).sum()
}

/// Matriz de P&L: filas = choques de spot (relativos), columnas = choques de vol (absolutos).
/// `out` debe tener spot_shocks.len() * vol_shocks.len() posiciones (row-major).
pub fn pnl_matrix(legs: &[Leg], spot: f64, rate: f64, div: f64, horizon_years: f64, spot_shocks: &[f64], vol_shocks: &[f64], out: &mut [f64]) {
    let base = portfolio_value(legs, spot, rate, div, 0.0, 0.0);
    for (i, ds) in spot_shocks.iter().enumerate() {
        let s = spot * (1.0 + ds);
        for (j, dv) in vol_shocks.iter().enumerate() {
            out[i * vol_shocks.len() + j] = portfolio_value(legs, s, rate, div, *dv, horizon_years) - base;
        }
    }
}

/// Estadísticas que regresa Monte Carlo (en este orden en `out`).
pub const MC_STATS: usize = 9;
// [media, desv_std, VaR95, CVaR95, VaR99, prob_ganancia, min, max, valor_base]

/// Simula el subyacente con movimiento browniano geométrico hasta el horizonte y revalúa.
/// Usa variables antitéticas. `out` = MC_STATS + bins (histograma de P&L entre min y max).
pub fn monte_carlo(legs: &[Leg], spot: f64, rate: f64, div: f64, underlying_vol: f64, horizon_years: f64, paths: usize, seed: u64, out: &mut [f64]) {
    let paths = paths.max(2) & !1; // par, por las antitéticas
    let bins = out.len().saturating_sub(MC_STATS);
    let base = portfolio_value(legs, spot, rate, div, 0.0, 0.0);
    let drift = (rate - div - 0.5 * underlying_vol * underlying_vol) * horizon_years;
    let diffusion = underlying_vol * horizon_years.sqrt();

    let mut rng = Rng::new(seed);
    let mut pnl = Vec::with_capacity(paths);
    for _ in 0..paths / 2 {
        let z = rng.normal();
        for zz in [z, -z] {
            let s = spot * (drift + diffusion * zz).exp();
            pnl.push(portfolio_value(legs, s, rate, div, 0.0, horizon_years) - base);
        }
    }

    let n = pnl.len() as f64;
    let mean = pnl.iter().sum::<f64>() / n;
    let var = pnl.iter().map(|x| (x - mean) * (x - mean)).sum::<f64>() / (n - 1.0);
    let wins = pnl.iter().filter(|x| **x > 0.0).count() as f64 / n;

    pnl.sort_by(|a, b| a.partial_cmp(b).unwrap_or(core::cmp::Ordering::Equal));
    let idx95 = ((0.05 * n) as usize).min(pnl.len() - 1);
    let idx99 = ((0.01 * n) as usize).min(pnl.len() - 1);
    let var95 = -pnl[idx95];
    let cvar95 = -pnl[..=idx95].iter().sum::<f64>() / (idx95 + 1) as f64;
    let var99 = -pnl[idx99];
    let (min, max) = (pnl[0], pnl[pnl.len() - 1]);

    out[..MC_STATS].copy_from_slice(&[mean, var.sqrt(), var95, cvar95, var99, wins, min, max, base]);

    if bins > 0 {
        let hist = &mut out[MC_STATS..];
        hist.iter_mut().for_each(|h| *h = 0.0);
        let width = (max - min) / bins as f64;
        for x in &pnl {
            let b = if width > 0.0 { (((x - min) / width) as usize).min(bins - 1) } else { 0 };
            hist[b] += 1.0;
        }
    }
}

/// Margen Reg T por pierna (reglas de margen de CBOE).
/// - Largas: prima completa. Acción: 50%.
/// - Cortas cubiertas por una larga del mismo tipo que vence igual o después (spread vertical):
///   ancho entre strikes (0 si es de débito) menos la prima recibida. Así el total del spread
///   es su pérdida máxima: el débito neto, o el ancho menos el crédito.
/// - Cortas sin cubrir: fórmula de opción descubierta.
///
/// `out` recibe el requerimiento de cada pierna; regresa el total.
pub fn reg_t(legs: &[Leg], spot: f64, rate: f64, div: f64, out: &mut [f64]) -> f64 {
    // Unidades largas aún disponibles para cubrir cortas.
    let mut free: Vec<f64> = legs.iter().map(|l| if !l.is_stock() && l.qty > 0.0 { l.qty * l.multiplier } else { 0.0 }).collect();
    let mut total = 0.0;
    for (i, l) in legs.iter().enumerate() {
        let units = l.qty.abs() * l.multiplier;
        let req = if l.is_stock() {
            0.5 * spot * units
        } else if l.qty > 0.0 {
            l.unit_value(spot, rate, div, 0.0, 0.0) * units
        } else {
            let kind = Kind::from_f64(l.kind);
            let premium = l.unit_value(spot, rate, div, 0.0, 0.0);
            let mut uncovered = units;
            let mut req = 0.0;
            // Primero las largas que dejan el spread en débito (requerimiento 0), luego las de crédito.
            let mut candidates: Vec<usize> = (0..legs.len())
                .filter(|&j| free[j] > 0.0 && legs[j].kind == l.kind && legs[j].t >= l.t - 1e-9)
                .collect();
            let width = |j: usize| match kind {
                Kind::Call => (legs[j].strike - l.strike).max(0.0),
                Kind::Put => (l.strike - legs[j].strike).max(0.0),
            };
            candidates.sort_by(|&a, &b| width(a).partial_cmp(&width(b)).unwrap_or(core::cmp::Ordering::Equal));
            for j in candidates {
                if uncovered <= 0.0 {
                    break;
                }
                let used = free[j].min(uncovered);
                free[j] -= used;
                uncovered -= used;
                req += (width(j) - premium) * used;
            }
            if uncovered > 0.0 {
                let per_unit = match kind {
                    Kind::Call => premium + (0.20 * spot - (l.strike - spot).max(0.0)).max(0.10 * spot),
                    Kind::Put => premium + (0.20 * spot - (spot - l.strike).max(0.0)).max(0.10 * l.strike),
                };
                req += per_unit * uncovered;
            }
            req
        };
        out[i] = req;
        total += req;
    }
    total
}

/// Escenarios SPAN estándar: (fracción del rango de precio, dirección de vol, peso).
pub const SPAN_SCENARIOS: [(f64, f64, f64); 16] = [
    (0.0, 1.0, 1.0),
    (0.0, -1.0, 1.0),
    (1.0 / 3.0, 1.0, 1.0),
    (1.0 / 3.0, -1.0, 1.0),
    (-1.0 / 3.0, 1.0, 1.0),
    (-1.0 / 3.0, -1.0, 1.0),
    (2.0 / 3.0, 1.0, 1.0),
    (2.0 / 3.0, -1.0, 1.0),
    (-2.0 / 3.0, 1.0, 1.0),
    (-2.0 / 3.0, -1.0, 1.0),
    (1.0, 1.0, 1.0),
    (1.0, -1.0, 1.0),
    (-1.0, 1.0, 1.0),
    (-1.0, -1.0, 1.0),
    (2.0, 0.0, 0.35),
    (-2.0, 0.0, 0.35),
];

/// Salida SPAN: [margen, scan_risk, short_option_minimum, escenario_peor] + 16 pérdidas.
pub const SPAN_HEADER: usize = 4;

pub fn span(legs: &[Leg], spot: f64, rate: f64, div: f64, price_scan: f64, vol_scan: f64, som_per_contract: f64, out: &mut [f64]) -> f64 {
    let base = portfolio_value(legs, spot, rate, div, 0.0, 0.0);
    let one_day = 1.0 / 365.0;
    let (mut scan_risk, mut worst) = (0.0_f64, 0usize);
    for (i, (dp, dv, w)) in SPAN_SCENARIOS.iter().enumerate() {
        let s = spot * (1.0 + dp * price_scan);
        let loss = (base - portfolio_value(legs, s, rate, div, dv * vol_scan, one_day)) * w;
        out[SPAN_HEADER + i] = loss;
        if loss > scan_risk {
            scan_risk = loss;
            worst = i;
        }
    }
    let short_contracts: f64 = legs.iter().filter(|l| !l.is_stock() && l.qty < 0.0).map(|l| -l.qty).sum();
    let som = short_contracts * som_per_contract;
    let margin = scan_risk.max(som);
    out[..SPAN_HEADER].copy_from_slice(&[margin, scan_risk, som, worst as f64]);
    margin
}

#[cfg(test)]
mod tests {
    use super::*;

    fn short_strangle() -> Vec<Leg> {
        vec![
            Leg { kind: 1.0, strike: 110.0, t: 30.0 / 365.0, qty: -1.0, vol: 0.25, multiplier: 100.0 },
            Leg { kind: -1.0, strike: 90.0, t: 30.0 / 365.0, qty: -1.0, vol: 0.25, multiplier: 100.0 },
        ]
    }

    #[test]
    fn pnl_matrix_center_is_theta_only() {
        let legs = short_strangle();
        let mut out = vec![0.0; 9];
        pnl_matrix(&legs, 100.0, 0.05, 0.0, 0.0, &[-0.1, 0.0, 0.1], &[-0.05, 0.0, 0.05], &mut out);
        assert!(out[4].abs() < 1e-9, "centro sin choque debe ser 0");
        assert!(out[0] < 0.0 && out[8] < 0.0, "un strangle corto pierde en movimientos grandes");
    }

    #[test]
    fn monte_carlo_short_strangle_has_positive_mean_but_fat_left_tail() {
        let legs = short_strangle();
        let mut out = vec![0.0; MC_STATS + 20];
        monte_carlo(&legs, 100.0, 0.05, 0.0, 0.25, 30.0 / 365.0, 20_000, 7, &mut out);
        let (var95, prob) = (out[2], out[5]);
        assert!(var95 > 0.0);
        assert!(prob > 0.5, "prob ganancia {prob}");
        let total: f64 = out[MC_STATS..].iter().sum();
        assert_eq!(total, 20_000.0);
    }

    #[test]
    fn reg_t_naked_put() {
        // Put corta K=90, S=100: 0.20*100 - 10 = 10 ; 0.10*90 = 9 -> max = 10 + prima
        let legs = [Leg { kind: -1.0, strike: 90.0, t: 30.0 / 365.0, qty: -2.0, vol: 0.25, multiplier: 100.0 }];
        let mut out = [0.0];
        let total = reg_t(&legs, 100.0, 0.05, 0.0, &mut out);
        let premium = legs[0].unit_value(100.0, 0.05, 0.0, 0.0, 0.0);
        assert!((total - (premium + 10.0) * 200.0).abs() < 1e-9);
    }

    #[test]
    fn reg_t_recognizes_vertical_spreads() {
        let t = 30.0 / 365.0;
        let long = |strike| Leg { kind: 1.0, strike, t, qty: 1.0, vol: 0.2, multiplier: 100.0 };
        let short = |strike| Leg { kind: 1.0, strike, t, qty: -1.0, vol: 0.2, multiplier: 100.0 };
        let mut out = [0.0; 2];

        let prem = |l: &Leg| l.unit_value(100.0, 0.05, 0.0, 0.0, 0.0);

        // Bull call spread (débito): requerimiento = débito neto = pérdida máxima.
        let debit = [long(100.0), short(105.0)];
        let total = reg_t(&debit, 100.0, 0.05, 0.0, &mut out);
        assert!((total - (prem(&debit[0]) - prem(&debit[1])) * 100.0).abs() < 1e-9);

        // Bear call spread (crédito): ancho - crédito = pérdida máxima.
        let credit = [long(110.0), short(105.0)];
        let total = reg_t(&credit, 100.0, 0.05, 0.0, &mut out);
        assert!((total - (5.0 - prem(&credit[1]) + prem(&credit[0])) * 100.0).abs() < 1e-9);

        // Una larga que vence antes no cubre a la corta.
        let calendar = [Leg { t: t / 2.0, ..long(100.0) }, short(105.0)];
        reg_t(&calendar, 100.0, 0.05, 0.0, &mut out);
        assert!(out[1] > 1000.0);
    }

    #[test]
    fn span_covers_worst_scenario() {
        let legs = short_strangle();
        let mut out = vec![0.0; SPAN_HEADER + 16];
        let m = span(&legs, 100.0, 0.05, 0.0, 0.15, 0.05, 50.0, &mut out);
        let max_loss = out[SPAN_HEADER..].iter().cloned().fold(f64::MIN, f64::max);
        assert!((m - max_loss.max(100.0)).abs() < 1e-9);
        assert!(m > 0.0);
    }
}
