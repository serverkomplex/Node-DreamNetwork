/**
 * DreamNetwork streaming API client
 * Copyright (C) 2014 Carl Kittelberger (icedream)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

//require("buffer");

var ce = require("cloneextend");
var BSON = require("buffalo-browserify");
var toBuffer = require("typedarray-to-buffer");

function PushClient(host, port, path, ssl) {
    var protocol = ssl ? "wss" : "ws";
    if (!host) {
        host = window.location.hostname;
    }
    if (!port || port < 0x0001 || port > 0xffff) {
        port = ssl ? 28111 : 28110;
    }
    if (!path || path.length < 1) {
        path = "/";
    }
    if (path.substring(0, 1) != "/") {
        path = "/" + path;
    }

    // target url for websocket
    this.url = protocol + "://" + host + ":" + port + path;
    this.authenticated = false;
    this.guid = null;
}

/**
 * Encodes a message so that it can be transferred over the socket.
 */
function msgencode(msg) {
    // binary json used to serialized message
    messageBuffer = BSON.serialize(msgnormalizeencode(msg));
    messageLength = messageBuffer.length;

    buffer = new ArrayBuffer(messageLength); // message is a string and js works with unicode (2 bytes per char)
    bufferView = new DataView(buffer);
    for (var i = 0; i < messageLength; i++) {
        bufferView.setUint8(i, messageBuffer.readUInt8(i));
    }

    return buffer;
}

/**
 * Normalizes a few types in a message to encode.
 */
function msgnormalizeencode(msg, key) {
    return msg;
}

/**
 * Decodes a message from a network-received buffer.
 */
function msgdecode(buffer) {
    bufferView = new DataView(buffer);
    var body = new Uint8Array(buffer, 0);
    body = new Buffer(body);
    var message = msgnormalizedecode(BSON.parse(body));

    return message;
}

/**
 * Normalizes a few types in a decoded message.
 */
function msgnormalizedecode(msg, key) {
    return msg;
}

/**
 * Trigger an event if it is set properly.
 */
function trigger(self, name) {
    return !!self["on" + name] ? self["on" + name].apply(self, Array.prototype.slice.call(arguments, 2)) : null;
}

/**
 * Connects the socket to the platform server.
 */
PushClient.prototype.connect = function() {
    var platform = this;

    trigger(platform, "connecting");
    platform.socket = new WebSocket(platform.url); // TODO: node compatibility actually needed, me fool!!!
    platform.waitingForInitialPing = true;

    // force binary mode
    platform.socket.binaryType = "arraybuffer";

    platform.socket.onopen = function() {
        platform.msgid = 0;
        trigger(platform, "waitingforinitialping");
    };
    platform.socket.onmessage = function(msg) {
        msg = msgdecode(msg.data);

        /* internal handling */
        // we need to wait for the server's initial ping or it might be our data doesn't
        // reach the server. http://stackoverflow.com/a/21201020
        if (platform.waitingForInitialPing && !!msg["Ping"]) {
            trigger(platform, "open", msg.Ping);
            platform.waitingForInitialPing = false;
        } else if(!!msg["Ping"]) {
            trigger(platform, "ping", msg.Ping);
        }

        if (!!msg["Notification"]) {
            trigger(platform, "notification", msg);
        }

        trigger(platform, "messagereceived", ce.extend(msg));
    };
    platform.socket.onclose = function() {
        trigger(platform, "close");
    };
    platform.socket.onerror = function(error) {
        trigger(platform, "error", error);
    };
};

PushClient.prototype.send = function(message) {
    if (message === null)
        message = {};

    do {
        this.msgid++;
    } while (this.msgid === 0); // 0 reserved for background messages
    message["Id"] = this.msgid;
    var msg = msgencode(message);
    if (msg === null)
        return false;

    this.socket.send(msg);
    trigger(this, "messagesend", message);

    return this.msgid;
};

PushClient.prototype.subscribe = function(channel, type) {
    return this.send({
        "Channel": channel,
        "Type": type,
        "State": 1
    });
};

PushClient.prototype.unsubscribe = function(channel, type) {
    return this.send({
        "Channel": channel,
        "Type": type,
        "State": 0
    });
};

PushClient.prototype.instant = function(channel, type) {
    return this.send({
        "Channel": channel,
        "Type": type,
        "State": 2
    });
};

PushClient.prototype.close = function() {
    this.socket.close();
};

module.exports = PushClient;