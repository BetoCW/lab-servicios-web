-- =====================================================================
-- Datos de prueba (mismos datos que los seed JSON de las APIs en MongoDB)
-- =====================================================================

-- Ayudante temporal: inserta un valor buscando al padre por su code
CREATE FUNCTION pg_temp.add_value(p_key TEXT, p_parent_code TEXT, p_code TEXT, p_value TEXT, p_alias TEXT)
RETURNS VOID AS $$
DECLARE
  v_catalog UUID;
  v_parent  UUID;
BEGIN
  SELECT id INTO v_catalog FROM catalogs WHERE key = p_key;
  IF p_parent_code IS NOT NULL THEN
    SELECT id INTO STRICT v_parent FROM catalog_values WHERE catalog_id = v_catalog AND code = p_parent_code;
  END IF;

  INSERT INTO catalog_values (catalog_id, parent_id, code, value, alias, sequence, created_by, updated_by)
  SELECT v_catalog, v_parent, p_code, p_value, p_alias,
         coalesce(max(sequence), 0) + 1, 'SEED', 'SEED'
  FROM catalog_values
  WHERE catalog_id = v_catalog AND parent_id IS NOT DISTINCT FROM v_parent;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Catálogos
-- ---------------------------------------------------------------------
INSERT INTO catalogs (key, label, description, collection, section, sequence, route, created_by, updated_by) VALUES
  ('institute_business', 'Giros de Institutos', 'Clasificación del giro o actividad principal de un instituto.', 'eeducation', 'Institutos', 1, '/eeducation/institute-business', 'SEED', 'SEED'),
  ('prod_serv_status', 'Estatus de Productos y Servicios', 'Estados posibles de un producto o servicio dentro de su ciclo de vida.', 'eeducation', 'Productos', 2, '/eeducation/prod-serv-status', 'SEED', 'SEED'),
  ('prod_serv_type', 'Tipos de Productos y Servicios', 'Clasificación en dos niveles (tipo > subtipo) de lo que ofrece un instituto.', 'eeducation', 'Productos', 3, '/eeducation/prod-serv-type', 'SEED', 'SEED'),
  ('education_levels', 'Niveles Educativos', 'Ejemplo maestro-detalle-detalle: nivel > tipo de programa > programa.', 'eeducation', 'Academico', 4, '/eeducation/education-levels', 'SEED', 'SEED'),
  ('file_type', 'Tipos de Archivo', 'Tipos de archivo que se pueden asociar a una presentación de producto.', 'config', 'Digital', 5, '/config/file-type', 'SEED', 'SEED'),
  ('vehicle_type', 'Tipos de Vehículo', 'Ejemplo del tutorial: jerarquía de tres niveles con parentId.', 'config', 'Digital', 6, '/config/vehicle-type', 'SEED', 'SEED'),
  ('strategies', 'Estrategias', 'Ejemplo del esquema canónico del docente (maestro-detalle-detalle).', 'trading', 'Operacion', 7, '/config/strategies', 'SEED', 'SEED');

SELECT pg_temp.add_value('institute_business', NULL, 'EDUCACION', 'Educación', 'EDU');
SELECT pg_temp.add_value('institute_business', NULL, 'INVESTIGACION', 'Investigación', 'INV');
SELECT pg_temp.add_value('institute_business', NULL, 'CAPACITACION', 'Capacitación', 'CAP');

SELECT pg_temp.add_value('prod_serv_status', NULL, 'PS_ACTIVO', 'Activo', 'ACT');
SELECT pg_temp.add_value('prod_serv_status', NULL, 'PS_INACTIVO', 'Inactivo', 'INA');
SELECT pg_temp.add_value('prod_serv_status', NULL, 'PS_AGOTADO', 'Agotado', 'AGO');
SELECT pg_temp.add_value('prod_serv_status', NULL, 'PS_DESCONTINUADO', 'Descontinuado', 'DES');

SELECT pg_temp.add_value('prod_serv_type', NULL, 'SERVICIO_ESCOLAR', 'Servicio escolar', 'SE');
SELECT pg_temp.add_value('prod_serv_type', 'SERVICIO_ESCOLAR', 'CONSTANCIAS', 'Constancias y certificados', 'CON');
SELECT pg_temp.add_value('prod_serv_type', 'SERVICIO_ESCOLAR', 'CREDENCIALES', 'Credenciales', 'CRE');
SELECT pg_temp.add_value('prod_serv_type', NULL, 'CURSO', 'Curso', 'CUR');
SELECT pg_temp.add_value('prod_serv_type', 'CURSO', 'IDIOMAS', 'Idiomas', 'IDI');
SELECT pg_temp.add_value('prod_serv_type', 'CURSO', 'VERANO', 'Curso de verano', 'VER');
SELECT pg_temp.add_value('prod_serv_type', NULL, 'PRODUCTO', 'Producto', 'PRO');
SELECT pg_temp.add_value('prod_serv_type', 'PRODUCTO', 'PAPELERIA', 'Papelería institucional', 'PAP');

SELECT pg_temp.add_value('education_levels', NULL, 'SUPERIOR', 'Educación superior', 'SUP');
SELECT pg_temp.add_value('education_levels', 'SUPERIOR', 'LICENCIATURA', 'Licenciatura', 'LIC');
SELECT pg_temp.add_value('education_levels', 'LICENCIATURA', 'ING_SISTEMAS', 'Ingeniería en Sistemas Computacionales', 'ISC');
SELECT pg_temp.add_value('education_levels', 'LICENCIATURA', 'ING_INDUSTRIAL', 'Ingeniería Industrial', 'IIN');
SELECT pg_temp.add_value('education_levels', 'SUPERIOR', 'POSGRADO', 'Posgrado', 'POS');
SELECT pg_temp.add_value('education_levels', 'POSGRADO', 'MAESTRIA_TI', 'Maestría en Tecnologías de la Información', 'MTI');
SELECT pg_temp.add_value('education_levels', NULL, 'MEDIA_SUPERIOR', 'Educación media superior', 'MS');
SELECT pg_temp.add_value('education_levels', 'MEDIA_SUPERIOR', 'BACHILLERATO_TEC', 'Bachillerato tecnológico', 'BT');

SELECT pg_temp.add_value('file_type', NULL, 'IMG', 'Imagen', 'IMG');
SELECT pg_temp.add_value('file_type', NULL, 'PDF', 'Documento PDF', 'PDF');
SELECT pg_temp.add_value('file_type', NULL, 'VIDEO', 'Video', 'VID');
SELECT pg_temp.add_value('file_type', NULL, 'LINK', 'Enlace externo', 'URL');

SELECT pg_temp.add_value('vehicle_type', NULL, 'VEHICULOS', 'Vehículos', 'VEH');
SELECT pg_temp.add_value('vehicle_type', 'VEHICULOS', 'TERRESTRES', 'Terrestres', 'TER');
SELECT pg_temp.add_value('vehicle_type', 'TERRESTRES', 'AUTOMOVIL', 'Automóvil', 'AUT');
SELECT pg_temp.add_value('vehicle_type', 'TERRESTRES', 'MOTOCICLETA', 'Motocicleta', 'MOT');
SELECT pg_temp.add_value('vehicle_type', 'VEHICULOS', 'AEREOS', 'Aéreos', 'AER');
SELECT pg_temp.add_value('vehicle_type', 'AEREOS', 'AVION', 'Avión', 'AVI');
SELECT pg_temp.add_value('vehicle_type', 'AEREOS', 'HELICOPTERO', 'Helicóptero', 'HEL');

SELECT pg_temp.add_value('strategies', NULL, 'OPTIONS', 'Opciones', 'OPT');
SELECT pg_temp.add_value('strategies', 'OPTIONS', 'IRON_CONDOR', 'Iron Condor', 'IC');
SELECT pg_temp.add_value('strategies', 'IRON_CONDOR', 'WIDE_IRON_CONDOR', 'Iron Condor Ancho', 'WIC');

-- ---------------------------------------------------------------------
-- Institutos (el superior se inserta antes que sus dependientes)
-- ---------------------------------------------------------------------
INSERT INTO institutos (id_instituto_ok, id_instituto_bk, des_instituto, alias, matriz, giro, id_instituto_sup_ok, created_by, updated_by) VALUES
  ('1', '18DIT0002Z', 'Instituto Tecnológico de Tepic', 'ITT', 'S', 'EDUCACION', NULL, 'SEED', 'SEED'),
  ('3', 'ITBB-PRUEBA', 'Instituto Tecnológico de Bahía de Banderas', 'ITBB', 'S', 'EDUCACION', NULL, 'SEED', 'SEED'),
  ('4', 'ITT-CLE', 'Coordinación de Lenguas Extranjeras del ITT', 'CLE-ITT', 'N', 'CAPACITACION', '1', 'SEED', 'SEED');

-- ---------------------------------------------------------------------
-- Productos y servicios
-- ---------------------------------------------------------------------
INSERT INTO prod_serv (id_instituto_ok, id_prod_serv_ok, id_prod_serv_bk, codigo_barras, des_prod_serv, id_tipo_prod_serv_ok, indice, created_by, updated_by) VALUES
  ('1', '1-CONST-EST', 'SE-001', NULL, 'Constancia de estudios', 'CONSTANCIAS', 'constancia estudios servicios escolares', 'SEED', 'SEED'),
  ('1', '1-CRED-EST', 'SE-002', NULL, 'Credencial de estudiante', 'CREDENCIALES', 'credencial estudiante identificación', 'SEED', 'SEED'),
  ('1', '1-PAP-LIBRETA', 'PR-001', '7500000000017', 'Libreta institucional', 'PAPELERIA', 'libreta cuaderno papelería', 'SEED', 'SEED'),
  ('4', '4-INGLES-N1', 'CUR-ING-01', NULL, 'Curso de inglés nivel 1', 'IDIOMAS', 'inglés idiomas curso nivel 1', 'SEED', 'SEED'),
  ('3', '3-VER-PYTHON', 'CUR-VER-01', NULL, 'Curso de verano: programación en Python', 'VERANO', 'python programación verano curso', 'SEED', 'SEED');

INSERT INTO prod_serv_estatus (prod_serv_id, id_tipo_estatus_ok, actual, created_by)
SELECT ps.id, e.code, e.actual, 'SEED'
FROM (VALUES
  ('1-CONST-EST', 'PS_ACTIVO', 'S'),
  ('1-CRED-EST', 'PS_ACTIVO', 'S'),
  ('1-PAP-LIBRETA', 'PS_ACTIVO', 'N'),
  ('1-PAP-LIBRETA', 'PS_AGOTADO', 'S'),
  ('4-INGLES-N1', 'PS_ACTIVO', 'S'),
  ('3-VER-PYTHON', 'PS_ACTIVO', 'S')
) AS e (prod, code, actual)
JOIN prod_serv ps ON ps.id_prod_serv_ok = e.prod;

INSERT INTO prod_serv_info_ad (prod_serv_id, id_etiqueta_ok, etiqueta, valor, secuencia, created_by)
SELECT ps.id, i.etiqueta_ok, i.etiqueta, i.valor, i.secuencia, 'SEED'
FROM (VALUES
  ('1-CONST-EST', 'education_levels', 'Nivel educativo', 'SUPERIOR', 1),
  ('1-CONST-EST', 'tiempo_entrega', 'Tiempo de entrega', '3 días hábiles', 2),
  ('4-INGLES-N1', 'duracion', 'Duración', '60 horas', 1),
  ('3-VER-PYTHON', 'education_levels', 'Programa relacionado', 'ING_SISTEMAS', 1)
) AS i (prod, etiqueta_ok, etiqueta, valor, secuencia)
JOIN prod_serv ps ON ps.id_prod_serv_ok = i.prod;

INSERT INTO prod_serv_presenta (prod_serv_id, id_presenta_ok, codigo_barras, des_presenta, precio, principal, created_by, updated_by)
SELECT ps.id, p.presenta_ok, p.codigo, p.des, p.precio, p.principal, 'SEED', 'SEED'
FROM (VALUES
  ('1-CONST-EST', '1-CONST-EST-SIMPLE', NULL, 'Constancia simple', 50, 'S'),
  ('1-CONST-EST', '1-CONST-EST-KARDEX', NULL, 'Constancia con kárdex', 90, 'N'),
  ('1-CRED-EST', '1-CRED-EST-NUEVA', NULL, 'Credencial de primer ingreso', 0, 'S'),
  ('1-CRED-EST', '1-CRED-EST-REPO', NULL, 'Reposición por extravío', 120, 'N'),
  ('1-PAP-LIBRETA', '1-PAP-LIBRETA-100', '7500000000024', 'Libreta profesional 100 hojas', 65, 'S'),
  ('4-INGLES-N1', '4-INGLES-N1-SAB', NULL, 'Modalidad sabatina', 1800, 'S'),
  ('4-INGLES-N1', '4-INGLES-N1-INT', NULL, 'Modalidad intensiva de verano', 2100, 'N'),
  ('3-VER-PYTHON', '3-VER-PYTHON-PRES', NULL, 'Presencial', 1500, 'S'),
  ('3-VER-PYTHON', '3-VER-PYTHON-LIN', NULL, 'En línea', 1200, 'N')
) AS p (prod, presenta_ok, codigo, des, precio, principal)
JOIN prod_serv ps ON ps.id_prod_serv_ok = p.prod;

INSERT INTO prod_serv_presenta_archivos (presenta_id, id_archivo_ok, id_tipo_archivo_ok, des_archivo, ruta_archivo, principal, created_by)
SELECT pr.id, a.archivo_ok, a.tipo, a.des, a.ruta, 'S', 'SEED'
FROM (VALUES
  ('1-CONST-EST-SIMPLE', 'ARCH-001', 'PDF', 'Formato de solicitud', 'https://example.com/itt/constancia-solicitud.pdf'),
  ('1-PAP-LIBRETA-100', 'ARCH-002', 'IMG', 'Foto de portada', 'https://example.com/itt/libreta.jpg'),
  ('4-INGLES-N1-INT', 'ARCH-003', 'VIDEO', 'Video promocional', 'https://example.com/itt/ingles-verano.mp4')
) AS a (presenta, archivo_ok, tipo, des, ruta)
JOIN prod_serv_presenta pr ON pr.id_presenta_ok = a.presenta;

-- Bitácora de alta para todo lo insertado
INSERT INTO bitacora (tabla, registro_id, accion, usuario_reg)
SELECT 'institutos', id, 'ALTA', 'SEED' FROM institutos
UNION ALL SELECT 'prod_serv', id, 'ALTA', 'SEED' FROM prod_serv
UNION ALL SELECT 'prod_serv_presenta', id, 'ALTA', 'SEED' FROM prod_serv_presenta;
