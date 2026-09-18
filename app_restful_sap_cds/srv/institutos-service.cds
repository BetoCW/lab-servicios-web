using { eeducation as db } from '../db/schema';

/**
 * Microservicio del Catalogo de Institutos.
 * CAP expone automaticamente el servicio como OData V4 en /odata/v4/institutos
 * y, con la anotacion @protocol, tambien como REST plano en /rest/institutos.
 */
@protocol: [
  { kind: 'odata', path: '/api/v1' },      // OData V4: /api/v1/Institutos
  { kind: 'rest',  path: '/rest/api/v1' }  // REST plano: /rest/api/v1/Institutos
]
service InstitutosService {

  @odata.draft.enabled: false
  entity Institutos as projection on db.Institutos;

  entity InfoAdicional as projection on db.InfoAdicional;

  /** Accion adicional: baja logica del instituto (detail_row.Borrado = 'S') */
  action bajaLogica(IdInstitutoOK : String, usuario : String) returns Institutos;
}

annotate InstitutosService with @(
  OpenAPI: {
    externalDocs: {
      description: 'T1-Actividad 3 - Laboratorio de Servicios Web, ITTepic',
      url        : 'https://github.com/BetoCW/lab-servicios-web'
    }
  }
);
