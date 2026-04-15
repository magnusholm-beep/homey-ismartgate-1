# Changelog

All notable changes to this project will be documented in this file.

## [1.7.5] - 2026-04-15

### Fixed
- Add 30-second timeout to all API requests to prevent the polling loop from hanging indefinitely on unresponsive devices
- Preserve the original network error message when the ismartgate device cannot be reached, replacing the previous generic error
- Wrap decryption in a try-catch so malformed or unexpected API responses produce a clear error message instead of crashing the app
- Wrap XML parsing in a try-catch with a descriptive error message for protocol-level changes
- Remove unused `that` variable in `executeRequest`

## [1.7.4] - 2026-04-15

### Changed
- Refactor all flow card conditions and actions to use a device picker instead of manual hub/door number inputs
- Add Norwegian (`no`) translations to all flow card titles, hints, and formatted titles
- Add `testConnection` API endpoint to app manifest

## [1.7.1] - 2025-xx-xx

### Fixed
- Move API handler to `api.js` and use correct manifest format
- Use correct 4-argument `Homey.api` call for test connection
- Avoid throwing from API handler to prevent Homey SDK internal error

## [1.6.1] - 2025-xx-xx

### Fixed
- Remove `[[device]]` from `titleFormatted` in flow cards

## [1.6.0] - 2025-xx-xx

### Added
- Device-based flow cards
- Fix `getInfo` race condition (deduplicate in-flight requests)
- Norwegian translations
- Capability reset on polling failure
- Test connection button in settings

## [1.5.1] - 2025-xx-xx

### Fixed
- Critical security and stability issues

## [1.0.0] - 2025-xx-xx

### Added
- Initial release with garage door device driver
- Status polling with configurable interval
- Flow triggers, conditions, and actions
- Dual-hub support (two ismartgate devices)
- Temperature and battery sensor support
