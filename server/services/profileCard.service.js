const { prisma } = require('../db/prisma');
const { sanitizeText } = require('../utils/sanitize');
const {
  normalizeSocialLinks,
  getRawProfileByUser,
  ensureRawProfileForUser
} = require('./streamer.service');

const dayOrder = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function mapDesign(value) {
  const map = {
    CLEAN_WHITE: 'CLEAN_WHITE',
    SOFT_OVERLAY: 'SOFT_OVERLAY',
    DARK_GLASS: 'DARK_GLASS',
    'style-clean': 'CLEAN_WHITE',
    'style-soft': 'SOFT_OVERLAY',
    'style-dark': 'DARK_GLASS'
  };
  return map[value] || 'CLEAN_WHITE';
}

function normalizeSchedule(items = []) {
  const seen = new Set();
  return items
    .filter((item) => dayOrder.includes(item?.dayOfWeek) && !seen.has(item.dayOfWeek))
    .map((item) => {
      seen.add(item.dayOfWeek);
      return {
        dayOfWeek: item.dayOfWeek,
        startTime: item.startTime ? sanitizeText(item.startTime, 12) : null,
        title: item.title ? sanitizeText(item.title, 120) : null,
        isActive: item.isActive !== false
      };
    });
}

async function updateProfileCard(user, body) {
  const profile = await ensureRawProfileForUser(user);

  const socialLinks = normalizeSocialLinks(body.socialLinks || []);
  const schedule = normalizeSchedule(body.schedule || []);

  await prisma.$transaction(async (tx) => {
    await tx.streamerProfile.update({
      where: { id: profile.id },
      data: {
        name: sanitizeText(body.name, 80) || profile.name,
        handle: sanitizeText(body.handle, 80) || profile.handle,
        subtitle: sanitizeText(body.subtitle, 180) || profile.subtitle,
        mainContent: sanitizeText(body.mainContent, 80) || profile.mainContent,
        language: sanitizeText(body.language, 40) || profile.language,
        cardDesign: mapDesign(body.cardDesign),
        mainColor: sanitizeText(body.mainColor, 20) || profile.mainColor,
        subColor: sanitizeText(body.subColor, 20) || profile.subColor,
        isPublic: typeof body.isPublic === 'boolean' ? body.isPublic : profile.isPublic
      }
    });

    await tx.socialLink.deleteMany({ where: { profileId: profile.id } });
    if (socialLinks.length) {
      await tx.socialLink.createMany({
        data: socialLinks.map((link) => ({ ...link, profileId: profile.id }))
      });
    }

    for (const item of schedule) {
      await tx.streamSchedule.upsert({
        where: { profileId_dayOfWeek: { profileId: profile.id, dayOfWeek: item.dayOfWeek } },
        create: { ...item, profileId: profile.id },
        update: item
      });
    }
  });

  return getRawProfileByUser(user.id);
}

module.exports = { updateProfileCard, normalizeSchedule, mapDesign };
