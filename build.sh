#!/bin/sh
PATH=node_modules/.bin
(browserify --version 2>/dev/null || npm install browserify)>/dev/null
npm install
browserify -s PlatformSocket -d -o platform_debug.js js/platform.js
browserify -s PlatformSocket -o platform.js js/platform.js