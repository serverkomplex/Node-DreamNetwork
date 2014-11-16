#!/bin/sh
export PATH="node_modules/.bin:$PATH"
(browserify --version 2>/dev/null || npm install browserify)>/dev/null
(packer --version 2>/dev/null || npm install packer)>/dev/null

npm install

browserify -s DreamNetwork -o platform_debug.js -d js/platform.js
browserify -s DreamNetwork js/platform.js -o platform_release.js

fixmyjs platform_debug.js platform_release.js

packer -b 1 -s 1 -o platform.js -i platform_release.js
rm platform_release.js