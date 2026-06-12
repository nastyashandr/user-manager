require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const { pool, initDB } = require('./db');

const app = express();
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

app.use(session({
    secret: process.env.SESSION_SECRET || 'secret123',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// Check user
async function checkUserStatus(req) {
    if (!req.session.userId) return { isValid: false };
    const { rows } = await pool.query('SELECT id, status FROM users WHERE id = $1', [req.session.userId]);
    if (!rows.length || rows[0].status === 'blocked') {
        req.session.destroy();
        return { isValid: false };
    }
    return { isValid: true, user: rows[0] };
}

async function authMiddleware(req, res, next) {
    const { isValid, user } = await checkUserStatus(req);
    if (!isValid) return res.redirect('/login');
    req.user = user;
    next();
}

async function apiAuthMiddleware(req, res, next) {
    const { isValid, user } = await checkUserStatus(req);
    if (!isValid) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    next();
}

app.get('/register', (req, res) => res.render('register', { error: null, success: null }));

app.post('/register', async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
        return res.render('register', { error: 'All fields are required', success: null });

    try {
        const { rows } = await pool.query(
            'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id',
            [name, email.toLowerCase(), await bcrypt.hash(password, 10)]
        );

        const verifyLink = `http://localhost:3000/verify/${rows[0].id}`;

        transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Verify your email',
            html: `<a href="${verifyLink}">Click to verify your email</a>`
        });

        res.render('register', { error: null, success: 'Registered! Check your email.' });

    } catch (err) {
        const error = err.code === '23505' ? 'Email already exists' : 'Registration failed';
        res.render('register', { error, success: null });
    }
});

app.get('/verify/:id', async (req, res) => {
    await pool.query("UPDATE users SET status='active' WHERE id=$1 AND status='unverified'", [req.params.id]);
    res.redirect('/login');
});

app.get('/login', (req, res) => res.render('login', { error: req.query.message || null }));

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email?.toLowerCase()]);
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password)))
        return res.render('login', { error: 'Invalid email or password' });

    if (user.status === 'blocked')
        return res.render('login', { error: 'Your account has been blocked' });

    await pool.query('UPDATE users SET last_login=NOW() WHERE id=$1', [user.id]);
    req.session.userId = user.id;
    res.redirect('/admin');
});

app.get('/admin', authMiddleware, async (req, res) => {
    const { rows } = await pool.query(
        'SELECT id, name, email, status, last_login, created_at FROM users ORDER BY last_login DESC NULLS LAST'
    );
    res.render('admin', { users: rows, currentUserId: req.session.userId });
});

app.post('/api/block', apiAuthMiddleware, async (req, res) => {
    await pool.query("UPDATE users SET status='blocked' WHERE id=ANY($1)", [req.body.ids]);
    res.json({ success: true });
});

app.post('/api/unblock', apiAuthMiddleware, async (req, res) => {
    await pool.query("UPDATE users SET status='active' WHERE id=ANY($1)", [req.body.ids]);
    res.json({ success: true });
});

app.post('/api/delete', apiAuthMiddleware, async (req, res) => {
    const { ids } = req.body;
    await pool.query('DELETE FROM users WHERE id=ANY($1)', [ids]);

    if (ids.map(String).includes(String(req.user.id))) {
        req.session.destroy();
        return res.status(410).json({ success: true });
    }

    res.json({ success: true });
});

app.post('/api/delete-unverified', apiAuthMiddleware, async (req, res) => {
    await pool.query("DELETE FROM users WHERE status='unverified'");
    res.json({ success: true });
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

const PORT = process.env.PORT || 3000;
initDB().then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)));