import { initDb } from './db.js';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* Schema anlegen (der Administrator wird nur beim allerersten Mal erzeugt),
   danach den Datenbestand einspielen. */
await initDb();

const kind = spawn(process.execPath, [path.join(__dirname, 'import.js')], { stdio: 'inherit' });
kind.on('exit', code => process.exit(code ?? 0));
