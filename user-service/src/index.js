const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));
const pool = new Pool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, max: 10
});
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET es obligatorio');

async function initialize() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id UUID PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS managed_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Se requiere un token Bearer.' });
  try {
    req.identity = jwt.verify(token, JWT_SECRET, { issuer: 'microservices-auth' });
    next();
  } catch {
    return res.status(401).json({ error: 'El token es inválido o ha expirado.' });
  }
}
app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ service: 'user-service', status: 'ok' }); }
  catch { res.status(503).json({ service: 'user-service', status: 'unavailable' }); }
});
app.get('/users/me', authenticate, async (req, res) => {
  try {
    // Sincronización idempotente del perfil a partir de la identidad firmada por auth-service.
    const result = await pool.query(`
      INSERT INTO profiles (id, name, email)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email
      RETURNING id, name, email, created_at
    `, [req.identity.sub, req.identity.name || req.identity.email.split('@')[0], req.identity.email]);
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error consultando perfil:', error.message);
    res.status(500).json({ error: 'No se pudo consultar el perfil.' });
  }
});

// CRUD básico de registros de usuario (protegido mediante JWT).
app.get('/users', authenticate, async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, created_at FROM managed_users ORDER BY created_at DESC'
    );
    res.json({ users: result.rows });
  } catch (error) {
    console.error('Error listando usuarios:', error.message);
    res.status(500).json({ error: 'No se pudieron consultar los usuarios.' });
  }
});

app.post('/users', authenticate, async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({ error: 'El nombre debe tener entre 2 y 100 caracteres.' });
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Introduce un correo electrónico válido.' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO managed_users (name, email) VALUES ($1, $2) RETURNING id, name, email, created_at',
      [name, email]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un registro con ese correo.' });
    console.error('Error creando usuario:', error.message);
    res.status(500).json({ error: 'No se pudo crear el usuario.' });
  }
});

app.patch('/users/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({ error: 'El nombre debe tener entre 2 y 100 caracteres.' });
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Introduce un correo electrónico válido.' });
  }
  try {
    const result = await pool.query(
      'UPDATE managed_users SET name = $1, email = $2 WHERE id = $3 RETURNING id, name, email, created_at',
      [name, email, id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'El usuario no existe.' });
    res.json({ user: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un registro con ese correo.' });
    if (error.code === '22P02') return res.status(400).json({ error: 'El identificador del usuario no es válido.' });
    console.error('Error actualizando usuario:', error.message);
    res.status(500).json({ error: 'No se pudo actualizar el usuario.' });
  }
});

app.delete('/users/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM managed_users WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'El usuario no existe.' });
    res.json({ message: 'Usuario eliminado correctamente.' });
  } catch (error) {
    if (error.code === '22P02') return res.status(400).json({ error: 'El identificador del usuario no es válido.' });
    console.error('Error eliminando usuario:', error.message);
    res.status(500).json({ error: 'No se pudo eliminar el usuario.' });
  }
});
const port = Number(process.env.PORT || 3002);
initialize().then(() => app.listen(port, '0.0.0.0', () => console.log(`User service escuchando en ${port}`)))
  .catch(error => { console.error('No se pudo inicializar user-service:', error); process.exit(1); });
