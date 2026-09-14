import mongoose from 'mongoose';

// Bitácora de cada alta o cambio: quién y cuándo
const detailRowRegSchema = new mongoose.Schema(
  {
    FechaReg: { type: Date, default: Date.now },
    UsuarioReg: { type: String, required: true },
  },
  { _id: false },
);

// detail_row: control de auditoría que se repite en documentos y subdocumentos.
// Activo/Borrado usan 'S' o 'N' como en los modelos del docente.
export const detailRowSchema = new mongoose.Schema(
  {
    Activo: { type: String, enum: ['S', 'N'], default: 'S' },
    Borrado: { type: String, enum: ['S', 'N'], default: 'N' },
    detail_row_reg: [detailRowRegSchema],
  },
  { _id: false },
);

// Para declarar el campo en cualquier esquema: detail_row: detailRowField
export const detailRowField = { type: detailRowSchema, default: () => ({}) };
