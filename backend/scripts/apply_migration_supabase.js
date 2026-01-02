import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Configurar __dirname para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno desde el archivo .env en la raíz del backend
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
    const migrationPath = path.join(__dirname, '../db/migrations/003_add_config_urls.sql');

    try {
        console.log(`Leyendo migración desde: ${migrationPath}`);
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('Ejecutando migración en Supabase...');

        // Supabase-js no tiene un método directo para ejecutar SQL raw con el cliente estándar
        // pero podemos usar la función rpc si tenemos una configurada, o usar la API REST si es posible.
        // Sin embargo, con el service role key, a veces se puede usar pg directamente o una función edge.
        // DADO QUE ESTO ES COMPLICADO DESDE EL CLIENTE JS SIN UNA FUNCIÓN RPC ESPECÍFICA:
        // Vamos a intentar usar la API de Postgres si está disponible o asumir que el usuario debe correrlo.
        // PERO, el usuario pidió "implement the conection".

        // INTENTO 1: Usar una función RPC 'exec_sql' si existe (común en setups de Supabase para admins)
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

        if (error) {
            // Si falla RPC, intentamos ver si podemos hacerlo de otra forma o informamos.
            console.error('Error ejecutando migración vía RPC (puede que la función exec_sql no exista):', error);
            console.log('NOTA: Si no tienes una función RPC para ejecutar SQL, debes correr el SQL manualmente en el dashboard de Supabase.');
            process.exit(1);
        } else {
            console.log('Migración aplicada exitosamente.');
        }

    } catch (err) {
        console.error('Error inesperado:', err);
        process.exit(1);
    }
}

applyMigration();
