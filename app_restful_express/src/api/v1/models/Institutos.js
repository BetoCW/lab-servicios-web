import * as mongoose from 'mongoose';
import config from '../../../config/config';

// Bitacora de auditoria que el docente pide en todos los documentos del proyecto
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

// Informacion adicional: subdocumento (arreglo de objetos) del instituto
const infoAdicionalSchema = new mongoose.Schema(
  {
    IdEtiqueta: { type: String, required: true },
    Etiqueta: { type: String, required: true },
    Valor: { type: String, default: '' },
    Secuencia: { type: Number, default: 0 },
    detail_row: { type: detailRowSchema, default: () => ({}) },
  },
  { _id: false },
);

// Clase modelo del Catalogo de Institutos
const institutosSchema = new mongoose.Schema(
  {
    IdInstitutoOK: { type: String, required: true, trim: true }, // llave de negocio interna
    IdInstitutoBK: { type: String, required: true, trim: true }, // clave externa (centro de trabajo)
    DesInstituto: { type: String, required: true, trim: true },
    Alias: { type: String, required: false, trim: true, default: '' },
    Matriz: { type: String, required: false, enum: ['S', 'N'], default: 'S' },
    Giro: { type: String, required: false, trim: true, uppercase: true },
    IdInstitutoSupOK: { type: String, required: false, trim: true, default: '' },
    informacion_adicional: { type: [infoAdicionalSchema], default: [] },
    detail_row: { type: detailRowSchema, default: () => ({}) },
  },
  { versionKey: false },
);

// Indices: las dos llaves de negocio no se repiten
institutosSchema.index({ IdInstitutoOK: 1 }, { unique: true });
institutosSchema.index({ IdInstitutoBK: 1 }, { unique: true });
institutosSchema.index({ IdInstitutoSupOK: 1 });

export default mongoose.model('cat_institutos', institutosSchema, config.COLLECTION);
