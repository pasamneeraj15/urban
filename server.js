const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const root = path.join(__dirname);
const usersFile = path.join(root, 'users.json');
let dbReady = false;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    return res.sendStatus(200);
  }
  next();
});

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(usersFile, 'utf8'));
  } catch (error) {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

async function isEmailRegistered(email) {
  const normalizedEmail = normalizeEmail(email);

  if (dbReady) {
    try {
      const [rows] = await db.execute('SELECT email FROM login WHERE email = ?', [normalizedEmail]);
      if (rows.length > 0) {
        return true;
      }
    } catch (error) {
      console.warn('DB email check failed, falling back to users.json:', error.message);
    }
  }

  return readUsers().some((user) => normalizeEmail(user.email) === normalizedEmail);
}

async function findUser(email, password) {
  const normalizedEmail = normalizeEmail(email);

  if (dbReady) {
    try {
      const [rows] = await db.execute('SELECT * FROM login WHERE email = ? AND password = ?', [normalizedEmail, password]);
      if (rows.length > 0) {
        return rows[0];
      }
    } catch (error) {
      console.warn('DB login check failed, falling back to users.json:', error.message);
    }
  }

  return readUsers().find(
    (user) => normalizeEmail(user.email) === normalizedEmail && user.password === password
  );
}

async function saveUser(newUser) {
  if (dbReady) {
    try {
      await db.execute('INSERT INTO login (fullName, email, password) VALUES (?, ?, ?)', [
        newUser.fullName,
        normalizeEmail(newUser.email),
        newUser.password,
      ]);
      return true;
    } catch (error) {
      console.warn('Database insert failed, saving locally instead:', error.message);
    }
  }

  const users = readUsers();
  users.push({
    ...newUser,
    email: normalizeEmail(newUser.email),
  });
  writeUsers(users);
  return false;
}

async function initializeDatabase() {
  try {
    await db.initializeDatabase();
    dbReady = true;
  } catch (error) {
    dbReady = false;
    console.warn('Database unavailable. Falling back to users.json only.');
  }
}

app.use(express.static(root));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(root, 'web.html'));
});

app.get('/register', (req, res) => {
  res.send('Use the registration form to create an account.');
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  try {
    const user = await findUser(email, password);
    if (user) {
      return res.json({ success: true, message: 'Login successful.', user: { fullName: user.fullName, email: normalizeEmail(user.email) } });
    }

    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({ success: false, message: 'Login failed.' });
  }
});

app.post('/register', async (req, res) => {
  const { fullName, email, password, confirmPassword } = req.body;

  if (!fullName || !email || !password || !confirmPassword) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ success: false, message: 'Passwords do not match.' });
  }

  const normalizedEmail = normalizeEmail(email);
  const alreadyRegistered = await isEmailRegistered(normalizedEmail);

  if (alreadyRegistered) {
    return res.status(400).json({ success: false, message: 'Email already registered. Please use a different email.' });
  }

  const newUser = {
    fullName,
    email: normalizedEmail,
    password,
    createdAt: new Date().toISOString(),
  };

  try {
    const savedToDb = await saveUser(newUser);
    const message = savedToDb
      ? 'Registration successful.'
      : 'Registration saved locally. Database is unavailable.';
    return res.json({ success: true, message });
  } catch (error) {
    console.error('Registration error:', error.message);
    return res.status(500).json({ success: false, message: 'Registration failed.' });
  }
});

initializeDatabase();

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
