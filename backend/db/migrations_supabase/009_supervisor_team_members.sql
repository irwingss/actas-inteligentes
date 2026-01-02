-- Migración: 009_supervisor_team_members
-- Descripción: Tabla para almacenar los miembros del equipo supervisor
-- Fecha: 2025-12-08

-- Tabla para almacenar los miembros del equipo supervisor
CREATE TABLE IF NOT EXISTS supervisor_team_members (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  apellidos_nombres text NOT NULL,
  dni text,
  num_colegiatura text,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índices para búsqueda eficiente
CREATE INDEX IF NOT EXISTS idx_supervisor_team_members_apellidos ON supervisor_team_members(apellidos_nombres);
CREATE INDEX IF NOT EXISTS idx_supervisor_team_members_active ON supervisor_team_members(is_active);
CREATE INDEX IF NOT EXISTS idx_supervisor_team_members_dni ON supervisor_team_members(dni);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_supervisor_team_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_supervisor_team_members_updated_at ON supervisor_team_members;
CREATE TRIGGER trigger_supervisor_team_members_updated_at
  BEFORE UPDATE ON supervisor_team_members
  FOR EACH ROW
  EXECUTE FUNCTION update_supervisor_team_members_updated_at();

-- RLS Policies
ALTER TABLE supervisor_team_members ENABLE ROW LEVEL SECURITY;

-- Lectura para usuarios autenticados
CREATE POLICY "supervisor_team_members_select_authenticated"
  ON supervisor_team_members FOR SELECT
  TO authenticated
  USING (true);

-- Escritura solo para superadmins
CREATE POLICY "supervisor_team_members_insert_superadmin"
  ON supervisor_team_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'superadmin'
    )
  );

CREATE POLICY "supervisor_team_members_update_superadmin"
  ON supervisor_team_members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'superadmin'
    )
  );

CREATE POLICY "supervisor_team_members_delete_superadmin"
  ON supervisor_team_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'superadmin'
    )
  );

-- Comentarios
COMMENT ON TABLE supervisor_team_members IS 'Miembros del equipo supervisor disponibles para asignar a actas';
COMMENT ON COLUMN supervisor_team_members.apellidos_nombres IS 'Apellidos y nombres completos del supervisor';
COMMENT ON COLUMN supervisor_team_members.dni IS 'Documento Nacional de Identidad';
COMMENT ON COLUMN supervisor_team_members.num_colegiatura IS 'Número de colegiatura profesional';
COMMENT ON COLUMN supervisor_team_members.is_active IS 'Si el miembro está activo y disponible para selección';

-- Insertar datos iniciales
INSERT INTO supervisor_team_members (apellidos_nombres, dni, num_colegiatura) VALUES
('Aguirre Peralta Alejandra Lizbeth', NULL, NULL),
('Aguirre Mendez Luis Angel', NULL, NULL),
('Alvarado Alama Armando Alonso', NULL, NULL),
('Anccori Avado Carmen Rosa', NULL, NULL),
('Angeles Mendiola Omar Jair', NULL, NULL),
('Asmad Lokuan Celeste Vanessa', NULL, NULL),
('Atúncar Quispe José Sebastián', NULL, NULL),
('Ayala Huamán Ernesto Eusebio', NULL, NULL),
('Bautista Rivera Yecenia Elizabeth', NULL, NULL),
('Barbaran Vera Luigi Sly', NULL, NULL),
('Bejarano Monroy Giulianno Salvatore', NULL, NULL),
('Bustamante Bustamante Anarela Yamalin', NULL, NULL),
('Canales Ludeña Yoselly Estefany', NULL, NULL),
('Carbajal Seguil Víctor Hugo', NULL, NULL),
('Cardoso Enciso Carolina', NULL, NULL),
('Castañeda Dávila Marco Antonio', NULL, NULL),
('Chero Reto Ganetsy Guisella', NULL, NULL),
('Chipana De la Cruz Julio Fermin', NULL, NULL),
('Delgado Seclen John Junior', NULL, NULL),
('Effio Herrera Jhonattan Javier', NULL, NULL),
('Espinoza Ayala Jhan Carlos', NULL, NULL),
('Gonzales Giraldo Tania Jessica', NULL, NULL),
('Jara Perea Andrews Junior', NULL, NULL),
('Liñan Flores Edward Luis', NULL, NULL),
('Martel Vásquez Sandro Emilio', NULL, NULL),
('Medina Del Carpio Nelson Delmar', NULL, NULL),
('Mejia Cobos Jaime Eduardo', NULL, NULL),
('Meza Conde Pablo Roberto', NULL, NULL),
('Muñoz Rosales Sandra Pilar', NULL, NULL),
('Ordoñez Terrones Jorge Luis', NULL, NULL),
('Parra Velasque David Joe', NULL, NULL),
('Pilco Astudillo Pitter Pablo', NULL, NULL),
('Ponce Bravo Dianthony Luis', NULL, NULL),
('Quispe Gil Carlos Alberto', NULL, NULL),
('Reátegui Romero Heydin', NULL, NULL),
('Ríos Quispe Jonathan Jason', NULL, NULL),
('Rodríguez Hermenegildo Pamela Marleny', NULL, NULL),
('Saldaña Ugaz Irwing Smith', NULL, NULL),
('Salgado Rivas Roberto Junior', NULL, NULL),
('Taipe Huamán Eduardo Hugo', NULL, NULL);
