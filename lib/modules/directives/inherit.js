"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.schemaDirectives = exports.typeDef = void 0;

var _graphqlTools = require("graphql-tools");

var _utils = require("../../utils");

const typeDef = `directive @inherit(from:String = null) on INTERFACE`;
exports.typeDef = typeDef;

class Inherit extends _graphqlTools.SchemaDirectiveVisitor {
  visitInterface(iface) {
    const {
      _typeMap: SchemaTypes
    } = this.schema;

    if (!iface.mmDiscriminatorField) {
      iface.mmDiscriminatorField = '_cls';
    }

    iface.mmInherit = true;

    iface._addFromInterfaces = function (type) {
      if (this.mmFrom) {
        if (!type._interfaces.find(i => i === this.mmFrom)) {
          type._interfaces.push(this.mmFrom);

          this.mmFrom._addFromInterfaces(type);
        }
      }
    }.bind(iface);

    iface.discriminatorValue = function () {
      let parentName = this.mmFrom && this.mmFrom.mmInherit ? this.mmFrom.discriminatorValue() : undefined;
      let parts = [];

      if (parentName) {
        parts.push(parentName);
      }

      parts.push(this.name);
      return parts.join('.');
    }.bind(iface);

    const {
      from = null
    } = this.args;

    if (from) {
      let fromInherit = Object.values(SchemaTypes).find(type => type.name === from);

      if (!fromInherit) {
        throw `from:${from} was not found or does not contain the inherit directive`;
      }

      iface.mmFrom = fromInherit;
      iface._fields = { ...fromInherit._fields,
        ...iface._fields
      };

      if (fromInherit.mmDiscriminatorField) {
        iface.mmDiscriminatorField = fromInherit.mmDiscriminatorField;
      }

      if (fromInherit.mmCollectionName) {
        iface.mmCollectionName = fromInherit.mmCollectionName;
      }
    }

    iface.mmDiscriminatorMap = iface.mmDiscriminatorMap || {};
    Object.values(SchemaTypes).filter(type => Array.isArray(type._interfaces) && type._interfaces.includes(iface)).forEach(type => {
      iface._addFromInterfaces(type);

      type._fields = { ...iface._fields,
        ...type._fields
      };
    });

    iface.mmOnSchemaBuild = () => {
      Object.values(SchemaTypes).filter(type => Array.isArray(type._interfaces) && type._interfaces.includes(iface)).forEach(type => {
        if (type._interfaces[0] === iface) {
          type.mmCollectionName = iface.mmCollectionName;
          type.mmDiscriminator = [iface.discriminatorValue(), type.name].join('.');
          type.mmDiscriminatorField = iface.mmDiscriminatorField;
        }
      });
    };

    iface.mmOnSchemaInit = () => {
      Object.values(SchemaTypes).filter(type => Array.isArray(type._interfaces) && type._interfaces.includes(iface)).forEach(type => {
        let impls = this.schema._implementations[iface.name] || [];

        if (!impls.find(i => i.name === type.name)) {
          impls.push(type);
        }

        this.schema._implementations[iface.name] = impls;
        iface.mmDiscriminatorMap[type.mmDiscriminator] = type.name;
        iface.mmInheritTypes = [...iface.mmInheritTypes, type];
      });
      console.log(JSON.stringify(iface.mmDiscriminatorMap));
    };

    iface.resolveType = doc => {
      return iface.mmDiscriminatorMap[doc[iface.mmDiscriminatorField]];
    };
  }

}

const schemaDirectives = {
  inherit: Inherit
};
exports.schemaDirectives = schemaDirectives;