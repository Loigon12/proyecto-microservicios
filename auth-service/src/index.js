const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '20kb' }));
app.disable('x-powered-by');

const pool = new Pool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, max: 10
});
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET es obligatorio');

async function initialize() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS credentials (
      id UUID PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ service: 'auth-service', status: 'ok' }); }
  catch { res.status(503).json({ service: 'auth-service', status: 'unavailable' }); }
});
app.post('/auth/register', async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'El nombre debe tener entre 2 y 100 caracteres.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'Introduce un correo válido.' });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'La contraseña debe tener entre 8 y 72 caracteres.' });
    const id = require('crypto').randomUUID();
    const hash = await bcrypt.hash(password, 12);
    await pool.query('INSERT INTO credentials (id, name, email, password_hash) VALUES ($1, $2, $3, $4)', [id, name, email, hash]);
    return res.status(201).json({ message: 'Cuenta creada. Ya puedes iniciar sesión.' });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    console.error('Error registrando usuario:', error.message);
    return res.status(500).json({ error: 'No se pudo crear la cuenta.' });
  }
});
app.post('/auth/login', async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!email || !password) return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
    const result = await pool.query('SELECT id, name, email, password_hash FROM credentials WHERE email = $1', [email]);
    const account = result.rows[0];
    if (!account || !(await bcrypt.compare(password, account.password_hash))) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }
    const token = jwt.sign({ sub: account.id, name: account.name, email: account.email }, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '2h', issuer: 'microservices-auth' });
    return res.json({ token, tokenType: 'Bearer', expiresIn: process.env.JWT_EXPIRES_IN || '2h', user: { id: account.id, name: account.name, email: account.email } });
  } catch (error) {
    console.error('Error iniciando sesión:', error.message);
    return res.status(500).json({ error: 'No se pudo iniciar sesión.' });
  }
});
const port = Number(process.env.PORT || 3001);
initialize().then(() => app.listen(port, '0.0.0.0', () => console.log(`Auth service escuchando en ${port}`)))
  .catch(error => { console.error('No se pudo inicializar auth-service:', error); process.exit(1); });
