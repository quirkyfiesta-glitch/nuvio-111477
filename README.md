# 111477 Index provider for Nuvio

Nuvio provider package for the 111477 directory index (version 0.1.2). Nuvio installs it from the **Plugins** section, not the Addons section.

## Files

- `manifest.json` declares the provider repository.
- `providers/index111477_v012.js` contains the provider and exports `getStreams(tmdbId, mediaType, season, episode)`.

## How it works

1. Reads the title and year from the public TMDB title page using the provided TMDB ID.
2. Searches the `movies/` or `tvs/` directory on `a.111477.xyz`.
3. Matches a movie filename or the requested season/episode.
4. Returns the stable index URL with a `type=<extension>` MIME hint. The URL remains stable and is not replaced by an expiring `workers.dev` redirect URL. The original filename is also supplied as stream metadata.

## Install / test

The provider needs to be hosted at a stable HTTPS URL so Nuvio can load the manifest and script. Put `manifest.json` and the `providers/` directory in a public GitHub repository, then add the raw `manifest.json` URL in **Nuvio > Settings > Plugins**. Enable `111477 Index` after refreshing the repository.

For development, use Nuvio's Plugin Tester with the standalone `providers/index111477_v012.js` file. A normal app release may not include the Plugin Tester.

## Current limitations

- The live index could not be reached from this build environment, so this package has not been live-tested against directory responses or in Nuvio playback.
- Metadata lookup depends on the public TMDB HTML page exposing its title in the page metadata/title tag.
- Episode matching expects a season folder or filenames containing an `SxxEyy` / `NxNN` marker. It returns no result when confidence is low.
- Use this only for content you are authorized to access.


## Version 0.1.2

This version adds a format query hint (such as `?type=mkv`) for extensionless `/d/<id>` URLs and provides the source filename through `behaviorHints.filename`. The query hint is intended for Nuvio player MIME detection.
