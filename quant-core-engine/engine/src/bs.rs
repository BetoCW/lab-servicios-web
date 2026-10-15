//! Black-Scholes-Merton (europeas, dividendo continuo q), griegas analíticas y volatilidad implícita.
//!
//! Convenciones de salida (las mismas que publica el contrato @core/quant-engine):
//! - vega: cambio de precio por +1 punto de volatilidad (0.01)
//! - theta: cambio de precio por 1 día calendario (año = 365)
//! - rho: cambio de precio por +1% de tasa (0.01)

use crate::math::{norm_cdf, norm_pdf};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Kind {
    Call,
    Put,
}

impl Kind {
    /// En la frontera FFI: valor > 0 => call, en otro caso put.
    pub fn from_f64(v: f64) -> Kind {
        if v > 0.0 {
            Kind::Call
        } else {
            Kind::Put
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Contract {
    pub kind: Kind,
    pub spot: f64,
    pub strike: f64,
    /// Años al vencimiento.
    pub t: f64,
    pub rate: f64,
    pub div: f64,
    pub vol: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Greeks {
    pub price: f64,
    pub delta: f64,
    pub gamma: f64,
    pub vega: f64,
    pub theta: f64,
    pub rho: f64,
}

/// Solo precio (camino rápido para IV, margen y Monte Carlo).
pub fn price(c: &Contract) -> f64 {
    let df_q = (-c.div * c.t).exp();
    let df_r = (-c.rate * c.t).exp();
    if c.t <= 0.0 || c.vol <= 0.0 {
        // Vencida o sin volatilidad: valor intrínseco del forward descontado.
        let fwd_intrinsic = match c.kind {
            Kind::Call => c.spot * df_q - c.strike * df_r,
            Kind::Put => c.strike * df_r - c.spot * df_q,
        };
        return fwd_intrinsic.max(0.0);
    }
    let sqrt_t = c.t.sqrt();
    let d1 = ((c.spot / c.strike).ln() + (c.rate - c.div + 0.5 * c.vol * c.vol) * c.t) / (c.vol * sqrt_t);
    let d2 = d1 - c.vol * sqrt_t;
    match c.kind {
        Kind::Call => c.spot * df_q * norm_cdf(d1) - c.strike * df_r * norm_cdf(d2),
        Kind::Put => c.strike * df_r * norm_cdf(-d2) - c.spot * df_q * norm_cdf(-d1),
    }
}

/// Precio + griegas analíticas.
pub fn greeks(c: &Contract) -> Greeks {
    if c.t <= 0.0 || c.vol <= 0.0 {
        let p = price(c);
        let itm = match c.kind {
            Kind::Call => c.spot > c.strike,
            Kind::Put => c.spot < c.strike,
        };
        let delta = match (c.kind, itm) {
            (Kind::Call, true) => 1.0,
            (Kind::Put, true) => -1.0,
            _ => 0.0,
        };
        return Greeks { price: p, delta, ..Default::default() };
    }

    let sqrt_t = c.t.sqrt();
    let df_q = (-c.div * c.t).exp();
    let df_r = (-c.rate * c.t).exp();
    let d1 = ((c.spot / c.strike).ln() + (c.rate - c.div + 0.5 * c.vol * c.vol) * c.t) / (c.vol * sqrt_t);
    let d2 = d1 - c.vol * sqrt_t;
    let pdf_d1 = norm_pdf(d1);

    let gamma = df_q * pdf_d1 / (c.spot * c.vol * sqrt_t);
    let vega = c.spot * df_q * pdf_d1 * sqrt_t;
    let theta_common = -c.spot * df_q * pdf_d1 * c.vol / (2.0 * sqrt_t);

    let (price, delta, theta, rho) = match c.kind {
        Kind::Call => {
            let nd1 = norm_cdf(d1);
            let nd2 = norm_cdf(d2);
            (
                c.spot * df_q * nd1 - c.strike * df_r * nd2,
                df_q * nd1,
                theta_common - c.rate * c.strike * df_r * nd2 + c.div * c.spot * df_q * nd1,
                c.strike * c.t * df_r * nd2,
            )
        }
        Kind::Put => {
            let nmd1 = norm_cdf(-d1);
            let nmd2 = norm_cdf(-d2);
            (
                c.strike * df_r * nmd2 - c.spot * df_q * nmd1,
                -df_q * nmd1,
                theta_common + c.rate * c.strike * df_r * nmd2 - c.div * c.spot * df_q * nmd1,
                -c.strike * c.t * df_r * nmd2,
            )
        }
    };

    Greeks { price, delta, gamma, vega: vega / 100.0, theta: theta / 365.0, rho: rho / 100.0 }
}

/// Volatilidad implícita: Newton-Raphson protegido por bisección.
/// Regresa NaN si el precio está fuera de los límites de no-arbitraje.
pub fn implied_vol(kind: Kind, spot: f64, strike: f64, t: f64, rate: f64, div: f64, target: f64) -> f64 {
    if !(target.is_finite() && spot > 0.0 && strike > 0.0 && t > 0.0) {
        return f64::NAN;
    }
    let df_q = (-div * t).exp();
    let df_r = (-rate * t).exp();
    let (lower, upper) = match kind {
        Kind::Call => ((spot * df_q - strike * df_r).max(0.0), spot * df_q),
        Kind::Put => ((strike * df_r - spot * df_q).max(0.0), strike * df_r),
    };
    if target < lower - 1e-12 || target >= upper {
        return f64::NAN;
    }
    if target - lower < 1e-12 {
        return 0.0;
    }

    let mut c = Contract { kind, spot, strike, t, rate, div, vol: 0.0 };
    let (mut lo, mut hi) = (1e-6_f64, 5.0_f64);
    // Semilla de Brenner-Subrahmanyam, acotada al intervalo.
    let mut vol = ((2.0 * core::f64::consts::PI / t).sqrt() * target / spot).clamp(0.05, 2.0);

    for _ in 0..100 {
        c.vol = vol;
        let diff = price(&c) - target;
        if diff.abs() < 1e-10 {
            return vol;
        }
        if diff > 0.0 {
            hi = vol;
        } else {
            lo = vol;
        }
        let sqrt_t = t.sqrt();
        let d1 = ((spot / strike).ln() + (rate - div + 0.5 * vol * vol) * t) / (vol * sqrt_t);
        let vega = spot * df_q * norm_pdf(d1) * sqrt_t;
        let newton = vol - diff / vega;
        // Si Newton se sale del intervalo o la vega es casi cero, se bisecta.
        vol = if vega > 1e-10 && newton > lo && newton < hi { newton } else { 0.5 * (lo + hi) };
        if hi - lo < 1e-12 {
            break;
        }
    }
    vol
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hull() -> Contract {
        // Hull, "Options, Futures and Other Derivatives", ejemplo 15.6
        Contract { kind: Kind::Call, spot: 42.0, strike: 40.0, t: 0.5, rate: 0.10, div: 0.0, vol: 0.20 }
    }

    #[test]
    fn hull_example() {
        let call = price(&hull());
        let put = price(&Contract { kind: Kind::Put, ..hull() });
        assert!((call - 4.7594).abs() < 1e-4, "call {call}");
        assert!((put - 0.8086).abs() < 1e-4, "put {put}");
    }

    #[test]
    fn put_call_parity() {
        let c = Contract { div: 0.03, ..hull() };
        let call = price(&c);
        let put = price(&Contract { kind: Kind::Put, ..c });
        let rhs = c.spot * (-c.div * c.t).exp() - c.strike * (-c.rate * c.t).exp();
        assert!((call - put - rhs).abs() < 1e-12);
    }

    #[test]
    fn greeks_match_finite_differences() {
        for kind in [Kind::Call, Kind::Put] {
            let c = Contract { kind, div: 0.02, ..hull() };
            let g = greeks(&c);
            let h = 1e-4;
            let up = price(&Contract { spot: c.spot + h, ..c });
            let dn = price(&Contract { spot: c.spot - h, ..c });
            assert!((g.delta - (up - dn) / (2.0 * h)).abs() < 1e-6);
            assert!((g.gamma - (up - 2.0 * g.price + dn) / (h * h)).abs() < 1e-4);
            let vu = price(&Contract { vol: c.vol + h, ..c });
            let vd = price(&Contract { vol: c.vol - h, ..c });
            assert!((g.vega - (vu - vd) / (2.0 * h) / 100.0).abs() < 1e-6);
            let ru = price(&Contract { rate: c.rate + h, ..c });
            let rd = price(&Contract { rate: c.rate - h, ..c });
            assert!((g.rho - (ru - rd) / (2.0 * h) / 100.0).abs() < 1e-6);
            let later = price(&Contract { t: c.t - h, ..c });
            let earlier = price(&Contract { t: c.t + h, ..c });
            assert!((g.theta - (later - earlier) / (2.0 * h) / 365.0).abs() < 1e-6);
        }
    }

    #[test]
    fn implied_vol_roundtrip() {
        for kind in [Kind::Call, Kind::Put] {
            for &k in &[20.0, 35.0, 42.0, 50.0, 80.0] {
                for &v in &[0.05, 0.2, 0.6, 1.5] {
                    let c = Contract { kind, strike: k, vol: v, ..hull() };
                    let p = price(&c);
                    let iv = implied_vol(kind, c.spot, k, c.t, c.rate, c.div, p);
                    // Muy OTM con vol baja la vega es ~0 y la IV no es identificable.
                    if greeks(&c).vega > 1e-6 {
                        assert!((iv - v).abs() < 1e-6, "{kind:?} K={k} v={v} iv={iv}");
                    }
                }
            }
        }
    }

    #[test]
    fn implied_vol_rejects_arbitrage() {
        let c = hull();
        assert!(implied_vol(Kind::Call, c.spot, c.strike, c.t, c.rate, 0.0, 0.5).is_nan());
        assert!(implied_vol(Kind::Call, c.spot, c.strike, c.t, c.rate, 0.0, 50.0).is_nan());
    }
}
