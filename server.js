const express = require('express');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const escapeHtml = require('escape-html');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers with helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"]
    }
  }
}));

// Rate limiting for contact form
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: { success: false, error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Valid services whitelist
const VALID_SERVICES = ['editing', 'mixing', 'mastering', 'production', 'midiDrums'];

// Email configuration
const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// Verify email transporter on startup (only if credentials are configured)
if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
  emailTransporter.verify((error) => {
    if (error) {
      console.error('Email transporter error:', error.message);
    } else {
      console.log('Email transporter is ready');
    }
  });
} else {
  console.warn('Email credentials not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD environment variables.');
}

// Data paths
const DATA_DIR = path.join(__dirname, 'data');
const LOCALES_DIR = path.join(DATA_DIR, 'locales');
const BIO_PATH = path.join(DATA_DIR, 'bio.json');
const TRACKS_PATH = path.join(DATA_DIR, 'tracks.json');

// Load translations from data/ directory
function loadTranslations() {
  return {
    en: JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en.json'), 'utf8')),
    fr: JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'fr.json'), 'utf8'))
  };
}

// Load bio from data/bio.json
function loadBio() {
  try {
    return JSON.parse(fs.readFileSync(BIO_PATH, 'utf8'));
  } catch (e) {
    return { en: '', fr: '' };
  }
}

// Load tracks from data/tracks.json
function loadTracksData() {
  try {
    return JSON.parse(fs.readFileSync(TRACKS_PATH, 'utf8'));
  } catch (e) {
    return { tracks: [] };
  }
}

let translations = loadTranslations();
let bio = loadBio();
let tracksData = loadTracksData();

// Reload tracks (called by admin after modifications)
function reloadTracks() {
  tracksData = loadTracksData();
}

// Configure EJS
app.set('views', './views');
app.set('view engine', 'ejs');

// Translation helper (available in all templates via app.locals)
app.locals.t = (key, lang) => {
  const keys = key.split('.');
  let value = translations[lang];
  for (const k of keys) {
    value = value?.[k];
  }
  // Special case: bio comes from bio.json, not locale files
  if (key === 'about.bio') {
    return bio[lang] || value || key;
  }
  return value || key;
};

// Reload translations once per request (not per t() call) to reflect admin changes
app.use((req, res, next) => {
  translations = loadTranslations();
  bio = loadBio();
  next();
});

// Language detection middleware
app.use((req, res, next) => {
  // Priority: path prefix > Accept-Language > 'en'
  const pathLang = req.path.match(/^\/(en|fr)$/)?.[1];
  const headerLang = req.acceptsLanguages('en', 'fr');
  res.locals.lang = pathLang || headerLang || 'en';
  next();
});

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve data/images for admin-uploaded profile photo
app.use('/data/images', express.static(path.join(DATA_DIR, 'images')));

// Serve only rakui-css (not entire node_modules)
app.use('/css/rakui.css', express.static(path.join(__dirname, 'node_modules/rakui-css/dist/rakui.css')));

// Parse JSON bodies (for contact form API)
app.use(express.json());

// Get audio files from tracks.json (order = index in array)
function getAudioFiles() {
  return tracksData.tracks.map(track => ({
    url: `/work/${encodeURIComponent(track.filename)}`,
    title: track.title
  }));
}

// Admin routes
app.use('/admin', adminRouter);

// Page routes
app.get('/', (req, res) => res.render('index', { audioFiles: getAudioFiles() }));
app.get('/en', (req, res) => res.render('index', { audioFiles: getAudioFiles() }));
app.get('/fr', (req, res) => res.render('index', { audioFiles: getAudioFiles() }));

// Contact form validation rules
const contactValidation = [
  body('email')
    .isEmail().withMessage('Valid email is required')
    .isLength({ max: 254 }).withMessage('Email too long')
    .normalizeEmail(),
  body('message')
    .notEmpty().withMessage('Message is required')
    .isLength({ max: 5000 }).withMessage('Message too long (max 5000 characters)')
    .trim(),
  body('bandName')
    .optional()
    .isLength({ max: 200 }).withMessage('Band name too long')
    .trim(),
  body('numberOfSongs')
    .optional()
    .isLength({ max: 50 }).withMessage('Number of songs too long')
    .trim(),
  body('links')
    .optional()
    .isLength({ max: 1000 }).withMessage('Links too long')
    .trim(),
  body('services')
    .optional()
    .customSanitizer(value => {
      // Handle services - can be a string (single checkbox) or array (multiple checkboxes)
      const arr = Array.isArray(value) ? value : (value ? [value] : []);
      // Filter to only valid services
      return arr.filter(s => VALID_SERVICES.includes(s));
    })
];

// API endpoint for contact form with rate limiting and validation
app.post('/api/contact', contactLimiter, contactValidation, async (req, res) => {
  // Check validation results
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: errors.array()[0].msg
    });
  }

  const { email, bandName, numberOfSongs, links, services, message } = req.body;

  // Format services for display
  const selectedServices = services && services.length > 0
    ? services.join(', ')
    : 'None selected';

  console.log('Contact form submission:', { email, bandName, numberOfSongs, links, services: selectedServices, message });

  // Send email if credentials are configured
  const contactEmail = process.env.CONTACT_EMAIL;
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && contactEmail) {
    try {
      const subjectName = bandName || email;
      // Escape all user inputs for HTML email to prevent XSS
      const safeEmail = escapeHtml(email);
      const safeBandName = escapeHtml(bandName || 'Not provided');
      const safeNumberOfSongs = escapeHtml(numberOfSongs || 'Not provided');
      const safeLinks = escapeHtml(links || 'Not provided');
      const safeServices = escapeHtml(selectedServices);
      const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');

      await emailTransporter.sendMail({
        from: process.env.GMAIL_USER,
        replyTo: email,
        to: contactEmail,
        cc: email,
        subject: `[Hellajay] Message from ${subjectName}`,
        text: `New message from the Hellajay website contact form:\n\nEmail: ${email}\nBand/Project Name: ${bandName || 'Not provided'}\nNumber of songs: ${numberOfSongs || 'Not provided'}\nLinks: ${links || 'Not provided'}\nServices: ${selectedServices}\n\nMessage:\n${message}`,
        html: `
          <h2>New message from the Hellajay website</h2>
          <p><strong>Email:</strong> ${safeEmail}</p>
          <p><strong>Band/Project Name:</strong> ${safeBandName}</p>
          <p><strong>Number of songs:</strong> ${safeNumberOfSongs}</p>
          <p><strong>Links:</strong> ${safeLinks}</p>
          <p><strong>Services:</strong> ${safeServices}</p>
          <hr>
          <p><strong>Message:</strong></p>
          <p>${safeMessage}</p>
        `
      });
      console.log('Email sent successfully');
    } catch (error) {
      console.error('Failed to send email:', error.message);
      // Don't fail the request if email fails - still acknowledge the submission
    }
  }

  res.json({
    success: true,
    message: 'Message received! Thank you for reaching out.'
  });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({
    success: false,
    error: 'An unexpected error occurred'
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// Export for admin routes
module.exports = { reloadTracks, TRACKS_PATH };
