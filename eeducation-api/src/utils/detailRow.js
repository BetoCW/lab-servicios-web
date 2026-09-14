// Ayudantes para el control de auditoría detail_row (Activo / Borrado / bitácora)

// Filtro de MongoDB para excluir documentos con borrado lógico
export const NOT_DELETED = { 'detail_row.Borrado': { $ne: 'S' } };

export const isDeleted = (item) => item?.detail_row?.Borrado === 'S';

export const newDetailRow = (actor) => ({
  Activo: 'S',
  Borrado: 'N',
  detail_row_reg: [{ FechaReg: new Date(), UsuarioReg: actor }],
});

export const registerChange = (detailRow, actor) => {
  detailRow.detail_row_reg.push({ FechaReg: new Date(), UsuarioReg: actor });
};

export const markDeleted = (detailRow, actor) => {
  detailRow.Activo = 'N';
  detailRow.Borrado = 'S';
  registerChange(detailRow, actor);
};

// Copia solo los campos permitidos que sí vienen en el body
export const pick = (source = {}, fields = []) =>
  Object.fromEntries(fields.filter((f) => source[f] !== undefined).map((f) => [f, source[f]]));
