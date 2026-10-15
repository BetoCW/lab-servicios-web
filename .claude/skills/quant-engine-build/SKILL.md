---
name: quant-engine-build
description: Compilar el motor Rust a WebAssembly, copiar el .wasm a @core/quant-engine y correr las pruebas Rust y JS. Úsala al tocar quant-core-engine/engine o packages/quant-engine.
---

# Build y pruebas del Quant Core Engine

Estado: preparado (aún no lo consumen las APIs).

```bash
# 1. Pruebas nativas (14): Hull, paridad, griegas vs. diferencias finitas, IV, binomial, riesgo
cd quant-core-engine/engine && cargo test --release

# 2. WASM + copia al paquete + pruebas JS (4)
cd ../packages/quant-engine && npm run build && npm test
```

Requiere el target: `rustup target add wasm32-unknown-unknown`.

Comprobar que el .wasm sigue sin imports (necesario para la carga síncrona):
```bash
node -e 'const m=new WebAssembly.Module(require("fs").readFileSync("quant_core.wasm"));console.log(WebAssembly.Module.imports(m))'   # []
```

Si cambias un layout FFI (`engine/src/lib.rs`), sube `qc_abi_version()` y actualiza
`packages/quant-engine/index.js` y `openspec/specs/quant-engine/spec.md`. Pide revisión al agente `quant-math-reviewer`.
