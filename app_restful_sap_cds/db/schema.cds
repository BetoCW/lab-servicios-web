namespace eeducation;

using { managed } from '@sap/cds/common';

/**
 * Clase modelo del Catalogo de Institutos (proceso DEMO).
 * Es la misma entidad que en app_restful_express; aqui se declara con CDS
 * en lugar de un esquema de Mongoose.
 */
entity Institutos : managed {
      /** Llave de negocio interna */
  key IdInstitutoOK    : String(20);
      /** Clave externa, por ejemplo la clave del centro de trabajo */
      IdInstitutoBK     : String(30)  not null;
      /** Nombre completo del instituto */
      DesInstituto      : String(200) not null;
      /** Nombre corto */
      Alias             : String(50);
      /** S = es matriz, N = es sucursal o dependencia */
      Matriz            : String(1) default 'S';
      /** Giro del instituto (codigo de catalogo) */
      Giro              : String(30);
      /** Instituto superior dentro de la jerarquia */
      IdInstitutoSupOK  : String(20);
      /** Subdocumento con las etiquetas libres del instituto */
      informacion_adicional : Composition of many InfoAdicional
                                on informacion_adicional.instituto = $self;
      /** Control de auditoria */
      detail_row        : DetailRow;
}

entity InfoAdicional {
  key instituto  : Association to Institutos;
  key IdEtiqueta : String(30);
      Etiqueta   : String(50);
      Valor      : String(500);
      Secuencia  : Integer default 0;
}

/** Bloque de auditoria que el proyecto usa en todas las entidades */
type DetailRow : {
  FechaReg    : Timestamp;
  UsuarioReg  : String(50);
  FechaUltMod : Timestamp;
  UsuarioMod  : String(50);
  Activo      : String(1);
  Borrado     : String(1);
}
