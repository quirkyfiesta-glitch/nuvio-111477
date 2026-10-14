# 111477 Index provider for Nuvio

This is a first-pass Nuvio provider package. Nuvio installs it from the **Plugins** section, not the Addons section.

## Files

- `manifest.json` declares the provider repository.
- `providers/index111477.js` contains the provider and exports `getStreams(tmdbId, mediaType, season, episode)`.

## How it works

1. Reads the title and year from the public TMDB title page using the provided TMDB ID.
2. Searches the `movies/` or `tvs/` directory on `a.111477.xyz`.
3. Matches a movie filename or the requested season/episode.
4. Returns the stable index URL for each matching file. It intentionally does not cache `workers.dev` URLs, which can be temporary redirects.

## Install / test

The provider needs to be hosted at a stable HTTPS URL so Nuvio can load the manifest and script. Put `manifest.json` and the `providers/` directory in a public GitHub repository, then add the raw `manifest.json` URL in **Nuvio > Settings > Plugins**. Enable `111477 Index` after refreshing the repository.

For development, use Nuvio's Plugin Tester with the standalone `providers/index111477.js` file. A normal app release may not include the Plugin Tester.

## Current limitations

- The live index could not be reached from this build environment, so this package has not been tested against live directory responses or in Nuvio's runtime.
- Metadata lookup depends on the public TMDB HTML page exposing its title in the page metadata/title tag.
- Episode matching expects a season folder or filenames containing an `SxxEyy` / `NxNN` marker. It returns no result when confidence is low.
- Use this only for content you are authorized to access.
