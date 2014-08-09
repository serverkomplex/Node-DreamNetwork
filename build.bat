@echo off
path %path%;node_modules/.bin
call browserify --version >NUL
if errorlevel 0 goto browserify_ok
call npm install browserify >NUL

:browserify_ok
call npm install
call browserify -s PlatformSocket -d -o platform_debug.js js/platform.js
call browserify -s PlatformSocket -o platform.js js/platform.js
