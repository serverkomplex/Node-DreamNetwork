@echo off
path %path%;node_modules/.bin
call browserify --version 2>NUL >NUL
if %ERRORLEVEL% EQU 0 goto browserify_ok
call npm install browserify

:browserify_ok
call packer --help 2>NUL >NUL
if %ERRORLEVEL% EQU 0 goto packer_ok
call npm install packer

:packer_ok
call npm install

call browserify -s PlatformSocket -d -o platform_debug.js js/platform.js
call browserify -s PlatformSocket js/platform.js | call packer -s 1 -b 1 -o platform.js


call browserify -s PushClient -d -o platform-streaming_debug.js js/platform-streaming.js
call browserify -s PushClient js/platform-streaming.js | call packer -s 1 -b 1 -o platform-streaming.js
