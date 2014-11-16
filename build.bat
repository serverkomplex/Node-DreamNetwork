@echo off
path %path%;node_modules/.bin
call npm install

call browserify -s DreamNetwork -o platform_debug.js -d js/platform.js
call browserify -s DreamNetwork js/platform.js -o platform_release.js

call fixmyjs platform_debug.js platform_release.js

call packer -s 1 -o platform.js -i platform_release.js
del platform_release.js