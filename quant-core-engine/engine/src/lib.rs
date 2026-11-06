//! Quant Core Engine (F0).
//!
//! Frontera FFI pensada para WebAssembly: todas las funciones trabajan sobre lotes
//! (arreglos planos de f64 en la memoria lineal) para que JavaScript cruce la frontera
//! una sola vez por cadena de opciones, no una vez por contrato.
//!
//! Layout de los lotes:
//! - contrato:  [tipo, spot, strike, t, rate, div, vol|precio]   (stride 7, tipo 1=call / -1=put)
//! - griegas:   [price, delta, gamma, vega, theta, rho]          (stride 6)
//! - árbol:     [price, delta, gamma, theta, early_exercise]     (stride 5)
//! - pierna:    [tipo, strike, t, qty, vol, multiplicador]       (stride 6, tipo 0 = acción)

pub mod binomial;
pub mod bs;
pub mod math;
pub mod risk;

use bs::{Contract, Kind};
use core::slice;
use risk::{Leg, LEG_STRIDE};

pub const CONTRACT_STRIDE: usize = 7;
pub const GREEKS_STRIDE: usize = 6;
pub const TREE_STRIDE: usize = 5;

// Offsets en el buffer lineal de 7 elementos por contrato
pub const OFFSET_KIND: usize = 0;
pub const OFFSET_SPOT: usize = 1;
pub const OFFSET_STRIKE: usize = 2;
pub const OFFSET_T: usize = 3;
pub const OFFSET_RATE: usize = 4;
pub const OFFSET_DIV: usize = 5;
pub const OFFSET_PARAM: usize = 6; // Volatilidad para pricing/árbol, o precio para cálculo de IV

fn contract_from(row: &[f64]) -> Contract {
    Contract {
        kind: Kind::from_f64(row[OFFSET_KIND]),
        spot: row[OFFSET_SPOT],
        strike: row[OFFSET_STRIKE],
        t: row[OFFSET_T],
        rate: row[OFFSET_RATE],
        div: row[OFFSET_DIV],
        vol: row[OFFSET_PARAM],
    }
}

unsafe fn legs_from(ptr: *const f64, n: usize) -> Vec<Leg> {
    slice::from_raw_parts(ptr, n * LEG_STRIDE).chunks_exact(LEG_STRIDE).map(Leg::from_slice).collect()
}

// ---------------------------------------------------------------- memoria

/// Reserva `n` f64 en la memoria lineal y regresa el puntero.
#[no_mangle]
pub extern "C" fn qc_alloc(n: usize) -> *mut f64 {
    let mut v = Vec::<f64>::with_capacity(n.max(1));
    let p = v.as_mut_ptr();
    core::mem::forget(v);
    p
}

/// Libera un bloque reservado con `qc_alloc(n)`.
///
/// # Safety
/// `ptr` debe venir de `qc_alloc` con el mismo `n`.
#[no_mangle]
pub unsafe extern "C" fn qc_free(ptr: *mut f64, n: usize) {
    drop(Vec::from_raw_parts(ptr, 0, n.max(1)));
}

/// Versión del ABI (mayor * 100 + menor). Sube cuando cambia un layout.
#[no_mangle]
pub extern "C" fn qc_abi_version() -> u32 {
    100
}

// ---------------------------------------------------------------- pricing

/// Black-Scholes-Merton + griegas para `n` contratos.
///
/// # Safety
/// `inp` apunta a n*7 f64 y `out` a n*6 f64.
#[no_mangle]
pub unsafe extern "C" fn qc_bs_batch(inp: *const f64, n: usize, out: *mut f64) {
    let inp = slice::from_raw_parts(inp, n * CONTRACT_STRIDE);
    let out = slice::from_raw_parts_mut(out, n * GREEKS_STRIDE);
    for (row, out_row) in inp.chunks_exact(CONTRACT_STRIDE).zip(out.chunks_exact_mut(GREEKS_STRIDE)) {
        let g = bs::greeks(&contract_from(row));
        out_row.copy_from_slice(&[g.price, g.delta, g.gamma, g.vega, g.theta, g.rho]);
    }
}

/// Árbol binomial CRR para `n` contratos. `american` != 0 permite ejercicio anticipado.
///
/// # Safety
/// `inp` apunta a n*7 f64 y `out` a n*5 f64.
#[no_mangle]
pub unsafe extern "C" fn qc_binomial_batch(inp: *const f64, n: usize, steps: u32, american: u32, out: *mut f64) {
    let inp = slice::from_raw_parts(inp, n * CONTRACT_STRIDE);
    let out = slice::from_raw_parts_mut(out, n * TREE_STRIDE);
    let mut buf = Vec::with_capacity(steps as usize + 1);
    for (row, out_row) in inp.chunks_exact(CONTRACT_STRIDE).zip(out.chunks_exact_mut(TREE_STRIDE)) {
        let r = binomial::price_tree(&contract_from(row), steps as usize, american != 0, &mut buf);
        out_row.copy_from_slice(&[r.price, r.delta, r.gamma, r.theta, r.early_exercise_premium]);
    }
}

/// Volatilidad implícita para `n` cotizaciones (la columna 6 es el precio observado).
///
/// # Safety
/// `inp` apunta a n*7 f64 y `out` a n f64.
#[no_mangle]
pub unsafe extern "C" fn qc_iv_batch(inp: *const f64, n: usize, out: *mut f64) {
    let inp = slice::from_raw_parts(inp, n * CONTRACT_STRIDE);
    let out = slice::from_raw_parts_mut(out, n);
    for (row, out_iv) in inp.chunks_exact(CONTRACT_STRIDE).zip(out.iter_mut()) {
        *out_iv = bs::implied_vol(
            Kind::from_f64(row[OFFSET_KIND]),
            row[OFFSET_SPOT],
            row[OFFSET_STRIKE],
            row[OFFSET_T],
            row[OFFSET_RATE],
            row[OFFSET_DIV],
            row[OFFSET_PARAM],
        );
    }
}

// ---------------------------------------------------------------- riesgo

/// # Safety
/// `out` debe tener num_spot_shocks * num_vol_shocks posiciones.
#[no_mangle]
pub unsafe extern "C" fn qc_pnl_matrix(
    legs: *const f64, n_legs: usize, spot: f64, rate: f64, div: f64, horizon: f64,
    spot_shocks: *const f64, num_spot_shocks: usize, vol_shocks: *const f64, num_vol_shocks: usize, out: *mut f64,
) {
    let legs = legs_from(legs, n_legs);
    risk::pnl_matrix(
        &legs, spot, rate, div, horizon,
        slice::from_raw_parts(spot_shocks, num_spot_shocks),
        slice::from_raw_parts(vol_shocks, num_vol_shocks),
        slice::from_raw_parts_mut(out, num_spot_shocks * num_vol_shocks),
    );
}

/// # Safety
/// `out` debe tener `out_len` >= risk::MC_STATS posiciones (9 estadísticas + histograma).
#[no_mangle]
pub unsafe extern "C" fn qc_monte_carlo(
    legs: *const f64, n_legs: usize, spot: f64, rate: f64, div: f64, underlying_vol: f64,
    horizon: f64, paths: u32, seed: f64, out: *mut f64, out_len: usize,
) {
    let legs = legs_from(legs, n_legs);
    risk::monte_carlo(&legs, spot, rate, div, underlying_vol, horizon, paths as usize, seed as u64, slice::from_raw_parts_mut(out, out_len));
}

/// Regresa el margen total; `out` recibe el requerimiento por pierna.
///
/// # Safety
/// `out` debe tener `n_legs` posiciones.
#[no_mangle]
pub unsafe extern "C" fn qc_reg_t(legs: *const f64, n_legs: usize, spot: f64, rate: f64, div: f64, out: *mut f64) -> f64 {
    let legs = legs_from(legs, n_legs);
    risk::reg_t(&legs, spot, rate, div, slice::from_raw_parts_mut(out, n_legs))
}

/// Regresa el margen; `out` recibe [margen, scan_risk, som, peor] + 16 pérdidas.
///
/// # Safety
/// `out` debe tener 20 posiciones.
#[no_mangle]
pub unsafe extern "C" fn qc_span(
    legs: *const f64, n_legs: usize, spot: f64, rate: f64, div: f64,
    price_scan: f64, vol_scan: f64, som_per_contract: f64, out: *mut f64,
) -> f64 {
    let legs = legs_from(legs, n_legs);
    risk::span(&legs, spot, rate, div, price_scan, vol_scan, som_per_contract, slice::from_raw_parts_mut(out, risk::SPAN_HEADER + risk::SPAN_SCENARIOS.len()))
}
