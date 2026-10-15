//! Árbol binomial de Cox-Ross-Rubinstein para opciones americanas (y europeas).
//! Las griegas delta, gamma y theta salen de los primeros nodos del árbol.

use crate::bs::{Contract, Kind};

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct TreeResult {
    pub price: f64,
    pub delta: f64,
    pub gamma: f64,
    /// Por día calendario.
    pub theta: f64,
    /// Precio americano - precio europeo con el mismo árbol.
    pub early_exercise_premium: f64,
}

#[inline]
fn payoff(kind: Kind, s: f64, k: f64) -> f64 {
    match kind {
        Kind::Call => (s - k).max(0.0),
        Kind::Put => (k - s).max(0.0),
    }
}

/// Recorre el árbol hacia atrás. `buf` se reutiliza entre llamadas del lote para no
/// pedir memoria por contrato. Regresa (v0, [v1_down, v1_up], [v2_dd, v2_ud, v2_uu]).
fn roll_back(c: &Contract, steps: usize, american: bool, buf: &mut Vec<f64>) -> (f64, [f64; 2], [f64; 3]) {
    let dt = c.t / steps as f64;
    let u = (c.vol * dt.sqrt()).exp();
    let d = 1.0 / u;
    let growth = ((c.rate - c.div) * dt).exp();
    let p = ((growth - d) / (u - d)).clamp(0.0, 1.0);
    let disc = (-c.rate * dt).exp();
    let (pu, pd) = (disc * p, disc * (1.0 - p));

    buf.clear();
    // Nodo j en el paso n: S * u^j * d^(n-j) = S * u^(2j - n)
    let mut s = c.spot * d.powi(steps as i32);
    let u2 = u * u;
    for _ in 0..=steps {
        buf.push(payoff(c.kind, s, c.strike));
        s *= u2;
    }

    let mut level2 = [0.0; 3];
    let mut level1 = [0.0; 2];
    for n in (0..steps).rev() {
        let mut s = c.spot * d.powi(n as i32);
        for j in 0..=n {
            let cont = pu * buf[j + 1] + pd * buf[j];
            buf[j] = if american { cont.max(payoff(c.kind, s, c.strike)) } else { cont };
            s *= u2;
        }
        if n == 2 {
            level2 = [buf[0], buf[1], buf[2]];
        } else if n == 1 {
            level1 = [buf[0], buf[1]];
        }
    }
    (buf[0], level1, level2)
}

pub fn price_tree(c: &Contract, steps: usize, american: bool, buf: &mut Vec<f64>) -> TreeResult {
    let steps = steps.clamp(3, 20_000);
    if c.t <= 0.0 || c.vol <= 0.0 {
        let p = payoff(c.kind, c.spot, c.strike);
        return TreeResult { price: p, ..Default::default() };
    }

    let (v0, v1, v2) = roll_back(c, steps, american, buf);
    let dt = c.t / steps as f64;
    let u = (c.vol * dt.sqrt()).exp();
    let d = 1.0 / u;

    let (s_d, s_u) = (c.spot * d, c.spot * u);
    let delta = (v1[1] - v1[0]) / (s_u - s_d);
    let (s_dd, s_uu) = (c.spot * d * d, c.spot * u * u);
    let delta_up = (v2[2] - v2[1]) / (s_uu - c.spot);
    let delta_dn = (v2[1] - v2[0]) / (c.spot - s_dd);
    let gamma = (delta_up - delta_dn) / (0.5 * (s_uu - s_dd));
    // El nodo central del paso 2 tiene el mismo spot que la raíz, 2*dt después.
    let theta = (v2[1] - v0) / (2.0 * dt) / 365.0;

    let early_exercise_premium = if american {
        let (euro, _, _) = roll_back(c, steps, false, buf);
        (v0 - euro).max(0.0)
    } else {
        0.0
    };

    TreeResult { price: v0, delta, gamma, theta, early_exercise_premium }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bs;

    #[test]
    fn european_tree_converges_to_black_scholes() {
        let c = Contract { kind: Kind::Put, spot: 50.0, strike: 52.0, t: 2.0, rate: 0.05, div: 0.0, vol: 0.30 };
        let mut buf = Vec::new();
        let tree = price_tree(&c, 2000, false, &mut buf);
        assert!((tree.price - bs::price(&c)).abs() < 5e-3, "{}", tree.price);
    }

    #[test]
    fn american_put_hull_example() {
        // Hull ejemplo 21.1: put americana S=50 K=50 r=10% σ=40% T=5 meses -> ≈ 4.28
        let c = Contract { kind: Kind::Put, spot: 50.0, strike: 50.0, t: 5.0 / 12.0, rate: 0.10, div: 0.0, vol: 0.40 };
        let mut buf = Vec::new();
        let r = price_tree(&c, 5000, true, &mut buf);
        assert!((r.price - 4.28).abs() < 0.01, "{}", r.price);
        assert!(r.early_exercise_premium > 0.0);
    }

    #[test]
    fn american_call_without_dividends_equals_european() {
        let c = Contract { kind: Kind::Call, spot: 100.0, strike: 95.0, t: 1.0, rate: 0.05, div: 0.0, vol: 0.25 };
        let mut buf = Vec::new();
        let r = price_tree(&c, 500, true, &mut buf);
        assert!(r.early_exercise_premium < 1e-9);
        let g = bs::greeks(&c);
        assert!((r.delta - g.delta).abs() < 5e-3);
        assert!((r.gamma - g.gamma).abs() < 5e-4);
        assert!((r.theta - g.theta).abs() < 5e-3);
    }
}
