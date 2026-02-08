require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const connectDB = require('./config/db');

const app = express();

// Connect to MongoDB
connectDB();

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
const rootDir = path.join(__dirname, '..');
app.use('/', express.static(rootDir, { index: 'index.html' }));
app.use('/dashboard', express.static(path.join(rootDir, 'dashboard')));
app.use('/admin', express.static(path.join(rootDir, 'admin')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/import', require('./routes/import'));

// Fallback routes for SPA-like navigation (Express 5 syntax)
app.get('/dashboard/{*path}', (req, res) => {
    res.sendFile(path.join(rootDir, 'dashboard', 'index.html'));
});
app.get('/admin/{*path}', (req, res) => {
    res.sendFile(path.join(rootDir, 'admin', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Travelins Server running on port ${PORT}`);
    console.log(`Marketing site: http://localhost:${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin`);
    console.log(`Company dashboard: http://localhost:${PORT}/dashboard`);
});
