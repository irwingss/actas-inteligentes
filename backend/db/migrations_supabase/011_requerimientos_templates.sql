-- =====================================================
-- Migración 011: Templates de Requerimientos de Información
-- =====================================================
-- Esta tabla almacena los textos estándar de requerimientos
-- que se muestran como checkboxes según el hecho detectado
-- y el tipo de supervisión (Especial/Regular)
-- =====================================================

-- Crear tabla de templates de requerimientos
CREATE TABLE IF NOT EXISTS requerimientos_templates (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    -- Texto del requerimiento (puede ser largo con HTML)
    texto TEXT NOT NULL,
    
    -- Hecho(s) detectado(s) asociados (array de strings)
    -- Ejemplos: ["A. Acciones de primera respuesta."]
    -- o ["C. Almacenamiento de residuos sólidos.", "I. Disposición Final de residuos sólidos."]
    hechos_asociados TEXT[] NOT NULL DEFAULT '{}',
    
    -- Tipo de CA: 'Especial' o 'Regular'
    tipo_ca TEXT NOT NULL CHECK (tipo_ca IN ('Especial', 'Regular')),
    
    -- Orden de visualización (menor = primero)
    orden INTEGER NOT NULL DEFAULT 0,
    
    -- Si el template está activo
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Auditoría
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Índices para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_requerimientos_templates_tipo_ca 
    ON requerimientos_templates(tipo_ca) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_requerimientos_templates_orden 
    ON requerimientos_templates(orden);

-- Índice GIN para búsqueda en el array de hechos_asociados
CREATE INDEX IF NOT EXISTS idx_requerimientos_templates_hechos 
    ON requerimientos_templates USING GIN (hechos_asociados);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_requerimientos_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_requerimientos_templates_updated_at ON requerimientos_templates;
CREATE TRIGGER trigger_requerimientos_templates_updated_at
    BEFORE UPDATE ON requerimientos_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_requerimientos_templates_updated_at();

-- =====================================================
-- RLS Policies
-- =====================================================
ALTER TABLE requerimientos_templates ENABLE ROW LEVEL SECURITY;

-- Lectura para todos los usuarios autenticados
DROP POLICY IF EXISTS "requerimientos_templates_read" ON requerimientos_templates;
CREATE POLICY "requerimientos_templates_read" ON requerimientos_templates
    FOR SELECT
    TO authenticated
    USING (true);

-- Escritura solo para superadmins
DROP POLICY IF EXISTS "requerimientos_templates_write" ON requerimientos_templates;
CREATE POLICY "requerimientos_templates_write" ON requerimientos_templates
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'superadmin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'superadmin'
        )
    );

-- =====================================================
-- Datos iniciales del CSV
-- =====================================================
-- Insertar los requerimientos estándar desde el CSV

-- TIPO ESPECIAL
INSERT INTO requerimientos_templates (texto, hechos_asociados, tipo_ca, orden) VALUES
(E'1.-Presentar evidencia que acredite la ejecución de la reparación permanente de la sección que contiene el punto de fuga, la cual deberá incluir, según corresponda: informes de actividades de la empresa contratista, órdenes de trabajo, informes de conformidad, registros fotográficos y permisos de trabajo.\nLa información presentada permitirá acreditar que el administrado ha corregido la conducta que dio origen a la emergencia ambiental.', 
 ARRAY['A. Acciones de primera respuesta.'], 'Especial', 1),

('2.-Presentar información detallada sobre las acciones realizadas e implementadas por el administrado con posterioridad a la ocurrencia del evento, las cuales deberán encontrarse directamente orientadas a la causa identificada que ocasionó la fuga. Dicha información deberá estar debidamente sustentada mediante documentación con fecha cierta, así como registros fotográficos fechados.', 
 ARRAY['A. Acciones de primera respuesta.'], 'Especial', 2),

(E'Presentar la bitácora del recorredor de campo y/o del personal de seguridad, según corresponda al área en la que se registró el evento de fuga.\n\nAsimismo, presentar los reportes generados por el personal que detectó la fuga, mediante los cuales se comunicó el evento a la central de operaciones, incluyendo los registros fotográficos que se hubieran obtenido al momento de la detección.', 
 ARRAY['A. Acciones de primera respuesta.'], 'Especial', 3),

('Presentar las bitácoras del recorredor de producción y/o de seguridad que contengan información del punto de fuga, correspondientes al período de hasta un (1) mes previo a la ocurrencia del evento, únicamente respecto de los registros en los que se haya consignado información sobre dicho componente.', 
 ARRAY['L. Medidas de prevención.'], 'Especial', 4),

('Presentar la metodología utilizada y su aplicación para el cálculo del volumen fugado durante la emergencia, desde el inicio del evento hasta el control de la fuente. El cálculo deberá considerar, de corresponder, el volumen de hidrocarburo en fase libre, así como el volumen impregnado en el suelo.', 
 ARRAY['L. Medidas de prevención.'], 'Especial', 5),

('Presentar los resultados del último muestreo realizado en cabeza de pozo, en el que se consignen los valores de corte de agua y grado API del hidrocarburo fugado.', 
 ARRAY['L. Medidas de prevención.'], 'Especial', 6),

(E'•Presentar la causa inmediata y basica que origino la emergencia ambiental. Remitir el informe analisis de causa raiz elaborado por el comité de seguridad del operador el cual deberá detallar la metodología aplicada, los hallazgos obtenidos y las conclusiones alcanzadas.\n•DE CORRESPONDER, Presentar el reporte de analisis del daño del ducto.', 
 ARRAY['L. Medidas de prevención.'], 'Especial', 7),

('•Presentar registros fotográficos fechados y georreferenciados que evidencien el daño o falla por donde se produjo la fuga del contaminante, incluyendo tomas de detalle y de contexto que permitan identificar claramente el componente afectado y su ubicación', 
 ARRAY['L. Medidas de prevención.'], 'Especial', 8),

('1.-Presentar el último Reporte Mensual de Producción del pozo, en el que se consigne el período que comprende. ESTO ES PARA PODER DETERMINAR LA SITUACION DEL POZO Y DE SU DUCTO DE RECOLECCION AL MOMENTO DE LA EMERGENCIA AMBIENTAL.', 
 ARRAY['L. Medidas de prevención.'], 'Especial', 9),

('1.-Presentar un archivo en formato KMZ del área afectada (delimitada) en coordenadas UTM WGS 84, identificando la ruta y amplitud (poliogono) de migración del hidrocarburo y señalando la ubicación de la instalación que generó la emergencia ambiental.', 
 ARRAY['A. Acciones de primera respuesta.'], 'Especial', 10),

(E'1. Informe de las acciones de primera respuesta adoptadas para la atención de la emergencia ambiental, en el cual se deberá evidenciar, de corresponder, la ejecución de las siguientes acciones:\n•Control de la fuente del evento.\n•Aseguramiento del área afectada y medidas de contención implementadas.\n•Recuperación superficial del material contaminante.\n•Acciones de limpieza y disposición final de residuos generados.\n•Rescate, atención y manejo de fauna silvestre afectada.\nEl informe deberá contener registros fotográficos fechados y georreferenciados, además de cualquier otro aspecto que se considere relevante.', 
 ARRAY['A. Acciones de primera respuesta.'], 'Especial', 11),

('2. Presentar evidencia del cumplimiento de las obligaciones XXX (previamente revisar el instrumento de gestión ambiental correspondiente), establecidas en el IGA XXX.', 
 ARRAY['A. Acciones de primera respuesta.'], 'Especial', 12),

('3. Indicar la relación y cantidad de equipos utilizados durante la atención de la emergencia ambiental, así como la ubicación de dichos recursos al momento de la detección del evento.', 
 ARRAY['A. Acciones de primera respuesta.'], 'Especial', 13),

('4. Presentar el detalle de las comunicaciones internas realizadas con posterioridad a la detección de la emergencia ambiental (fecha, hora, responsables), y Sustento documental de la activación del Plan de contingencias (registros, actas, reportes).', 
 ARRAY['A. Acciones de primera respuesta.'], 'Especial', 14),

(E'1.- Informe técnico sustentado, con registro fotográfico fechado y georreferenciado, que describa detalladamente el manejo de los residuos sólidos generados durante la ejecución de las acciones de limpieza en cada una de las áreas donde se haya identificados suelos impactados. El informe deberá contemplar de manera diferenciada cada una de las operaciones de manejo:\n•Segregación.\n•Almacenamiento inicial, intermedio y central, se debera registrar las condiciones de almacenamiento tanto del residuo como del entorno.\n•Transporte, presentar imagenes del vehiculo que realizo el transporte, mostrando placa del mismo.\n•Valorización, presentar registros de entregas de material a la empresa autorizada, y/o registro de almacenamiento interno.\n•Disposición final\n•Presentar la tipificación y cuantificación de los residuos (tipos y volúmenes) generados producto de la emergencia ambiental y las APR implementadas, conforme a lo establecido en la Ley de Gestión Integral de Residuos Sólidos (LGIRS), su Reglamento (RLGIRS) y el Instrumento de Gestión Ambiental aplicable.\n\nLa información deberá presentarse de forma específica y desagregada por cada uno de los puntos señalados en el presente hecho, y toda la documentación deberá estar claramente vinculada a su respectivo punto de generación.\nAdicionalmente, para todas las emergencias en las que se haya realizado el cambio de la sección de línea donde ocurrió la fuga o derrame, deberá presentar información detallada sobre el almacenamiento o disposición de dicha sección.', 
 ARRAY['C. Almacenamiento de residuos sólidos.', 'I. Disposición Final de residuos sólidos.'], 'Especial', 15),

(E'1. Inclusión en el Instrumento de Gestión Ambiental (IGA)\nIndicar y sustentar en qué Instrumento(s) de Gestión Ambiental aprobado(s) se encuentra incorporado el programa de inspección y mantenimiento del componente involucrado, precisando:\n•Nombre del IGA y resolución de aprobación.\n•Capítulo, numeral o anexo donde se describe el programa.\n•Componentes a los que aplica el programa (ductos, tanques, pozos, válvulas, entre otros).', 
 ARRAY['L. Medidas de prevención.'], 'Especial', 16),

(E'2. Descripción del programa de inspección y mantenimiento\nPresentar el programa aprobado de inspección y mantenimiento aplicable al componente, el cual deberá incluir, como mínimo:\n•Tipos de trabajos contemplados (inspecciones visuales, ensayos no destructivos, mantenimiento preventivo, correctivo, predictivo, entre otros).\n•Periodicidad de cada tipo de inspección y mantenimiento.\n•Metodología de aplicación (procedimientos, normas técnicas) indicar el criterio de aceptación/rechazo.', 
 ARRAY['L. Medidas de prevención.'], 'Especial', 17),

(E'3.-Ultimo informe del operador y/o de la contratista que ejecuto la inspeccion y mantenimientos preventivos en el punto donde se produjo la fuga del contaminante, donde se detalle:\n•Registros, reportes o actas de inspección\n•Órdenes de trabajo y reportes de mantenimiento\n•Resultados de evaluaciones de integridad (Hallazgos identificados en las inspecciones)\n•Registros fotográficos fechados y georreferenciados de los hallazgos\n•Acciones correctivas implementadas o programadas.\n•Plazos de ejecución y estado de cierre de las acciones\n\nSe precisa y recalca que la informacion debe abarcar el punto por donde se produjo la fuga del contaminante.', 
 ARRAY['L. Medidas de prevención.'], 'Especial', 18),

(E'Presentar un informe técnico de evaluación en campo mediante el cual se haya determinado la viabilidad o no viabilidad del control de la fuente, el cual deberia indicar Fecha y hora de la evaluación, Sustento técnico que justifique si la intervención del pozo implicaba o no su abandono.\n\nRespecto al resto de APR revisar requerimiento propuesto previo.', 
 ARRAY['A. Acciones de primera respuesta.'], 'Especial', 19),

(E'Indicar Fecha exacta de inicio de la inoperatividad.\nMotivo de la inoperatividad (mantenimiento mayor, cierre temporal, abandono, caso fortuito, etc.).', 
 ARRAY['A. Acciones de primera respuesta.'], 'Especial', 20),

(E'Indicar el periodo de implementación de la tina en la ubicación del pozo, especificando fechas de instalación y retiro, de corresponder.\n\nDescribir el uso previsto de la tina, detallando su función y el tipo de líquidos o materiales que se almacenarán o manipularán.\n\nPresentar el cronograma de uso previsto de la tina, incluyendo frecuencia de utilización, duración de cada uso y cualquier planificación asociada a operaciones del pozo.', 
 ARRAY['A. Acciones de primera respuesta.'], 'Especial', 21);

-- TIPO REGULAR
INSERT INTO requerimientos_templates (texto, hechos_asociados, tipo_ca, orden) VALUES
(E'El administrado deberá presentar un informe técnico sustentado y suscrito por su representante legal, indicados en el Hecho N°xx bajo el siguiente tenor:\n\nFecha de inopreatividad y el motivo del cese', 
 ARRAY['Ñ. Instalaciones inoperativas por más de 1 año.'], 'Regular', 22),

(E'El administrado deberá presentar un informe técnico sustentado y suscrito por su representante legal, que detalle la trazabilidad integral de los residuos sólidos y líquidos (peligrosos y no peligrosos) indicados en el Hecho N°xx bajo el siguiente tenor:\n\nInformes del manejo y disposición final de los residuos sólidos y líquidos peligrosos y no peligrosos, precisando el volumen de los residuos recolectados, dispuestos en el almacén primario, almacén central y disposición final (recolección, almacenamiento, transporte y disposición final).\n\nEstos informes deben incluir fotografías, registros, manifiestos, registro de internamiento, entre otros.', 
 ARRAY['C. Almacenamiento de residuos sólidos.'], 'Regular', 23),

(E'El administrado deberá presentar un informe técnico sustentado y suscrito por su representante legal, que detalle la trazabilidad integral de los residuos sólidos y líquidos (peligrosos y no peligrosos) indicados en el Hecho N°xx bajo el siguiente tenor:\n\nInformes del manejo y disposición final de los residuos sólidos y líquidos peligrosos y no peligrosos, precisando el volumen de los residuos recolectados, dispuestos en el almacén primario, almacén central y disposición final (recolección, almacenamiento, transporte y disposición final).\n\nEstos informes deben incluir fotografías, registros, manifiestos, registro de internamiento, entre otros.', 
 ARRAY['I. Disposición Final de residuos sólidos.'], 'Regular', 24),

(E'El administrado deberá presentar un informe técnico sustentado y suscrito por su representante legal, indicados en el Hecho N°xx bajo el siguiente tenor:\n\nEl administrado deberá indicar la causa raíz que originó las áreas impactadas', 
 ARRAY['F. Áreas impactadas (suelo, agua, sedimento, otros con hidrocarburos).', 'L. Medidas de prevención.'], 'Regular', 25),

(E'El administrado deberá presentar un informe técnico sustentado y suscrito por su representante legal, indicados en el Hecho N°xx bajo el siguiente tenor:\n\nEl administrado deberá presentar un informe que acredite las medidas de prevención realizadas en las instalaciones mencionadas en el Hecho detectado N° xx en el periodo de un año, o si en ese periodo no se ha realizo antenimiento, presentar el ultimo realizado.', 
 ARRAY['F. Áreas impactadas (suelo, agua, sedimento, otros con hidrocarburos).', 'L. Medidas de prevención.'], 'Regular', 26),

(E'El administrado deberá presentar un informe técnico sustentado y suscrito por su representante legal, indicados en el Hecho N°xx bajo el siguiente tenor:\n\nEl administrado deberá de recolectar muestras del componente ambiental afectado despúes de habe ejecutado las actividades de limpieza y presentar los informes de ensayos acreditados por INACAL.', 
 ARRAY['F. Áreas impactadas (suelo, agua, sedimento, otros con hidrocarburos).', 'K. Limpieza del área afectada.'], 'Regular', 27),

(E'El administrado deberá presentar un informe técnico sustentado y suscrito por su representante legal, indicados en el Hecho N°xx bajo el siguiente tenor:\n\nEl registro de ejecución de las actividades de mantenimiento correspondiente a las instalaciones y equipos críticos (ductos, tanques, unidades de proceso, sistemas de bombeo y válvulas), detallando la trazabilidad de las intervenciones preventivas y predictivas realizadas para minimizar riesgos de fugas o derrames.', 
 ARRAY['J. Falta de mantenimiento.'], 'Regular', 28),

(E'El administrado deberá presentar un informe técnico sustentado y suscrito por su representante legal, indicados en el Hecho N°xx bajo el siguiente tenor:\n\nEl administrado deberá presentar un informe (que indique el tipo de suelo, grado de compactación y espesor y composición de la capa compactada) que acredite la impermeabilización de las zonas estancas a fin de cumplir con lo indicado en la normativa ambiental.', 
 ARRAY['E. Área estanca.', 'J. Falta de mantenimiento.'], 'Regular', 29),

(E'El administrado deberá presentar un informe técnico sustentado y suscrito por su representante legal, indicados en el Hecho N°xx bajo el siguiente tenor:\n\nEl administrado deberá presentar información (un informe detallado y sustentado que contenga: fotografías panorámicas y de detalle y/o video, debidamente fechados y georreferenciados, Hojas MSDS de los productos químicos almacenados, impermeabilización en las áreas que corresponda, señalización, y otros de corresponder) que acredite el adecuado manejo y almacenamiento de los productos químicos descrito en el presente hecho.', 
 ARRAY['D. Almacenamiento de sustancias químicas.'], 'Regular', 30);

-- =====================================================
-- Comentarios
-- =====================================================
COMMENT ON TABLE requerimientos_templates IS 'Templates de requerimientos de información estándar para actas de supervisión';
COMMENT ON COLUMN requerimientos_templates.texto IS 'Texto completo del requerimiento (puede incluir saltos de línea)';
COMMENT ON COLUMN requerimientos_templates.hechos_asociados IS 'Array de hechos detectados a los que aplica este requerimiento';
COMMENT ON COLUMN requerimientos_templates.tipo_ca IS 'Tipo de CA: Especial o Regular';
COMMENT ON COLUMN requerimientos_templates.orden IS 'Orden de visualización';
