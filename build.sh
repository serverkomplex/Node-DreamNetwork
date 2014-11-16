#!/bin/sh
export PATH="node_modules/.bin:$PATH"
(browserify --version 2>/dev/null || npm install browserify)>/dev/null
(packer --version 2>/dev/null || npm install packer)>/dev/null

npm install

browserify -s DreamNetwork -d -o platform_debug.js js/platform.js
browserify -s DreamNetwork js/platform.js | packer -s 1 -b 1 -o platform.js
