//! Funciones numéricas base: normal estándar y generador aleatorio.

pub const INV_SQRT_2PI: f64 = 0.398_942_280_401_432_7;

/// Densidad de la normal estándar n(x).
#[inline]
pub fn norm_pdf(x: f64) -> f64 {
    INV_SQRT_2PI * (-0.5 * x * x).exp()
}

/// Acumulada de la normal estándar N(x).
/// Algoritmo de Hart (1968) en la forma de West (2005): error < 1e-14 en doble precisión.
pub fn norm_cdf(x: f64) -> f64 {
    let z = x.abs();
    let c = if z > 37.0 {
        0.0
    } else {
        let e = (-z * z / 2.0).exp();
        if z < 7.071_067_811_865_47 {
            let mut n = 3.526_249_659_989_11e-2 * z + 0.700_383_064_443_688;
            n = n * z + 6.373_962_203_531_65;
            n = n * z + 33.912_866_078_383;
            n = n * z + 112.079_291_497_871;
            n = n * z + 221.213_596_169_931;
            n = n * z + 220.206_867_912_376;
            let mut d = 8.838_834_764_831_84e-2 * z + 1.755_667_163_182_64;
            d = d * z + 16.064_177_579_207;
            d = d * z + 86.780_732_202_946_1;
            d = d * z + 296.564_248_779_674;
            d = d * z + 637.333_633_378_831;
            d = d * z + 793.826_512_519_948;
            d = d * z + 440.413_735_824_752;
            e * n / d
        } else {
            let mut b = z + 0.65;
            b = z + 4.0 / b;
            b = z + 3.0 / b;
            b = z + 2.0 / b;
            b = z + 1.0 / b;
            e / b / 2.506_628_274_631
        }
    };
    if x > 0.0 {
        1.0 - c
    } else {
        c
    }
}

/// xorshift64* + Box-Muller. Determinista por semilla para que las simulaciones
/// sean reproducibles entre corridas (y entre equipos que consumen el contrato).
pub struct Rng {
    state: u64,
    spare: Option<f64>,
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        Rng { state: if seed == 0 { 0x9E37_79B9_7F4A_7C15 } else { seed }, spare: None }
    }

    #[inline]
    fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.state = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    /// Uniforme en (0, 1).
    #[inline]
    pub fn uniform(&mut self) -> f64 {
        ((self.next_u64() >> 11) as f64 + 0.5) * (1.0 / (1u64 << 53) as f64)
    }

    /// Normal estándar.
    pub fn normal(&mut self) -> f64 {
        if let Some(z) = self.spare.take() {
            return z;
        }
        let u1 = self.uniform();
        let u2 = self.uniform();
        let r = (-2.0 * u1.ln()).sqrt();
        let theta = 2.0 * core::f64::consts::PI * u2;
        self.spare = Some(r * theta.sin());
        r * theta.cos()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cdf_known_values() {
        assert!((norm_cdf(0.0) - 0.5).abs() < 1e-15);
        assert!((norm_cdf(1.959_963_984_540_054) - 0.975).abs() < 1e-12);
        assert!((norm_cdf(-1.0) - 0.158_655_253_931_457_05).abs() < 1e-13);
    }

    #[test]
    fn rng_moments() {
        let mut rng = Rng::new(42);
        let n = 200_000;
        let (mut s, mut s2) = (0.0, 0.0);
        for _ in 0..n {
            let z = rng.normal();
            s += z;
            s2 += z * z;
        }
        let mean = s / n as f64;
        let var = s2 / n as f64 - mean * mean;
        assert!(mean.abs() < 0.01, "media {mean}");
        assert!((var - 1.0).abs() < 0.01, "varianza {var}");
    }
}
