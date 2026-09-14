import mongoose from 'mongoose';
import { detailRowField } from './detailRow';

const institutosSchema = new mongoose.Schema(
  {
    IdInstitutoOK: { type: String, required: true, trim: true }, // llave de negocio: '1'
    IdInstitutoBK: { type: String, required: true, trim: true }, // clave externa: '18DIT0002Z'
    DesInstituto: { type: String, required: true, trim: true },
    Alias: { type: String, trim: true, default: '' },
    Matriz: { type: String, enum: ['S', 'N'], default: 'S' },
    Giro: { type: String, trim: true, uppercase: true }, // code del catálogo institute_business
    IdInstitutoSupOK: { type: String, trim: true, default: '' }, // instituto superior ('' = ninguno)
    detail_row: detailRowField,
  },
  { versionKey: false },
);

institutosSchema.index({ IdInstitutoOK: 1 }, { unique: true });
institutosSchema.index({ IdInstitutoSupOK: 1 });

export default mongoose.model('Institutos', institutosSchema, 'Institutos');
