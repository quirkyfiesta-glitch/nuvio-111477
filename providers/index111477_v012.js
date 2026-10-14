/*
 * Nuvio provider for the 111477 directory index.
 * It returns the stable index file URL, not a cached workers.dev URL.
 * Nuvio/player follows the index's redirect at playback time.
 */

var INDEX_BASE = 'https://a.111477.xyz/';
var INDEX_GAP_MS = 3400;
var BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
var INDEX_HEADERS = {
  'User-Agent': BROWSER_USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};
var PLAYBACK_HEADERS = {
  'User-Agent': BROWSER_USER_AGENT,
  'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/octet-stream;q=0.8,*/*;q=0.5',
  'Accept-Encoding': 'identity',
  'Referer': INDEX_BASE
};
var _indexQueue = Promise.resolve();
var _lastIndexRequestAt = 0;
var VIDEO_EXTENSIONS = ['mkv', 'mp4', 'avi', 'm4v', 'mov', 'wmv', 'flv', 'webm', 'ts', 'mpg', 'mpeg'];

function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function decodeEntities(value) {
  if (!value || value.indexOf('&') < 0) return value || '';
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|#39);/gi, function (whole, entity) {
    var e = entity.toLowerCase();
    if (e === 'amp') return '&';
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos' || e === '#39') return "'";
    if (e === 'nbsp') return ' ';
    if (e.indexOf('#x') === 0) return String.fromCharCode(parseInt(e.slice(2), 16));
    if (e.indexOf('#') === 0) return String.fromCharCode(parseInt(e.slice(1), 10));
    return whole;
  });
}

function attr(html, key) {
  var escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var re = new RegExp('(?:^|\\s)' + escaped + '\\s*=\\s*(["\\\'])(.*?)\\1', 'i');
  var match = re.exec(html);
  return match ? decodeEntities(match[2]) : '';
}

function getMeta(html, prop) {
  var tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (var i = 0; i < tags.length; i++) {
    var tag = tags[i];
    var k = attr(tag, 'property') || attr(tag, 'name');
    if (k.toLowerCase() === prop.toLowerCase()) return attr(tag, 'content');
  }
  return '';
}

function cleanTmdbTitle(raw) {
  var title = decodeEntities(raw || '');
  title = title.replace(/\s*[-|–—:]\s*The Movie Database\s*\(TMDB\).*$/i, '').trim();
  title = title.replace(/\s*[-|–—:]\s*TMDB.*$/i, '').trim();
  var year = null;
  var yearMatch = /\s*\((18\d{2}|19\d{2}|20\d{2}|21\d{2})\)\s*$/.exec(title);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
    title = title.slice(0, yearMatch.index).trim();
  }
  return { title: title, year: year };
}

function resolveMetadata(tmdbId, mediaType) {
  var type = mediaType === 'tv' ? 'tv' : 'movie';
  var url = 'https://www.themoviedb.org/' + type + '/' + encodeURIComponent(String(tmdbId));
  return fetch(url, { headers: INDEX_HEADERS })
    .then(function (response) {
      if (!response.ok) throw new Error('TMDB page returned HTTP ' + response.status);
      return response.text();
    })
    .then(function (html) {
      var candidates = [
        getMeta(html, 'og:title'),
        getMeta(html, 'twitter:title'),
        (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || ''
      ];
      var best = null;
      for (var i = 0; i < candidates.length; i++) {
        var parsed = cleanTmdbTitle(candidates[i]);
        if (!parsed.title || /the movie database/i.test(parsed.title)) continue;
        if (!best) best = parsed;
        if (parsed.year) return parsed;
      }
      if (best) return best;
      throw new Error('Could not read the title from the TMDB page');
    });
}

function sanitizeTitle(title) {
  return title.replace(/:/g, ' -').replace(/[\\/*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  return String(value || '').toLowerCase()
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  var prev = [];
  var cur = [];
  for (var j = 0; j <= b.length; j++) prev[j] = j;
  for (var i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (var k = 1; k <= b.length; k++) {
      var cost = a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1;
      cur[k] = Math.min(cur[k - 1] + 1, prev[k] + 1, prev[k - 1] + cost);
    }
    var tmp = prev; prev = cur; cur = tmp;
  }
  return prev[b.length];
}

function similarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  var ta = a.split(' ');
  var tb = b.split(' ');
  var setA = {};
  var setB = {};
  ta.forEach(function (t) { setA[t] = true; });
  tb.forEach(function (t) { setB[t] = true; });
  var intersection = 0;
  var union = {};
  Object.keys(setA).forEach(function (t) { union[t] = true; if (setB[t]) intersection++; });
  Object.keys(setB).forEach(function (t) { union[t] = true; });
  var unionCount = Object.keys(union).length || 1;
  var jaccard = intersection / unionCount;
  var edit = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  return 0.6 * jaccard + 0.4 * edit;
}

function parseListing(html, pageUrl) {
  var entries = [];
  var chunks = html.split('data-entry="true"');
  for (var i = 1; i < chunks.length; i++) {
    var chunk = chunks[i];
    var name = attr(chunk, 'data-name');
    var relative = attr(chunk, 'data-url');
    if (!name || !relative) continue;
    var url;
    try { url = new URL(relative, pageUrl).toString(); } catch (_) { continue; }
    var sizeMatch = /<td\s+class="size"[^>]*data-sort="(-?\d+)"[^>]*>([^<]*)<\/td>/i.exec(chunk);
    var sizeBytes = sizeMatch ? parseInt(sizeMatch[1], 10) : -1;
    var sizeLabel = sizeMatch ? decodeEntities(sizeMatch[2]).trim() : '';
    if (sizeLabel === '-') sizeLabel = '';
    entries.push({
      name: name,
      url: url,
      isDir: /\/$/.test(relative),
      sizeBytes: sizeBytes,
      sizeLabel: sizeLabel
    });
  }
  return entries;
}

function waitForIndexSlot() {
  var run = _indexQueue.then(function () {
    var wait = INDEX_GAP_MS - (Date.now() - _lastIndexRequestAt);
    return delay(wait > 0 ? wait : 0);
  });
  _indexQueue = run.catch(function () {});
  return run;
}

function fetchIndex(url) {
  var run = _indexQueue.then(function () {
    var wait = INDEX_GAP_MS - (Date.now() - _lastIndexRequestAt);
    return delay(wait > 0 ? wait : 0).then(function () {
      var attempt = 0;
      function request() {
        _lastIndexRequestAt = Date.now();
        return fetch(url, { headers: INDEX_HEADERS }).then(function (response) {
          if ((response.status === 429 || response.status === 503) && attempt < 2) {
            attempt++;
            var retryAfter = parseInt(response.headers.get('retry-after') || '', 10);
            return delay(retryAfter > 0 ? Math.min(retryAfter * 1000, 12000) : 4000 * attempt).then(request);
          }
          if (!response.ok) throw new Error('Index returned HTTP ' + response.status);
          return response.text();
        });
      }
      return request();
    });
  });
  _indexQueue = run.catch(function () {});
  return run;
}

function directoryUrl(root, name) {
  return root + encodeURIComponent(name) + '/';
}

function findDirectory(title, year, kind) {
  var root = INDEX_BASE + (kind === 'tv' ? 'tvs/' : 'movies/');
  var clean = sanitizeTitle(title);
  var candidates = [];
  function add(name) { if (name && candidates.indexOf(name) < 0) candidates.push(name); }
  if (kind !== 'tv' && year) { add(title + ' (' + year + ')'); add(clean + ' (' + year + ')'); }
  add(title);
  add(clean);
  if (kind === 'tv' && year) add(title + ' (' + year + ')');

  function probeAt(index) {
    if (index >= candidates.length) return fuzzyFindDirectory(root, title);
    var url = directoryUrl(root, candidates[index]);
    return fetchIndex(url).then(function (html) {
      var entries = parseListing(html, url);
      if (entries.length) return { name: candidates[index], url: url, entries: entries };
      return probeAt(index + 1);
    }).catch(function () { return probeAt(index + 1); });
  }
  return probeAt(0);
}

function fuzzyFindDirectory(root, title) {
  return fetchIndex(root).then(function (html) {
    var entries = parseListing(html, root).filter(function (entry) { return entry.isDir; });
    var query = normalize(title);
    var scored = entries.map(function (entry) {
      var candidate = normalize(entry.name);
      return { entry: entry, score: similarity(query, candidate) };
    }).filter(function (item) {
      var candidate = normalize(item.entry.name);
      return item.score > 0.55 || candidate.indexOf(query) >= 0 || query.indexOf(candidate) >= 0;
    }).sort(function (a, b) { return b.score - a.score; });
    if (!scored.length) return null;
    // Reject weak matches rather than returning an unrelated title.
    if (scored[0].score < 0.55 && normalize(scored[0].entry.name).indexOf(query) < 0) return null;
    return { name: scored[0].entry.name, url: scored[0].entry.url, entries: null };
  });
}

function parseSeasonNumber(name) {
  var match = /season\s*0*(\d+)/i.exec(name) || /(?:^|[^a-z0-9])s0*(\d{1,2})(?:$|[^0-9])/i.exec(name);
  return match ? parseInt(match[1], 10) : null;
}

function episodeNumbers(name, currentSeason) {
  var match = /[Ss](\d{1,2})[ ._-]*[Ee](\d{1,3})/.exec(name);
  if (match) return { season: parseInt(match[1], 10), episode: parseInt(match[2], 10) };
  match = /(?:^|[^0-9])(\d{1,2})x(\d{1,3})(?:[^0-9]|$)/i.exec(name);
  if (match) return { season: parseInt(match[1], 10), episode: parseInt(match[2], 10) };
  match = /(?:episode|\bep\.?|\be)\s*0*(\d{1,3})(?:\D|$)/i.exec(name);
  if (match && currentSeason !== null && currentSeason !== undefined) return { season: currentSeason, episode: parseInt(match[1], 10) };
  return null;
}

function hasVideoExtension(name) {
  var match = /\.([a-z0-9]+)$/i.exec(name);
  return !!match && VIDEO_EXTENSIONS.indexOf(match[1].toLowerCase()) >= 0;
}

// Nuvio infers the media container from this query when the final CDN URL has no file extension.
// The index/Worker endpoint routes by pathname, so the format hint is only player metadata.
function addFormatHint(url, filename) {
  var match = /\.([a-z0-9]+)$/i.exec(filename || '');
  if (!match) return url;
  var ext = match[1].toLowerCase();
  var known = new RegExp('[?&](?:type|format|ext|extension|mime|mime_type|content_type|contenttype)=' , 'i');
  if (known.test(url)) return url;
  var hashIndex = url.indexOf('#');
  var base = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  var fragment = hashIndex >= 0 ? url.slice(hashIndex) : '';
  return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'type=' + encodeURIComponent(ext) + fragment;
}

function qualityInfo(name) {
  var low = name.toLowerCase();
  var resMatch = /\b(2160|1080|720|480)p\b/i.exec(name);
  var resolution = resMatch ? resMatch[1] + 'p' : (/\b(4k|uhd)\b/i.test(name) ? '2160p' : 'Unknown');
  var source = /remux/i.test(name) ? 'Remux' : (/blu\.?ray|bdrip|brrip/i.test(name) ? 'BluRay' : (/web[ ._-]?dl/i.test(name) ? 'WEB-DL' : (/web[ ._-]?rip/i.test(name) ? 'WEBRip' : (/\bhdtv\b/i.test(name) ? 'HDTV' : ''))));
  var codec = /x265|h\.265|h265|hevc/i.test(name) ? 'HEVC' : (/x264|h\.264|h264|avc/i.test(name) ? 'AVC' : '');
  var tags = [resolution];
  if (source) tags.push(source);
  if (codec) tags.push(codec);
  if (/dolby.?vision|\bdovi\b|\bdv\b/i.test(name)) tags.push('DV');
  else if (/hdr10/i.test(name)) tags.push('HDR10');
  else if (/\bhdr\b/i.test(name)) tags.push('HDR');
  if (/truehd/i.test(name)) tags.push('TrueHD');
  else if (/dts.?hd|\bdts\b/i.test(name)) tags.push(/dts.?hd/i.test(name) ? 'DTS-HD MA' : 'DTS');
  else if (/\bddp|dd\+|eac3/i.test(name)) tags.push('DDP');
  else if (/\baac\b/i.test(name)) tags.push('AAC');
  return { resolution: resolution, label: tags.join(' · '), score: qualityScore(resolution, source, codec, low) };
}

function qualityScore(resolution, source, codec, low) {
  var score = resolution === '2160p' ? 4000 : (resolution === '1080p' ? 3000 : (resolution === '720p' ? 2000 : (resolution === '480p' ? 1000 : 0)));
  if (source === 'Remux') score += 500;
  else if (source === 'BluRay') score += 400;
  else if (source === 'WEB-DL') score += 300;
  else if (source === 'WEBRip') score += 200;
  if (/\bhdr10\b|\bhdr\b/.test(low)) score += 20;
  if (/dolby.?vision|\bdovi\b/.test(low)) score += 30;
  if (codec === 'HEVC') score += 4;
  return score;
}

function sizeToLabel(bytes, existing) {
  if (existing) return existing;
  if (bytes <= 0) return '';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  return (bytes / 1048576).toFixed(0) + ' MB';
}

function streamsFromEntries(entries, mediaType, season, episode, seasonContext) {
  var candidates = [];
  entries.forEach(function (entry) {
    if (entry.isDir || !hasVideoExtension(entry.name)) return;
    if (/sample|trailer/i.test(entry.name)) return;
    var epInfo = mediaType === 'tv' ? episodeNumbers(entry.name, seasonContext) : null;
    if (mediaType === 'tv') {
      if (!epInfo || epInfo.season !== Number(season) || epInfo.episode !== Number(episode)) return;
    }
    var quality = qualityInfo(entry.name);
    candidates.push({ entry: entry, quality: quality });
  });
  candidates.sort(function (a, b) {
    if (b.quality.score !== a.quality.score) return b.quality.score - a.quality.score;
    return b.entry.sizeBytes - a.entry.sizeBytes;
  });
  var seenUrls = {};
  return candidates.slice(0, 10).filter(function (item) {
    if (seenUrls[item.entry.url]) return false;
    seenUrls[item.entry.url] = true;
    return true;
  }).map(function (item) {
    var display = item.quality.label;
    var size = sizeToLabel(item.entry.sizeBytes, item.entry.sizeLabel);
    return {
      name: '111477 Index',
      title: (display === 'Unknown' ? '' : display) + (size ? ' · ' + size : '') + ' | ' + item.entry.name,
      url: addFormatHint(item.entry.url, item.entry.name),
      quality: item.quality.resolution,
      size: item.entry.sizeBytes > 0 ? item.entry.sizeBytes : undefined,
      headers: Object.assign({}, PLAYBACK_HEADERS),
      // Standard stream metadata, used by compatible Nuvio versions for MIME inference.
      behaviorHints: {
        filename: item.entry.name,
        videoSize: item.entry.sizeBytes > 0 ? item.entry.sizeBytes : undefined
      }
    };
  });
}

function getMovieStreams(metadata) {
  return findDirectory(metadata.title, metadata.year, 'movie').then(function (directory) {
    if (!directory) return [];
    var entriesPromise = directory.entries ? Promise.resolve(directory.entries) : fetchIndex(directory.url).then(function (html) { return parseListing(html, directory.url); });
    return entriesPromise.then(function (entries) {
      return streamsFromEntries(entries, 'movie', null, null, null);
    });
  });
}

function getTvStreams(metadata, season, episode) {
  if (season === null || season === undefined || episode === null || episode === undefined) return Promise.resolve([]);
  return findDirectory(metadata.title, metadata.year, 'tv').then(function (directory) {
    if (!directory) return [];
    var entriesPromise = directory.entries ? Promise.resolve(directory.entries) : fetchIndex(directory.url).then(function (html) { return parseListing(html, directory.url); });
    return entriesPromise.then(function (showEntries) {
      var direct = streamsFromEntries(showEntries, 'tv', season, episode, Number(season));
      if (direct.length) return direct;
      var seasons = showEntries.filter(function (entry) { return entry.isDir; }).map(function (entry) {
        return { entry: entry, number: parseSeasonNumber(entry.name) };
      });
      var selected = seasons.filter(function (item) { return item.number === Number(season); });
      // Some indexes name the folder simply "Season 06"; if no numbered folder
      // is present, do not guess an unrelated directory.
      if (!selected.length) return [];
      return fetchIndex(selected[0].entry.url).then(function (html) {
        return streamsFromEntries(parseListing(html, selected[0].entry.url), 'tv', season, episode, Number(season));
      });
    });
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  var kind = mediaType === 'tv' ? 'tv' : 'movie';
  if (!tmdbId) return Promise.resolve([]);
  return resolveMetadata(tmdbId, kind)
    .then(function (metadata) {
      console.log('[111477] Looking up ' + metadata.title + (metadata.year ? ' (' + metadata.year + ')' : '') + ' [' + kind + ']');
      return kind === 'tv' ? getTvStreams(metadata, season, episode) : getMovieStreams(metadata);
    })
    .catch(function (error) {
      console.error('[111477] Lookup failed: ' + (error && error.message ? error.message : String(error)));
      return [];
    });
}

module.exports = { getStreams: getStreams };
