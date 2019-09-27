"use strict";

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var Model = _interopRequireWildcard(require("./directives/model"));

var GeoJSON = _interopRequireWildcard(require("./geoJSON"));

var InitInputTypes = _interopRequireWildcard(require("./directives/initInputTypes"));

var Discriminator = _interopRequireWildcard(require("./directives/discriminator"));

var CreatedAt = _interopRequireWildcard(require("./directives/createdAt"));

var UpdatedAt = _interopRequireWildcard(require("./directives/updatedAt"));

var Default = _interopRequireWildcard(require("./directives/default"));

var Abstract = _interopRequireWildcard(require("./directives/abstract"));

var DB = _interopRequireWildcard(require("./directives/db"));

var Relation = _interopRequireWildcard(require("./directives/relation"));

var ExtRelation = _interopRequireWildcard(require("./directives/extRelation"));

var ID = _interopRequireWildcard(require("./directives/id"));

var Inherit = _interopRequireWildcard(require("./directives/inherit"));

var Unique = _interopRequireWildcard(require("./directives/unique"));

var Embedded = _interopRequireWildcard(require("./directives/embedded"));

var Date = _interopRequireWildcard(require("./scalars/date"));

var ObjectID = _interopRequireWildcard(require("./scalars/objectID"));

var _default = [Model, InitInputTypes, GeoJSON, Discriminator, CreatedAt, UpdatedAt, Default, Abstract, DB, Relation, ExtRelation, ID, Inherit, Unique, Embedded, Date, ObjectID];
exports.default = _default;