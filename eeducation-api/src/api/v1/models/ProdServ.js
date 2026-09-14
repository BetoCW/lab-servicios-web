import mongoose from 'mongoose';
import { detailRowField } from './detailRow';

// Historial de estatus: solo uno tiene Actual = 'S'
const estatusSchema = new mongoose.Schema(
  {
    IdTipoEstatusOK: { type: String, required: true, uppercase: true, trim: true }, // catálogo prod_serv_status
    Actual: { type: String, enum: ['S', 'N'], default: 'S' },
    Observacion: { type: String, trim: true, default: '' },
    detail_row: detailRowField,
  },
  { _id: false },
);

// Información adicional clave-valor; la etiqueta sale del catálogo de catálogos
const infoAdSchema = new mongoose.Schema(
  {
    IdEtiquetaOK: { type: String, required: true, trim: true }, // key de un catálogo, ej. 'education_levels'
    Etiqueta: { type: String, trim: true, default: '' },
    Valor: { type: String, required: true, trim: true },
    Secuencia: { type: Number, default: 1 },
    detail_row: detailRowField,
  },
  { _id: false },
);

// Archivos (imágenes, PDF, video) de una presentación
const archivoSchema = new mongoose.Schema(
  {
    IdArchivoOK: { type: String, required: true, trim: true },
    IdTipoArchivoOK: { type: String, required: true, uppercase: true, trim: true }, // catálogo file_type
    DesArchivo: { type: String, trim: true, default: '' },
    RutaArchivo: { type: String, required: true, trim: true },
    Principal: { type: String, enum: ['S', 'N'], default: 'N' },
    Secuencia: { type: Number, default: 1 },
    detail_row: detailRowField,
  },
  { _id: false },
);

// Presentaciones: variantes vendibles del mismo producto/servicio
const presentaSchema = new mongoose.Schema(
  {
    IdPresentaOK: { type: String, required: true, trim: true },
    IdPresentaBK: { type: String, trim: true, default: '' },
    CodigoBarras: { type: String, trim: true, default: '' },
    DesPresenta: { type: String, required: true, trim: true },
    Precio: { type: Number, min: 0, default: 0 },
    Principal: { type: String, enum: ['S', 'N'], default: 'N' },
    Indice: { type: String, trim: true, default: '' },
    cat_prod_serv_archivos: [archivoSchema],
    detail_row: detailRowField,
  },
  { _id: false },
);

const prodServSchema = new mongoose.Schema(
  {
    IdInstitutoOK: { type: String, required: true, trim: true }, // referencia a Institutos
    IdProdServOK: { type: String, required: true, trim: true },
    IdProdServBK: { type: String, trim: true, default: '' },
    CodigoBarras: { type: String, trim: true, default: '' },
    DesProdServ: { type: String, required: true, trim: true },
    IdTipoProdServOK: { type: String, uppercase: true, trim: true }, // catálogo prod_serv_type
    Indice: { type: String, trim: true, default: '' }, // palabras clave para búsquedas
    cat_prod_serv_estatus: [estatusSchema],
    cat_prod_serv_info_ad: [infoAdSchema],
    cat_prod_serv_presenta: [presentaSchema],
    detail_row: detailRowField,
  },
  { versionKey: false },
);

prodServSchema.index({ IdProdServOK: 1 }, { unique: true });
prodServSchema.index({ IdInstitutoOK: 1 });
prodServSchema.index({ 'cat_prod_serv_presenta.IdPresentaOK': 1 });
prodServSchema.index({ Indice: 'text', DesProdServ: 'text' }, { default_language: 'spanish' });

export default mongoose.model('ProdServ', prodServSchema, 'ProdServ');
