const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Paths
const DATA_DIR = path.join(__dirname, '..', 'data');
const LOCALES_DIR = path.join(DATA_DIR, 'locales');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const WORK_DIR = path.join(__dirname, '..', 'public', 'work');
const BIO_PATH = path.join(DATA_DIR, 'bio.json');
const TRACKS_PATH = path.join(DATA_DIR, 'tracks.json');

// Rate limiting for admin routes
// 100 requests per minute - generous for normal usage, still blocks brute-force
const adminLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

router.use(adminLimiter);

// HTTP Basic Auth middleware with timing-safe comparison
function basicAuth(req, res, next) {
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS;

  if (!adminPass) {
    console.error('ADMIN_PASS environment variable not set');
    return res.status(500).send('Server configuration error');
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Authentication required');
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
  const [user, pass] = credentials.split(':');

  // Timing-safe comparison (pad to same length to avoid leaking length info)
  const userInput = user || '';
  const passInput = pass || '';
  const maxUserLen = Math.max(userInput.length, adminUser.length);
  const maxPassLen = Math.max(passInput.length, adminPass.length);

  const userBuffer = Buffer.alloc(maxUserLen, 0);
  const expectedUserBuffer = Buffer.alloc(maxUserLen, 0);
  const passBuffer = Buffer.alloc(maxPassLen, 0);
  const expectedPassBuffer = Buffer.alloc(maxPassLen, 0);

  Buffer.from(userInput).copy(userBuffer);
  Buffer.from(adminUser).copy(expectedUserBuffer);
  Buffer.from(passInput).copy(passBuffer);
  Buffer.from(adminPass).copy(expectedPassBuffer);

  const userMatch = crypto.timingSafeEqual(userBuffer, expectedUserBuffer) &&
    userInput.length === adminUser.length;
  const passMatch = crypto.timingSafeEqual(passBuffer, expectedPassBuffer) &&
    passInput.length === adminPass.length;

  if (userMatch && passMatch) {
    return next();
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
  return res.status(401).send('Invalid credentials');
}

router.use(basicAuth);

// Multer config for image uploads
const imageStorage = multer.diskStorage({
  destination: IMAGES_DIR,
  filename: (req, file, cb) => {
    cb(null, 'profile.webp');
  }
});

const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/webp', 'image/jpeg', 'image/png', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: webp, jpeg, png, gif'));
    }
  }
});

// Multer config for audio uploads
const audioStorage = multer.diskStorage({
  destination: WORK_DIR,
  filename: (req, file, cb) => {
    // Sanitize filename
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, safeName);
  }
});

const audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/flac', 'audio/x-flac'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: mp3, wav, ogg, m4a, flac'));
    }
  }
});

// Helper functions
function loadJson(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function saveJson(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

function loadTracksJson() {
  try {
    return JSON.parse(fs.readFileSync(TRACKS_PATH, 'utf8'));
  } catch (e) {
    return { tracks: [] };
  }
}

function saveTracksJson(data) {
  fs.writeFileSync(TRACKS_PATH, JSON.stringify(data, null, 2));
}

// Get reloadTracks from server.js (lazy-loaded to avoid circular dependency)
function reloadTracks() {
  const server = require('../server');
  if (server && server.reloadTracks) {
    server.reloadTracks();
  }
}

// Routes

// Redirect to about page
router.get('/', (req, res) => {
  res.redirect('/admin/about');
});

// About page - edit bio and photo
router.get('/about', (req, res) => {
  const bio = loadJson(BIO_PATH) || { en: '', fr: '' };
  const message = req.query.message || null;
  const error = req.query.error || null;
  res.render('admin/about', { bio, message, error, page: 'about' });
});

// Save bio
router.post('/about/bio', express.urlencoded({ extended: false }), (req, res) => {
  const { bioEn, bioFr } = req.body;
  const bio = {
    en: (bioEn || '').trim(),
    fr: (bioFr || '').trim()
  };
  saveJson(BIO_PATH, bio);
  res.redirect('/admin/about?message=Bio saved successfully');
});

// Upload photo
router.post('/about/photo', imageUpload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.redirect('/admin/about?error=No file uploaded');
  }
  res.redirect('/admin/about?message=Photo updated successfully');
});

// Work page - manage audio files
router.get('/work', (req, res) => {
  const tracksData = loadTracksJson();
  const message = req.query.message || null;
  const error = req.query.error || null;
  res.render('admin/work', { tracks: tracksData.tracks, message, error, page: 'work' });
});

// Upload audio
router.post('/work/upload', audioUpload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.redirect('/admin/work?error=No file uploaded');
  }

  // Add entry to tracks.json
  const tracksData = loadTracksJson();
  const filename = req.file.filename;
  const title = path.basename(filename, path.extname(filename));

  tracksData.tracks.push({ filename, title });
  saveTracksJson(tracksData);
  reloadTracks();

  res.redirect('/admin/work?message=Track uploaded successfully');
});

// Delete audio
router.post('/work/delete', express.urlencoded({ extended: false }), (req, res) => {
  const { filename } = req.body;

  // Path traversal protection
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return res.redirect('/admin/work?error=Invalid filename');
  }

  const filepath = path.join(WORK_DIR, filename);

  // Ensure file is within WORK_DIR
  if (!filepath.startsWith(WORK_DIR)) {
    return res.redirect('/admin/work?error=Invalid path');
  }

  // Remove entry from tracks.json
  const tracksData = loadTracksJson();
  const index = tracksData.tracks.findIndex(t => t.filename === filename);
  if (index === -1) {
    return res.redirect('/admin/work?error=Track not found in database');
  }

  tracksData.tracks.splice(index, 1);
  saveTracksJson(tracksData);

  // Delete the actual file
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
  }

  reloadTracks();
  res.redirect('/admin/work?message=Track deleted successfully');
});

// Update track title
router.post('/work/update', express.urlencoded({ extended: false }), (req, res) => {
  const { filename, title } = req.body;

  if (!filename || !title) {
    return res.redirect('/admin/work?error=Missing filename or title');
  }

  // Path traversal protection
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return res.redirect('/admin/work?error=Invalid filename');
  }

  const tracksData = loadTracksJson();
  const track = tracksData.tracks.find(t => t.filename === filename);

  if (!track) {
    return res.redirect('/admin/work?error=Track not found');
  }

  track.title = title.trim();
  saveTracksJson(tracksData);
  reloadTracks();

  res.redirect('/admin/work?message=Title updated successfully');
});

// Reorder tracks (swap positions)
router.post('/work/reorder', express.urlencoded({ extended: false }), (req, res) => {
  const { filename, direction } = req.body;

  if (!filename || !direction) {
    return res.redirect('/admin/work?error=Missing parameters');
  }

  // Path traversal protection
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return res.redirect('/admin/work?error=Invalid filename');
  }

  const tracksData = loadTracksJson();
  const index = tracksData.tracks.findIndex(t => t.filename === filename);

  if (index === -1) {
    return res.redirect('/admin/work?error=Track not found');
  }

  let newIndex;
  if (direction === 'up' && index > 0) {
    newIndex = index - 1;
  } else if (direction === 'down' && index < tracksData.tracks.length - 1) {
    newIndex = index + 1;
  } else {
    return res.redirect('/admin/work');
  }

  // Swap positions
  const temp = tracksData.tracks[index];
  tracksData.tracks[index] = tracksData.tracks[newIndex];
  tracksData.tracks[newIndex] = temp;

  saveTracksJson(tracksData);
  reloadTracks();

  res.redirect('/admin/work?message=Track reordered');
});

// Translations page
router.get('/translations', (req, res) => {
  const en = loadJson(path.join(LOCALES_DIR, 'en.json')) || {};
  const fr = loadJson(path.join(LOCALES_DIR, 'fr.json')) || {};
  const message = req.query.message || null;
  const error = req.query.error || null;
  res.render('admin/translations', { en, fr, message, error, page: 'translations' });
});

// Save translations
router.post('/translations', express.urlencoded({ extended: true }), (req, res) => {
  const { en, fr } = req.body;

  try {
    // Parse and validate JSON
    const enData = typeof en === 'string' ? JSON.parse(en) : en;
    const frData = typeof fr === 'string' ? JSON.parse(fr) : fr;

    saveJson(path.join(LOCALES_DIR, 'en.json'), enData);
    saveJson(path.join(LOCALES_DIR, 'fr.json'), frData);

    res.redirect('/admin/translations?message=Translations saved successfully');
  } catch (e) {
    res.redirect('/admin/translations?error=Invalid JSON format');
  }
});

// Error handler for multer
router.use((err, req, res, next) => {
  // Safe redirect: only use referer if it's a local admin path
  const referer = req.headers.referer || '';
  const isLocalAdmin = referer.includes('/admin/');
  const redirectBase = isLocalAdmin ? referer.split('?')[0] : '/admin';

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.redirect(redirectBase + '?error=File too large');
    }
    return res.redirect(redirectBase + '?error=' + encodeURIComponent(err.message));
  }
  if (err) {
    return res.redirect(redirectBase + '?error=' + encodeURIComponent(err.message));
  }
  next();
});

module.exports = router;
