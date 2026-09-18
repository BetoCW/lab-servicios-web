const mongoose = require('mongoose');
const config = require('../config/config');

// Bitacora de auditoria
const detailRowSchema = new mongoose.Schema(
  {
    FechaReg: { type: Date, default: Date.now },
    UsuarioReg: { type: String, default: 'system' },
    FechaUltMod: { type: Date, default: Date.now },
    UsuarioMod: { type: String, default: 'system' },
    Activo: { type: String, enum: ['S', 'N'], default: 'S' },
    Borrado: { type: String, enum: ['S', 'N'], default: 'N' },
  },
  { _id: false },
);

// Subdocumento de etiquetas libres
const infoAdicionalSchema = new mongoose.Schema(
  {
    IdEtiqueta: { type: String, required: true },
    Etiqueta: { type: String, required: true },
    Valor: { type: String, default: '' },
    Secuencia: { type: Number, default: 0 },
  },
  { _id: false },
);

// El esquema refleja exactamente la entidad Institutos declarada en db/schema.cds
const institutosSchema = new mongoose.Schema(
  {
    IdInstitutoOK: { type: String, required: true, trim: true },
    IdInstitutoBK: { type: String, required: true, trim: true },
    DesInstituto: { type: String, required: true, trim: true },
    Alias: { type: String, default: '', trim: true },
    Matriz: { type: String, enum: ['S', 'N'], default: 'S' },
    Giro: { type: String, trim: true, uppercase: true },
    IdInstitutoSupOK: { type: String, default: '', trim: true },
    informacion_adicional: { type: [infoAdicionalSchema], default: [] },
    detail_row: { type: detailRowSchema, default: () => ({}) },
  },
  { versionKey: false },
);

institutosSchema.index({ IdInstitutoOK: 1 }, { unique: true });
institutosSchema.index({ IdInstitutoBK: 1 }, { unique: true });
institutosSchema.index({ IdInstitutoSupOK: 1 });

module.exports = mongoose.model('cat_institutos', institutosSchema, config.COLLECTION);
