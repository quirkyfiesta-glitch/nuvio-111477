const assert = require('node:assert/strict');
const { getStreams } = require('../providers/index111477_v012.js');

const movieHtml = `<!doctype html><html><head>
<meta property="og:title" content="Test Film" />
<title>Test Film (2020) - The Movie Database (TMDB)</title>
</head></html>`;
const showHtml = `<!doctype html><html><head>
<meta property="og:title" content="Test Show" />
<title>Test Show (2021) - The Movie Database (TMDB)</title>
</head></html>`;
function listing(entries) {
  return '<table>' + entries.map(e => `<tr data-entry="true" data-name="${e.name}" data-url="${e.url}"><td class="size" data-sort="${e.size || -1}">${e.label || '-'}</td></tr>`).join('') + '</table>';
}

const originalFetch = global.fetch;
global.fetch = function (url) {
  url = String(url);
  if (url === 'https://www.themoviedb.org/movie/101') {
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(movieHtml), headers: { get: () => null } });
  }
  if (url === 'https://www.themoviedb.org/tv/202') {
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(showHtml), headers: { get: () => null } });
  }
  if (url === 'https://a.111477.xyz/movies/Test%20Film%20(2020)/') {
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(listing([
      { name: 'Test.Film.2020.1080p.WEB-DL.x265.mkv', url: '/d/movie123', size: 1200000000, label: '1.12 GB' }
    ])), headers: { get: () => null } });
  }
  if (url === 'https://a.111477.xyz/tvs/Test%20Show/') {
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(listing([
      { name: 'Season 1', url: 'Season%201/', label: '-' }
    ])), headers: { get: () => null } });
  }
  if (url === 'https://a.111477.xyz/tvs/Test%20Show/Season%201/') {
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(listing([
      { name: 'Test.Show.S01E02.720p.WEB-DL.x264.mkv', url: '/d/episode123', size: 600000000, label: '600 MB' },
      { name: 'Test.Show.S01E03.1080p.WEB-DL.x265.mkv', url: '/d/episode999', size: 800000000, label: '800 MB' }
    ])), headers: { get: () => null } });
  }
  return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('not found'), headers: { get: () => null } });
};

(async () => {
  const movie = await getStreams('101', 'movie', null, null);
  assert.equal(movie.length, 1);
  assert.equal(movie[0].url, 'https://a.111477.xyz/d/movie123?type=mkv');
  assert.equal(movie[0].behaviorHints.filename, 'Test.Film.2020.1080p.WEB-DL.x265.mkv');
  assert.equal(movie[0].size, 1200000000);
  assert.match(movie[0].title, /1080p/);

  const episode = await getStreams('202', 'tv', 1, 2);
  assert.equal(episode.length, 1);
  assert.equal(episode[0].url, 'https://a.111477.xyz/d/episode123?type=mkv');
  assert.equal(episode[0].behaviorHints.filename, 'Test.Show.S01E02.720p.WEB-DL.x264.mkv');
  assert.match(episode[0].title, /720p/);
  console.log('Smoke tests passed: movie lookup, episode filtering, metadata parsing, stable source URLs.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  global.fetch = originalFetch;
});
