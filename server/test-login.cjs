const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const user = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
    const secret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      secret,
      { expiresIn: '7d' }
    );
    console.log(token);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
})();
