"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.schemaDirectives = exports.typeDef = exports.ABSTRACT_WITH_EMBEDDED = exports.ABSTRACT_WITH_MODEL = exports.SHOULD_BE_MODEL = void 0;

var _graphqlTools = require("graphql-tools");

var _utils = require("../../utils");

var _sdlSyntaxException = _interopRequireDefault(require("../../sdlSyntaxException"));

const SHOULD_BE_MODEL = 'shouldBeModel';
exports.SHOULD_BE_MODEL = SHOULD_BE_MODEL;
const ABSTRACT_WITH_MODEL = 'abstractWithModel';
exports.ABSTRACT_WITH_MODEL = ABSTRACT_WITH_MODEL;
const ABSTRACT_WITH_EMBEDDED = 'abstractWithEmbedded';
exports.ABSTRACT_WITH_EMBEDDED = ABSTRACT_WITH_EMBEDDED;
const typeDef = `directive @abstract(from:String = null) on INTERFACE`;
exports.typeDef = typeDef;

class Abstract extends _graphqlTools.SchemaDirectiveVisitor {
  visitInterface(iface) {
    const {
      _typeMap: SchemaTypes
    } = this.schema;
    iface.mmAbstract = true;
    iface.mmAbstractTypes = [];

    iface._setAbstractTypes = function () {
      if (this.mmFromAbstract) {
        let types = new Set([...this.mmFromAbstract.mmAbstractTypes, ...this.mmAbstractTypes]);
        this.mmFromAbstract.mmAbstractTypes = Array.from(types);

        this.mmFromAbstract._setAbstractTypes();
      }
    }.bind(iface);

    iface._addFromInterfaces = function (type) {
      if (this.mmFrom) {
        if (!type._interfaces.find(i => i === this.mmFrom)) {
          type._interfaces.push(this.mmFrom);

          this.mmFrom._addFromInterfaces(type);
        }
      }
    }.bind(iface);

    const {
      from = null
    } = this.args;

    if (from) {
      let fromAbstract = Object.values(SchemaTypes).find(type => type.name === from);

      if (!fromAbstract) {
        throw `from:${from} was not found or does not contain the abstract directive`;
      }

      iface.mmFromAbstract = fromAbstract.mmInherit ? fromAbstract : null;
      iface.mmFrom = fromAbstract;
      iface._fields = { ...fromAbstract._fields,
        ...iface._fields
      };
    }

    Object.values(SchemaTypes).filter(type => type._interfaces && type._interfaces.includes(iface)).forEach(type => {
      iface.mmAbstractTypes.push(type);

      iface._addFromInterfaces(type);

      if (!(0, _utils.getDirective)(type, 'model')) {
        throw new _sdlSyntaxException.default(`
            Type '${type.name}' is inherited from abstract interface '${iface.name}' and should be marked with @model directive
          `, SHOULD_BE_MODEL, [type, iface]);
      }

      type._interfaces.filter(i => i !== iface).forEach(i => {
        if ((0, _utils.getDirective)(i, 'model')) {
          throw new _sdlSyntaxException.default(`Type '${type.name}' can not inherit both '${iface.name}' and '${i.name}' because they marked with @abstract and @model directives`, ABSTRACT_WITH_MODEL, [i, iface]);
        }

        if ((0, _utils.getDirective)(i, 'embedded')) {
          throw new _sdlSyntaxException.default(`Type '${type.name}' can not inherit both '${iface.name}' and '${i.name}' because they marked with @abstract and @embedded directives`, ABSTRACT_WITH_EMBEDDED, [i, iface]);
        }
      });

      type._fields = { ...iface._fields,
        ...type._fields
      };
    });

    iface._setAbstractTypes();

    iface.resolveType = data => {
      return iface.mmAbstractTypes.find(t => t.mmCollectionName === data['mmCollection']);
    };
  }

}

const schemaDirectives = {
  abstract: Abstract
};
exports.schemaDirectives = schemaDirectives;