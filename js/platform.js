/**
 * DreamNetwork Platform Server - general purpose server based on the logic of clients and channels
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

var $ = require("jquery"); // TODO: Get rid of $.extend somehow
var ce = require("cloneextend");
var BSON = require("buffalo-browserify");
var toBuffer = require("typedarray-to-buffer");

// this can be generated from the server with argument "typeids.js"
var typeIds = {
    "client": {
        "ChannelChatMessageRequest": 0x00010101,
        "AnonymousLoginRequest": 0x00000001,
        "ChannelBroadcastRequest": 0x00010005,
        "ChannelClientGuidListRequest": 0x00010006,
        "ChannelClientListRequest": 0x00010007,
        "ChannelDiscoveryRequest": 0x00010001,
        "ChannelJoinRequest": 0x00010002,
        "ChannelLeaveRequest": 0x00010004,
        "ChannelOpenRequest": 0x00010003,
        "ChannelOwnerRequest": 0x00010008,
        "DisconnectMessage": 0xFFFFFFFF,
        "PrivateChatMessageRequest": 0x00020101
    },
    "server": {
        "InitialPingMessage": 0x00000000,
        "ChannelChatMessageSent": 0x00010201,
        "ErrorActionNotAllowedResponse": 0x00FF0003,
        "ErrorChannelNotFoundResponse": 0x00FF0002,
        "ErrorChannelPasswordInvalidResponse": 0x00FF0004,
        "ChannelBroadcast": 0x00010005,
        "ChannelChatMessage": 0x00010101,
        "ChannelClientGuidListResponse": 0x00010006,
        "ChannelClientJoined": 0x00010002,
        "ChannelClientKicked": 0x00010009,
        "ChannelClientLeft": 0x00010004,
        "ChannelClientListResponse": 0x00010007,
        "ChannelDiscoveryResponse": 0x00010001,
        "ChannelOwnerResponse": 0x00010008,
        "ErrorClientNotFoundResponse": 0x00FF0001,
        "ErrorInvalidMessageResponse": 0x00FF0005,
        "LoginResponse": 0x00000001,
        "PrivateChatMessage": 0x00020101,
        "PrivateChatMessageSent": 0x00020201
    }
};

// reverse dictionary for debugging purposes
var typeNames = {};
for (var direction in typeIds) {
    typeNames[direction] = {};
    for (var name in typeIds[direction])
        typeNames[direction][typeIds[direction][name]] = name;
}

function PlatformSocket(host, port, path, ssl) {
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
    this.guid = null;
}

/**
 * Encodes a message so that it can be transferred over the socket.
 */
function msgencode(pid, type, message) {
    // binary json used to serialized message
    messageBuffer = BSON.serialize(message /*, false, true, false*/ );
    messageLength = messageBuffer.length; // || messageBuffer.byteLength;

    /*
     * header:
     * - message type (uint32/4 bytes/big endian)
     *
     * content:
     * - message (bson/n bytes)
     *
     * HH HH HH HH CC CC CC .. CC CC
     *
     * H = header, C = content
     */
    buffer = new ArrayBuffer(8 + messageLength); // message is a string and js works with unicode (2 bytes per char)
    bufferView = new DataView(buffer);
    bufferView.setUint32(0, pid, false);
    bufferView.setUint32(4, type, false);
    for (var i = 0; i < messageLength; i++) {
        bufferView.setUint8(8 + i, messageBuffer.readUInt8(i));
    }

    return buffer;
}

/**
 * Decodes a message from a network-received buffer.
 */
function msgdecode(buffer) {
    bufferView = new DataView(buffer);
    var pid = bufferView.getUint32(0, false);
    var type = bufferView.getUint32(4, false);
    var body = new Uint8Array(buffer, 8);
    body = new Buffer(body);
    var message = BSON.parse(body);

    return {
        "isResponse": pid !== 0,
        "requestId": pid,
        "typeId": type,
        "typeName": typeNames.server[type],
        "body": message
    };
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
PlatformSocket.prototype.connect = function() {
    var platform = this;

    console.log("Connecting to platform...");
    trigger(platform, "connecting");
    platform.socket = new WebSocket(platform.url); // TODO: node compatibility actually needed, me fool!!!

    // force binary mode
    platform.socket.binaryType = "arraybuffer";

    platform.socket.onopen = function() {
        platform.msgid = 0;
        trigger(platform, "waitingforinitialping");
    };
    platform.socket.onmessage = function(msg) {
        msg = msgdecode(msg.data);

        // internal handling
        if (msg.typeName == "LoginResponse") {
            if (msg.body.Success) {
                platform.guid = msg.body.ClientGuid.buffer;
                platform.authenticated = true;
                trigger(platform, "authenticated", platform.guid);
            }
        }

        // we're cloning the message here to avoid manipulation from event handlers
        trigger(platform, "messagereceived", ce.extend(msg));
        trigger(platform, msg.typeName.toLower(), ce.extend(msg.body));

        // we need to wait for the server's initial ping or it might be our data doesn't
        // reach the server. http://stackoverflow.com/a/21201020
        if (msg.typeName == "InitialPingMessage") {
            console.log("Ready to send data.");
            trigger(platform, "open");
        }
    };
    platform.socket.onclose = function() {
        trigger(platform, "close");
    };
    platform.socket.onerror = function(error) {
        trigger(platform, "error", error);
    };
};

PlatformSocket.prototype.send = function(type, message) {
    if (message === null)
        message = {};

    // message id
    if (typeof type === 'string' || type instanceof String) {
        typeName = type;
        typeId = typeIds.client[type];
        if (!type)
            return null;
    } else {
        typeName = typeNames.client[type];
        typeId = type;
    }

    do {
        this.msgid++;
    } while (this.msgid === 0); // 0 reserved for background messages
    var msg = msgencode(this.msgid, typeId, message);
    if (msg === null)
        return false;

    this.socket.send(msg);
    trigger(platform, "messagesend", {
        "requestId": this.msgid,
        "typeId": typeId,
        "typeName": typeName,
        "message": message
    });

    return true;
};

PlatformSocket.prototype.loginAnonymously = function(profile) {
    if (!profile)
        profile = {};

    if (profile instanceof Array)
        return false;

    return this.send("AnonymousLoginRequest", {
        "Profile": profile
    });
};

PlatformSocket.prototype.discoverChannels = function(query) {
    if (query === null) {
        query = "true";
    }

    if (!(typeof query === 'string' || query instanceof String)) {
        return false;
    }

    return this.send("ChannelDiscoveryRequest", {
        "Query": query
    });
};

PlatformSocket.prototype.openChannel = function(tags, password, options) {
    if (tags === null) {
        tags = [];
    }

    // if (tags instanceof Object)
    // {
    //  return false;
    // }

    if (!password)
        password = null;

    if (password !== null && !(typeof password === 'string' || password instanceof String)) {
        return false;
    }

    // if (options !== null && !(options instanceof Object))
    // {
    //  return false;
    // }

    if (!options)
        options = {};

    var message = $.extend({
        "AllowBroadcasts": true,
        "AllowOwnerClientDiscovery": true,
        "AllowClientDiscovery": true
    }, options === null ? {} : options);
    message = $.extend(message, {
        "Tags": tags,
        "Password": password
    });

    return this.send("ChannelOpenRequest", message);
};

PlatformSocket.prototype.joinChannel = function(guid, password) {
    // TODO: check if guid is in binary format, I don't think that's standardized though
    // except for the bson library that we're using.

    if (!password) password = null;
    if (password !== null && !(typeof password === 'string' || password instanceof String)) {
        return false;
    }

    return this.send("ChannelJoinRequest", {
        "ChannelGuid": guid,
        "Password": password
    });
};

PlatformSocket.prototype.leaveChannel = function(guid) {
    // TODO: check if guid is in binary format, I don't think that's standardized though
    // except for the bson library that we're using.

    return this.send("ChannelLeaveRequest", {
        "ChannelGuid": guid
    });
};

PlatformSocket.prototype.close = function() {
    this.send("DisconnectMessage");
};

module.exports = PlatformSocket;