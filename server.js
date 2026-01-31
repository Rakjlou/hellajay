const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Load translations at startup
const translations = {
  en: require('./public/locales/en.json'),
  fr: require('./public/locales/fr.json')
};

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
  return value || key;
};

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

// Serve only rakui-css (not entire node_modules)
app.use('/css/rakui.css', express.static(path.join(__dirname, 'node_modules/rakui-css/dist/rakui.css')));

// Parse JSON bodies (for contact form API)
app.use(express.json());

// Scan work directory for audio files
function getAudioFiles() {
  const workDir = path.join(__dirname, 'public', 'work');
  if (!fs.existsSync(workDir)) return [];

  const extensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];
  return fs.readdirSync(workDir)
    .filter(file => extensions.includes(path.extname(file).toLowerCase()))
    .map(file => ({
      url: `/work/${encodeURIComponent(file)}`,
      title: path.basename(file, path.extname(file))
    }));
}

// Page routes
app.get('/', (req, res) => res.render('index', { audioFiles: getAudioFiles() }));
app.get('/en', (req, res) => res.render('index', { audioFiles: getAudioFiles() }));
app.get('/fr', (req, res) => res.render('index', { audioFiles: getAudioFiles() }));

// API endpoint for contact form
app.post('/api/contact', (req, res) => {
  const { name, email, message } = req.body;

  // Validate required fields
  if (!name || !email || !message) {
    return res.status(400).json({
      success: false,
      error: 'All fields are required'
    });
  }

  // Log the submission (in production: send email, store in DB, etc.)
  console.log('Contact form submission:', { name, email, message });

  res.json({
    success: true,
    message: 'Message received! Thank you for reaching out.'
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
