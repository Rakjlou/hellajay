const express = require('express');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

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
app.post('/api/contact', async (req, res) => {
  const { name, email, message } = req.body;

  // Validate required fields
  if (!name || !email || !message) {
    return res.status(400).json({
      success: false,
      error: 'All fields are required'
    });
  }

  console.log('Contact form submission:', { name, email, message });

  // Send email if credentials are configured
  const contactEmail = process.env.CONTACT_EMAIL;
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && contactEmail) {
    try {
      await emailTransporter.sendMail({
        from: process.env.GMAIL_USER,
        replyTo: email,
        to: contactEmail,
        cc: email,
        subject: `[Hellajay] Message from ${name}`,
        text: `New message from the Hellajay website contact form:\n\nName: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
        html: `
          <h2>New message from the Hellajay website</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <hr>
          <p><strong>Message:</strong></p>
          <p>${message.replace(/\n/g, '<br>')}</p>
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

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
