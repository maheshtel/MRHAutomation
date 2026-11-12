"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PNM = void 0;
const utils_1 = require("./utils");
const PNMTypes = {
    P1: 'pbm/ascii',
    P2: 'pgm/ascii',
    P3: 'ppm/ascii',
    P4: 'pbm',
    P5: 'pgm',
    P6: 'ppm',
    P7: 'pam',
    PF: 'pfm',
};
const HEADER_SCAN_LIMIT = 64;
const PAM_HEADER_LIMIT = 256;
const isWhitespace = (byte) => byte === 32 || byte === 9 || byte === 10 || byte === 13;
const isEndOfLine = (byte) => byte === 10 || byte === 13;
const handlers = {
    default: (input) => {
        const end = Math.min(input.length, HEADER_SCAN_LIMIT);
        const tokens = [];
        let token = '';
        let inComment = false;
        for (let i = 2; i < end && tokens.length < 2; i++) {
            const byte = input[i];
            if (inComment) {
                inComment = !isEndOfLine(byte);
            }
            else if (byte === 35) {
                inComment = true;
            }
            else if (isWhitespace(byte)) {
                if (token) {
                    tokens.push(token);
                    token = '';
                }
            }
            else {
                token += String.fromCharCode(byte);
            }
        }
        if (token && tokens.length < 2)
            tokens.push(token);
        if (tokens.length < 2) {
            throw new TypeError('Invalid PNM');
        }
        return {
            width: Number.parseInt(tokens[0], 10),
            height: Number.parseInt(tokens[1], 10),
        };
    },
    pam: (input) => {
        const header = (0, utils_1.toUTF8String)(input, 0, Math.min(input.length, PAM_HEADER_LIMIT));
        const size = {};
        for (const line of header.split(/[\r\n]+/)) {
            if (line.length > 16 || line.charCodeAt(0) > 128) {
                continue;
            }
            const [key, value] = line.split(' ');
            if (key && value) {
                size[key.toLowerCase()] = Number.parseInt(value, 10);
            }
            if (size.height && size.width) {
                break;
            }
        }
        if (size.height && size.width) {
            return {
                height: size.height,
                width: size.width,
            };
        }
        throw new TypeError('Invalid PAM');
    },
};
exports.PNM = {
    validate: (input) => (0, utils_1.toUTF8String)(input, 0, 2) in PNMTypes,
    calculate(input) {
        const signature = (0, utils_1.toUTF8String)(input, 0, 2);
        const type = PNMTypes[signature];
        const handler = handlers[type] || handlers.default;
        return handler(input);
    },
};
