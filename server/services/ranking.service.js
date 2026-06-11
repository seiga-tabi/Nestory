const { listPublicStreamers } = require('./streamer.service');

async function rankings(query = {}) {
  const items = await listPublicStreamers({
    ...query,
    sort: 'popular',
    status: 'all'
  });
  return items.map((item, index) => ({ rank: index + 1, ...item }));
}

module.exports = { rankings };
