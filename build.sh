#!/bin/sh
export PATH="node_modules/.bin:$PATH"
(browserify --version 2>/dev/null || npm install browserify)>/dev/null
(packer --version 2>/dev/null || npm install packer)>/dev/null

npm install

browserify -s PlatformSocket -d -o platform_debug.js js/platform.js
browserify -s PlatformSocket js/platform.js | packer -s 1 -b 1 -o platform.js

browserify -s PushClient -d -o platform-streaming_debug.js js/platform-streaming.js
browserify -s PushClient js/platform-streaming.js | packer -s 1 -b 1 -o platform-streaming.js