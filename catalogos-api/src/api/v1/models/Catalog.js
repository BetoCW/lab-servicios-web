import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// Subdocumento: un valor dentro del catálogo (values[])
const valueSchema = new mongoose.Schema(
  {
    id: { type: String, default: uuidv4 },
    parentId: { type: String, default: null }, // null = nivel 1
    code: { type: String, required: true, uppercase: true, trim: true }, // 'VEH_PICKUP'
    value: { type: String, required: true, trim: true }, // 'Pick-Up'
    alias: { type: String, trim: true, default: '' },
    sequence: { type: Number, required: true },
    imageUrl: { type: String, default: '' },
    description: { type: String, default: '' },
    active: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
    createdBy: { type: String },
    updatedBy: { type: String },
  },
  {
    _id: false, // usamos nuestro propio "id" uuid, no un ObjectId extra por cada valor
    timestamps: true,
  },
);

// Documento raíz: el catálogo completo (maestro + values embebidos)
const catalogSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, lowercase: true }, // 'vehicle_type'
    label: { type: String, required: true, trim: true }, // 'Tipos de Vehículo'
    description: { type: String, trim: true, default: '' },
    collection: { type: String, trim: true }, // dominio/agrupación, ej. 'config'
    section: { type: String, trim: true }, // ej. 'Digital'
    sequence: { type: Number, default: 0 },
    imageUrl: { type: String, default: '' },
    route: { type: String, trim: true }, // '/config/vehicle-type'
    active: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
    createdBy: { type: String },
    updatedBy: { type: String },
    values: [valueSchema],
  },
  {
    timestamps: true,
    suppressReservedKeysWarning: true, // el campo "collection" es intencional (contrato del profe)
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id; // contrato canónico: _id -> id
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Índices (multikey sobre el subdocumento values)
catalogSchema.index({ key: 1 }, { unique: true }); // mon-1
catalogSchema.index({ 'values.parentId': 1 }); // mon-2
catalogSchema.index({ key: 1, 'values.code': 1 }, { unique: true }); // mon-3
catalogSchema.index({ key: 1, 'values.sequence': 1 }); // mon-4

export default mongoose.model('catalogs', catalogSchema, 'catalogs');
