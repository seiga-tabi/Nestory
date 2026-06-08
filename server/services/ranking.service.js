const { listPublicStreamers } = require('./streamer.service');

async function rankings() {
  const items = await listPublicStreamers({ sort: 'popular', status: 'all' });
  return items.map((item, index) => ({ rank: index + 1, ...item }));
}

module.exports = { rankings };
