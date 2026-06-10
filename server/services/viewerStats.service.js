const COLLECTION_NOTE = '채팅 통계는 Nestory가 수집을 시작한 이후의 데이터만 표시됩니다.';

async function getViewerStats(user) {
  return {
    ok: true,
    code: 'VIEWER_STATS_COLLECTION_NOT_STARTED',
    summary: {
      totalMessages: 0,
      activeChannels: 0,
      topChannel: null
    },
    channels: [],
    viewer: {
      id: user.id,
      twitchUserId: user.twitchUserId || null,
      twitchLogin: user.twitchLogin || null
    },
    collection: {
      started: false,
      source: 'nestory_chat_events',
      historicalTwitchImport: false
    },
    note: COLLECTION_NOTE
  };
}

module.exports = {
  getViewerStats
};
