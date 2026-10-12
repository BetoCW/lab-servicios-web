import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import config from '../../../../config/config';

// ---------------------------------------------------------------------------
// CLASE MODELO (MongoDB): coleccion catalogs. Un documento = un catalogo
// completo con su subdocumento values[] embebido (maestro-detalle-detalle).
// Los campos ya estan en camelCase: es el mismo contrato que devuelve la API.
// ---------------------------------------------------------------------------

// Subdocumento: un valor del catalogo. parentId arma los N niveles.
const valueSchema = new mongoose.Schema(
  {
    id: { type: String, default: randomUUID }, // uuid, igual que en Supabase
    parentId: { type: String, default: null }, // null = nivel 1
    code: { type: String, required: true, trim: true }, // UPPER_SNAKE: 'VEH_PICKUP'
    value: { type: String, required: true, trim: true }, // 'Pick-Up'
    alias: { type: String, trim: true, default: null },
    sequence: { type: Number, required: true, default: 0 },
    imageUrl: { type: String, default: null },
    description: { type: String, default: null },
    active: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { _id: false, timestamps: true },
);

// Documento raiz: definicion del catalogo (maestro)
const catalogSchema = new mongoose.Schema(
  {
    _id: { type: String, default: randomUUID },
    key: { type: String, required: true, trim: true }, // snake_case: 'vehicle_type'
    label: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    collection: { type: String, required: true, trim: true }, // dominio: 'config'
    section: { type: String, default: null },
    sequence: { type: Number, default: 0 },
    imageUrl: { type: String, default: null },
    route: { type: String, default: null }, // kebab-case: '/config/vehicle-type'
    active: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
    values: { type: [valueSchema], default: [] },
  },
  {
    timestamps: true,
    versionKey: false,
    suppressReservedKeysWarning: true, // "collection" es un campo del contrato
  },
);

// Indices del diseno (mon-1 ... mon-4)
catalogSchema.index({ key: 1 }, { unique: true });
catalogSchema.index({ 'values.parentId': 1 });
catalogSchema.index({ key: 1, 'values.code': 1 }, { unique: true });
catalogSchema.index({ key: 1, 'values.sequence': 1 });

export default mongoose.model('catalogs', catalogSchema, config.CATALOGS_COLLECTION);
