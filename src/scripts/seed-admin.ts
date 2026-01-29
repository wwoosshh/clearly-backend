import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

async function seedAdmin() {
  const prisma = new PrismaClient();

  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@clearly.co.kr';
    const randomPassword = crypto.randomBytes(16).toString('hex');
    const hashedPassword = await bcrypt.hash(randomPassword, 12);

    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {
        passwordHash: hashedPassword,
        role: 'ADMIN',
        isActive: true,
      },
      create: {
        email: adminEmail,
        passwordHash: hashedPassword,
        name: '관리자',
        role: 'ADMIN',
        isActive: true,
      },
    });

    console.log('=================================');
    console.log('관리자 계정이 생성/갱신되었습니다.');
    console.log(`이메일: ${adminEmail}`);
    console.log(`비밀번호: ${randomPassword}`);
    console.log(`ID: ${admin.id}`);
    console.log('=================================');
    console.log('⚠️  이 비밀번호를 안전한 곳에 저장하세요.');
  } catch (error) {
    console.error('관리자 계정 생성 실패:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedAdmin();
