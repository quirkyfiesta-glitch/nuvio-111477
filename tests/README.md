Live integration tests are pending because the source host was unreachable from the build environment. Recommended checks inside Nuvio's Plugin Tester:

1. A known movie ID, media type `movie`, no season/episode.
2. A known TV ID with season and episode populated.
3. A title with punctuation (colon, ampersand, apostrophe).
4. Confirm the stream's URL is the index file URL and playback follows its redirect.
5. Confirm HTTP 429/503 responses cause retries rather than a false match.
