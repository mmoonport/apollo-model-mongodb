"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));

class SDLSyntaxException extends Error {
  constructor(description, code, relatedObjects) {
    super();
    (0, _defineProperty2.default)(this, "toString", () => this.description);
    this.description = description;
    this.code = code;
    this.relatedObjects = relatedObjects;
  }

}

exports.default = SDLSyntaxException;