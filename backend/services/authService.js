const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { prisma } = require('./prismaClient');

// Never fall back to a secret that is written in the source: anyone could read it and forge
// tokens. Without JWT_SECRET the server signs with a random one, so sign-ins last until restart.
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(48).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET is not set: using a temporary secret, so everyone is signed out on restart.');
}
const SALT_ROUNDS = 10;

// Register a new user
async function register(name, email, password) {
  name = String(name).trim();
  email = String(email).trim().toLowerCase();
  if (name.length < 2 || name.length > 80) throw new Error('Please enter your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new Error('Please enter a valid email.');
  if (typeof password !== 'string' || password.length < 6 || password.length > 200) {
    throw new Error('Password must be at least 6 characters.');
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email }
  });
  
  if (existingUser) {
    throw new Error('User with this email already exists');
  }
  
  // Hash password
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  
  // Create user
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword
    }
  });
  
  // Return user without password
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

// Login user and return JWT token
async function login(email, password) {
  email = String(email).trim();
  password = String(password);

  // Find user. New accounts are stored lower-cased; older ones may have been saved as typed
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    || await prisma.user.findUnique({ where: { email } });
  
  if (!user) {
    throw new Error('Incorrect email or password.');
  }
  
  // Verify password
  const isValid = await bcrypt.compare(password, user.password);
  
  if (!isValid) {
    throw new Error('Incorrect email or password.');
  }
  
  // Generate JWT token
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  
  // Return user and token
  const { password: _, ...userWithoutPassword } = user;
  return {
    user: userWithoutPassword,
    token
  };
}

// Verify JWT token - returns user data if valid
function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

// Express middleware to protect routes
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = verifyToken(token);
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Get user by ID
async function getUserById(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

module.exports = {
  JWT_SECRET,
  register,
  login,
  verifyToken,
  authMiddleware,
  getUserById
};
