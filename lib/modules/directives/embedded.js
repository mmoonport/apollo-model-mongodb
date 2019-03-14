"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.schemaDirectives = exports.typeDef = void 0;

var _lodash = _interopRequireDefault(require("lodash"));

var _graphqlTools = require("graphql-tools");

var _utils = require("../../utils");

const typeDef = `directive @embedded on OBJECT | INTERFACE`;
exports.typeDef = typeDef;

class EmbeddedDirective extends _graphqlTools.SchemaDirectiveVisitor {
  visitObject(object) {// object.mmEmbedded = true;
  }

  visitInterface(iface) {
    const {
      _typeMap: SchemaTypes
    } = this.schema; // iface.mmEmbedded = true;
    //Set discriminator

    if (!iface.mmDiscriminatorField) {
      iface.mmDiscriminatorField = '_type';
    }

    Object.values(SchemaTypes).filter(type => type._interfaces && type._interfaces.includes(iface)).forEach(type => {
      if (!type.mmDiscriminator) {
        type.mmDiscriminator = (0, _utils.lowercaseFirstLetter)(type.name);
      }
    });
    iface.mmDiscriminatorMap = iface.mmDiscriminatorMap || {};

    iface.mmOnSchemaInit = () => {
      Object.values(SchemaTypes).filter(type => Array.isArray(type._interfaces) && type._interfaces.includes(iface)).forEach(type => {
        type.mmDiscriminatorField = iface.mmDiscriminatorField;
        iface.mmDiscriminatorMap[type.mmDiscriminator] = type.name;
      });
    };

    iface.resolveType = doc => {
      return iface.mmDiscriminatorMap[doc[iface.mmDiscriminatorField]];
    }; ////////////

  }

}

const schemaDirectives = {
  embedded: EmbeddedDirective
};
exports.schemaDirectives = schemaDirectives;