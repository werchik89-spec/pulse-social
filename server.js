const express = require('express');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'pulse_secret_key_2024_super_secure';
const DB_FILE = path.join(__dirname, 'pulse.db');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(async (req, res, next) => {
  if (process.env.VERCEL && !db) {
    await dbReady;
  }
  next();
});

if (!process.env.VERCEL) {
  const uploadsDir = path.join(__dirname, 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '_' + Math.random().toString(36).substr(2, 9) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

let db;

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Нет токена' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    res.status(401).json({ error: 'Неверный токен' });
  }
}

function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId = decoded.id;
    } catch {}
  }
  next();
}

function saveDb() {
  if (process.env.VERCEL) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_FILE, buffer);
}

async function initDB() {
  const SQL = await initSqlJs({
    locateFile: file => {
      if (process.env.VERCEL) {
        return `https://sql.js.org/dist/${file}`;
      }
      return path.join(__dirname, 'node_modules', 'sql.js', 'dist', file);
    }
  });
  if (!process.env.VERCEL && fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    bio TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    cover TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    image TEXT DEFAULT '',
    reply_to INTEGER DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (reply_to) REFERENCES posts(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (post_id) REFERENCES posts(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS reposts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (post_id) REFERENCES posts(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (post_id) REFERENCES posts(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER NOT NULL,
    following_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(follower_id, following_id),
    FOREIGN KEY (follower_id) REFERENCES users(id),
    FOREIGN KEY (following_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    from_user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    post_id INTEGER,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (from_user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL,
    to_user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_user_id) REFERENCES users(id),
    FOREIGN KEY (to_user_id) REFERENCES users(id)
  )`);

  saveDb();
  console.log('База данных инициализирована');
}

// ===== AUTH =====
app.post('/api/auth/register', (req, res) => {
  const { username, displayName, email, password } = req.body;
  if (!username || !displayName || !email || !password) {
    return res.status(400).json({ error: 'Все поля обязательны' });
  }
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: 'Имя пользователя 3-20 символов' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль минимум 6 символов' });
  }

  const existing = db.exec(`SELECT id FROM users WHERE username = '${username}' OR email = '${email}'`);
  if (existing.length > 0 && existing[0].values.length > 0) {
    return res.status(400).json({ error: 'Пользователь уже существует' });
  }

  const hash = bcrypt.hashSync(password, 10);
  db.run(`INSERT INTO users (username, display_name, email, password) VALUES ('${username}', '${displayName}', '${email}', '${hash}')`);
  const userId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  saveDb();
  const token = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '30d' });

  res.json({ token, user: { id: userId, username, displayName, email, bio: '', avatar: '', cover: '' } });
});

app.post('/api/auth/login', (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }

  const escaped = login.replace(/'/g, "''");
  const result = db.exec(`SELECT id, username, display_name, email, password, bio, avatar, cover FROM users WHERE username = '${escaped}' OR email = '${escaped}'`);
  if (result.length === 0 || result[0].values.length === 0) {
    return res.status(400).json({ error: 'Неверные данные' });
  }

  const [id, username, displayName, email, hash, bio, avatar, cover] = result[0].values[0];
  if (!bcrypt.compareSync(password, hash)) {
    return res.status(400).json({ error: 'Неверный пароль' });
  }

  const token = jwt.sign({ id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id, username, displayName, email, bio: bio || '', avatar: avatar || '', cover: cover || '' } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const result = db.exec(`SELECT id, username, display_name, email, bio, avatar, cover FROM users WHERE id = ${req.userId}`);
  if (result.length === 0 || result[0].values.length === 0) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  const [id, username, displayName, email, bio, avatar, cover] = result[0].values[0];

  const followersCount = db.exec(`SELECT COUNT(*) FROM follows WHERE following_id = ${id}`)[0]?.values[0][0] || 0;
  const followingCount = db.exec(`SELECT COUNT(*) FROM follows WHERE follower_id = ${id}`)[0]?.values[0][0] || 0;
  const postsCount = db.exec(`SELECT COUNT(*) FROM posts WHERE user_id = ${id}`)[0]?.values[0][0] || 0;

  res.json({ id, username, displayName, email, bio: bio || '', avatar: avatar || '', cover: cover || '', followersCount, followingCount, postsCount });
});

// ===== USERS =====
app.get('/api/users/:username', optionalAuth, (req, res) => {
  const uname = req.params.username.replace(/'/g, "''");
  const result = db.exec(`SELECT id, username, display_name, bio, avatar, cover, created_at FROM users WHERE username = '${uname}'`);
  if (result.length === 0 || result[0].values.length === 0) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  const [id, username, displayName, bio, avatar, cover, createdAt] = result[0].values[0];

  const followersCount = db.exec(`SELECT COUNT(*) FROM follows WHERE following_id = ${id}`)[0]?.values[0][0] || 0;
  const followingCount = db.exec(`SELECT COUNT(*) FROM follows WHERE follower_id = ${id}`)[0]?.values[0][0] || 0;
  const postsCount = db.exec(`SELECT COUNT(*) FROM posts WHERE user_id = ${id}`)[0]?.values[0][0] || 0;

  let isFollowing = false;
  if (req.userId) {
    const f = db.exec(`SELECT id FROM follows WHERE follower_id = ${req.userId} AND following_id = ${id}`);
    isFollowing = f.length > 0 && f[0].values.length > 0;
  }

  res.json({ id, username, displayName, bio: bio || '', avatar: avatar || '', cover: cover || '', createdAt, followersCount, followingCount, postsCount, isFollowing });
});

app.put('/api/users/profile', authMiddleware, (req, res) => {
  const { displayName, bio, avatar, cover } = req.body;
  const d = (displayName || '').replace(/'/g, "''");
  const b = (bio || '').replace(/'/g, "''");
  const a = (avatar || '').replace(/'/g, "''");
  const c = (cover || '').replace(/'/g, "''");

  db.run(`UPDATE users SET display_name = '${d}', bio = '${b}', avatar = '${a}', cover = '${c}' WHERE id = ${req.userId}`);
  saveDb();
  res.json({ success: true });
});

app.post('/api/users/avatar', authMiddleware, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Нет файла' });
  const url = '/uploads/' + req.file.filename;
  db.run(`UPDATE users SET avatar = '${url}' WHERE id = ${req.userId}`);
  saveDb();
  res.json({ url });
});

app.post('/api/users/cover', authMiddleware, upload.single('cover'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Нет файла' });
  const url = '/uploads/' + req.file.filename;
  db.run(`UPDATE users SET cover = '${url}' WHERE id = ${req.userId}`);
  saveDb();
  res.json({ url });
});

app.get('/api/users', optionalAuth, (req, res) => {
  const search = (req.query.q || '').replace(/'/g, "''");
  if (!search) return res.json([]);

  const result = db.exec(`SELECT id, username, display_name, bio, avatar FROM users WHERE username LIKE '%${search}%' OR display_name LIKE '%${search}%' LIMIT 20`);
  if (result.length === 0) return res.json([]);

  const users = result[0].values.map(([id, username, displayName, bio, avatar]) => ({
    id, username, displayName, bio: bio || '', avatar: avatar || ''
  }));
  res.json(users);
});

// ===== POSTS =====
app.post('/api/posts', authMiddleware, (req, res) => {
  const { content, replyTo, image } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Пост не может быть пустым' });
  }
  if (content.length > 500) {
    return res.status(400).json({ error: 'Максимум 500 символов' });
  }

  const c = content.replace(/'/g, "''");
  const img = (image || '').replace(/'/g, "''");
  const reply = replyTo || 'NULL';

  db.run(`INSERT INTO posts (user_id, content, image, reply_to) VALUES (${req.userId}, '${c}', '${img}', ${reply})`);
  const postId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  saveDb();

  if (replyTo) {
    const postOwner = db.exec(`SELECT user_id FROM posts WHERE id = ${replyTo}`);
    if (postOwner.length > 0 && postOwner[0].values[0][0] !== req.userId) {
      db.run(`INSERT INTO notifications (user_id, from_user_id, type, post_id) VALUES (${postOwner[0].values[0][0]}, ${req.userId}, 'reply', ${postId})`);
      saveDb();
    }
  }

  res.json({ id: postId, content, image: img, replyTo: replyTo || null });
});

app.get('/api/posts/feed', authMiddleware, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  const result = db.exec(`
    SELECT p.id, p.content, p.image, p.reply_to, p.created_at,
           u.id, u.username, u.display_name, u.avatar,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes,
           (SELECT COUNT(*) FROM posts WHERE reply_to = p.id) as replies,
           (SELECT COUNT(*) FROM reposts WHERE post_id = p.id) as reposts,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ${req.userId}) as liked,
           (SELECT COUNT(*) FROM reposts WHERE post_id = p.id AND user_id = ${req.userId}) as reposted,
           (SELECT COUNT(*) FROM bookmarks WHERE post_id = p.id AND user_id = ${req.userId}) as bookmarked
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.user_id = ${req.userId}
       OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id = ${req.userId})
       OR p.reply_to IS NULL
    ORDER BY p.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const posts = formatPosts(result);
  res.json(posts);
});

app.get('/api/posts/explore', optionalAuth, (req, res) => {
  const userId = req.userId || 0;
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  const result = db.exec(`
    SELECT p.id, p.content, p.image, p.reply_to, p.created_at,
           u.id, u.username, u.display_name, u.avatar,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes,
           (SELECT COUNT(*) FROM posts WHERE reply_to = p.id) as replies,
           (SELECT COUNT(*) FROM reposts WHERE post_id = p.id) as reposts,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ${userId}) as liked,
           (SELECT COUNT(*) FROM reposts WHERE post_id = p.id AND user_id = ${userId}) as reposted,
           (SELECT COUNT(*) FROM bookmarks WHERE post_id = p.id AND user_id = ${userId}) as bookmarked
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.reply_to IS NULL
    ORDER BY p.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const posts = formatPosts(result);
  res.json(posts);
});

app.get('/api/posts/user/:userId', optionalAuth, (req, res) => {
  const targetId = parseInt(req.params.userId);
  const userId = req.userId || 0;

  const result = db.exec(`
    SELECT p.id, p.content, p.image, p.reply_to, p.created_at,
           u.id, u.username, u.display_name, u.avatar,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes,
           (SELECT COUNT(*) FROM posts WHERE reply_to = p.id) as replies,
           (SELECT COUNT(*) FROM reposts WHERE post_id = p.id) as reposts,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ${userId}) as liked,
           (SELECT COUNT(*) FROM reposts WHERE post_id = p.id AND user_id = ${userId}) as reposted,
           (SELECT COUNT(*) FROM bookmarks WHERE post_id = p.id AND user_id = ${userId}) as bookmarked
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.user_id = ${targetId} AND p.reply_to IS NULL
    ORDER BY p.created_at DESC
  `);

  const posts = formatPosts(result);
  res.json(posts);
});

app.get('/api/posts/:id', optionalAuth, (req, res) => {
  const postId = parseInt(req.params.id);
  const userId = req.userId || 0;

  const result = db.exec(`
    SELECT p.id, p.content, p.image, p.reply_to, p.created_at,
           u.id, u.username, u.display_name, u.avatar,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes,
           (SELECT COUNT(*) FROM posts WHERE reply_to = p.id) as replies,
           (SELECT COUNT(*) FROM reposts WHERE post_id = p.id) as reposts,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ${userId}) as liked,
           (SELECT COUNT(*) FROM reposts WHERE post_id = p.id AND user_id = ${userId}) as reposted,
           (SELECT COUNT(*) FROM bookmarks WHERE post_id = p.id AND user_id = ${userId}) as bookmarked
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.id = ${postId}
  `);

  if (result.length === 0 || result[0].values.length === 0) {
    return res.status(404).json({ error: 'Пост не найден' });
  }

  const post = formatPosts(result)[0];

  const repliesResult = db.exec(`
    SELECT p.id, p.content, p.image, p.reply_to, p.created_at,
           u.id, u.username, u.display_name, u.avatar,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes,
           (SELECT COUNT(*) FROM posts WHERE reply_to = p.id) as replies,
           (SELECT COUNT(*) FROM reposts WHERE post_id = p.id) as reposts,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ${userId}) as liked,
           (SELECT COUNT(*) FROM reposts WHERE post_id = p.id AND user_id = ${userId}) as reposted,
           (SELECT COUNT(*) FROM bookmarks WHERE post_id = p.id AND user_id = ${userId}) as bookmarked
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.reply_to = ${postId}
    ORDER BY p.created_at DESC
  `);

  post.replies = formatPosts(repliesResult);
  res.json(post);
});

app.delete('/api/posts/:id', authMiddleware, (req, res) => {
  const postId = parseInt(req.params.id);
  const result = db.exec(`SELECT user_id FROM posts WHERE id = ${postId}`);
  if (result.length === 0 || result[0].values.length === 0) {
    return res.status(404).json({ error: 'Пост не найден' });
  }
  if (result[0].values[0][0] !== req.userId) {
    return res.status(403).json({ error: 'Нет доступа' });
  }
  db.run(`DELETE FROM likes WHERE post_id = ${postId}`);
  db.run(`DELETE FROM reposts WHERE post_id = ${postId}`);
  db.run(`DELETE FROM bookmarks WHERE post_id = ${postId}`);
  db.run(`DELETE FROM notifications WHERE post_id = ${postId}`);
  db.run(`DELETE FROM posts WHERE reply_to = ${postId}`);
  db.run(`DELETE FROM posts WHERE id = ${postId}`);
  saveDb();
  res.json({ success: true });
});

function formatPosts(result) {
  if (!result || result.length === 0) return [];
  return result[0].values.map(row => ({
    id: row[0], content: row[1], image: row[2] || '', replyTo: row[3], createdAt: row[4],
    user: { id: row[5], username: row[6], displayName: row[7], avatar: row[8] || '' },
    likesCount: row[9], repliesCount: row[10], repostsCount: row[11],
    liked: !!row[12], reposted: !!row[13], bookmarked: !!row[14]
  }));
}

// ===== LIKES =====
app.post('/api/posts/:id/like', authMiddleware, (req, res) => {
  const postId = parseInt(req.params.id);
  const existing = db.exec(`SELECT id FROM likes WHERE user_id = ${req.userId} AND post_id = ${postId}`);
  if (existing.length > 0 && existing[0].values.length > 0) {
    db.run(`DELETE FROM likes WHERE user_id = ${req.userId} AND post_id = ${postId}`);
    saveDb();
    return res.json({ liked: false });
  }

  db.run(`INSERT INTO likes (user_id, post_id) VALUES (${req.userId}, ${postId})`);

  const postOwner = db.exec(`SELECT user_id FROM posts WHERE id = ${postId}`);
  if (postOwner.length > 0 && postOwner[0].values[0][0] !== req.userId) {
    db.run(`INSERT INTO notifications (user_id, from_user_id, type, post_id) VALUES (${postOwner[0].values[0][0]}, ${req.userId}, 'like', ${postId})`);
  }

  saveDb();
  res.json({ liked: true });
});

// ===== REPOSTS =====
app.post('/api/posts/:id/repost', authMiddleware, (req, res) => {
  const postId = parseInt(req.params.id);
  const existing = db.exec(`SELECT id FROM reposts WHERE user_id = ${req.userId} AND post_id = ${postId}`);
  if (existing.length > 0 && existing[0].values.length > 0) {
    db.run(`DELETE FROM reposts WHERE user_id = ${req.userId} AND post_id = ${postId}`);
    saveDb();
    return res.json({ reposted: false });
  }

  db.run(`INSERT INTO reposts (user_id, post_id) VALUES (${req.userId}, ${postId})`);
  saveDb();
  res.json({ reposted: true });
});

// ===== BOOKMARKS =====
app.post('/api/posts/:id/bookmark', authMiddleware, (req, res) => {
  const postId = parseInt(req.params.id);
  const existing = db.exec(`SELECT id FROM bookmarks WHERE user_id = ${req.userId} AND post_id = ${postId}`);
  if (existing.length > 0 && existing[0].values.length > 0) {
    db.run(`DELETE FROM bookmarks WHERE user_id = ${req.userId} AND post_id = ${postId}`);
    saveDb();
    return res.json({ bookmarked: false });
  }

  db.run(`INSERT INTO bookmarks (user_id, post_id) VALUES (${req.userId}, ${postId})`);
  saveDb();
  res.json({ bookmarked: true });
});

app.get('/api/bookmarks', authMiddleware, (req, res) => {
  const result = db.exec(`
    SELECT p.id, p.content, p.image, p.reply_to, p.created_at,
           u.id, u.username, u.display_name, u.avatar,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes,
           (SELECT COUNT(*) FROM posts WHERE reply_to = p.id) as replies,
           (SELECT COUNT(*) FROM reposts WHERE post_id = p.id) as reposts,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ${req.userId}) as liked,
           1 as reposted,
           1 as bookmarked
    FROM bookmarks b
    JOIN posts p ON b.post_id = p.id
    JOIN users u ON p.user_id = u.id
    WHERE b.user_id = ${req.userId}
    ORDER BY b.created_at DESC
  `);

  res.json(formatPosts(result));
});

// ===== FOLLOWS =====
app.post('/api/users/:id/follow', authMiddleware, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (targetId === req.userId) {
    return res.status(400).json({ error: 'Нельзя подписаться на себя' });
  }

  const existing = db.exec(`SELECT id FROM follows WHERE follower_id = ${req.userId} AND following_id = ${targetId}`);
  if (existing.length > 0 && existing[0].values.length > 0) {
    db.run(`DELETE FROM follows WHERE follower_id = ${req.userId} AND following_id = ${targetId}`);
    saveDb();
    return res.json({ following: false });
  }

  db.run(`INSERT INTO follows (follower_id, following_id) VALUES (${req.userId}, ${targetId})`);
  db.run(`INSERT INTO notifications (user_id, from_user_id, type) VALUES (${targetId}, ${req.userId}, 'follow')`);
  saveDb();
  res.json({ following: true });
});

app.get('/api/users/:id/followers', (req, res) => {
  const userId = parseInt(req.params.id);
  const result = db.exec(`
    SELECT u.id, u.username, u.display_name, u.bio, u.avatar
    FROM follows f
    JOIN users u ON f.follower_id = u.id
    WHERE f.following_id = ${userId}
    ORDER BY f.created_at DESC
  `);
  if (result.length === 0) return res.json([]);
  res.json(result[0].values.map(r => ({ id: r[0], username: r[1], displayName: r[2], bio: r[3] || '', avatar: r[4] || '' })));
});

app.get('/api/users/:id/following', (req, res) => {
  const userId = parseInt(req.params.id);
  const result = db.exec(`
    SELECT u.id, u.username, u.display_name, u.bio, u.avatar
    FROM follows f
    JOIN users u ON f.following_id = u.id
    WHERE f.follower_id = ${userId}
    ORDER BY f.created_at DESC
  `);
  if (result.length === 0) return res.json([]);
  res.json(result[0].values.map(r => ({ id: r[0], username: r[1], displayName: r[2], bio: r[3] || '', avatar: r[4] || '' })));
});

// ===== NOTIFICATIONS =====
app.get('/api/notifications', authMiddleware, (req, res) => {
  db.run(`UPDATE notifications SET read = 1 WHERE user_id = ${req.userId}`);
  saveDb();

  const result = db.exec(`
    SELECT n.id, n.type, n.post_id, n.read, n.created_at,
           u.id, u.username, u.display_name, u.avatar
    FROM notifications n
    JOIN users u ON n.from_user_id = u.id
    WHERE n.user_id = ${req.userId}
    ORDER BY n.created_at DESC
    LIMIT 50
  `);

  if (result.length === 0) return res.json([]);
  const notifications = result[0].values.map(r => ({
    id: r[0], type: r[1], postId: r[2], read: !!r[3], createdAt: r[4],
    fromUser: { id: r[5], username: r[6], displayName: r[7], avatar: r[8] || '' }
  }));
  res.json(notifications);
});

app.get('/api/notifications/count', authMiddleware, (req, res) => {
  const result = db.exec(`SELECT COUNT(*) FROM notifications WHERE user_id = ${req.userId} AND read = 0`);
  const count = result[0]?.values[0][0] || 0;
  res.json({ count });
});

// ===== MESSAGES =====
app.get('/api/messages/conversations', authMiddleware, (req, res) => {
  const result = db.exec(`
    SELECT
      CASE WHEN m.from_user_id = ${req.userId} THEN m.to_user_id ELSE m.from_user_id END as other_id,
      u.username, u.display_name, u.avatar,
      m.content as last_message, m.created_at as last_at,
      (SELECT COUNT(*) FROM messages WHERE from_user_id = other_id AND to_user_id = ${req.userId} AND read = 0) as unread
    FROM messages m
    JOIN users u ON u.id = CASE WHEN m.from_user_id = ${req.userId} THEN m.to_user_id ELSE m.from_user_id END
    WHERE m.from_user_id = ${req.userId} OR m.to_user_id = ${req.userId}
    GROUP BY other_id
    ORDER BY last_at DESC
  `);

  if (result.length === 0) return res.json([]);
  res.json(result[0].values.map(r => ({
    user: { id: r[0], username: r[1], displayName: r[2], avatar: r[3] || '' },
    lastMessage: r[4], lastAt: r[5], unread: r[6]
  })));
});

app.get('/api/messages/:userId', authMiddleware, (req, res) => {
  const otherId = parseInt(req.params.userId);
  db.run(`UPDATE messages SET read = 1 WHERE from_user_id = ${otherId} AND to_user_id = ${req.userId}`);
  saveDb();

  const result = db.exec(`
    SELECT id, from_user_id, to_user_id, content, read, created_at
    FROM messages
    WHERE (from_user_id = ${req.userId} AND to_user_id = ${otherId})
       OR (from_user_id = ${otherId} AND to_user_id = ${req.userId})
    ORDER BY created_at ASC
  `);

  if (result.length === 0) return res.json([]);
  res.json(result[0].values.map(r => ({
    id: r[0], fromUserId: r[1], toUserId: r[2], content: r[3], read: !!r[4], createdAt: r[5]
  })));
});

app.post('/api/messages/:userId', authMiddleware, (req, res) => {
  const toId = parseInt(req.params.userId);
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Пустое сообщение' });

  const c = content.replace(/'/g, "''");
  db.run(`INSERT INTO messages (from_user_id, to_user_id, content) VALUES (${req.userId}, ${toId}, '${c}')`);
  const msgId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  saveDb();
  res.json({ id: msgId, fromUserId: req.userId, toUserId: toId, content, read: false, createdAt: new Date().toISOString() });
});

// ===== SEARCH =====
app.get('/api/search', optionalAuth, (req, res) => {
  const q = (req.query.q || '').replace(/'/g, "''");
  if (!q) return res.json({ users: [], posts: [] });

  const usersResult = db.exec(`SELECT id, username, display_name, bio, avatar FROM users WHERE username LIKE '%${q}%' OR display_name LIKE '%${q}%' LIMIT 10`);
  const users = usersResult.length > 0 ? usersResult[0].values.map(r => ({ id: r[0], username: r[1], displayName: r[2], bio: r[3] || '', avatar: r[4] || '' })) : [];

  const userId = req.userId || 0;
  const postsResult = db.exec(`
    SELECT p.id, p.content, p.image, p.reply_to, p.created_at,
           u.id, u.username, u.display_name, u.avatar,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes,
           (SELECT COUNT(*) FROM posts WHERE reply_to = p.id) as replies,
           (SELECT COUNT(*) FROM reposts WHERE post_id = p.id) as reposts,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ${userId}) as liked,
           (SELECT COUNT(*) FROM reposts WHERE post_id = p.id AND user_id = ${userId}) as reposted,
           (SELECT COUNT(*) FROM bookmarks WHERE post_id = p.id AND user_id = ${userId}) as bookmarked
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.content LIKE '%${q}%'
    ORDER BY p.created_at DESC
    LIMIT 20
  `);
  const posts = formatPosts(postsResult);

  res.json({ users, posts });
});

// ===== TRENDS (simple) =====
app.get('/api/trends', (req, res) => {
  const result = db.exec(`
    SELECT p.content, COUNT(*) as cnt
    FROM likes l
    JOIN posts p ON l.post_id = p.id
    WHERE l.created_at > datetime('now', '-7 days')
    GROUP BY p.id
    ORDER BY cnt DESC
    LIMIT 10
  `);
  if (result.length === 0) return res.json([]);
  res.json(result[0].values.map(r => ({ content: r[0], count: r[1] })));
});

// ===== SUGGESTED =====
app.get('/api/suggested', authMiddleware, (req, res) => {
  const result = db.exec(`
    SELECT id, username, display_name, bio, avatar
    FROM users
    WHERE id != ${req.userId}
      AND id NOT IN (SELECT following_id FROM follows WHERE follower_id = ${req.userId})
    ORDER BY RANDOM()
    LIMIT 5
  `);
  if (result.length === 0) return res.json([]);
  res.json(result[0].values.map(r => ({ id: r[0], username: r[1], displayName: r[2], bio: r[3] || '', avatar: r[4] || '' })));
});

// ===== UPLOAD =====
app.post('/api/upload', authMiddleware, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Нет файла' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const dbReady = initDB();

if (process.env.VERCEL) {
  module.exports = app;
} else {
  dbReady.then(() => {
    app.listen(PORT, () => {
      console.log(`\n  ╔══════════════════════════════════════╗`);
      console.log(`  ║   PULSE Social Network running on    ║`);
      console.log(`  ║   http://localhost:${PORT}              ║`);
      console.log(`  ╚══════════════════════════════════════╝\n`);
    });
  });
}
