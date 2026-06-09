const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const dayMap = [
  ['MON', '20:30', '마인크래프트 참가형'],
  ['WED', '20:30', 'LoL 참가형 / 초보자 환영'],
  ['SAT', '21:00', '팬 카드 읽기 / 기획 방송']
];

const samples = [
  {
    email: 'seiga@example.com',
    password: 'seiga1234',
    name: '서야 Seiga',
    slug: 'seiga',
    handle: '@seiga_stream',
    subtitle: '한국어와 일본어로 함께하는 편안한 방송',
    mainContent: '마인크래프트',
    language: 'KR/JA',
    colors: ['#7c3aed', '#f9a8d4'],
    live: true,
    viewers: 1248,
    gameName: 'Minecraft',
    title: '오늘은 마인크래프트 참가형!'
  },
  {
    email: 'nene@example.com',
    password: 'nene1234',
    name: 'Nene Studio',
    slug: 'nene-studio',
    handle: '@nene_studio',
    subtitle: 'LoL 참가형과 초보자 환영 방송',
    mainContent: 'League of Legends',
    language: 'KR',
    colors: ['#2563eb', '#a78bfa'],
    live: true,
    viewers: 842,
    gameName: 'League of Legends',
    title: '초보자 환영 LoL 참가형'
  },
  {
    email: 'yuki@example.com',
    password: 'yuki1234',
    name: 'Yuki GameRoom',
    slug: 'yuki-gameroom',
    handle: '@yuki_gameroom',
    subtitle: '일본어 중심의 스토리 게임과 잔잔한 잡담',
    mainContent: '스토리 게임',
    language: 'JA',
    colors: ['#db2777', '#fde68a'],
    live: false,
    viewers: 0,
    gameName: null,
    title: null
  },
  {
    email: 'haru@example.com',
    password: 'haru1234',
    name: 'Haru Craft',
    slug: 'haru-craft',
    handle: '@haru_craft',
    subtitle: '건축과 생활 서버를 함께 만드는 마인크래프트 월드',
    mainContent: '마인크래프트',
    language: 'JA/KR',
    colors: ['#059669', '#c4b5fd'],
    live: true,
    viewers: 512,
    gameName: 'Minecraft',
    title: '건축 서버 같이 만들어요'
  }
];

function parseBooleanFlag(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return undefined;
}

function resolveSeedPolicy(source = process.env) {
  const nodeEnv = source.NODE_ENV || 'development';
  const explicitSampleFlag = parseBooleanFlag(source.SEED_SAMPLE_DATA);

  return {
    nodeEnv,
    seedSampleData: explicitSampleFlag,
    shouldSeedSampleData: explicitSampleFlag ?? nodeEnv !== 'production'
  };
}

async function upsertStreamer(sample) {
  const passwordHash = await bcrypt.hash(sample.password, 12);
  const user = await prisma.user.upsert({
    where: { email: sample.email },
    update: {
      displayName: sample.name,
      role: 'STREAMER',
      status: 'ACTIVE'
    },
    create: {
      email: sample.email,
      passwordHash,
      displayName: sample.name,
      role: 'STREAMER',
      status: 'ACTIVE'
    }
  });

  const profile = await prisma.streamerProfile.upsert({
    where: { userId: user.id },
    update: {
      slug: sample.slug,
      name: sample.name,
      handle: sample.handle,
      subtitle: sample.subtitle,
      mainContent: sample.mainContent,
      language: sample.language,
      mainColor: sample.colors[0],
      subColor: sample.colors[1],
      isPublic: true
    },
    create: {
      userId: user.id,
      slug: sample.slug,
      name: sample.name,
      handle: sample.handle,
      subtitle: sample.subtitle,
      mainContent: sample.mainContent,
      language: sample.language,
      mainColor: sample.colors[0],
      subColor: sample.colors[1],
      isPublic: true
    }
  });

  await prisma.socialLink.deleteMany({ where: { profileId: profile.id } });
  await prisma.socialLink.createMany({
    data: [
      {
        profileId: profile.id,
        type: 'TWITCH',
        label: 'Twitch',
        url: `https://twitch.tv/${sample.slug.replace(/-/g, '')}`,
        sortOrder: 0
      },
      {
        profileId: profile.id,
        type: 'YOUTUBE',
        label: 'YouTube',
        url: `https://youtube.com/@${sample.slug}`,
        sortOrder: 1
      },
      {
        profileId: profile.id,
        type: 'X',
        label: 'X',
        url: `https://x.com/${sample.slug.replace(/-/g, '_')}`,
        sortOrder: 2
      }
    ]
  });

  for (const [dayOfWeek, startTime, title] of dayMap) {
    await prisma.streamSchedule.upsert({
      where: { profileId_dayOfWeek: { profileId: profile.id, dayOfWeek } },
      update: { startTime, title, isActive: true },
      create: { profileId: profile.id, dayOfWeek, startTime, title, isActive: true }
    });
  }

  await prisma.streamSnapshot.create({
    data: {
      profileId: profile.id,
      isLive: sample.live,
      title: sample.title,
      gameName: sample.gameName,
      viewerCount: sample.viewers,
      startedAt: sample.live ? new Date(Date.now() - 1000 * 60 * 75) : null
    }
  });

  const fanCount = await prisma.fanCard.count({ where: { profileId: profile.id } });
  if (!fanCount) {
    await prisma.fanCard.createMany({
      data: [
        {
          profileId: profile.id,
          senderName: '익명 팬',
          message: '오늘 방송도 기대하고 있어요!',
          emoji: '💜',
          isPublic: true,
          status: 'APPROVED'
        },
        {
          profileId: profile.id,
          senderName: 'nene_viewer',
          message: '처음 들어왔는데 편하게 볼 수 있었어요. 다음 방송도 보러올게요!',
          emoji: '🌸',
          isPublic: true,
          status: 'APPROVED'
        },
        {
          profileId: profile.id,
          senderName: 'JP/KR Viewer',
          message: '다음 콘텐츠도 기대하고 있습니다.',
          emoji: '🎮',
          isPublic: true,
          status: 'PENDING'
        }
      ]
    });
  }

  const now = new Date();
  for (let i = 0; i < 18; i += 1) {
    const createdAt = new Date(now);
    createdAt.setDate(now.getDate() - (i % 7));
    await prisma.pageView.create({
      data: {
        profileId: profile.id,
        path: `/streamer-detail.html?slug=${profile.slug}`,
        visitorHash: `seed-${profile.slug}-${i}`,
        referrer: i % 2 ? 'https://twitch.tv' : null,
        userAgent: 'seed',
        createdAt
      }
    });
  }
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'change-me-admin-password';
  const seedPolicy = resolveSeedPolicy();
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: {
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      displayName: 'Seiga Admin'
    },
    create: {
      email: adminEmail.toLowerCase(),
      passwordHash,
      displayName: 'Seiga Admin',
      role: 'ADMIN',
      status: 'ACTIVE'
    }
  });

  console.log(`Seed sample data: ${seedPolicy.shouldSeedSampleData ? 'enabled' : 'disabled'} (NODE_ENV=${seedPolicy.nodeEnv}, SEED_SAMPLE_DATA=${process.env.SEED_SAMPLE_DATA || 'unset'})`);

  if (seedPolicy.shouldSeedSampleData) {
    for (const sample of samples) {
      await upsertStreamer(sample);
    }

    await prisma.accessRequest.upsert({
      where: { id: 'seed-access-request' },
      update: {},
      create: {
        id: 'seed-access-request',
        name: 'Mika Talk',
        email: 'mika@example.com',
        twitchUrl: 'https://twitch.tv/mika_talk',
        message: '승인 요청 샘플입니다.'
      }
    });
  }
}

if (require.main === module) {
  main()
    .then(async () => {
      console.log('Seed completed');
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}

module.exports = { resolveSeedPolicy };
